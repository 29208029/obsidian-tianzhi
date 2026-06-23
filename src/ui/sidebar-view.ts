// Sidebar ItemView — hosts the two-tab 天智 panel in the right sidebar.
// Tab 1: Chat (renders the QueryModal UI inline; no duplicated logic)
// Tab 2: Wiki Sync (React 18 + Tailwind, lifted from tianzhi AuthGate)

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createElement, type ReactNode } from 'react';
import React from 'react';
import { StyleProvider, createCache } from '@ant-design/cssinjs';
import LLMWikiPlugin from '../main';
import { getText } from '../utils';
import { QueryModal } from '../wiki/query-engine';
import { ChatRenderer } from '../wiki/chat-renderer';
import { SyncPanel } from './sync-panel-react';
import { MaintainPanel } from './maintain-panel-react';
import { SidebarHeader } from './sidebar-header-react';
import kaosLogo from '../assets/kaos_logo.png';

export const SIDEBAR_VIEW_TYPE = 'llm-wiki-sidebar';

export type SidebarTabId = 'chat' | 'maintain' | 'sync';

interface MountedPanel {
  unmount(): void;
}

export class SidebarView extends ItemView {
  private plugin: LLMWikiPlugin;
  private activeTab: SidebarTabId;
  private rootEl: HTMLElement | null = null;
  private tabBarEl: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private mountedPanel: MountedPanel | null = null;
  // Header (logo + user dropdown) also hosts a React tree (antd Dropdown),
  // so it gets its own React root + cssinjs <style> tag, lifecycle-bound.
  private mountedHeader: MountedPanel | null = null;
  private antdHeaderStyleEl: HTMLStyleElement | null = null;
  // antd cssinjs cache lifecycle is tied to the panel mount.
  // Cache is created on demand in mountSyncReact and discarded on unmount
  // by removing its injected <style> tag, preventing accumulation across
  // tab switches.
  private antdStyleEl: HTMLStyleElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LLMWikiPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.activeTab = plugin.settings.activeSidebarTab ?? 'chat';
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getIcon(): string {
    return 'message-square';
  }

  getDisplayText(): string {
    return getText(this.plugin.settings.language, 'sidebarTitle');
  }

  async onOpen(): Promise<void> {
    const viewContent = this.containerEl.children[1] as HTMLElement;
    viewContent.empty();
    viewContent.addClass('llm-wiki-sidebar-view-content');

    this.rootEl = viewContent.createDiv({ cls: 'llm-wiki-sidebar-root' });
    const headerEl = this.rootEl.createDiv({ cls: 'llm-wiki-sidebar-header' });
    // Header is React-rendered: logo on the left, user info dropdown on the
    // right. CSS still applies the .llm-wiki-sidebar-header class (flex,
    // padding) so layout is preserved across popout windows.
    this.mountedHeader = mountHeaderReact(this.plugin, headerEl);
    this.rootEl.createDiv({ cls: 'llm-wiki-sidebar-divider' });
    this.tabBarEl = this.rootEl.createDiv({ cls: 'llm-wiki-sidebar-tabs' });
    this.panelEl = this.rootEl.createDiv({ cls: 'llm-wiki-sidebar-content' });

    this.renderTabBar();
    this.renderActiveTab();
  }

  async onClose(): Promise<void> {
    this.disposePanel();
    this.disposeHeader();
    this.rootEl?.remove();
    this.rootEl = null;
    this.tabBarEl = null;
    this.panelEl = null;
  }

  private disposeHeader(): void {
    if (!this.mountedHeader) return;
    try {
      this.mountedHeader.unmount();
    } catch (err) {
      console.error('SidebarView: header unmount failed:', err);
    }
    if (this.rootEl) {
      // header is the first child of rootEl — defensive empty in case
      // unmount() left orphan nodes
      const headerEl = this.rootEl.querySelector('.llm-wiki-sidebar-header');
      headerEl?.empty();
    }
    this.mountedHeader = null;
    this.antdHeaderStyleEl?.remove();
    this.antdHeaderStyleEl = null;
  }

