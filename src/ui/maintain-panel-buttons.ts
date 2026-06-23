// MaintainPanel button metadata + availability evaluator.
//
// Pure data + pure functions, no React / Obsidian imports. The React panel
// (`maintain-panel-react.tsx`) imports MAINTAIN_BUTTONS and evaluateAvailability
// to render the UI; the unit tests in __tests__/maintain-panel-buttons.test.ts
// exercise evaluateAvailability across every state combination.
//
// Adding a new command button: add a MaintainButtonDef entry below; the React
// panel renders it automatically inside its declared section.

export type MaintainButtonId =
  | 'ingest-source'
  | 'ingest-folder'
  | 'ingest-active-file'
  | 'lint-wiki'
  | 'suggest-schema-update'
  | 'regenerate-index'
  | 'ensure-structure'
  | 'cancel-ingestion';

export type SectionId = 'ingest' | 'maintain' | 'index' | 'cancel';

// i18n keys for the 4 sections. Reuse the existing syncPanel* keys that
// were already reserved in src/texts/*.ts but never wired to code.
export const SECTION_LABEL_KEY: Record<SectionId, string> = {
  ingest: 'syncPanelIngestSection',
  maintain: 'syncPanelMaintainSection',
  index: 'syncPanelIndexSection',
  cancel: 'syncPanelCancel',
};

// Display order of sections in the panel.
export const SECTION_ORDER: readonly SectionId[] = ['ingest', 'maintain', 'index', 'cancel'] as const;

export interface MaintainButtonDef {
  id: MaintainButtonId;
  /** i18n key for the button label (already in texts) */
  labelKey: string;
  /** i18n key for the tooltip describing the button's function */
  tooltipKey: string;
  /** Which section the button belongs to */
  section: SectionId;
  /** True if the button calls an LLM-backed command */
  requiresLLM: boolean;
  /** True if the button needs a currently-open Markdown file */
  requiresActiveMd: boolean;
  /**
   * False only for `cancel-ingestion`: idle state shows the button as
   * disabled with "nothing to cancel" reason. All other buttons are enabled
   * at idle (gated by other conditions).
   */
  enabledWhenIdle: boolean;
}

export const MAINTAIN_BUTTONS: MaintainButtonDef[] = [
  // ── Ingest ──
  {
    id: 'ingest-source',
    labelKey: 'syncPanelIngestFile',
    tooltipKey: 'maintainPanelTooltipIngestSource',
    section: 'ingest',
    requiresLLM: true,
    requiresActiveMd: false,
    enabledWhenIdle: true,
  },
  {
    id: 'ingest-folder',
    labelKey: 'syncPanelIngestFolder',
    tooltipKey: 'maintainPanelTooltipIngestFolder',
    section: 'ingest',
    requiresLLM: true,
    requiresActiveMd: false,
    enabledWhenIdle: true,
  },
  {
    id: 'ingest-active-file',
    labelKey: 'syncPanelIngestActive',
    tooltipKey: 'maintainPanelTooltipIngestActive',
    section: 'ingest',
    requiresLLM: true,
    requiresActiveMd: true,
    enabledWhenIdle: true,
  },

  // ── Maintain ──
  {
    id: 'lint-wiki',
    labelKey: 'syncPanelLint',
    tooltipKey: 'maintainPanelTooltipLint',
    section: 'maintain',
    requiresLLM: true,
    requiresActiveMd: false,
    enabledWhenIdle: true,
  },
  {
    id: 'suggest-schema-update',
    labelKey: 'syncPanelSuggestSchema',
    tooltipKey: 'maintainPanelTooltipSuggestSchema',
    section: 'maintain',
    requiresLLM: true,
    requiresActiveMd: false,
    enabledWhenIdle: true,
  },

  // ── Index ──
  {
    id: 'regenerate-index',
    labelKey: 'syncPanelRegenerateIndex',
    tooltipKey: 'maintainPanelTooltipRegenerateIndex',
    section: 'index',
    requiresLLM: false,
    requiresActiveMd: false,
    enabledWhenIdle: true,
  },
  {
    id: 'ensure-structure',
    labelKey: 'syncPanelEnsureStructure',
    tooltipKey: 'maintainPanelTooltipEnsureStructure',
    section: 'index',
    requiresLLM: false,
    requiresActiveMd: false,
    enabledWhenIdle: true,
  },

  // ── Cancel ──
  {
    id: 'cancel-ingestion',
    labelKey: 'syncPanelCancel',
    tooltipKey: 'maintainPanelTooltipCancel',
    section: 'cancel',
    requiresLLM: false,
    requiresActiveMd: false,
    enabledWhenIdle: false,
  },
];

/**
 * Snapshot of the runtime state evaluateAvailability needs to decide whether
 * a button should be enabled. Constructed in the React component from
 * `plugin.isLLMReady()`, `plugin.getActiveFile()`, and `plugin.getEngineBusy()`.
 */
export interface ButtonAvailabilityCtx {
  llmReady: boolean;
  /** Subset of TFile the buttons actually consult: extension + basename. */
  activeFile: { extension: string; basename: string } | null;
  isIngesting: boolean;
  isLintRunning: boolean;
}

export type AvailabilityResult =
  | { enabled: true }
  | { enabled: false; reasonKey: string };

/**
 * Pure decision function: given a button def and current context, decide
 * whether the button should be enabled. If disabled, also return the i18n
 * key for the reason (used as the hover tooltip when disabled).
 *
 * Rules (evaluated top-to-bottom, first matching reason wins):
 *   1. `enabledWhenIdle === false` and engine idle → "nothingToCancel"
 *   2. `requiresLLM` and not llmReady → "needLLMConfig"
 *   3. `requiresActiveMd` and no active file → "needActiveFile"
 *   4. `requiresActiveMd` and active file is not .md → "needMarkdownFile"
 *   5. otherwise → enabled
 */
export function evaluateAvailability(
  btn: MaintainButtonDef,
  ctx: ButtonAvailabilityCtx,
): AvailabilityResult {
  if (!btn.enabledWhenIdle && !(ctx.isIngesting || ctx.isLintRunning)) {
    return { enabled: false, reasonKey: 'maintainPanelReasonNothingToCancel' };
  }
  if (btn.requiresLLM && !ctx.llmReady) {
    return { enabled: false, reasonKey: 'maintainPanelReasonNeedLLMConfig' };
  }
  if (btn.requiresActiveMd) {
    if (!ctx.activeFile) {
      return { enabled: false, reasonKey: 'maintainPanelReasonNeedActiveFile' };
    }
    if (ctx.activeFile.extension !== 'md') {
      return { enabled: false, reasonKey: 'maintainPanelReasonNeedMarkdownFile' };
    }
  }
  return { enabled: true };
}
