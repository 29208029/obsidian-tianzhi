import { describe, it, expect } from 'vitest';
import {
  MAINTAIN_BUTTONS,
  SECTION_ORDER,
  evaluateAvailability,
  type AvailabilityResult,
  type ButtonAvailabilityCtx,
  type MaintainButtonDef,
} from '../ui/maintain-panel-buttons';

// ── Test helpers ────────────────────────────────────────────────

const IDLE_CTX: ButtonAvailabilityCtx = {
  llmReady: true,
  activeFile: null,
  isIngesting: false,
  isLintRunning: false,
};

function ctxWith(overrides: Partial<ButtonAvailabilityCtx>): ButtonAvailabilityCtx {
  return { ...IDLE_CTX, ...overrides };
}

function findBtn(id: MaintainButtonDef['id']): MaintainButtonDef {
  const btn = MAINTAIN_BUTTONS.find((b) => b.id === id);
  if (!btn) throw new Error(`test setup: button ${id} not found in MAINTAIN_BUTTONS`);
  return btn;
}

/**
 * Narrowed accessor for the AvailabilityResult discriminated union.
 * Returns the reasonKey when the button is disabled, throws when enabled.
 * Using this helper avoids ESLint's @typescript-eslint/no-unsafe-member-access
 * (which fires when expect() chains widen the union to an unresolvable type).
 */
function reasonOf(r: AvailabilityResult): string {
  if (r.enabled) {
    throw new Error('test helper: expected disabled result, got enabled');
  }
  return r.reasonKey;
}

// ── Structural sanity ───────────────────────────────────────────

describe('MAINTAIN_BUTTONS catalog', () => {
  it('contains exactly 8 buttons', () => {
    expect(MAINTAIN_BUTTONS).toHaveLength(8);
  });

  it('groups buttons into 4 sections in the expected order', () => {
    expect(SECTION_ORDER).toEqual(['ingest', 'maintain', 'index', 'cancel']);
    const sectionOf = (id: MaintainButtonDef['id']): MaintainButtonDef['section'] => {
      const b = MAINTAIN_BUTTONS.find((x) => x.id === id);
      if (!b) throw new Error(`test setup: ${id} not found`);
      return b.section;
    };
    expect(MAINTAIN_BUTTONS.filter((b) => b.section === 'ingest')).toHaveLength(3);
    expect(MAINTAIN_BUTTONS.filter((b) => b.section === 'maintain')).toHaveLength(2);
    expect(MAINTAIN_BUTTONS.filter((b) => b.section === 'index')).toHaveLength(2);
    expect(MAINTAIN_BUTTONS.filter((b) => b.section === 'cancel')).toHaveLength(1);
    expect(sectionOf('ingest-source')).toBe('ingest');
    expect(sectionOf('lint-wiki')).toBe('maintain');
    expect(sectionOf('regenerate-index')).toBe('index');
    expect(sectionOf('cancel-ingestion')).toBe('cancel');
  });

  it('marks only cancel-ingestion as disabledWhenIdle', () => {
    const idleDisabled = MAINTAIN_BUTTONS.filter((b) => !b.enabledWhenIdle);
    expect(idleDisabled.map((b) => b.id)).toEqual(['cancel-ingestion']);
  });

  it('flags ingest-active-file as the only requiresActiveMd button', () => {
    const needsFile = MAINTAIN_BUTTONS.filter((b) => b.requiresActiveMd);
    expect(needsFile.map((b) => b.id)).toEqual(['ingest-active-file']);
  });
});

// ── evaluateAvailability: LLM gate ──────────────────────────────

describe('evaluateAvailability: LLM gate', () => {
  it('disables ingest-source when LLM not ready', () => {
    const r = evaluateAvailability(findBtn('ingest-source'), ctxWith({ llmReady: false }));
    expect(r).toEqual({ enabled: false, reasonKey: 'maintainPanelReasonNeedLLMConfig' });
  });

  it('disables ingest-folder when LLM not ready', () => {
    const r = evaluateAvailability(findBtn('ingest-folder'), ctxWith({ llmReady: false }));
    expect(reasonOf(r)).toBe('maintainPanelReasonNeedLLMConfig');
  });

  it('disables lint-wiki and suggest-schema-update when LLM not ready', () => {
    for (const id of ['lint-wiki', 'suggest-schema-update'] as const) {
      const r = evaluateAvailability(findBtn(id), ctxWith({ llmReady: false }));
      expect(reasonOf(r)).toBe('maintainPanelReasonNeedLLMConfig');
    }
  });

  it('enables index buttons even without LLM', () => {
    for (const id of ['regenerate-index', 'ensure-structure'] as const) {
      const r = evaluateAvailability(findBtn(id), ctxWith({ llmReady: false }));
      expect(r).toEqual({ enabled: true });
    }
  });
});

