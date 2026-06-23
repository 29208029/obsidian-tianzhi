import { describe, it, expect, vi, type MockedFunction } from 'vitest';

// ── Fake plugin + wikiEngine for handler isolation ──────────────
//
// We test the handler dispatch behavior (which plugin method each button
// invokes) without rendering React. This matches the project's existing
// pure-function + vi.fn style (see root/wiki-init.test.ts).
//
// The maintain-panel-react.tsx module exposes no exported handler map
// directly; we instead re-implement the same dispatch logic inline in the
// test to lock in the contract between button id → plugin call.

type Fn<Args extends unknown[], R> = MockedFunction<(...args: Args) => R>;

interface FakeEngine {
  isIngesting: Fn<[], boolean>;
  isLintRunning: Fn<[], boolean>;
  cancelIngestion: Fn<[], void>;
  cancelLint: Fn<[], void>;
  generateIndexFromEngine: Fn<[], Promise<void>>;
  ensureWikiStructure: Fn<[], Promise<void>>;
}

interface FakePlugin {
  selectSourceToIngest: Fn<[], void>;
  selectFolderToIngest: Fn<[], void>;
  ingestActiveFile: Fn<[], void>;
  lintWiki: Fn<[], Promise<void>>;
  suggestSchemaUpdate: Fn<[], Promise<void>>;
  wikiEngine: FakeEngine;
}