  /**
   * Programmatically switch to a tab (e.g. from a command).
   * Persists the choice so the next open lands on the same tab.
   */
  switchTab(tab: SidebarTabId): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.plugin.settings.activeSidebarTab = tab;
    void this.plugin.saveSettings();
    this.renderTabBar();
    this.renderActiveTab();
  }

  getActiveTab(): SidebarTabId {
    return this.activeTab;
  }

  private renderTabBar(): void {
    if (!this.tabBarEl) return;
    this.tabBarEl.empty();

    const tabs: Array<{ id: SidebarTabId; label: string; icon: string }> = [
      {
        id: 'chat',
        label: getText(this.plugin.settings.language, 'tabChat'),
        icon: 'message-square',
      },
      {
        id: 'maintain',
        label: getText(this.plugin.settings.language, 'tabMaintain'),
        icon: 'wrench',
      },
      {
        id: 'sync',
        label: getText(this.plugin.settings.language, 'tabSync'),
        icon: 'refresh-cw',
      },
    ];

    for (const tab of tabs) {
      const btn = this.tabBarEl.createEl('button', {
        cls: 'llm-wiki-sidebar-tab',
      });
      setIcon(btn, tab.icon);
      btn.createSpan({ text: tab.label });

      if (tab.id === this.activeTab) {
        btn.addClass('llm-wiki-sidebar-tab-active');
      }
      btn.addEventListener('click', () => this.switchTab(tab.id));
    }
  }

  private renderActiveTab(): void {
    if (!this.panelEl) return;
    // disposePanel 同步释放 React root / QueryModal 资源并清空容器;
    // mount 之后才能挂新的 panel,顺序不能反
    this.disposePanel();
    // this.panelEl.empty() 不需要:unmount 已经清空了 DOM

    if (this.activeTab === 'chat') {
      this.mountedPanel = mountChatInline(this.plugin, this.panelEl);
    } else if (this.activeTab === 'maintain') {
      this.mountedPanel = mountMaintainReact(this.plugin, this.panelEl);
    } else {
      this.mountedPanel = mountSyncReact(this.plugin, this.panelEl);
    }
  }

  private disposePanel(): void {
    if (!this.mountedPanel) return;
    try {
      this.mountedPanel.unmount();
    } catch (err) {
      console.error('SidebarView: panel unmount failed:', err);
    }
    // Fallback: even if unmount() threw, the panel may still hold DOM nodes.
    // Without this fallback, the next renderActiveTab() would append fresh
    // DOM siblings to a still-mounted subtree (user-visible as duplicate
    // chat / sync panels after a tab switch that races a panel teardown).
    // Force-clear so the next mount starts from a known-empty container.
    if (this.panelEl) this.panelEl.empty();
    this.mountedPanel = null;
  }
}

/**
 * Mount the chat UI inline inside the sidebar by creating a QueryModal
 * instance WITHOUT calling .open(). We never call open(), so no modal
 * chrome (overlay, scrim, click-outside handler) is ever created. The
 * chat DOM is built directly into the given container by ChatRenderer.
 *
 * QueryModal's internal fields (historyContainer, inputArea, sendBtn, ...)
 * are populated by the renderer. All existing methods on QueryModal
 * (sendMessage, stopGeneration, saveToWiki, clearHistory, etc.) work
 * unchanged because they only reference those fields.
 *
 * unmount() tears down the renderer's MarkdownRenderer component and
 * persists conversation history, mirroring QueryModal.onClose.
 */
function mountChatInline(plugin: LLMWikiPlugin, container: HTMLElement): MountedPanel {
  // construct WITHOUT calling .open() — we don't want Obsidian's modal
  // overlay, scrim, or click-outside handler.
  const modal = new QueryModal(plugin.app, plugin);

  // Build the chat UI directly into the sidebar container.
  container.addClass('llm-wiki-inline-query');
  ChatRenderer.renderChatUI(modal, container);

  return {
    unmount(): void {
      // Mirror QueryModal.onClose() — but skip contentEl.empty() since
      // we never opened as a Modal so contentEl is null. Just release
      // the MarkdownRenderer component and persist history.
      if (modal.activeRenderComponent) {
        modal.activeRenderComponent.unload();
        modal.activeRenderComponent = null;
      }
      modal.plugin.settings.queryHistory = modal.history.messages;
      void modal.plugin.saveSettings();
    },
  };
}

/**
 * Mount the SyncPanel (React + Tailwind + antd Switch) into the sidebar
 * container. Two extra concerns beyond a plain React mount:
 *
 * 1. antd's CSS-in-JS (@ant-design/cssinjs) auto-injects <style> tags.
 *    By default it uses document.head, which Obsidian's
 *    `obsidianmd/prefer-active-doc` rule flags in popout windows. We
 *    wrap the tree in <StyleProvider container={...}> pointing at
 *    activeDocument.head so the rule is honored. (CLAUDE.md:
 *    "document" is forbidden; use activeDocument.)
 *
 * 2. React 18 createRoot.render is async-batched. The DOM nodes React
 *    manages don't actually get removed until the commit phase runs.
 *    flushSync forces the commit to happen inside the unmount() call,
 *    so by the time we return, container is empty and safe for the
 *    next mount.
 */
