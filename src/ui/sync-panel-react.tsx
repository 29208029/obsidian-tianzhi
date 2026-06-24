// esbuild production banner 替换 console.debug 为空函数；Obsidian 规则
// 要求 console.log 须带说明。模仿 sync-service.ts:45-50 风格。
// eslint-disable-next-line obsidianmd/rule-custom-message
const cosmoLog = (...args: unknown[]): void => console.log('[cosmo-bootstrap:sync-panel]', ...args);

// SyncPanel (React + Tailwind) — 知识同步 Tab 内容
//
// 替代原 src/ui/sync-panel.ts 的纯 DOM 实现;功能等价,样式贴近
// tianzhi copilot 的 AuthGate 风格。Auth 业务逻辑仍由 IAMAuthService
// 与 IAMTokenManager 调度,本组件只做订阅 + 渲染。
//
// 关键设计:
// 1. 组件通过 useEffect 订阅 IAMAuthService;卸载时退订,避免内存泄漏
// 2. i18n 文本通过 plugin.settings.language + getText() 解析,
//    与纯 DOM 版保持一致(避免引入 react-i18next 等额外依赖)
// 3. 同步按钮目前是占位(原版也是这样),等后续接入云端业务

import { useEffect, useState, type ReactElement } from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import { Switch } from "antd";
import LLMWikiPlugin from "../main";
import { IAMAuthService } from "../auth/IAMAuthService";
import type { IAMAuthState } from "../auth/IAMTypes";
import { getText } from "../utils";
import { cn } from "../lib/utils";
import type { SyncProgressEvent } from "../sync/types";

interface SyncPanelProps {
  plugin: LLMWikiPlugin;
  // 保留 app prop 以便后续直接调 vault 操作 (暂未使用)
  app?: App;
}

type SyncStatus = "idle" | "syncing" | "completed" | "error";

interface SyncProgress {
  phase: string;
  current: number;
  total: number;
  currentFile: string;
  failedFiles: string[];
  errorMessage?: string;
}

function tr(plugin: LLMWikiPlugin, key: string): string {
  return getText(plugin.settings.language, key as Parameters<typeof getText>[1]);
}

export function SyncPanel({ plugin }: SyncPanelProps): ReactElement {
  const [authState, setAuthState] = useState<IAMAuthState>(() =>
    IAMAuthService.getInstance().getState()
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = IAMAuthService.getInstance().subscribe((state) => {
      setAuthState(state);
      setBusy(false);
    });
    return () => {
      unsub();
    };
  }, []);

  if (!authState.isLoggedIn || !authState.userInfo) {
    return (
      <LoginPage
        plugin={plugin}
        busy={busy}
        setBusy={setBusy}
      />
    );
  }
  return (
    <ProfilePage
      plugin={plugin}
      syncStatus={syncStatus}
      setSyncStatus={setSyncStatus}
      busy={busy}
      setBusy={setBusy}
    />
  );
}

// ─── 未登录:LoginPage ────────────────────────────────────────

interface LoginPageProps {
  plugin: LLMWikiPlugin;
  busy: boolean;
  setBusy: (v: boolean) => void;
}

