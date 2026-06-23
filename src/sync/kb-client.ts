// KBSyncClient — 4 个知识库同步 HTTP 接口的薄封装
//
// 设计要点:
// 1. 使用 Obsidian requestUrl (而非 fetch) 发起 HTTP:
//    - requestUrl 绕过 CORS (Obsidian 走 Electron net,不受浏览器 CORS 限制)
//    - URL 字符串里的中文 requestUrl 内部会自动正确编码,
//      无需也不应手动 encodeURIComponent (否则会双重编码导致后端拿到错字符)
// 2. 鉴权 header: `Authorization: <access_token>` (不带 Bearer 前缀)。
// 3. 客户端不持有任何全局状态 — auth token 通过构造函数注入,便于测试。

import { requestUrl, type App } from "obsidian";
import {
  SYNC_API,
  KB_MODEL,
  KB_TYPE,
  KB_RESOURCE_GROUP,
} from "./constants";
import type {
  DocListApiResponse,
  KBCreateResponse,
  KBListResponse,
  KnowledgeBaseRef,
  RemoteDocList,
  SyncError,
} from "./types";

/** 测试/外部可注入的最小 App 形态 — 这里没用到,保留为占位,允许 mock 注入 */
export type SyncClientDeps = {
  app: App;
  /**
   * 5 个接口 (KB_LIST / KB_CREATE / saveNewResourcePermission /
   * DOC_LIST / DOC_UPLOAD) 都需要 `Authorization: <token>` header。
   * 注意:不带 `Bearer ` 前缀,直接是 token 字符串本身。
   * token = userInfo.access_token (JWT,new_c_regist 返回)。
   */
  accessToken?: string | null;
};

function makeError(
  code: SyncError["code"],
  message: string,
  status?: number,
): SyncError {
  return { code, message, status };
}

/** 把 SyncError 包成 Error,方便 ESLint only-throw-error 通过 */
function wrapError(e: SyncError): Error {
  const err = new Error(e.message);
  (err as Error & { syncError: SyncError }).syncError = e;
  return err;
}

/**
 * 手动构造 multipart/form-data 的 ArrayBuffer。
 *
 * requestUrl 在 Obsidian 桌面端走 Electron net.request(),底层不兼容
 * FormData 对象 — 传给 body 的 FormData 不会被正确序列化,服务器收到
 * 空体/无效体,HTTP 200 但文件没存进去。因此需要自行拼出 multipart 字节。
 */
