# LLM Wiki Plugin Roadmap

> Feature planning and improvement proposals

**Version:** 1.18.2 | **Updated:** 2026-06-12

---

## Current Status

### Implemented (v1.18.2) — Custom Extraction Limits Hard-Enforced (Issue #120)

Closes #120, a long-standing silent-overflow bug in custom extraction mode. Previously, when `extractionGranularity` was set to `custom`, the `customEntityLimit` and `customConceptLimit` settings were only enforced as soft prompt hints — the LLM routinely returned 12–25 items for a configured cap of 8, and every one of them was written to wiki pages. The existing convergence detector only stopped *further batches* once both types reached the cap, which never fired on the common single-batch case (most notes). Fix: after all batches are accumulated and immediately before `buildSourceAnalysis()`, the plugin slices both `accumulation.entities` and `accumulation.concepts` to the configured limits. The first N items in extraction order are preserved. The prompt instruction and convergence detector remain as complementary mechanisms (they guide the LLM and avoid unnecessary extra batches). No behavior change for `default` / `1-5` granularity modes. One new end-to-end test locks the behavior.

This release also includes two community contributions that landed in the same window: configurable file-name casing (Issue #111) and tags-preservation on re-ingest (Issue #114).

### Implemented (v1.18.1) — Obsidian Review Compliance Hotfix

**Obsidian Community Plugin source-code review compliance.** The v1.18.0 release was rejected during automated source-code review because production code contained `document` (the bare global DOM reference) alongside `eslint-disable` comments targeting `obsidianmd/prefer-active-doc` — both are forbidden in the Obsidian review pipeline. This hotfix removes the `document` fallback and all related `eslint-disable` comments from production code; the `activeDocument` stub is centralized in the test setup file. No user-visible behavior change.

### Implemented (v1.18.0) — User-Controlled Tag Vocabulary (Issue #85 v6 — end-to-end customTags pipeline)

Closes the long-standing #85 (P3) tag-vocabulary request. v2 ships a chip-input UX (GitHub Issue Labels style) that replaces v1's textarea CSV. Headline wins:

- **Chip input replaces the textarea CSV.** Each tag renders as a discrete chip (rounded pill + × button) inside the input area. Add via Enter / `,` / `;`; remove via × click or Backspace on empty input. Duplicate tags (case-insensitive) are silently skipped with a brief shake animation. CJK IME composition is respected (`event.isComposing` guard). Nested tags with `/` are preserved verbatim.
- **No more standalone "Tag Vocabulary" heading.** The settings sub-block is now embedded inside the Wiki Configuration section as a `setName()` row (no `.setHeading()`), making the visual hierarchy reflect the conceptual hierarchy.
- **Default-mode description enumerates the actual defaults.** When mode = Default, the dropdown description shows `Default uses built-in tags: person, organization, project, product, event, location, other (entities) / theory, method, technology, term, other (concepts).` so users know what they will get without switching modes.
- **v1 → v2 migration runs on `onload()`.** `cleanupVocabularyTags()` normalizes any pre-v2 CSV (trim, dedupe case-insensitively, drop empty entries) and writes back to `data.json` so existing users see clean chips immediately.
- **Eight-language i18n.** 8 new keys per language: `tagVocabularyInlineName/Desc`, `tagVocabularyModeDescDefault/Custom`, `chipDuplicateHint`, plus rewritten `customEntityTagsDesc` / `customConceptTagsDesc` describing chip semantics.
- **🔴 v6: End-to-end customTags pipeline (the actual fix).** Before v6, the user-defined vocabulary was only used for *post-hoc validation* — the LLM was never told about it, so it kept inventing its own subtype names that got silently dropped at write time. v6 closes the loop:
  - **Prompt injection** via new `buildActiveTagVocabularySection()` + `appendTagVocabularyToPrompt()` helpers. The active vocabulary is now injected into ingestion (source-analyzer), page generation (page-factory × 3 sites: new page, merge, rebuild), and lint analyze (lint-controller). The LLM knows exactly which entity/concept types are valid and stops inventing new ones.
  - **Preserve LLM intent on write.** `enforceFrontmatterConstraints` no longer silently drops out-of-vocab tags. It retains all LLM-emitted tags (with a `console.debug` note when the vocabulary diverges) so the user can see what the model produced and decide whether to expand their custom vocabulary. Fallback to `DEFAULT_ENTITY_TAG` / `DEFAULT_CONCEPT_TAG` only when the tags array is genuinely empty.
- **Default tags as editable baseline (v4).** When the persisted custom CSV is empty, the chip input materializes the default vocabulary as fully-editable chips (same `.llm-wiki-tag-chip` class, same × button). No "preview" / read-only distinction.
- **Two-row layout (v5).** Chips on the top row, input on its own row below — natural reading flow, no awkward left-alignment.
- **49 new tests, 0 regressions.** 16 chip input (jsdom), 7 normalize vocabulary, 7 buildActiveTagVocabularySection, 4 appendTagVocabularyToPrompt, 6 preserve-LLM-intent, plus updated legacy tests. 605 → 654 tests passing.
- **`minAppVersion` bumped 1.6.6 → 1.11.0** to use `Setting.addComponent()` (the only Obsidian API that mounts custom DOM into a Setting row). Users on Obsidian <1.11.0 must upgrade to continue using the plugin.
- **New devDep `jsdom@29.1.1`** for chip input test environment (does NOT affect production bundle).

- **🔴 v7: Programmatic tag audit + LLM-assisted retag (the closing of the loop).** Before v7, the Lint pipeline never reported pages whose frontmatter `tags` fall outside the active vocabulary — silently, out-of-vocab tags survived (v6 preserve-LLM-intent). v7 introduces a pure-function `scanTagViolations()` that runs as part of every Lint (zero token cost, <50ms on 2000-page vaults). A new "🏷️ Retag N page(s) with LLM" button in the Lint Modal calls `runRetagViolations()` which sends the page's first-paragraph summary to the LLM with `appendTagVocabularyToPrompt()` injected; the LLM returns a new `tags: string[]` constrained to the active vocabulary, the runner re-validates the response (defensive), and only the `tags:` line of the frontmatter is rewritten — the body is byte-identical to the input. Source pages get their own static `VALID_SOURCE_TAGS` vocabulary (paper / document / article / book / clippings / transcript / notes / other) — no user override per Issue #85 v7 design decision.
- **34 new tests, 0 regressions.** 2 `getActiveSourceTags` + 11 `scanTagViolations` + 5 `runRetagViolations` + 16 already in v6 chip input. 654 → 672 passing.

### Implemented (v1.17.0) — Long-Document Ingestion & Source Attribution

Major quality release addressing previously-unprocessable large sources and a class of metadata-integrity issues that caused silent data corruption. **Closes #90.** Headline wins:

- **Long-document ingestion now works.** A 619KB Chinese source (史记 / Shiji) that previously failed after 3 minutes and 15 items now completes fully, extracting hundreds of entities and concepts. Root causes addressed: (a) custom granularity was hardcoded to 15 items max regardless of caps, (b) `max_tokens` was capped below the response length needed for large batches, (c) truncation retries couldn't grow beyond 16K. Fix: dynamic `initialBatchSize` (capped at 50), `maxBatchesBase` derived from caps, `max_tokens` scales 16K→20K→60K with auto halve-and-retry on truncation.
- **Mentions carry source attribution (footnote-style).** The "Mentions in Source" section now renders each verbatim quote as `- "quote" — [[source-path|display-name]]`, replacing the previous free-form block of untraced quotes. Future page merges can never mix up which quote came from which source.
- **Source pages inherit tags from the source note frontmatter (Issue #90).** The LLM used to inject arbitrary concept names (e.g. `Alzheimer-Demenz`, `Neuroprotektion`) into source pages, polluting the user's tag vocabulary. New `extractSourceTags()` pure helper reads the source note's frontmatter and passes tags directly to the summary-page template, falling back to LLM-derived names only when the source has no tags.
- **Provider settings now sync everywhere.** Switching Provider/API Key/Model in Settings used to fail to reach the wiki engine; the next Ingest/Lint/Query would silently use the old provider. Fixed via `WikiEngine.updateSettings()` that keeps the EngineContext in sync with the live settings object (root cause: `settings.ts` was replacing `plugin.settings` with a NEW object from `tempSettings` spread, but EngineContext captured the OLD reference at construction time).
- **Dates are now programmatic, not LLM-generated.** `enforceFrontmatterConstraints` strips LLM-invented `created`/`updated` dates and replaces them: `created` preserved on merge, `updated` always set to today.
- **Lint reports persisted to log.md** with minute-precision timestamps so multiple same-day Lint runs are distinguishable. The Lint Report Modal shows a `📋 Full report saved to log.md` hint.
- **Custom granularity upper bound raised from 300 to 500** to support professional knowledge bases (legal, medical, deep research).
- **Default Schema documents the new contracts.** Three new sections in the default `wiki-folder/schema/config.md`: Source Page Template (mandates tag inheritance), Date Fields (programmatic, not LLM-generated), Mentions Format (academic-footnote style).
- **Test connection restores live settings on failure.** A failed Test Connection no longer persists broken config; previous settings are restored.
- **38 new tests added (549 → 587)**; 28 test files, 0 regressions.

---

## Next Milestone: v1.18.0 — Cleanup & Test Infrastructure

Focused on closing technical debt and adding integration tests for previously untested core paths.

### v1.18.0 hotfix 1 — Community Contribution Merge (2026-06-11 planned)

A targeted hotfix consolidating community-submitted bug fixes and UX improvements, without bumping the version digit. Scope is the set of PRs that pass 4-gate verification after rebase. Source: 2026-06-11 issue/PR triage.

**P0 — Real data loss / silent overwrite**

| Item | Author | Status | Block | Note |
|------|--------|--------|-------|------|
| **#115 fix(Issue #114): tags preserve on re-ingest** | @DocTpoint | PR open | none | Fixes `mergeFrontmatter` always-emit-tags + `createSummaryPage` reads existing source frontmatter. Sister bug in `enforceFrontmatterConstraints:833` (hardcoded `tags: [DEFAULT_*_TAG]` fallback) flagged in reply — author may fold in |
| **#113 feat(Issue #111): configurable slug casing** | @DocTpoint | PR open | rebase conflict on `utils.ts:36-40` | New `slugCase: 'lower' \| 'preserve'` setting; `computeSlug` always-lowercase-internally for matching, file-creation points optionally preserve case. Doc tweak: warn existing-lowercase-vaults may collide after switch |

**P1 — UX consistency**

| Item | Author | Status | Block | Note |
|------|--------|--------|-------|------|
| **#109 feat: Auto Smart Fix setting** | @dmarchevsky | PR open | rebase + CHANGELOG | Skip Lint modal, run Smart Fix All hands-free. default `false`. Merge first. |
| **#110 feat: status bar mirror** | @dmarchevsky | PR open | rebase + CHANGELOG + dependent on #109 | `makeMirroredNotice()` wrapper for popup+status bar sync. `onFixAll: () => Promise<void>` lets it join AbortSignal. Merge after #109. |

**Out of scope (defer to v1.19.0+):**
- **#112 (event type + 4-layer architecture)** — design unconverged; reply asks @HolyPotatoes1 to clarify arc+sequence vs full type
- **#97 (one-click apply schema suggestions)** — already deferred by owner 2026-06-06
- **#91 (nested tags)** — awaiting #85 in-the-wild feedback

### P1 — Cleanup

| Item | Effort |
|------|--------|
| page-factory resolvePagePath LLM fallback + merge + append tests | 1 day |
| runLintWiki phase extraction (762 → 6 × ~130 lines) | half day |
| Refine error message classification (`context`/`exceed`/`401`/`429`) based on user feedback | 1h |
| Add capability-based provider cache (per-baseUrl observed max prompt size) | 1-2 days |

### P2 — Test Infrastructure (deferred, high mock complexity)

| Item | Effort | Reason |
|------|--------|--------|
| wiki-engine ingestSource full-path integration tests | 2-3 days | Requires Obsidian App + 5 submodule mocks |
| query-engine core flow tests (Layer 1/2/3) | 1-2 days | Requires Modal + MarkdownRenderer + DOM mocks |

### P3 — Backlog

- Good First Issue tagging
- ~~Tag vocabulary ecosystem (Issues #85/#91)~~ — #85 implemented in v1.18.0; #91 (nested-tag UI visualization) still open
- Restore true streaming for 3rd-party providers (requires Obsidian native streaming support)
- **Missing Concept Pages tracker** (v1.18.0+): The LLM lint analysis currently flags missing concept pages ("缺少\"纪传体\"概念页") in prose. Future-work: parse these into structured reports, persist to `wiki-folder/lint/missing-concepts.json`, add a "Create missing concept pages" command, and diff against previous runs. Design intent documented in code (`lint-controller.ts` TODO marker).

### Evaluated & Rejected

| Proposal | Source | Reason |
|----------|--------|--------|
| Hexagonal Architecture refactoring | Audit 1 | Over-engineering for Obsidian plugin; mock alone enables testing |
| Vector search (Ollama embeddings) | Audit 1 | Requires Ollama + embedding model; <1% of users have this |
| Hash-bucket dedup optimization | Audit 1 | No user-reported perf issue; solve when it hurts |
| page-factory try/catch completion | Audit 2 | Exceptions bubble to wiki-engine's centralized error handler by design |
| API URL validation | Audit 1 | Obsidian's requestUrl already validates; self-phishing impossible |

### P3 — Nice-to-have

- #36 — Source title in frontmatter: needs clarification from issue author

### Lint performance (v1.18.0+ future-work)

User-reported bottleneck on 580-page vaults: ~6+ minutes per Lint. The cost concentrates in two LLM call types:

**1. Duplicate detection** (`runDuplicateMerges` in `wiki/lint/fix-runners.ts:runDuplicateMerges` + LLM verify pass in `lint-controller.ts` "lintCheckingDuplicates" block)
- O(N²) pair generation × O(N/100) LLM batches = dominant cost on large vaults.
- Optimization roadmap: (a) hash-bucket prefilter (5-10x pair reduction), (b) embedding-based Tier 2 candidate scoring, (c) per-lint-run memo of LLM-verify results, (d) skip second LLM pass if Tier 1 confidence is below threshold and no diff since last run.

**2. LLM health analysis** (single-shot `llmClient.createMessage` in `lint-controller.ts` "lintAnalyzingLLM" block)
- Single 16K+ token prompt (full wiki index + content sample + findings report) → truncation on large wikis → low-quality output.
- Optimization roadmap: (a) hierarchical 2-pass analyze (per-page signature then reason), (b) skip when programmatic checks found 0 issues, (c) cache results keyed on content hash, (d) parallel chunked analysis.

Design intent + specific code pointers documented inline in `src/wiki/lint-controller.ts` (TODO marker blocks above the relevant code paths). No implementation scheduled — measurement + profiling first.

---

## Version Timeline

| Version | Date | Headline |
|---------|------|----------|
| **1.18.2** | 2026-06-12 | Custom extraction limits hard-enforced (Closes #120) + #114 tags preservation + #111 slug casing |
| **1.18.1** | 2026-06-11 | Obsidian review compliance (document ban + prefer-active-doc) |
| **1.18.0** | 2026-06-10 | Tag controlled vocabulary (Closes #85) |
| 1.17.0 | 2026-06-08 | Long-document ingestion + source attribution (Closes #90) |
| 1.16.3 | 2026-06-07 | v1.16.2 P0 hotfix completion |
| 1.16.2 | 2026-06-07 | Lint cancel + thinking token bleeding + delete empty stubs |
| 1.16.0 | 2026-06-04 | Sources normalization + Context Window + LMStudio |
| 1.15.0 | 2026-06-01 | PR #87/#88 + aliases unification |
| 1.13.0 | 2026-05-26 | ConflictResolver + 6 audited improvements |
| 1.12.0 | 2026-05-20 | Extraction rearchitected, ~80% faster |
| 1.10.0 | 2026-05-15 | Aliases + granularity expansion |
| 1.9.0 | 2026-05-10 | Pollution defense + 14-issue batch |
| 1.8.1 | 2026-05-05 | Rate limit + smart fix all + 53 tests |
| 1.0.0 | initial | First Obsidian release |

### Earlier Versions (v1.16.2 and prior)

Full version history (v1.16.2 → v1.0.0) is preserved in [CHANGELOG.md](CHANGELOG.md). ROADMAP tracks only the current release and active work.

#### Highlights (chronological)

- **v1.16.2 — P0 Bug Fix Batch**: Lint cancel AbortSignal propagation, thinking-token bleeding three-layer defense, delete-empty-stubs.
- **v1.16.0 — Sources Normalization + Client Refinement**: Issue #81 (sources normalizer, 22 tests), Context Window setting, LMStudio provider, startup quick fixes.
- **v1.15.0 — Stability & UX Hotfix**: PR #87/#88 merged, aliases unification.
- **v1.13.0 — Quality & Infrastructure**: ConflictResolver, mock infrastructure, 6 audited improvements.
- **v1.12.0 — Production-Grade Performance**: extraction rearchitected, ~80% faster.
- **v1.10.0 — Aliases + Granularity Expansion**: 4 user-facing improvements.
- **v1.9.0 — Pollution Defense & Quality Upgrade**: 14-issue batch.
- **v1.8.1 — UX Hardening**: rate limit notice, smart fix all, settings reorg.
- **v1.7.20 — Code Quality Phase 1**: 5 deep fixes + modular splits.
- **v1.7.0 and earlier** — see CHANGELOG.md for full history.
