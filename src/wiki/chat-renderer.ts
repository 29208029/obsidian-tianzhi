// ChatRenderer — extracts the DOM-construction portion of QueryModal.onOpen
// into a static helper so the same UI can be mounted in two places:
//
//  1. As a Modal (called by QueryModal.onOpen) — original behavior, unchanged
//  2. Inline inside a sidebar ItemView (called by sidebar-view.ts) — no
//     modal chrome, no global scrim, no global click-outside handler
//
// Splitting out a single static method is far less code than re-implementing
// the entire chat UI for the sidebar, and the original QueryModal keeps its
// exact same observable behavior.

import { TEXTS } from '../texts';
import { QueryModal } from './query-engine';

// ── SVG icon builder (avoids innerHTML lint rule) ──

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_ATTRS: Record<string, string> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

interface SvgChild {
  tag: string;
  attrs: Record<string, string>;
}

function svgIcon(children: SvgChild[]): SVGElement {
  const el = activeDocument.createElementNS(SVG_NS, 'svg');
  for (const [key, val] of Object.entries(SVG_ATTRS)) {
    el.setAttribute(key, val);
  }
  for (const child of children) {
    const childEl = activeDocument.createElementNS(SVG_NS, child.tag);
    for (const [key, val] of Object.entries(child.attrs)) {
      childEl.setAttribute(key, val);
    }
    el.appendChild(childEl);
  }
  return el;
}

// Shared icon definitions
const ICON_SEND: SvgChild[] = [
  { tag: 'line', attrs: { x1: '22', y1: '2', x2: '11', y2: '13' } },
  { tag: 'polygon', attrs: { points: '22 2 15 22 11 13 2 9 22 2' } },
];

