// Vitest global setup — runs once before all test files
// Centralizes obsidian mock to eliminate per-file eslint-disable

import { vi } from 'vitest';

// Polyfill window for code that uses window.setTimeout (e.g. withRetry)
// @ts-expect-error — node test environment, window is not native
// eslint-disable-next-line obsidianmd/no-global-this
globalThis.window = globalThis;

// NoticeMock hoisted to top of file so vi.mock factory can reference it
const { NoticeMock } = vi.hoisted(() => {
  class NoticeMock {
    static instances: Array<{ message: string; hidden: boolean }> = [];
    private _message: string;
    constructor(message: string, _timeout?: number) {
      this._message = message;
      NoticeMock.instances.push({ message, hidden: false });
      // Testing: console intentionally not used
    }
    setMessage(message: string): void {
      this._message = message;
    }
    hide(): void {
      const last = NoticeMock.instances[NoticeMock.instances.length - 1];
      if (last) last.hidden = true;
    }
  }
  return { NoticeMock };
});

// Mock obsidian module globally — all tests inherit this
vi.mock('obsidian', () => ({
  // Basic exports
  normalizePath: (path: string) => path,
  Notice: NoticeMock,
  // TFile/TFolder stubs
  TFile: class {
    path = '';
    basename = '';
    extension = '';
  },
  TFolder: class {
    path = '';
    name = '';
  },
  // Modal base class (simplified for testing)
  Modal: class {
    app: unknown;
    // Testing: HTMLElement stubbed as any to avoid DOM dependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contentEl: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modalEl: any;
    constructor(app: unknown) {
      this.app = app;
      this.contentEl = {};
      this.modalEl = {};
    }
    open() {}
    close() {}
    onOpen() {}
    onClose() {}
  },
  // Platform detection
  Platform: {
    isMacOS: false,
    isMobile: false,
  },
  // MarkdownRenderer
  MarkdownRenderer: {
    renderMarkdown: async () => {},
  },
  // Component
  Component: class {
    load() {}
    unload() {}
  },
  // Network requests — tests control return values via vi.mocked(requestUrl)
  requestUrl: vi.fn(),
}));

// Stub activeDocument for jsdom test environment.
// Production code uses activeDocument (Obsidian's popout-window-aware
// document reference). jsdom only provides `document`, so we alias it
// here so that tests don't need per-file eslint-disable comments.
// eslint-disable-next-line obsidianmd/no-global-this
(globalThis as Record<string, unknown>).activeDocument = globalThis.document;

// Global test environment setup
export function setup(): void {
  // Future: global test state initialization
}

export function teardown(): void {
  // Future: global cleanup
}