// ── evaluateAvailability: active file gate ──────────────────────

describe('evaluateAvailability: active file gate', () => {
  it('enables ingest-source without any active file (it opens a picker)', () => {
    const r = evaluateAvailability(findBtn('ingest-source'), ctxWith({ activeFile: null }));
    expect(r).toEqual({ enabled: true });
  });

  it('disables ingest-active-file when no file is open', () => {
    const r = evaluateAvailability(findBtn('ingest-active-file'), ctxWith({ activeFile: null }));
    expect(reasonOf(r)).toBe('maintainPanelReasonNeedActiveFile');
  });

  it('disables ingest-active-file when active file is not .md', () => {
    const r = evaluateAvailability(
      findBtn('ingest-active-file'),
      ctxWith({ activeFile: { extension: 'pdf', basename: 'paper' } }),
    );
    expect(reasonOf(r)).toBe('maintainPanelReasonNeedMarkdownFile');
  });

  it('enables ingest-active-file when active file is .md', () => {
    const r = evaluateAvailability(
      findBtn('ingest-active-file'),
      ctxWith({ activeFile: { extension: 'md', basename: 'note' } }),
    );
    expect(r).toEqual({ enabled: true });
  });

  it('prefers the LLM reason over the file reason when both fail', () => {
    const r = evaluateAvailability(
      findBtn('ingest-active-file'),
      ctxWith({ llmReady: false, activeFile: null }),
    );
    expect(reasonOf(r)).toBe('maintainPanelReasonNeedLLMConfig');
  });
});

// ── evaluateAvailability: idle gate (cancel) ────────────────────

describe('evaluateAvailability: idle gate (cancel-ingestion)', () => {
  it('disables cancel when engine is idle', () => {
    const r = evaluateAvailability(findBtn('cancel-ingestion'), IDLE_CTX);
    expect(reasonOf(r)).toBe('maintainPanelReasonNothingToCancel');
  });

  it('enables cancel when an ingestion is running', () => {
    const r = evaluateAvailability(
      findBtn('cancel-ingestion'),
      ctxWith({ isIngesting: true }),
    );
    expect(r).toEqual({ enabled: true });
  });

  it('enables cancel when lint is running', () => {
    const r = evaluateAvailability(
      findBtn('cancel-ingestion'),
      ctxWith({ isLintRunning: true }),
    );
    expect(r).toEqual({ enabled: true });
  });

  it('cancel ignores LLM state (enabled without LLM when engine is busy)', () => {
    const r = evaluateAvailability(
      findBtn('cancel-ingestion'),
      ctxWith({ llmReady: false, isIngesting: true }),
    );
    expect(r).toEqual({ enabled: true });
  });
});

// ── evaluateAvailability: full grid sanity ──────────────────────

describe('evaluateAvailability: full state grid', () => {
  it('LLM ready + .md active + idle → all buttons except cancel are enabled', () => {
    const fullCtx: ButtonAvailabilityCtx = {
      llmReady: true,
      activeFile: { extension: 'md', basename: 'note' },
      isIngesting: false,
      isLintRunning: false,
    };
    for (const btn of MAINTAIN_BUTTONS) {
      const r = evaluateAvailability(btn, fullCtx);
      if (btn.id === 'cancel-ingestion') {
        expect(r).toEqual({ enabled: false, reasonKey: 'maintainPanelReasonNothingToCancel' });
      } else {
        expect(r).toEqual({ enabled: true });
      }
    }
  });

  it('LLM ready + no active file + idle → only ingest-active-file disabled', () => {
    const r = evaluateAvailability(
      findBtn('ingest-active-file'),
      ctxWith({ activeFile: null }),
    );
    expect(reasonOf(r)).toBe('maintainPanelReasonNeedActiveFile');

    for (const id of ['ingest-source', 'ingest-folder', 'lint-wiki', 'regenerate-index'] as const) {
      expect(evaluateAvailability(findBtn(id), ctxWith({ activeFile: null }))).toEqual({
        enabled: true,
      });
    }
  });

  it('LLM not ready + busy → cancel + index buttons are enabled (they do not need LLM)', () => {
    // regenerate-index and ensure-structure never require LLM, so they
    // remain enabled even when llmReady=false. cancel is enabled because
    // the engine is busy (something to cancel).
    const ctx: ButtonAvailabilityCtx = {
      llmReady: false,
      activeFile: null,
      isIngesting: true,
      isLintRunning: false,
    };
    const enabledIds: MaintainButtonDef['id'][] = [];
    for (const b of MAINTAIN_BUTTONS) {
      if (evaluateAvailability(b, ctx).enabled) enabledIds.push(b.id);
    }
    expect(enabledIds.sort()).toEqual(
      ['cancel-ingestion', 'ensure-structure', 'regenerate-index'].sort(),
    );
  });
});