const ICON_SAVE: SvgChild[] = [
  { tag: 'path', attrs: { d: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z' } },
  { tag: 'polyline', attrs: { points: '17 21 17 13 7 13 7 21' } },
  { tag: 'polyline', attrs: { points: '7 3 7 8 15 8' } },
];

const ICON_CLEAR: SvgChild[] = [
  { tag: 'polyline', attrs: { points: '3 6 5 6 21 6' } },
  { tag: 'path', attrs: { d: 'M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2' } },
];

export class ChatRenderer {
  /**
   * Build the chat UI (history + input + buttons) inside `rootEl`, wiring
   * it up to the given QueryModal instance for all behaviors (send, stop,
   * save, clear, render messages, etc.).
   */
  static renderChatUI(modal: QueryModal, rootEl: HTMLElement): void {
    const texts = TEXTS[modal.plugin.settings.language];

    const container = rootEl.createDiv({
      cls: 'llm-wiki-query-container'
    });

    // ── History (messages) ──
    modal.historyContainer = container.createDiv({
      cls: 'llm-wiki-query-history'
    });

    if (modal.history.messages.length === 0) {
      ChatRenderer.renderEmptyState(modal, modal.historyContainer);
    } else {
      modal.history.messages.forEach(msg => {
        modal.renderHistoryMessage(msg.role, msg.content);
      });
    }

    // ── Input area ──
    const inputContainer = container.createDiv({
      cls: 'llm-wiki-query-input-container'
    });

    // Input wrapper: textarea + send button positioned inside
    const inputWrapper = inputContainer.createDiv({
      cls: 'llm-wiki-query-input-wrapper'
    });

    modal.inputArea = inputWrapper.createEl('textarea', {
      attr: {
        placeholder: texts.queryModalPlaceholder,
        rows: '3'
      },
      cls: 'llm-wiki-query-textarea'
    });

    modal.inputArea.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault();
        if (modal.isStreaming) {
          modal.stopGeneration();
        } else if (modal.inputArea.value.trim()) {
          void modal.sendMessage(modal.inputArea.value);
        }
      }
    });

    // Send / Stop button (positioned inside textarea via CSS)
    modal.sendBtn = inputWrapper.createEl('button', {
      cls: 'llm-wiki-query-send-btn',
    });
    modal.sendBtn.appendChild(svgIcon(ICON_SEND));
    modal.sendBtn.addEventListener('click', () => {
      if (modal.isStreaming) {
        modal.stopGeneration();
      } else if (modal.inputArea.value.trim()) {
        void modal.sendMessage(modal.inputArea.value);
      }
    });

    // ── Action bar (save to wiki + clear history) ──
    const actionBar = inputContainer.createDiv({
      cls: 'llm-wiki-query-action-bar'
    });

    // Save to Wiki button
    const saveBtn = actionBar.createEl('button', {
      cls: 'llm-wiki-query-save-btn',
    });
    saveBtn.appendChild(svgIcon(ICON_SAVE));
    saveBtn.createSpan({ text: texts.queryModalSaveButton });
    saveBtn.addEventListener('click', () => {
      if (modal.history.messages.length > 0) {
        void modal.saveToWiki();
      }
    });

    // Clear history button
    const clearBtn = actionBar.createEl('button', {
      cls: 'llm-wiki-query-clear-btn',
    });
    clearBtn.appendChild(svgIcon(ICON_CLEAR));
    clearBtn.createSpan({ text: texts.queryModalClearButton });
    clearBtn.addEventListener('click', () => {
      modal.clearHistory();
    });

    // ── Status bar (history count + token meter) ──
    const statusBar = inputContainer.createDiv({
      cls: 'llm-wiki-query-status-bar'
    });

    modal.historyCountDisplay = statusBar.createDiv({
      cls: 'llm-wiki-query-count'
    });
    const currentRounds = Math.floor(modal.history.messages.length / 2);
    const maxRounds = modal.plugin.settings.maxConversationHistory;
    modal.historyCountDisplay.setText(
      texts.queryModalHistoryCount
        .replace('{}', currentRounds.toString())
        .replace('{}', maxRounds.toString())
    );

    // Token meter
    const tokenMeter = statusBar.createDiv({
      cls: 'llm-wiki-query-token-meter'
    });
    const tokenTrack = tokenMeter.createDiv({
      cls: 'llm-wiki-query-token-track'
    });
    tokenTrack.createDiv({ cls: 'llm-wiki-query-token-fill' });
    tokenMeter.createDiv({
      cls: 'llm-wiki-query-token-label',
      text: '0 / ' + (modal.plugin.settings.maxTokensPerCall > 0 ? modal.plugin.settings.maxTokensPerCall : '∞') + ''
    });
  }

  /** Class used to mark the empty state placeholder inside the history
   *  container. Anywhere we re-render messages we look for this class to
   *  know whether to show or hide the placeholder. */
  static readonly EMPTY_STATE_CLASS = 'llm-wiki-query-empty';

  /**
   * Render the empty state inside `container` (typically historyContainer).
   * Idempotent: if an empty state is already present, the call is a no-op
   * so callers can invoke it freely from sendMessage / clearHistory paths.
   *
   * The empty state has two stacked blocks:
   *   1. A blue tip strip ("AI-powered Q&A based on Wiki") with a 💡 icon
   *   2. A large rounded card with an "AI" avatar and a greeting / intro
   *
   * No real interactivity — the user is meant to start typing in the
   * textarea below.
   */
  static renderEmptyState(modal: QueryModal, container: HTMLElement): void {
    if (container.querySelector('.' + ChatRenderer.EMPTY_STATE_CLASS)) return;

    const texts = TEXTS[modal.plugin.settings.language];
    const empty = container.createDiv({
      cls: ChatRenderer.EMPTY_STATE_CLASS,
    });

    // ── Tip strip ──
    const tip = empty.createDiv({ cls: 'llm-wiki-query-empty-tip' });
    tip.createSpan({
      cls: 'llm-wiki-query-empty-tip-icon',
      text: '💡',
    });
    tip.createSpan({
      cls: 'llm-wiki-query-empty-tip-text',
      text: texts.queryModalEmptyTip,
    });

    // ── AI card ──
    const card = empty.createDiv({ cls: 'llm-wiki-query-empty-card' });
    const avatar = card.createDiv({ cls: 'llm-wiki-query-empty-avatar' });
    avatar.setText('AI');

    const body = card.createDiv({ cls: 'llm-wiki-query-empty-body' });
    body.createDiv({
      cls: 'llm-wiki-query-empty-greet',
      text: texts.queryModalEmptyGreet,
    });
    body.createDiv({
      cls: 'llm-wiki-query-empty-desc',
      text: texts.queryModalEmptyIntro,
    });
  }

  /**
   * Remove the empty state from `container` if present. Called when a
   * message is sent (history goes from 0 → 1) so the placeholder doesn't
   * sit above the first user message.
   */
  static hideEmptyState(container: HTMLElement): void {
    const existing = container.querySelector('.' + ChatRenderer.EMPTY_STATE_CLASS);
    if (existing) existing.remove();
  }
}
