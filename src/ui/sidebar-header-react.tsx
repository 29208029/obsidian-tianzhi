// SidebarHeader (React + Tailwind + antd Popover)
//
// 顶部 LOGO 行最右侧的用户信息区域：头像 + 全名（自适应宽度）。
// hover 时弹出 Popover 卡片，展示账户详细信息（非空字段）与退出登录按钮。
//
// 关键设计:
// 1. 组件通过 useEffect 订阅 IAMAuthService;卸载时退订,避免内存泄漏
// 2. 未登录时整个 user menu 渲染为 null,LOGO 行保持纯 logo
// 3. hover 用户名/头像区域弹出 Popover 详情卡片,不依赖点击操作
// 4. 卡片内分三区: 顶部头像+姓名,中间信息行,底部退出登录按钮
// 5. i18n 复用现有 authLogout / authLogoutLoading / authLogoutSuccess /
//    authLogoutFailed 四个 key;用户信息字段直接使用后端返回的原始值
// 6. 卡片仅渲染非空的字段（邮箱/手机号/工号/备注/角色）,避免显式空行

import { useEffect, useState, type ReactElement } from "react";
import { Notice } from "obsidian";
import { Popover } from "antd";
import LLMWikiPlugin from "../main";
import { IAMAuthService } from "../auth/IAMAuthService";
import type { IAMAuthState, IAMUserInfo } from "../auth/IAMTypes";
import { getText } from "../utils";
import { cn } from "../lib/utils";

interface SidebarHeaderProps {
  plugin: LLMWikiPlugin;
}

function tr(plugin: LLMWikiPlugin, key: string): string {
  return getText(plugin.settings.language, key as Parameters<typeof getText>[1]);
}

/** 定义一条在详情卡片中展示的字段 */
interface DetailField {
  /** i18n label，如"邮箱""手机号"——直接用中文硬编码可行，但为了与项目
   *  现有 i18n 体系一致，这里用 getText 取。若后续需要翻译可在 texts 新增。 */
  label: string;
  value: string | undefined | null;
  /** lucide 图标名称（未使用，保留以备将来扩展） */
  icon?: string;
}

/**
 * 构建详情卡片的信息行列表。只包含非空字段，按常见度排序。
 * 字段值需要 trim() 后判断，避免有空格的空串显示占位。
 */
function buildDetailFields(userInfo: IAMUserInfo): DetailField[] {
  const raw: DetailField[] = [
    { label: '手机号', value: userInfo.phone_number, icon: 'phone' },
    { label: '工号', value: userInfo.employee_code, icon: 'badge' },
    { label: '备注', value: userInfo.remark, icon: 'file-text' },
  ];
  return raw.filter((f) => f.value && f.value.trim() !== '');
}

/**
 * 详情卡片内容组件——显示在 Popover 弹出层内。
 * 三区布局：头像 + 姓名 / 详细信息行（等宽两列） / 退出登录按钮
 */