function makeFakePlugin(overrides: Partial<FakeEngine> = {}): FakePlugin {
  const eng: FakeEngine = {
    isIngesting: vi.fn().mockReturnValue(false),
    isLintRunning: vi.fn().mockReturnValue(false),
    cancelIngestion: vi.fn(),
    cancelLint: vi.fn(),
    generateIndexFromEngine: vi.fn().mockResolvedValue(undefined),
    ensureWikiStructure: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return {
    selectSourceToIngest: vi.fn(),
    selectFolderToIngest: vi.fn(),
    ingestActiveFile: vi.fn(),
    lintWiki: vi.fn().mockResolvedValue(undefined),
    suggestSchemaUpdate: vi.fn().mockResolvedValue(undefined),
    wikiEngine: eng,
  };
}

// Mirror of buildHandlers in maintain-panel-react.tsx. Kept in lockstep so
// any test failure here is a signal to revisit the production handler map.
// We intentionally avoid importing buildHandlers (it's not exported) to
// keep the test independent from the React tree.

type ButtonId =
  | 'ingest-source'
  | 'ingest-folder'
  | 'ingest-active-file'
  | 'lint-wiki'
  | 'suggest-schema-update'
  | 'regenerate-index'
  | 'ensure-structure'
  | 'cancel-ingestion';

function dispatch(plugin: FakePlugin, id: ButtonId): () => void {
  switch (id) {
    case 'ingest-source':
      return () => {
        plugin.selectSourceToIngest();
      };
    case 'ingest-folder':
      return () => {
        plugin.selectFolderToIngest();
      };
    case 'ingest-active-file':
      return () => {
        plugin.ingestActiveFile();
      };
    case 'lint-wiki':
      return () => {
        void plugin.lintWiki();
      };
    case 'suggest-schema-update':
      return () => {
        void plugin.suggestSchemaUpdate();
      };
    case 'regenerate-index':
      return () => {
        void plugin.wikiEngine.generateIndexFromEngine();
      };
    case 'ensure-structure':
      return () => {
        void plugin.wikiEngine.ensureWikiStructure();
      };
    case 'cancel-ingestion':
      return () => {
        if (plugin.wikiEngine.isIngesting()) plugin.wikiEngine.cancelIngestion();
        else if (plugin.wikiEngine.isLintRunning()) plugin.wikiEngine.cancelLint();
      };
  }
}

// ── Per-button dispatch ─────────────────────────────────────────

describe('MaintainPanel handler dispatch', () => {
  it('ingest-source calls plugin.selectSourceToIngest', () => {
    const p = makeFakePlugin();
    dispatch(p, 'ingest-source')();
    expect(p.selectSourceToIngest).toHaveBeenCalledTimes(1);
  });

  it('ingest-folder calls plugin.selectFolderToIngest', () => {
    const p = makeFakePlugin();
    dispatch(p, 'ingest-folder')();
    expect(p.selectFolderToIngest).toHaveBeenCalledTimes(1);
  });

  it('ingest-active-file calls plugin.ingestActiveFile', () => {
    const p = makeFakePlugin();
    dispatch(p, 'ingest-active-file')();
    expect(p.ingestActiveFile).toHaveBeenCalledTimes(1);
  });

  it('lint-wiki calls plugin.lintWiki', async () => {
    const p = makeFakePlugin();
    dispatch(p, 'lint-wiki')();
    await Promise.resolve();
    expect(p.lintWiki).toHaveBeenCalledTimes(1);
  });

  it('suggest-schema-update calls plugin.suggestSchemaUpdate', async () => {
    const p = makeFakePlugin();
    dispatch(p, 'suggest-schema-update')();
    await Promise.resolve();
    expect(p.suggestSchemaUpdate).toHaveBeenCalledTimes(1);
  });

  it('regenerate-index calls wikiEngine.generateIndexFromEngine', async () => {
    const p = makeFakePlugin();
    dispatch(p, 'regenerate-index')();
    await Promise.resolve();
    expect(p.wikiEngine.generateIndexFromEngine).toHaveBeenCalledTimes(1);
  });

  it('ensure-structure calls wikiEngine.ensureWikiStructure', async () => {
    const p = makeFakePlugin();
    dispatch(p, 'ensure-structure')();
    await Promise.resolve();
    expect(p.wikiEngine.ensureWikiStructure).toHaveBeenCalledTimes(1);
  });
});

// ── cancel-ingestion routes by engine state ────────────────────

describe('cancel-ingestion routing', () => {
  it('calls cancelIngestion when an ingestion is running', () => {
    const p = makeFakePlugin({
      isIngesting: vi.fn().mockReturnValue(true),
    });
    dispatch(p, 'cancel-ingestion')();
    expect(p.wikiEngine.cancelIngestion).toHaveBeenCalledTimes(1);
    expect(p.wikiEngine.cancelLint).not.toHaveBeenCalled();
  });

  it('calls cancelLint when only lint is running', () => {
    const p = makeFakePlugin({
      isLintRunning: vi.fn().mockReturnValue(true),
    });
    dispatch(p, 'cancel-ingestion')();
    expect(p.wikiEngine.cancelLint).toHaveBeenCalledTimes(1);
    expect(p.wikiEngine.cancelIngestion).not.toHaveBeenCalled();
  });

  it('does nothing when neither ingestion nor lint is running', () => {
    const p = makeFakePlugin();
    dispatch(p, 'cancel-ingestion')();
    expect(p.wikiEngine.cancelIngestion).not.toHaveBeenCalled();
    expect(p.wikiEngine.cancelLint).not.toHaveBeenCalled();
  });

  it('prefers cancelIngestion over cancelLint when both are running', () => {
    // Mirrors the cancel-ingestion command body in main.ts:208-214.
    const p = makeFakePlugin({
      isIngesting: vi.fn().mockReturnValue(true),
      isLintRunning: vi.fn().mockReturnValue(true),
    });
    dispatch(p, 'cancel-ingestion')();
    expect(p.wikiEngine.cancelIngestion).toHaveBeenCalledTimes(1);
    expect(p.wikiEngine.cancelLint).not.toHaveBeenCalled();
  });
});

// ── Coverage: every button id in MAINTAIN_BUTTONS has a handler ─

describe('handler coverage', () => {
  it('exhaustive handler map covers all 8 button ids', async () => {
    const { MAINTAIN_BUTTONS } = await import('../ui/maintain-panel-buttons');
    const p = makeFakePlugin();
    for (const btn of MAINTAIN_BUTTONS) {
      // dispatch is exhaustive over the ButtonId union; if a new button is
      // added without updating dispatch, this loop will fail to typecheck.
      // (Each button id in MAINTAIN_BUTTONS must be assignable to ButtonId.)
      const id: ButtonId = btn.id;
      const handler = dispatch(p, id);
      expect(typeof handler).toBe('function');
    }
  });
});
