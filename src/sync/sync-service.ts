// SyncService — 协调本地 vault 与远端知识库的上传流程
//
// 阶段:
//   enumerating → creatingKb → listingDocs → uploading → completed/error
//   (授权内嵌在 creatingKb 完成后,仅在新建知识库分支执行)
//
// 错误策略:
//   阶段失败 → 整批 abort (enumerating/creatingKb/listingDocs)
//   uploading 单文件失败 → 继续下一个,累加 failedFiles
//   鉴权失败 → 整批 abort,UI 切到 error 并提示重新登录
//
// 上传限制:
//   - 仅白名单扩展名 (KB_ALLOWED_EXTS) 走 candidates,其他静默忽略
//   - 单文件 > KB_MAX_FILE_BYTES 直接进 failedFiles (syncErrorFileTooLarge)
//   - 每批 KB_BATCH_SIZE 个文件串行上传,批内任一失败不影响其他

import { TFile, type App } from "obsidian";
import { IAMAuthService } from "../auth/IAMAuthService";
import type { LLMWikiSettings } from "../types";
import { KBSyncClient } from "./kb-client";
import {
  KB_ALLOWED_EXTS,
  KB_BATCH_SIZE,
  KB_MAX_FILE_BYTES,
} from "./constants";
import type {
  KnowledgeBaseRef,
  SyncListener,
  SyncProgressEvent,
  SyncResult,
} from "./types";

const INITIAL_EVENT: SyncProgressEvent = {
  status: "idle",
  phase: "idle",
  current: 0,
  total: 0,
  currentFile: "",
  failedFiles: [],
};

/** 统一日志前缀 — 用户在控制台 grep "LLM-Wiki Sync" 即可看到全部 */
const LOG_PREFIX = "[LLM-Wiki Sync]";

function logInfo(...args: unknown[]): void {
  // 用户主动要求的同步日志,生产环境可关闭 console.log 但本场景
  // 是给用户查问题的,默认开启。 Obsidian 规则要求带自定义说明。
  // eslint-disable-next-line obsidianmd/rule-custom-message
  console.log(LOG_PREFIX, ...args);
}

function logWarn(...args: unknown[]): void {
  console.warn(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]): void {
  console.error(LOG_PREFIX, ...args);
}

export class SyncService {
  private app: App;
  private settings: LLMWikiSettings;
  private client: KBSyncClient;
  private listeners = new Set<SyncListener>();
  private running = false;
  private lastEvent: SyncProgressEvent = { ...INITIAL_EVENT };
  /** 由 sync-panel 显式 abort 时使用的 token;null 表示无 abort */
  private currentAbort: { aborted: boolean } | null = null;

  constructor(app: App, settings: LLMWikiSettings) {
    this.app = app;
    this.settings = settings;
    this.rebuildClient();
  }

  getLastEvent(): SyncProgressEvent {
    return { ...this.lastEvent };
  }

  isRunning(): boolean {
    return this.running;
  }

  /** 立刻重置状态(idle) — 不等待 in-flight 任务 */
  reset(): void {
    if (this.currentAbort) this.currentAbort.aborted = true;
    this.running = false;
    this.currentAbort = null;
    this.emit({ ...INITIAL_EVENT });
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.lastEvent);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 重新绑定 auth 状态(用户刚登出/登录后) */
  rebuildClient(): void {
    const authState = IAMAuthService.getInstance().getState();
    const userInfo = authState.userInfo;
    const accessToken = userInfo?.access_token ?? null;
    if (!accessToken) {
      logWarn("auth: userInfo.access_token 缺失,5 个接口都会 401");
    } else {
      logInfo(
        `auth: 同步客户端使用 access_token = ${accessToken.slice(0, 16)}...`
      );
    }
    this.client = new KBSyncClient({ app: this.app, accessToken });
  }

  // ─── 主流程 ─────────────────────────────────────────────