function LoginPage({ plugin, busy, setBusy }: LoginPageProps): ReactElement {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleLogin = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setIsError(false);
    setStatusMsg(tr(plugin, "authLoginOpeningWindow"));
    try {
      await IAMAuthService.getInstance().login();
      new Notice(tr(plugin, "authLoginSuccess"));
      // 登录完成,立即触发一次同步 —— 不依赖任何标志位 / 订阅。
      // SyncService.run() 入口会读 userInfo.access_token,
      // 此时 IAMAuthService.this.userInfo 已经被 login() 内部赋值,
      // 不会再走"未登录短路"分支。
      void plugin.syncService.run().catch(() => {});
      // CosmoGPT auto-bootstrap: 同样的模式 —— 登录后直接调
      // plugin.runCosmoBootstrap(),不依赖 subscribe / provider 设置。
      // runCosmoBootstrap() 内部读 IAM 状态,强制 provider=cosmogpt 跑一次。
      cosmoLog('IAM 登录完成;开始调用 plugin.runCosmoBootstrap()');
      void plugin.runCosmoBootstrap();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "login failed";
      const tmpl = tr(plugin, "authLoginFailed");
      setStatusMsg(tmpl.replace("{}", msg));
      setIsError(true);
      setBusy(false);
    }
  };

  return (
    <div className="tw-flex tw-flex-col tw-gap-4 tw-p-5">
      <div className="tw-flex tw-flex-col tw-items-center tw-gap-3 tw-rounded-lg tw-border tw-border-surface-border tw-bg-surface-alt tw-p-6 tw-shadow-sm">
        <div
          className="tw-flex tw-h-12 tw-w-12 tw-items-center tw-justify-center tw-rounded-full tw-bg-primary/10 tw-text-primary"
          aria-hidden
        >
          <svg
            className="tw-h-6 tw-w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2 L20 7 V17 L12 22 L4 17 V7 Z" />
            <path d="M12 22 V12" />
            <path d="M4 7 L12 12 L20 7" />
          </svg>
        </div>
        <h2 className="tw-m-0 tw-text-lg tw-font-semibold">
          {tr(plugin, "authLoginTitle")}
        </h2>
        <p className="tw-m-0 tw-text-center tw-text-sm tw-leading-relaxed tw-text-muted">
          {tr(plugin, "authLoginDesc")}
        </p>
        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={busy}
          className={cn(
            "tw-mt-2 tw-w-full tw-rounded-md tw-bg-primary tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors",
            "hover:tw-bg-primary-hover",
            "disabled:tw-cursor-not-allowed disabled:tw-opacity-60"
          )}
        >
          {busy
            ? tr(plugin, "authLoginButtonLoading")
            : isError
              ? tr(plugin, "authLoginButtonRetry")
              : tr(plugin, "authLoginButton")}
        </button>
        {statusMsg && (
          <p
            className={cn(
              "tw-m-0 tw-text-center tw-text-xs",
              isError ? "tw-text-danger" : "tw-text-muted"
            )}
          >
            {statusMsg}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── 已登录:ProfilePage ──────────────────────────────────────

interface ProfilePageProps {
  plugin: LLMWikiPlugin;
  // userInfo 由顶部 LOGO 行的 SidebarHeader 直接订阅 IAMAuthService,
  // 此处不再需要。SyncPanel 的"已登录"判断也只看 authState.userInfo
  // 是否存在,无需把 userInfo 再向下传一层。
  syncStatus: SyncStatus;
  setSyncStatus: (s: SyncStatus) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
}

function ProfilePage({
  plugin,
  syncStatus,
  setSyncStatus,
  busy,
  setBusy,
}: ProfilePageProps): ReactElement {
  const [autoSync, setAutoSync] = useState(true);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  // 使用 plugin 全局 SyncService 实例（由 main.ts onload 创建，启动时运行一次 + 每小时轮询）
  const service = plugin.syncService;

  useEffect(() => {
    const unsub = service.subscribe((evt: SyncProgressEvent) => {
      setSyncStatus(evt.status);
      if (evt.phase === "idle") {
        setProgress(null);
        return;
      }
      setProgress({
        phase: evt.phase,
        current: evt.current,
        total: evt.total,
        currentFile: evt.currentFile,
        failedFiles: evt.failedFiles,
        errorMessage: evt.errorMessage,
      });
    });
    return () => {
      unsub();
    };
  }, [service, setSyncStatus]);

  async function runSync(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      service.rebuildClient();
      const result = await service.run();
      const failed = result.failed.length;
      if (failed > 0) {
        const tmpl = tr(plugin, "syncErrorUpload");
        const names = result.failed.slice(0, 3).join(", ");
        new Notice(
          `${tmpl.replace("{}", String(failed))} — ${names}${failed > 3 ? "…" : ""}`,
          6000
        );
      } else if (
        !result.cancelled &&
        result.uploaded === 0
      ) {
        // No failures, not cancelled, nothing uploaded — every file
        // matched the remote state already. Tell the user so the click
        // doesn't feel like a silent no-op.
        new Notice(tr(plugin, "syncAllUpToDate"), 3000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const tmpl = tr(plugin, "syncErrorKbCreate");
      new Notice(tmpl.replace("{}", msg), 6000);
      setSyncStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-flex tw-flex-col tw-gap-4 tw-p-5">
      {/* Profile header 已迁到顶部 LOGO 行最右侧 (见 SidebarHeader 组件),
          此处只保留同步相关 UI。 */}
      {/* 第 1 排:蓝色浅底提示卡片 — 文档图标 + 标题 + 说明 */}
      <div className="tw-flex tw-items-start tw-gap-3 tw-rounded-lg tw-border-2 tw-border-blue-300 tw-bg-blue-50 tw-p-4 tw-shadow-sm">
        <div
          className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-md tw-bg-white tw-text-primary tw-shadow-sm"
          aria-hidden
        >
          <svg
            className="tw-h-5 tw-w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2 H6 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 V8 z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="14" y2="17" />
          </svg>
        </div>
        <div className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-1">
          <div className="tw-text-sm tw-font-semibold tw-text-blue-900">
            {tr(plugin, "syncKbCardTitle")}
          </div>
          <div className="tw-text-xs tw-leading-relaxed tw-text-blue-700/80">
            {tr(plugin, "syncHint")}
          </div>
        </div>
      </div>

      {/* 第 3 排:开关模块 — 循环图标 + 文字 + 绿色 toggle + 灰色备注 */}
      <div className="tw-flex tw-flex-col tw-gap-2 tw-rounded-lg tw-border tw-border-surface-border tw-bg-surface-alt tw-p-4">
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
          <div className="tw-flex tw-items-center tw-gap-2.5">
            <div
              className="tw-flex tw-h-8 tw-w-8 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-md tw-bg-primary/10 tw-text-primary"
              aria-hidden
            >
              <svg
                className="tw-h-4 tw-w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9 a9 9 0 0 1 14.85 -3.36 L23 10 M1 14 l4.64 4.36 A9 9 0 0 0 20.49 15" />
              </svg>
            </div>
            <span className="tw-text-sm tw-font-medium">
              {tr(plugin, "syncToggleAutoSync")}
            </span>
          </div>
          <Switch
            checked={autoSync}
            disabled={busy}
            onChange={setAutoSync}
            aria-label={tr(plugin, "syncToggleAutoSync")}
            className={cn(
              "focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-success/40"
            )}
            size="default"
          />
        </div>
        <p className="tw-m-0 tw-pl-10.5 tw-text-xs tw-leading-relaxed tw-text-muted">
          {tr(plugin, "syncAutoSyncDesc")}
        </p>
      </div>

      {/* 第 4 排:同步状态模块 — 标题 + 绿点 + 进度条 + 当前文件 */}
      <div className="tw-flex tw-flex-col tw-gap-2.5 tw-rounded-lg tw-border tw-border-surface-border tw-bg-surface-alt tw-p-4">
        <div className="tw-flex tw-items-center tw-justify-between">
          <h3 className="tw-m-0 tw-text-sm tw-font-semibold">
            {tr(plugin, "syncStatusTitle")}
          </h3>
          <div className="tw-flex tw-items-center tw-gap-1.5">
            <span
              className={cn(
                "tw-inline-block tw-h-2 tw-w-2 tw-rounded-full",
                syncStatus === "syncing" ? "tw-bg-success tw-animate-pulse" : "tw-bg-muted-fg"
              )}
              aria-hidden
            />
            <span
              className={cn(
                "tw-text-xs tw-font-medium",
                syncStatus === "syncing" ? "tw-text-success" : "tw-text-muted"
              )}
            >
              {statusLabel(plugin, syncStatus)}
            </span>
          </div>
        </div>
        {/* 进度条:仅在 syncing 时可见,其他状态显示闲置底色 */}
        <div
          className="tw-h-1.5 tw-w-full tw-overflow-hidden tw-rounded-full tw-bg-gray-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress?.total ?? 100}
          aria-valuenow={progress?.current ?? 0}
        >
          <div
            className={cn(
              "tw-h-full tw-rounded-full tw-transition-all tw-duration-300",
              syncStatus === "syncing" ? "tw-bg-success" : "tw-bg-gray-200"
            )}
            style={{
              width:
                syncStatus === "syncing" && progress
                  ? `${Math.round((progress.current / progress.total) * 100)}%`
                  : "0%",
            }}
          />
        </div>
        {syncStatus === "syncing" && progress && (
          <p className="tw-m-0 tw-text-xs tw-text-muted">
            {phaseLabel(plugin, progress.phase, progress.currentFile)}
          </p>
        )}
        {syncStatus === "completed" && progress && progress.total > 0 && (
          <p className="tw-m-0 tw-text-xs tw-text-muted">
            {tr(plugin, "syncStatusCompleted")
              .replace("{}", String(progress.total - progress.failedFiles.length))
              .replace("{}", "0")
              .replace("{}", String(progress.failedFiles.length))}
          </p>
        )}
        {syncStatus === "error" && progress?.errorMessage && (
          <p className="tw-m-0 tw-text-xs tw-text-danger">
            {progress.errorMessage}
          </p>
        )}
      </div>

      {/* 第 5 排:底部独立按钮 — 与卡片等宽自适应,白色边框,循环图标 */}
      <div className="tw-pt-1">
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={busy || syncStatus === "syncing"}
          className={cn(
            "tw-flex tw-w-full tw-items-center tw-justify-center tw-gap-2 tw-rounded-md tw-border tw-border-surface-border tw-bg-white tw-px-5 tw-py-3 tw-text-sm tw-font-medium tw-text-foreground tw-shadow-sm tw-transition-colors",
            "hover:tw-bg-gray-50 hover:tw-border-primary hover:tw-text-primary",
            "disabled:tw-cursor-not-allowed disabled:tw-opacity-60"
          )}
        >
          <svg
            className="tw-h-4 tw-w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9 a9 9 0 0 1 14.85 -3.36 L23 10 M1 14 l4.64 4.36 A9 9 0 0 0 20.49 15" />
          </svg>
          <span>{tr(plugin, "syncNowButton")}</span>
        </button>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────

function statusLabel(plugin: LLMWikiPlugin, s: SyncStatus): string {
  switch (s) {
    case "syncing":
      return tr(plugin, "syncStatusSyncing");
    case "completed":
      return tr(plugin, "syncStatusCompleted")
        .replace("{}", "0")
        .replace("{}", "0")
        .replace("{}", "0");
    case "error":
      return tr(plugin, "syncStatusError");
    case "idle":
    default:
      return tr(plugin, "syncStatusIdle");
  }
}

/**
 * 把 SyncService 阶段映射到 i18n 阶段文案,优先用 phase 阶段,
 * uploading 阶段把当前文件名带在后面。
 */
function phaseLabel(
  plugin: LLMWikiPlugin,
  phase: string,
  currentFile: string,
): string {
  switch (phase) {
    case "enumerating":
      return tr(plugin, "syncPhaseEnumerating");
    case "creatingKb":
      return tr(plugin, "syncPhaseCreatingKb");
    case "listingDocs":
      return tr(plugin, "syncPhaseListingDocs");
    case "uploading":
      return tr(plugin, "syncPhaseUploading").replace("{}", currentFile);
    default:
      return tr(plugin, "syncProgressTemplate").replace("{}", currentFile);
  }
}