function UserDetailCard({
  userInfo,
  plugin,
  busy,
  onLogout,
}: {
  userInfo: IAMUserInfo;
  plugin: LLMWikiPlugin;
  busy: boolean;
  onLogout: () => void;
}): ReactElement {
  const avatarChar = (userInfo.user_name ?? "?").trim().charAt(0) || "?";
  const fields = buildDetailFields(userInfo);

  return (
    <div className="tw-flex tw-flex-col tw-gap-3 tw-min-w-[220px] tw-max-w-[300px]">
      {/* ── 顶部：头像 + 姓名 ── */}
      <div className="tw-flex tw-items-center tw-gap-3">
        <span
          aria-hidden
          className="tw-flex tw-h-10 tw-w-10 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-bg-primary tw-text-base tw-font-bold tw-text-white"
        >
          {avatarChar.toUpperCase()}
        </span>
        <div className="tw-flex tw-flex-col tw-gap-0 tw-overflow-hidden">
          <span className="tw-text-sm tw-font-semibold tw-leading-tight tw-overflow-hidden tw-text-ellipsis">
            {userInfo.user_name}
          </span>
          {userInfo.email && (
            <span className="tw-text-xs tw-text-muted tw-overflow-hidden tw-text-ellipsis">
              {userInfo.email}
            </span>
          )}
        </div>
      </div>

      {/* ── 分隔线 ── */}
      {fields.length > 0 && <div className="tw-border-t tw-border-surface-border" />}

      {/* ── 中间：详细信息行 ── */}
      {fields.length > 0 && (
        <div className="tw-flex tw-flex-col tw-gap-2">
          {fields.map((f) => (
            <div key={f.label} className="tw-flex tw-items-start tw-gap-2">
              <span className="tw-shrink-0 tw-text-xs tw-font-medium tw-text-muted tw-w-12">
                {f.label}
              </span>
              <span className="tw-text-xs tw-break-all">
                {f.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 底部：退出登录 ── */}
      <button
        type="button"
        disabled={busy}
        onClick={onLogout}
        className={cn(
          "tw-w-full tw-rounded-md tw-border tw-border-surface-border tw-bg-transparent tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-transition-colors",
          "hover:tw-bg-danger hover:tw-border-danger hover:tw-text-white",
          "focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-danger/40",
          "disabled:tw-cursor-not-allowed disabled:tw-opacity-60"
        )}
      >
        {busy ? tr(plugin, "authLogoutLoading") : tr(plugin, "authLogout")}
      </button>
    </div>
  );
}

export function SidebarHeader({ plugin }: SidebarHeaderProps): ReactElement | null {
  const [authState, setAuthState] = useState<IAMAuthState>(() =>
    IAMAuthService.getInstance().getState()
  );
  const [busy, setBusy] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    const unsub = IAMAuthService.getInstance().subscribe((state) => {
      setAuthState(state);
      setBusy(false);
    });
    return () => {
      unsub();
    };
  }, []);

  // 未登录时整个 user menu 隐藏:LOGO 行只显示 logo
  if (!authState.isLoggedIn || !authState.userInfo) {
    return null;
  }

  const userInfo = authState.userInfo;
  const avatarChar = (userInfo.user_name ?? "?").trim().charAt(0) || "?";

  const handleLogout = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await IAMAuthService.getInstance().logout();
      new Notice(tr(plugin, "authLogoutSuccess"));
      setPopoverOpen(false);
    } catch {
      new Notice(tr(plugin, "authLogoutFailed"));
      setBusy(false);
    }
  };

  return (
    // tw-ml-auto:把整个 user menu 推到 LOGO 行最右侧,贴着侧栏右边界
    <div className="tw-ml-auto tw-shrink-0">
      <Popover
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        trigger="hover"
        placement="bottomRight"
        arrow={false}
        classNames={{ root: 'llm-wiki-sidebar-user-popover' }}
        content={
          <UserDetailCard
            userInfo={userInfo}
            plugin={plugin}
            busy={busy}
            onLogout={() => void handleLogout()}
          />
        }
      >
        <button
          type="button"
          aria-label={userInfo.user_name}
          disabled={busy}
          className={cn(
            "tw-flex tw-h-10 tw-shrink-0 tw-items-center tw-gap-2 tw-rounded-full tw-bg-surface-alt tw-pl-1.5 tw-pr-3",
            "hover:tw-bg-surface-alt/80",
            "focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary/40",
            "disabled:tw-cursor-not-allowed disabled:tw-opacity-60"
          )}
        >
          <span
            aria-hidden
            className="tw-flex tw-h-8 tw-w-8 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-bg-primary tw-text-sm tw-font-semibold tw-text-white"
          >
            {avatarChar.toUpperCase()}
          </span>
          <span className="tw-overflow-hidden tw-text-ellipsis tw-text-sm tw-font-medium">
            {userInfo.user_name}
          </span>
        </button>
      </Popover>
    </div>
  );
}