function mountSyncReact(plugin: LLMWikiPlugin, container: HTMLElement): MountedPanel {
  container.addClass('llm-wiki-inline-sync');

  // antd v5 cssinjs: explicit <style> container that lives inside
  // activeDocument.head, NOT document.head. Each StyleProvider gets its
  // own cache so React tree owns its style tag; we capture the resulting
  // <style> element on first commit and remove it on unmount to keep
  // <head> clean across tab switches.
  const cache = createCache();
  const head = activeDocument.head;
  const styleEl = activeDocument.createElement('style');
  styleEl.setAttribute('data-llm-wiki-antd', 'true');
  head.appendChild(styleEl);

  const root: Root = createRoot(container);
  // 强制断言为带 children 的组件类型。createElement 第二个参数走
  // props 类型检查,这里手工构造 children 位置参数会触发
  // "Property 'children' is missing" — 用 as any 绕过 React 的
  // createElement 重载推断。Type 本身在 cast 那里已是
  // 已知正确的 StyleProvider 签名,这里只是抑制工具误报。
  const StyleProviderTyped = StyleProvider as unknown as React.ComponentType<{
    cache: ReturnType<typeof createCache>;
    container: Element | ShadowRoot;
    children?: ReactNode;
  }>;
  root.render(
    createElement(
      StyleProviderTyped,
      { cache, container: styleEl } as never,
      createElement(SyncPanel, { plugin })
    )
  );

  return {
    unmount(): void {
      // flushSync + unmount: commit phase runs synchronously, React 真正
      // 删除 DOM 节点后再返回。这避免与后续的 panelEl.empty() 或新
      // React mount 竞争同一棵 DOM 树
      try {
        flushSync(() => {
          root.unmount();
        });
      } catch (err) {
        console.error('SidebarView: react root unmount failed:', err);
      }
      // 清理 antd 注入的 <style> 节点,避免多次 tab 切换后 <head>
      // 累积大量 antd hash 规则
      try {
        styleEl.remove();
      } catch {
        // styleEl 已被外部移除(例如插件卸载);忽略
      }
    },
  };
}

/**
 * Mount the MaintainPanel (React + Tailwind + antd Tooltip) into the
 * sidebar container. Mirrors mountSyncReact lifecycle exactly:
 *
 *   - Own antd cssinjs cache + <style> tag, appended to activeDocument.head
 *     (not document.head) to honor Obsidian's prefer-active-doc rule.
 *     The data-* attribute is distinct from the sync panel's so multiple
 *     <style> tags can coexist and each unmount removes only its own.
 *
 *   - flushSync + root.unmount so React commits DOM removal synchronously
 *     before the next panel mounts.
 *
 * The wrapper <StyleProvider> is needed because MaintainPanel uses antd
 * <Tooltip>; without it, antd cssinjs would inject into document.head.
 */
function mountMaintainReact(plugin: LLMWikiPlugin, container: HTMLElement): MountedPanel {
  container.addClass('llm-wiki-inline-maintain');

  const cache = createCache();
  const head = activeDocument.head;
  const styleEl = activeDocument.createElement('style');
  styleEl.setAttribute('data-llm-wiki-antd', 'maintain');
  head.appendChild(styleEl);

  const root: Root = createRoot(container);
  const StyleProviderTyped = StyleProvider as unknown as React.ComponentType<{
    cache: ReturnType<typeof createCache>;
    container: Element | ShadowRoot;
    children?: ReactNode;
  }>;
  root.render(
    createElement(
      StyleProviderTyped,
      { cache, container: styleEl } as never,
      createElement(MaintainPanel, { plugin })
    )
  );

  return {
    unmount(): void {
      try {
        flushSync(() => {
          root.unmount();
        });
      } catch (err) {
        console.error('SidebarView: maintain react root unmount failed:', err);
      }
      try {
        styleEl.remove();
      } catch {
        // already removed
      }
    },
  };
}

/**
 * Mount the sidebar header (logo + user dropdown) as a React tree.
 *
 * Mirrors mountSyncReact: own cssinjs cache + <style> tag because the
 * header hosts an antd <Dropdown>. The <style> tag is removed in unmount
 * to keep activeDocument.head clean.
 */
function mountHeaderReact(plugin: LLMWikiPlugin, container: HTMLElement): MountedPanel {
  container.addClass('llm-wiki-sidebar-header-inner');

  const cache = createCache();
  const head = activeDocument.head;
  const styleEl = activeDocument.createElement('style');
  styleEl.setAttribute('data-llm-wiki-antd-header', 'true');
  head.appendChild(styleEl);

  const root: Root = createRoot(container);

  const StyleProviderTyped = StyleProvider as unknown as React.ComponentType<{
    cache: ReturnType<typeof createCache>;
    container: Element | ShadowRoot;
    children?: ReactNode;
  }>;

  root.render(
    createElement(
      StyleProviderTyped,
      { cache, container: styleEl } as never,
      // Fragment so we can keep logo (static <img>) and SidebarHeader
      // (dynamic) as siblings without an extra wrapper that would break
      // the parent flex space-between layout.
      createElement(
        React.Fragment,
        null,
        createElement('img', {
          className: 'llm-wiki-sidebar-logo',
          src: kaosLogo,
          alt: 'logo',
        }),
        createElement(SidebarHeader, { plugin })
      )
    )
  );

  return {
    unmount(): void {
      try {
        flushSync(() => {
          root.unmount();
        });
      } catch (err) {
        console.error('SidebarView: header react root unmount failed:', err);
      }
      try {
        styleEl.remove();
      } catch {
        // already removed
      }
    },
  };
}