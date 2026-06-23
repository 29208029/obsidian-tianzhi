// MaintainPanel — "维护Wiki" tab content (React + Tailwind + antd Tooltip)
//
// Mirrors the architectural pattern of sync-panel-react.tsx:
//   - props: { plugin } so handlers can call back into LLMWikiPlugin methods
//   - useEffect subscribes to Obsidian workspace events for live re-render
//     when the user switches files / tabs
//   - antd Tooltip (placement="left") wraps every button so hover shows the
//     tooltip OR the disabled-reason text
//
// Why polling for engine busy state instead of subscribing to wikiEngine
// callbacks: the wikiEngine's setIngestionCallbacks/setLintCallbacks are
// already wired to the status bar (main.ts:254-274). Adding another
// subscriber for the sidebar would duplicate that plumbing. A 500ms poll
// is cheap (two boolean reads) and bounded — interval is cleared on unmount.

import { useEffect, useRef, useState, type ReactElement } from "react";
import { Notice } from "obsidian";
import { Tooltip } from "antd";
import LLMWikiPlugin from "../main";
import { getText } from "../utils";
import { cn } from "../lib/utils";
import {
  MAINTAIN_BUTTONS,
  SECTION_ORDER,
  SECTION_LABEL_KEY,
  evaluateAvailability,
  type MaintainButtonId,
} from "./maintain-panel-buttons";

interface MaintainPanelProps {
  plugin: LLMWikiPlugin;
}

const BUTTON_BASE_CLASS = cn(
  "tw-w-full tw-rounded-md tw-bg-primary tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors tw-text-left",
  "hover:tw-bg-primary-hover hover:tw-text-white",
  "disabled:tw-cursor-not-allowed disabled:tw-opacity-60",
);

function tr(plugin: LLMWikiPlugin, key: string): string {
  return getText(plugin.settings.language, key as Parameters<typeof getText>[1]);
}

/**
 * Build a handler map from button id to the underlying plugin / engine call.
 * Centralized here so render() stays declarative and the handler list is
 * auditable in one place. Each handler trusts the upstream command to
 * enforce its own preconditions (LLM ready / active file checks) — the panel
 * only gates the *button enabled state*, not the action itself.
 */
function buildHandlers(plugin: LLMWikiPlugin): Record<MaintainButtonId, () => void> {
  const wikiEngine = plugin.wikiEngine;
  return {
    'ingest-source': () => plugin.selectSourceToIngest(),
    'ingest-folder': () => plugin.selectFolderToIngest(),
    'ingest-active-file': () => plugin.ingestActiveFile(),
    'lint-wiki': () => void plugin.lintWiki(),
    'suggest-schema-update': () => void plugin.suggestSchemaUpdate(),
    'regenerate-index': () => {
      // Mirrors the regenerate-index command body in main.ts:185-196
      void (async () => {
        new Notice(tr(plugin, "regenerateIndexCompleted") + "...");
        try {
          await wikiEngine.generateIndexFromEngine();
          new Notice(tr(plugin, "regenerateIndexCompleted"));
        } catch (err) {
          console.error("Regenerate index failed:", err);
          const msg = err instanceof Error ? err.message : String(err);
          new Notice(tr(plugin, "operationFailed") + msg);
        }
      })();
    },
    'ensure-structure': () => {
      // No LLM needed; just create folders + schema. Mirrors settings.ts:708.
      void wikiEngine.ensureWikiStructure().then(
        () => {
          new Notice(tr(plugin, "regenerateIndexCompleted"));
        },
        (err: unknown) => {
          console.error("Ensure wiki structure failed:", err);
          const msg = err instanceof Error ? err.message : String(err);
          new Notice(tr(plugin, "operationFailed") + msg);
        },
      );
    },
    'cancel-ingestion': () => {
      if (wikiEngine.isIngesting()) {
        wikiEngine.cancelIngestion();
      } else if (wikiEngine.isLintRunning()) {
        wikiEngine.cancelLint();
      }
    },
  };
}

export function MaintainPanel({ plugin }: MaintainPanelProps): ReactElement {
  // ── Live state ────────────────────────────────────────────────
  // llmReady is computed once at mount; the panel is remounted on every
  // tab switch, so re-reading on LLM-config change is unnecessary —
  // settings mutations effectively trigger a fresh read when the user
  // switches back to the Maintain tab.
  const [llmReady] = useState(() => plugin.isLLMReady());
  const [activeFile, setActiveFile] = useState(() => {
    const f = plugin.getActiveFile();
    return f ? { extension: f.extension, basename: f.basename } : null;
  });
  const [engineBusy, setEngineBusy] = useState(() => plugin.getEngineBusy());

  // Keep latest plugin in a ref so the polling interval callback doesn't
  // capture a stale closure if plugin reference ever changes (defensive —
  // LLMWikiPlugin is a singleton in practice).
  const pluginRef = useRef(plugin);
  pluginRef.current = plugin;

  useEffect(() => {
    const refreshFile = (): void => {
      const f = pluginRef.current.getActiveFile();
      setActiveFile(f ? { extension: f.extension, basename: f.basename } : null);
    };
    const refreshBusy = (): void => {
      setEngineBusy(pluginRef.current.getEngineBusy());
    };

    const app = plugin.app;
    const ev1 = app.workspace.on("active-leaf-change", refreshFile);
    const ev2 = app.vault.on("rename", refreshFile);
    const ev3 = app.workspace.on("layout-change", refreshFile);

    const intervalId = window.setInterval(refreshBusy, 500);

    return () => {
      app.workspace.offref(ev1);
      app.vault.offref(ev2);
      app.workspace.offref(ev3);
      window.clearInterval(intervalId);
    };
  }, [plugin]);

  // ── Handlers (built once per plugin) ──────────────────────────
  const handlers = buildHandlers(plugin);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="tw-flex tw-flex-col tw-gap-4 tw-p-4 tw-overflow-y-auto">
      {SECTION_ORDER.map((sectionId) => {
        const sectionButtons = MAINTAIN_BUTTONS.filter((b) => b.section === sectionId);
        if (sectionButtons.length === 0) return null;
        return (
          <section key={sectionId} className="tw-flex tw-flex-col tw-gap-2">
            <h3 className="tw-m-0 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-muted">
              {tr(plugin, SECTION_LABEL_KEY[sectionId])}
            </h3>
            <div className="tw-flex tw-flex-col tw-gap-2">
              {sectionButtons.map((btn) => {
                const av = evaluateAvailability(btn, {
                  llmReady,
                  activeFile,
                  isIngesting: engineBusy.ingesting,
                  isLintRunning: engineBusy.lintRunning,
                });
                const tooltipTitle = av.enabled
                  ? tr(plugin, btn.tooltipKey)
                  : tr(plugin, av.reasonKey);
                return (
                  <Tooltip
                    key={btn.id}
                    title={tooltipTitle}
                    placement="left"
                    mouseEnterDelay={0.3}
                  >
                    <button
                      type="button"
                      className={BUTTON_BASE_CLASS}
                      disabled={!av.enabled}
                      onClick={() => handlers[btn.id]()}
                    >
                      {tr(plugin, btn.labelKey)}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
