// KBSyncClient 单元测试
// 重点:
//  - 4 个接口的请求 URL/方法/headers 正确
//  - URL 里中文由 requestUrl 内部 URL parser 自动编码
//  - 响应解析 happy path
//  - 错误路径 (HTTP 4xx/5xx) 返回 SyncError
//  - 401/403 走 UNAUTHORIZED 错误
//  - 网络层 throw (requestUrl reject) 走 NETWORK 错误

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { requestUrl } from "obsidian";
import { KBSyncClient } from '../../sync/kb-client';
import { SYNC_API } from '../../sync/constants';
import type { DocListApiResponse, KBCreateResponse, KBListResponse } from '../../sync/types';

function ruResponse(body: unknown, status = 200): { status: number; json: unknown; text: string; headers: Record<string, string> } {
  return {
    status,
    json: body,
    text: typeof body === "string" ? body : JSON.stringify(body),
    headers: {},
  };
}

describe('KBSyncClient', () => {
  let ruMock: ReturnType<typeof vi.mocked<typeof requestUrl>>;

  beforeEach(() => {
    ruMock = vi.mocked(requestUrl);
    ruMock.mockReset();
  });

  afterEach(() => {
    ruMock.mockReset();
  });

  /** 排队一个 requestUrl 响应 */
  function queueResponse(body: unknown, status = 200): void {
    ruMock.mockResolvedValueOnce(ruResponse(body, status) as never);
  }

  /** 取出 requestUrl 第 i 次调用的 url 字符串 */
  function callUrl(i: number): string {
    const c = ruMock.mock.calls[i]?.[0] as { url?: string } | string | undefined;
    if (typeof c === "string") return c;
    return c?.url ?? "";
  }

  function callInit(i: number): { method?: string; headers?: Record<string, string>; body?: unknown } {
    const c = ruMock.mock.calls[i]?.[0] as { method?: string; headers?: Record<string, string>; body?: unknown } | undefined;
    return c ?? {};
  }

  function callHeaders(i: number): Record<string, string> {
    return callInit(i).headers ?? {};
  }

  function callMethod(i: number): string {
    return callInit(i).method ?? "GET";
  }

  function callBody(i: number): string | undefined {
    const body = callInit(i).body;
    if (typeof body === "string") return body;
    return undefined;
  }

  /** 把 request body 转字符串(JSON body 是 string,FormData 不支持) */
  function bodyAsString(i: number): string {
    return callBody(i) ?? "";
  }

  function makeClient(token?: string | null): KBSyncClient {
    return new KBSyncClient({ app: {} as never, accessToken: token });
  }

  describe('getOrCreateKnowledgeBase — 唯一命中', () => {
    it('returns existing ragflowId when exactly one match found', async () => {
      const list: KBListResponse = {
        code: 200,
        data: { total: 1, rows: [{ ragflowId: 'rb_existing', id: 1, name: 'aliceObsidian自动同步知识库' }] },
      };
      queueResponse(list);

      const result = await makeClient().getOrCreateKnowledgeBase('alice');
      expect(result).toEqual({ ragflowId: 'rb_existing', isNew: false });
      expect(ruMock).toHaveBeenCalledTimes(1);
      expect(callUrl(0)).toContain(SYNC_API.KB_LIST_URL);
      // query 携带中文(不预编码,requestUrl 内部 URL parser 会编码)
      expect(callUrl(0)).toContain('query=aliceObsidian自动同步知识库');
      expect(callUrl(0)).toContain('pageSize=20');
    });
  });

  describe('getOrCreateKnowledgeBase — 0 命中,创建新库', () => {
    it('creates a new knowledge base when zero matches', async () => {
      const list: KBListResponse = { code: 200, data: { total: 0, rows: [] } };
      const create: KBCreateResponse = {
        status_code: 200,
        data: { ragflow_id: 'rb_new', id: 9999, name: 'aliceObsidian自动同步知识库' },
      };
      queueResponse(list);
      queueResponse(create);

      const result = await makeClient().getOrCreateKnowledgeBase('alice');
      expect(result).toEqual({ ragflowId: 'rb_new', isNew: true, resourceId: 9999 });
      expect(ruMock).toHaveBeenCalledTimes(2);

      expect(callUrl(1)).toBe(SYNC_API.KB_CREATE_URL);
      expect(callMethod(1)).toBe('POST');
      const createBody = bodyAsString(1);
      expect(createBody).toContain('"name":"aliceObsidian自动同步知识库"');
      expect(createBody).toContain('"knowledge_type":"document"');
      expect(createBody).toContain('"resource_group_id":"0"');
      expect(createBody).toContain('"model":"text-embedding-ada-002"');
    });
  });

  describe('getOrCreateKnowledgeBase — ≥2 命中,创建新库(不唯一)', () => {
    it('skips non-unique list and creates a new one', async () => {
      const list: KBListResponse = {
        code: 200,
        data: {
          total: 2,
          rows: [
            { ragflowId: 'rb1', name: 'aliceObsidian自动同步知识库' },
            { ragflowId: 'rb2', name: 'aliceObsidian自动同步知识库' },
          ],
        },
      };
      const create: KBCreateResponse = {
        status_code: 200,
        data: { ragflow_id: 'rb_new', id: 5 },
      };
      queueResponse(list);
      queueResponse(create);

      const result = await makeClient().getOrCreateKnowledgeBase('alice');
      expect(result.isNew).toBe(true);
      expect(result.ragflowId).toBe('rb_new');
    });
  });

  describe('getOrCreateKnowledgeBase — create 接口失败', () => {
    it('throws KB_CREATE error when create returns non-200', async () => {
      const list: KBListResponse = { code: 200, data: { total: 0, rows: [] } };
      queueResponse(list);
      // create 响应:HTTP 200 但 status_code=500
      queueResponse({ status_code: 500, data: null });

      await expect(makeClient().getOrCreateKnowledgeBase('alice')).rejects.toMatchObject({
        syncError: { code: 'KB_CREATE' },
      });
    });
  });

  describe('grantPermission', () => {
    it('sends POST with correct body', async () => {
      queueResponse({ status_code: 200 });
      await makeClient().grantPermission(123);
      expect(callUrl(0)).toBe(SYNC_API.PERMISSION_URL);
      expect(callMethod(0)).toBe('POST');
      const permBody = bodyAsString(0);
      expect(permBody).toContain('"resourceId":123');
      expect(permBody).toContain('"resourceType":"knowledge"');
    });
  });

  describe('listRemoteDocs', () => {
    it('parses doc list response', async () => {
      const body: DocListApiResponse = {
        retcode: 0,
        retmsg: 'success',
        data: {
          docs: [{ id: 'd1', name: 'a.pdf' }, { id: 'd2', name: 'b.txt' }],
          total: 2,
        },
      };
      queueResponse(body);
      const result = await makeClient().listRemoteDocs('rb_x');
      expect(result.docs).toHaveLength(2);
      expect(result.total).toBe(2);

      expect(callUrl(0)).toContain(SYNC_API.DOC_LIST_URL);
      expect(callUrl(0)).toContain('kb_id=rb_x');
    });

    it('throws LIST_DOCS on retcode != 0', async () => {
      queueResponse({ retcode: 1, retmsg: 'denied', data: { docs: [], total: 0 } });
      await expect(makeClient().listRemoteDocs('rb_x')).rejects.toMatchObject({
        syncError: { code: 'LIST_DOCS' },
      });
    });
  });

  describe('uploadDocument', () => {
    it('sends multipart body with kb_id and file', async () => {
      queueResponse({ retcode: 0, retmsg: 'ok' });
      const buf = new TextEncoder().encode('hello').buffer;
      await makeClient().uploadDocument('rb_x', 'note.md', buf);

      expect(callUrl(0)).toBe(SYNC_API.DOC_UPLOAD_URL);
      expect(callMethod(0)).toBe('POST');
      // body 为手动构造的 multipart ArrayBuffer (不再用 FormData,
      // requestUrl 桌面端 Electron 下不支持 FormData)
      const opts = ruMock.mock.calls[0]?.[0] as { body?: unknown; headers?: Record<string, string> };
      expect(opts.body).toBeInstanceOf(ArrayBuffer);
      expect((opts.body as ArrayBuffer).byteLength).toBeGreaterThan(0);
      // Content-Type 必须包含 multipart boundary
      expect(opts.headers?.['Content-Type'] || '').toMatch(/^multipart\/form-data; boundary=/);
    });

    it('throws UPLOAD error when retcode != 0', async () => {
      queueResponse({ retcode: 1, retmsg: 'file rejected' });
      const buf = new TextEncoder().encode('hello').buffer;
      await expect(
        makeClient().uploadDocument('rb_x', 'note.md', buf),
      ).rejects.toMatchObject({
        syncError: { code: 'UPLOAD' },
      });
    });
  });

  describe('auth — Authorization: <token> (no Bearer prefix)', () => {
    it('sends Authorization with raw token on getOrCreateKnowledgeBase', async () => {
      queueResponse({
        code: 200,
        data: { total: 1, rows: [{ ragflowId: 'rb', name: 'kbObsidian自动同步知识库' }] },
      });
      await makeClient('eyJ0eXAiOiJKV1Q.xxx').getOrCreateKnowledgeBase('kb');
      // 关键:不应该是 "Bearer eyJ..."
      expect(callHeaders(0).Authorization).toBe('eyJ0eXAiOiJKV1Q.xxx');
    });

    it('sends Authorization on grantPermission', async () => {
      queueResponse({ status_code: 200 });
      await makeClient('eyJ.xxx').grantPermission(123);
      expect(callHeaders(0).Authorization).toBe('eyJ.xxx');
    });

    it('sends Authorization on listRemoteDocs', async () => {
      queueResponse({ retcode: 0, retmsg: 'ok', data: { docs: [], total: 0 } });
      await makeClient('eyJ.xxx').listRemoteDocs('rb');
      expect(callHeaders(0).Authorization).toBe('eyJ.xxx');
    });

    it('sends Authorization on uploadDocument', async () => {
      queueResponse({ retcode: 0, retmsg: 'ok' });
      const buf = new TextEncoder().encode('hello').buffer;
      await makeClient('eyJ.xxx').uploadDocument('rb', 'a.md', buf);
      expect(callHeaders(0).Authorization).toBe('eyJ.xxx');
    });

    it('does NOT send Authorization when token is null', async () => {
      queueResponse({
        code: 200,
        data: { total: 1, rows: [{ ragflowId: 'rb', name: 'kbObsidian自动同步知识库' }] },
      });
      await makeClient().getOrCreateKnowledgeBase('kb');
      expect(callHeaders(0).Authorization).toBeUndefined();
    });

    it('sends Bearer <token> on KB_CREATE call (create branch)', async () => {
      // KB_LIST + KB_CREATE 两条调用
      queueResponse({ code: 200, data: { total: 0, rows: [] } });
      queueResponse({ status_code: 200, data: { ragflow_id: 'rb_new', id: 99 } });
      await makeClient('eyJ.xxx').getOrCreateKnowledgeBase('kb');
      // call 0 = KB_LIST — 无 Bearer 前缀
      expect(callHeaders(0).Authorization).toBe('eyJ.xxx');
      // call 1 = KB_CREATE — 带 Bearer 前缀
      expect(callHeaders(1).Authorization).toBe('Bearer eyJ.xxx');
    });

    it('sends throw: false to make requestUrl return response on 4xx/5xx', async () => {
      queueResponse({ code: 200, data: { total: 1, rows: [{ ragflowId: 'rb', name: 'kbObsidian自动同步知识库' }] } });
      await makeClient('eyJ.xxx').getOrCreateKnowledgeBase('kb');
      const opts = ruMock.mock.calls[0]?.[0] as { throw?: boolean };
      expect(opts.throw).toBe(false);
    });
  });

  describe('error mapping', () => {
    it('401 → UNAUTHORIZED', async () => {
      queueResponse({}, 401);
      await expect(makeClient().listRemoteDocs('rb')).rejects.toMatchObject({
        syncError: { code: 'UNAUTHORIZED', status: 401 },
      });
    });

    it('500 → NETWORK', async () => {
      queueResponse({}, 500);
      await expect(makeClient().listRemoteDocs('rb')).rejects.toMatchObject({
        syncError: { code: 'NETWORK', status: 500 },
      });
    });

    it('requestUrl reject → NETWORK', async () => {
      ruMock.mockImplementationOnce(() =>
        Promise.reject(new Error('econnreset')) as never
      );
      await expect(makeClient().listRemoteDocs('rb')).rejects.toMatchObject({
        syncError: { code: 'NETWORK' },
      });
    });
  });
});