function buildMultipartBody(params: {
  kbId: string;
  fileName: string;
  fileContent: ArrayBuffer;
}): { body: ArrayBuffer; contentType: string } {
  const boundary = `----LLMWikiBoundary${Math.random().toString(36).slice(2, 10)}`;
  const encoder = new TextEncoder();

  // 前置:kb_id + file 头
  const preamble = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="kb_id"\r\n\r\n` +
    `${params.kbId}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${params.fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`,
  );
  // 后置:结束 boundary
  const epilogue = encoder.encode(`\r\n--${boundary}--\r\n`);

  const total =
    preamble.byteLength + params.fileContent.byteLength + epilogue.byteLength;
  const result = new Uint8Array(total);
  result.set(preamble, 0);
  result.set(new Uint8Array(params.fileContent), preamble.byteLength);
  result.set(epilogue, preamble.byteLength + params.fileContent.byteLength);

  return {
    body: result.buffer,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export class KBSyncClient {
  private deps: SyncClientDeps;

  constructor(deps: SyncClientDeps) {
    this.deps = deps;
  }

  /**
   * 是否持有有效 access_token。
   * SyncService.run() 入口用这个判断是否短路(不发任何网络请求,
   * 等待用户在 IAMAuthService 中登录后再重试)。
   * 注意:依赖外部 IAMAuthService 写入正确的 token(空串视为未登录)。
   */
  hasAccessToken(): boolean {
    const t = this.deps.accessToken;
    return typeof t === "string" && t.trim().length > 0;
  }
  // ─── 知识库:查/建 ─────────────────────────────────────────

  /**
   * 1. 查 `query=${name}Obsidian自动同步知识库`;唯一命中取其 `ragflow_id`
   * 2. 未命中 → POST /knowledge/create,返回新库的 ragflow_id + resource id
   * 入参 `name` 是 user_name (不带后缀),内部拼出完整名称 `${name}Obsidian自动同步知识库`。
   */
  async getOrCreateKnowledgeBase(name: string): Promise<KnowledgeBaseRef> {
    const kbName = `${name}Obsidian自动同步知识库`;

    // 直接把中文拼到 url 字符串里 — requestUrl 内部会走 URL parser
    // 自动正确编码(不要预编码,否则双重编码后端拿到错字符)
    const listUrl =
      `${SYNC_API.KB_LIST_URL}` +
      `?query=${kbName}` +
      `&pageNum=1&pageSize=20` +
      `&typeFilter=0&orderBy=CreateTimeDesc` +
      `&knowledgeType=all&resourceGroupId=`;

    const listResp = await this.request<KBListResponse>(listUrl, { method: "GET" });
    if (listResp.kind === "error") throw wrapError(listResp.error);
    const body = listResp.body;
    if (!body || body.code !== 200 || !body.data) {
      // 详细日志:用户能看到后端完整返回
      console.error(
        LOG_PREFIX,
        "KB_LIST 返回非预期:",
        listUrl,
        "body=",
        JSON.stringify(body),
      );
      throw wrapError(
        makeError(
          "KB_LIST",
          `查询知识库失败: ${body?.msg ?? "未知错误"} body=${JSON.stringify(body)}`,
        ),
      );
    }
    const matches = (body.data.rows ?? []).filter(
      (it) => (it.name ?? "").trim() === kbName,
    );
    if (matches.length === 1 && matches[0].ragflowId) {
      return { ragflowId: matches[0].ragflowId, isNew: false };
    }

    // 0 或 ≥2 都视为未唯一命中,尝试创建
    const createBody = {
      name: kbName,
      description: "",
      model: KB_MODEL,
      knowledge_type: KB_TYPE,
      resource_group_id: KB_RESOURCE_GROUP,
    };
    const createResp = await this.request<KBCreateResponse>(
      SYNC_API.KB_CREATE_URL,
      {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify(createBody),
      },
      "Bearer ", // KB_CREATE 要求 Authorization: Bearer <token>
    );
    if (createResp.kind === "error") throw wrapError(createResp.error);
    const created = createResp.body;
    if (
      !created ||
      created.status_code !== 200 ||
      !created.data?.ragflow_id
    ) {
      throw wrapError(
        makeError(
          "KB_CREATE",
          `创建知识库失败: status=${created?.status_code ?? "?"}`,
        ),
      );
    }
    return {
      ragflowId: created.data.ragflow_id,
      isNew: true,
      resourceId: created.data.id,
    };
  }

  /** 新建知识库后,授予公开权限(只对新库调用) */
  async grantPermission(resourceId: number): Promise<void> {
    const resp = await this.request<unknown>(SYNC_API.PERMISSION_URL, {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ resourceId, resourceType: "knowledge" }),
    });
    if (resp.kind === "error") throw wrapError(resp.error);
  }

  // ─── 文档:列/传 ──────────────────────────────────────────

  async listRemoteDocs(ragflowId: string): Promise<RemoteDocList> {
    const url =
      `${SYNC_API.DOC_LIST_URL}` +
      `?kb_id=${ragflowId}` +
      `&page=1&page_size=9999&keywords=` +
      `&queryDict={"file_type":[],"run":[]}`;

    const resp = await this.request<DocListApiResponse>(url, { method: "GET" });
    if (resp.kind === "error") throw wrapError(resp.error);
    const body = resp.body;
    if (!body || body.retcode !== 0) {
      throw wrapError(
        makeError(
          "LIST_DOCS",
          `远端文档列表失败: ${body?.retmsg ?? "未知错误"}`,
        ),
      );
    }
    return { docs: body.data.docs, total: body.data.total };
  }

  /**
   * 上传单个文件 — multipart/form-data (手动构造 body,避开 requestUrl
   * 在桌面端 Electron 下对 FormData 的不兼容)。
   *
   * 返回格式: { retcode: 0, retmsg: "success" }
   * retcode != 0 视为失败,抛 UPLOAD 错误。
   */
  async uploadDocument(
    ragflowId: string,
    fileName: string,
    content: ArrayBuffer,
  ): Promise<void> {
    const { body, contentType } = buildMultipartBody({
      kbId: ragflowId,
      fileName,
      fileContent: content,
    });

    const resp = await this.request<{ retcode?: number; retmsg?: string }>(
      SYNC_API.DOC_UPLOAD_URL,
      {
        method: "POST",
        contentType,
        body,
      },
    );
    if (resp.kind === "error") throw wrapError(resp.error);
    // 参考代码的 response interceptor: data.retcode !== 0 → reject
    if (resp.body?.retcode !== 0) {
      throw wrapError(
        makeError(
          "UPLOAD",
          `上传失败: retcode=${resp.body?.retcode ?? "?"} ${resp.body?.retmsg ?? ""}`,
        ),
      );
    }
  }

  // ─── 内部:fetch + 401 处理 ──────────────────────────────

  private async request<T>(
    url: string,
    options: { method: string; body?: string | FormData | ArrayBuffer; contentType?: string },
    authPrefix = "",
  ): Promise<
    { kind: "ok"; body: T } | { kind: "error"; error: SyncError }
  > {
    const headers: Record<string, string> = {};
    if (options.contentType) headers["Content-Type"] = options.contentType;
    // KB_CREATE 接口需要 `Authorization: Bearer <token>`, 其他 4 个接口
    // 用 `Authorization: <token>` (不带 Bearer 前缀)。
    // authPrefix 默认 "" (无前缀),KB_CREATE 调用处传 "Bearer "。
    if (this.deps.accessToken) {
      headers["Authorization"] = `${authPrefix}${this.deps.accessToken}`;
    }

    // ─── 内部:requestUrl + 401 处理 ─────────────────────
    //   requestUrl 绕过 CORS(走 Electron net,不受浏览器 CORS 限制),
    //   URL 里的中文由 requestUrl 内部 URL parser 自动编码 — 不能预
    //   编码,否则双重编码后端拿到错字符。

    type RequestUrlResponse = {
      status: number;
      json: unknown;
      text?: string;
      headers?: Record<string, string>;
    };

    let response: RequestUrlResponse;
    try {
      const requestOpts: Record<string, unknown> = {
        url,
        method: options.method,
        headers,
        throw: false,
      };
      if (options.body !== undefined) {
        requestOpts.body = options.body;
      }
      // requestUrl 的真实返回类型 (RequestUrlResponse) 跟局部声明的同名
      // 类型形态不一致(obsidian 公开类型字段比我们的宽),需要 cast 一下。
      const ruResp = (await requestUrl(requestOpts as never)) as unknown;
      response = ruResp as RequestUrlResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", error: makeError("NETWORK", msg) };
    }

    if (response.status === 401 || response.status === 403) {
      // 详细日志:用户能在控制台看到完整请求/响应,定位 401 原因
      console.error(
        LOG_PREFIX,
        `鉴权失败 ${response.status}:`,
        url,
        "headers=",
        JSON.stringify(headers),
        "response=",
        JSON.stringify(response.json ?? response.text ?? ""),
      );
      return {
        kind: "error",
        error: makeError(
          "UNAUTHORIZED",
          `鉴权失败 (HTTP ${response.status}) — 重新登录或检查 access_token`,
          response.status,
        ),
      };
    }
    if (response.status >= 400) {
      return {
        kind: "error",
        error: makeError(
          "NETWORK",
          `HTTP ${response.status}: ${url}`,
          response.status,
        ),
      };
    }

    return { kind: "ok", body: response.json as T };
  }
}

const LOG_PREFIX = "[LLM-Wiki Sync]";