  async run(): Promise<SyncResult> {
    if (this.running) {
      logWarn("已有同步任务在运行,本次取消");
      return { uploaded: 0, skipped: 0, failed: [], cancelled: true };
    }
    this.running = true;
    const abort = { aborted: false };
    this.currentAbort = abort;
    const failed: string[] = [];
    const skippedNames: string[] = [];
    let totalBytes = 0;
    let uploadedBytes = 0;
    const startTs = Date.now();

    // 每次 run 入口先 rebuild 一次 (cookie 鉴权,同步重建即可)
    this.rebuildClient();

    logInfo("=== 同步开始 ===");

    // 未登录短路:不发任何网络请求,直接返回。
    // 启动时、定时器命中未登录态时静默跳过,等待用户在 SyncPanel 登录后
    // 由 LoginPage.handleLogin 主动调一次 run() 触发同步。
    if (!this.client.hasAccessToken()) {
      logWarn(
        "未登录,跳过本次同步 — 登录天智云后会触发一次同步 " +
        "(插件启动 / 定时器 / 手动点击都会触发此路径)"
      );
      this.emit({
        status: "completed",
        phase: "completed",
        current: 0,
        total: 0,
        currentFile: "",
        failedFiles: [],
      });
      logInfo("=== 同步结束 === 未登录,无操作");
      this.running = false;
      this.currentAbort = null;
      return { uploaded: 0, skipped: 0, failed: [], cancelled: false };
    }

    try {
      // 1. enumerating
      this.emit({
        status: "syncing",
        phase: "enumerating",
        current: 0,
        total: 0,
        currentFile: "",
        failedFiles: [],
      });
      if (abort.aborted) return this.finish(failed, true, 0);
      const { candidates, skipped: enumSkipped } = this.enumerateCandidatesDetailed();
      skippedNames.push(...enumSkipped);
      logInfo(
        `阶段 1/4 enumerating: 候选 ${candidates.length} 个文件,` +
        `已过滤 ${enumSkipped.length} 个 (wiki 目录 / 格式不支持)`
      );
      if (enumSkipped.length > 0) {
        logInfo("被过滤文件列表:", enumSkipped.slice(0, 20).join(", "));
      }
      if (candidates.length === 0) {
        logInfo("本地无可上传文件，但仍将执行知识库检查及远端清单同步");
      }

      // 2. creatingKb
      this.emit({
        status: "syncing",
        phase: "creatingKb",
        current: 0,
        total: candidates.length,
        currentFile: "",
        failedFiles: [],
      });
      // query = ${user_name}Obsidian自动同步知识库
      const userInfo = IAMAuthService.getInstance().getState().userInfo;
      const userName = userInfo?.user_name ?? "user";
      // 详细日志:用户能直接看到 userInfo.user_name 字段实际值,
      // 定位后端返回是不是预期名字、字段读取路径是否对
      logInfo(
        `auth: userInfo.user_name = "${userName}" ` +
        `(后端 new_c_regist 返回值,如果和登录名不一致请检查)`
      );
      logInfo(`阶段 2/4 creatingKb: query = "${userName}Obsidian自动同步知识库"`);
      const kb: KnowledgeBaseRef = await this.client.getOrCreateKnowledgeBase(
        userName,
      );
      logInfo(
        `阶段 2/4 creatingKb: 知识库已就绪 (ragflow_id=${kb.ragflowId}, ` +
        `${kb.isNew ? "新建" : "已存在"})`
      );
      if (abort.aborted) return this.finish(failed, true, 0);

      // 3. (新建)授权 — 内联,不单独阶段
      if (kb.isNew && kb.resourceId !== undefined) {
        logInfo(`阶段 3/4 authorizing: 授予知识库 ${kb.resourceId} 公开权限`);
        await this.client.grantPermission(kb.resourceId);
        logInfo("阶段 3/4 authorizing: 授权完成");
      }
      if (abort.aborted) return this.finish(failed, true, 0);

      // 4. listingDocs
      this.emit({
        status: "syncing",
        phase: "listingDocs",
        current: 0,
        total: candidates.length,
        currentFile: "",
        failedFiles: [],
      });
      logInfo("阶段 4/4 listingDocs: 获取远端文档清单");
      const remote = await this.client.listRemoteDocs(kb.ragflowId);
      const remoteNames = new Set(remote.docs.map((d) => d.name));
      const todo = candidates.filter(
        (f) => !remoteNames.has(f.basename) && !remoteNames.has(f.name),
      );
      const remoteSkipped = candidates.length - todo.length;
      skippedNames.push(...candidates
        .filter((f) => remoteNames.has(f.basename) || remoteNames.has(f.name))
        .map((f) => f.name));
      logInfo(
        `阶段 4/4 listingDocs: 远端共 ${remote.total} 个文件,` +
        `本地需上传 ${todo.length} 个,` +
        `已存在跳过 ${remoteSkipped} 个`
      );
      const skipped = enumSkipped.length + remoteSkipped;
      if (abort.aborted) return this.finish(failed, true, skipped);

      if (todo.length === 0) {
        logInfo(
          `本地文件已与远端知识库同步，无需上传 ` +
          `(跳过 ${skipped} 个: 格式/wiki/远端已存在)`
        );
        this.emit({
          status: "completed",
          phase: "completed",
          current: 0,
          total: 0,
          currentFile: "",
          failedFiles: [],
        });
        const rs: SyncResult = { uploaded: 0, skipped, failed: [], cancelled: false };
        logInfo("=== 同步结束 === 已全部同步，无需上传");
        return rs;
      }

      // 5. uploading — 按 KB_BATCH_SIZE 切片串行上传
      const totalUploads = todo.length;
      totalBytes = todo.reduce((s, f) => s + (f.stat?.size ?? 0), 0);
      logInfo(
        `阶段 5/4 uploading: ${totalUploads} 个文件,` +
        `共 ${(totalBytes / 1024 / 1024).toFixed(2)} MB,` +
        `按 ${KB_BATCH_SIZE} 个/批串行上传`
      );
      this.emit({
        status: "syncing",
        phase: "uploading",
        current: 0,
        total: totalUploads,
        currentFile: "",
        failedFiles: [],
      });
      for (let i = 0; i < todo.length; i += KB_BATCH_SIZE) {
        if (abort.aborted) break;
        const batchIdx = Math.floor(i / KB_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(todo.length / KB_BATCH_SIZE);
        const batch = todo.slice(i, i + KB_BATCH_SIZE);
        logInfo(
          `批次 ${batchIdx}/${totalBatches}: ${batch.length} 个文件` +
          (batch.length > 0 ? ` (${batch.map((f) => f.basename).join(", ")})` : "")
        );
        for (let j = 0; j < batch.length; j++) {
          const file = batch[j];
          const fileIndex = i + j; // 全局序号 (0-based)
          if (abort.aborted) break;
          this.emit({
            status: "syncing",
            phase: "uploading",
            current: fileIndex + 1, // 1-based 给用户看
            total: totalUploads,
            currentFile: file.basename,
            failedFiles: [...failed],
          });
          // 单文件大小预检:超过 KB_MAX_FILE_BYTES 跳过,计入 failed
          const size = file.stat?.size ?? 0;
          if (size > KB_MAX_FILE_BYTES) {
            const sizeMB = (size / 1024 / 1024).toFixed(2);
            logWarn(
              `跳过 (文件过大): ${file.name} ${sizeMB}MB > ${KB_MAX_FILE_BYTES / 1024 / 1024}MB`
            );
            failed.push(file.basename);
            continue;
          }
          try {
            const buf = await this.app.vault.readBinary(file);
            logInfo(
              `上传 [${fileIndex + 1}/${totalUploads}]: ${file.name} ` +
              `(${(buf.byteLength / 1024).toFixed(1)} KB)`
            );
            await this.client.uploadDocument(kb.ragflowId, file.name, buf);
            uploadedBytes += buf.byteLength;
            logInfo(`  ✓ 上传成功: ${file.name}`);
          } catch (err) {
            const name = err instanceof Error ? err.message : String(err);
            const code =
              (err as Error & { syncError?: { code: string } }).syncError?.code ??
              "UNKNOWN";
            logError(`  ✗ 上传失败: ${file.name} code=${code} ${name}`);
            failed.push(file.basename);
          }
        }
      }

      const result = this.finish(failed, abort.aborted, skipped);
      const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
      logInfo(
        "=== 同步结束 === " +
        `耗时 ${elapsed}s, 上传 ${result.uploaded}/${totalUploads} ` +
        `(${(uploadedBytes / 1024 / 1024).toFixed(2)} MB), ` +
        `跳过 ${result.skipped} (格式/wiki/远端已存在), ` +
        `失败 ${result.failed.length}`
      );
      if (result.failed.length > 0) {
        logError("失败文件列表:", result.failed.join(", "));
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code =
        (err as Error & { syncError?: { code: string } }).syncError?.code ??
        "UNKNOWN";
      logError(`同步异常中断: code=${code} ${msg}`);
      this.emit({
        status: "error",
        phase: "error",
        current: 0,
        total: 0,
        currentFile: "",
        failedFiles: failed,
        errorMessage: msg,
      });
      return { uploaded: 0, skipped: skippedNames.length, failed, cancelled: false };
    } finally {
      this.running = false;
      this.currentAbort = null;
    }
  }

  // ─── helpers ─────────────────────────────────────────────

  /**
   * 枚举要上传的文件 + 跳过列表:
   *   1) 不在 wiki 目录下 (以 wikiFolder/ 前缀排除)
   *   2) 扩展名在 KB_ALLOWED_EXTS 白名单内
   *   3) 大小 ≤ KB_MAX_FILE_BYTES
   * 返回 candidates (走上传) 和 skipped (被过滤/超限,详细原因).
   */
  private enumerateCandidatesDetailed(): {
    candidates: TFile[];
    skipped: string[];
  } {
    const wikiPrefix = (this.settings.wikiFolder ?? "wiki") + "/";
    // 用 getFiles() 拿 vault 全部 TFile (含非 .md 二进制文件),
    // getMarkdownFiles() 只返回 .md,无法支持 PDF/DOCX 等上传场景。
    const all = this.app.vault.getFiles();
    const candidates: TFile[] = [];
    const skipped: string[] = [];
    for (const f of all) {
      if (!(f instanceof TFile)) continue;
      if (f.path.startsWith(wikiPrefix)) {
        skipped.push(`${f.name} (in ${this.settings.wikiFolder}/)`);
        continue;
      }
      if (!this.isAllowedExt(f.name)) {
        const dot = f.name.lastIndexOf(".");
        const ext = dot >= 0 ? f.name.slice(dot + 1).toLowerCase() : "(no ext)";
        skipped.push(`${f.name} (ext .${ext} not allowed)`);
        continue;
      }
      candidates.push(f);
    }
    return { candidates, skipped };
  }

  private isAllowedExt(name: string): boolean {
    const dot = name.lastIndexOf(".");
    if (dot < 0) return false;
    const ext = name.slice(dot + 1).toLowerCase();
    return KB_ALLOWED_EXTS.has(ext);
  }

  private finish(
    failed: string[],
    cancelled: boolean,
    skipped: number = 0,
  ): SyncResult {
    const total = this.lastEvent.total;
    const uploaded = Math.max(0, total - failed.length);
    const result: SyncResult = { uploaded, skipped, failed, cancelled };
    this.emit({
      status: cancelled ? "idle" : "completed",
      phase: cancelled ? "idle" : "completed",
      current: this.lastEvent.current,
      total,
      currentFile: "",
      failedFiles: failed,
    });
    return result;
  }

  private emit(event: SyncProgressEvent): void {
    this.lastEvent = event;
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error("[SyncService] listener error:", err);
      }
    });
  }
}
