# LLM Wiki Plugin Project Development Standards

**Last Updated:** 2026-06-12

---

## Current Phase: v1.18.2 — Custom Extraction Limits Hard-Enforced (Issue #120) — Released 2026-06-12

### Completed (v1.18.2) — Released 2026-06-12
- ✅ **Issue #120 (customEntityLimit/customConceptLimit hard-enforced).** Single 11-line slice in `src/wiki/source-analyzer.ts` (pre-`buildSourceAnalysis`) closes the silent-overflow bug in custom extraction mode. The LLM's "extract at most N" prompt hint is now actually enforced — 685 tests passing (684 → 685, +1 new end-to-end test for the cap).
- ✅ **Issue #114 (tags preservation on re-ingest) and Issue #111 (configurable slug casing)** community contributions from @DocTpoint shipped in the same window.

## Completed (v1.18.0) — Released 2026-06-11

### Completed (v1.18.0) — Released 2026-06-11
- ✅ **Issue #85 v2 (chip input UX)**: replaced v1's textarea CSV with GitHub-Issue-Labels-style chip input. Each tag renders as a discrete chip + × button. Add via Enter / `,` / `;`; remove via × click or Backspace on empty input. Duplicate tags (case-insensitive) are silently skipped with a brief shake animation. CJK IME composition is respected.
- ✅ **No standalone "Tag Vocabulary" heading**: settings sub-block is now embedded inside Wiki Configuration as a `setName()` row (no `.setHeading()`), reflecting the conceptual hierarchy.
- ✅ **Default-mode description enumerates actual defaults**: shows the concrete default list inline (`person, organization, project, … (entities) / theory, method, … (concepts)`) so users know what they will get.
- ✅ **v1 → v2 migration on `onload()`**: `cleanupVocabularyTags()` normalizes any pre-v2 CSV (trim, dedupe case-insensitively, drop empty) and writes back to `data.json`.
- ✅ **`enforceFrontmatterConstraints` honors the active vocabulary** via new `getActiveEntityTags` / `getActiveConceptTags` helpers. Three call-sites (page-factory, lint-fixes × 2) pass `this.ctx.settings`.
- ✅ **`minAppVersion` bumped 1.6.6 → 1.11.0** to use `Setting.addComponent()`.
- ✅ **8-language i18n**: rewritten 2 descs, added 5 new keys, removed 1 key. Mirrored in all 8 locales.
- ✅ **Tests**: 628 tests passing (605 → 628, +23 new), 0 regressions. New `jsdom@29.1.1` devDep for chip input tests.
- ✅ **de.ts trailing-comma fix**: 6 other language files had the same issue — all fixed in lockstep.
- ✅ **Tests**: 549/549 passing. 4-Gate clean.

### Completed (v1.16.2) — Released 2026-06-07
- ✅ **Issue #94: Lint cancellation**: AbortSignal propagated through 5 fix-runner functions. `try/finally` wraps all persistent Notices.
- ✅ **Issue #96: Lint granularity**: `appendGranularityToPrompt` injects extractionGranularity into lint LLM analysis. 4 tests.
- ✅ **Issue #99 + #86: Thinking token bleeding**: Three-layer defense — API `disableThinking` + `parseJsonResponse` strip + `cleanMarkdownResponse` Layer B2 preamble detection.
- ✅ **ROADMAP P3 #11**: `parseJsonResponse` strips `<think>`/`<thinking>` before brace-counting.
- ✅ **ROADMAP P3 #12**: `disableThinking` interface on `LLMClient` with `thinking.type='disabled'`, Test Connection probe + cache, 400 fallback.
- ✅ **Issue #103: Delete empty stubs**: Lint modal button + 8-language i18n + try/finally.
- ✅ **Tests**: 549/549 (+37 new tests). 4-Gate: lint 0/0, tsc 0, test 549, build clean.

### Completed (v1.16.0)
- ✅ **Issue #81: Sources normalization**: 4 pure functions in `src/core/sources-normalizer.ts`, 22 tests, Lint integration (section 0.5), startup quick fixes. 6 pollution patterns → canonical `[[sources/X]]`. 572 files/1616 entries cleaned on reporter's ~3800-page vault.
- ✅ **Issue #75: LM Studio 8K + token cap**: Removed `source-analyzer.ts:113` shadow constant. New Context Window setting (dropdown 4K~1M) caps max_tokens + truncation retry. LMStudio provider added. `capMaxTokens` pure function.
- ✅ **Issue #76: TOKENS_DEDUP_RESOLUTION 300→1000**: Token budget safety margin. Deleted dead constants `TOKENS_PAGE_MERGE`, `TOKENS_RELATED_UPDATE`.
- ✅ **Alias language fix (replaces PR #82)**: English as linker language, "no invented technical translations" guard. Explicit examples (Transformer≠变换器).
- ✅ **Startup quick fixes**: Default ON. Auto-repair sources + verify wiki structure. Single 10s aggregated Notice.
- ✅ **Settings UX redesign**: LLM-Wiki Status section, LLM Configuration/Wiki Configuration rename, Provider dropdown i18n.

### Deferred to P3 (high mock complexity — current ROI insufficient)
- ⏸ wiki-engine `ingestSource` full-path tests (P2 #4 → P3 #14): requires Obsidian App + 5 submodule mocks
- ⏸ query-engine core flow tests (P2 #5 → P3 #15): requires Modal + MarkdownRenderer + DOM mocks
- ⏸ True streaming for 3rd-party providers: `requestUrl` returns full response, not stream — would need Obsidian native streaming support

### Earlier Releases

Complete version history (v1.14.0 → v1.0.0) is maintained in [ROADMAP.md](ROADMAP.md). CLAUDE.md tracks only the current phase and active work items.

### P0 — Not applicable (v1.16.2 released)

All P0 items resolved. Current phase transitions to cleanup & technical debt.

### P1 — Cleanup (v1.17.0 target)

| Item | Effort |
|------|--------|
| page-factory resolvePagePath LLM fallback + merge + append tests | 1 day |
| runLintWiki phase extraction (762 → 6 × ~130 lines) | half day |
| Fix thinkingControlCache key mismatch when baseUrl is empty | 1h |
| Fix deleteEmptyStubs callback error handling | 1h |
| Update thinkingControlSupported after successful 400 fallback | 1h |
| Broaden isThinkingControlError detection patterns | 30min |
| Skip unnecessary thinking probe for Anthropic clients | 30min |

### P2 — Test infrastructure (deferred, high mock complexity)

| Item | Effort | Reason |
|------|--------|--------|
| wiki-engine ingestSource full-path integration tests | 2-3 days | Requires Obsidian App + 5 submodule mocks |
| query-engine core flow tests (Layer 1/2/3) | 1-2 days | Requires Modal + MarkdownRenderer + DOM mocks |

### P3 — Backlog

| Item | Effort |
|------|--------|
| Good First Issue tagging | 10min |
| Tag vocabulary ecosystem (Issues #85/#90/#91) | 2-3 days |
| Restore true streaming for 3rd-party providers | 1-2 days |

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

---

## 📁 Project Structure

```
src/
├── main.ts                         # Plugin entry point
├── types.ts                        # Shared types + EngineContext
├── utils.ts                        # Utilities (slugify, parseJson, etc.)
├── texts.ts                        # i18n texts (barrel, 8 languages)
├── llm-client.ts                   # LLM clients
├── wiki/                           # Wiki engine
│   ├── wiki-engine.ts              # Orchestrator
│   ├── query-engine.ts             # Conversational query
│   ├── source-analyzer.ts          # Iterative batch extraction
│   ├── page-factory.ts             # Entity/concept CRUD + merge
│   ├── conversation-ingest.ts      # Chat → wiki knowledge
│   ├── lint-fixes.ts               # Fix logic
│   ├── lint-controller.ts          # Lint orchestration
│   ├── lint/                       # Lint sub-modules
│   ├── contradictions.ts           # Contradiction detection
│   ├── system-prompts.ts           # Language directive + labels
│   └── prompts/                    # LLM prompt templates
├── schema/                         # Schema co-evolution
├── ui/
│   ├── settings.ts                 # Settings panel
│   └── modals.ts                   # Lint/Ingest/Query modals
└── __tests__/                      # Unit tests (vitest, 121 tests)
```

---

## 🛡️ Six-Gate Quality Closure

Every change must pass all six gates before being considered complete. Gates 1-4 are developer-responsible (checked during development and in Step 2 of the release workflow). Gates 5-6 are automated by `pre-release-gate` before user approval.

| Gate | Constraint | How | Who |
|------|-----------|-----|-----|
| **1. Code correct** | `pnpm lint` 0/0 + `npx tsc --noEmit` 0/0 + `pnpm test` all pass + `pnpm build` clean | 4-Gate script | Developer |
| **2. No side effects** | Call-site audit + data flow trace + state mutation check + error propagation check | Structured review | Developer |
| **3. No breaking changes** | API/Schema/File format/Default behavior/Command IDs/Obsidian API all backward-compatible | Breaking-change matrix | Developer |
| **4. No performance regression** | CPU/memory/IO/network/token usage — 5-dim walkthrough, written assessment table | simplify + code-review + Gate 4 table | Developer |
| **5. Docs complete** | 8 READMEs + ROADMAP + CLAUDE.md + CHANGELOG + memory all updated | pre-release-gate | Gate |
| **6. Release clean (superset of 1-5)** | Gate 1-5 all green, PLUS TOC anchors + localization + Release Notes + Contributors + git hygiene + **Gate 4 perf re-verification** | pre-release-gate | Gate |

### Gate 1: Four-Gate automated

Must all pass sequentially. If any fails, fix root cause (no `@ts-ignore` or `eslint-disable` to silence):

```bash
pnpm lint           # ESLint + Obsidian rules: 0 errors, 0 warnings
npx tsc --noEmit    # TypeScript: 0 errors (ESLint does NOT check type safety)
pnpm test           # Vitest: all pass, 0 failures
pnpm build          # esbuild: clean exit
```

**Dual Gate critical note**: ESLint and TypeScript are complementary — ESLint does not check type matching, TypeScript does not check code style. Single tool passing is insufficient.

### Gate 2: No Side Effects — structured review

For each modified function, trace:
- **Call-site audit**: `grep -rn "<fn>" src/` → check arguments, return value, error handling
- **Data flow**: inputs (origin?) → outputs (destination?) → side effects (file/API/DOM?)
- **State mutation**: concurrent safety? file overwrite vs append?
- **Error propagation**: new error paths caught by all callers?

**Deliverable**: 3-5 sentence side-effect assessment.

### Gate 3: No Breaking Changes — structured review

| Dimension | Check | Pass Criteria |
|-----------|-------|---------------|
| API Signature | `git diff` + `grep` | All call-sites updated; no new required params without defaults |
| Settings Schema | `types.ts` + `settings.ts` | New fields have defaults; removed fields ignored |
| File Format | Generation templates | Old files load without error |
| Default Behavior | Constructor / config init | Old behavior preserved unless opted in |
| Command/Setting IDs | `grep` for IDs/keys | IDs unchanged |
| Obsidian API | `manifest.json` | `minAppVersion` >= current |

**Deliverable**: "None detected" or specific migration plan.

### Gate 4: No Performance Regression — structured procedure

Performance regressions in this plugin have a user-visible cost (the Lint
phase on a 2000-page vault already runs 60+ seconds). Every change must
explicitly clear five performance dimensions **within the change scope**.

**Procedure** (do not skip):

1. **Run `simplify` skill** (3 parallel agents: Code Reuse / Code Quality / Efficiency). The Efficiency agent covers most of dimension 1-3 below.
2. **Run `code-review` skill** (max effort). Catches performance foot-guns specific to this codebase (e.g., N+1 LLM calls, N+1 vault ops).
3. **Walk through the 5 dimensions below** and produce a written assessment.
4. **If a dimension shows regression** → propose a mitigation OR escalate to user for sign-off. Do NOT silently accept regressions.
5. **If a dimension is N/A** (no code in that path) → state "N/A — no [hot path/IO/etc.] in change scope".

#### Five dimensions to evaluate

| # | Dimension | What to check | Project-specific signals |
|---|-----------|---------------|--------------------------|
| 1 | **CPU** | New O(n²) loops? Synchronous blocking in hot path? Hot loop allocating? | `O(n²) candidate generation` is the known risk — do not regress it. |
| 2 | **Memory** | Unbounded arrays / caches? Event listener leaks? Map growing without eviction? | `thinkingControlCache` (Record per baseUrl) is bounded by user count. `Map<string, PageMeta>` in `generateDuplicateCandidates` holds all pages in memory at once. |
| 3 | **IO** | Redundant file reads? N+1 vault operations? Unnecessary re-serialization? | `vault.read()` per page in loops is expensive. `vault.modify()` per page × N. Index regen on every fix call (was pre-fix). |
| 4 | **Network** | Extra LLM calls per operation? Redundant API requests? Missing cache reuse? | `OpenAICompatibleClient.createMessage` should cache 400-fallback results (Issue #245). Lint dedup batches by 100 / budget 500 — overshooting is a real risk (Issue #99 followup). |
| 5 | **Token usage** | Increased prompt size? Unnecessary context in LLM calls? Wrong model? | Ingest prompts are 1-3K tokens. Lint dedup prompt = 100 candidates × ~30 tokens = 3K per batch. Be especially alert to LLM retries (each retry consumes the full prompt again). |

**Deliverable** (mandatory in commit body or PR description):
```
## Gate 4: Performance

| Dim | Status | Notes |
|-----|--------|-------|
| CPU | ✅ / ⚠️ / N/A | ... |
| Memory | ✅ / ⚠️ / N/A | ... |
| IO | ✅ / ⚠️ / N/A | ... |
| Network | ✅ / ⚠️ / N/A | ... |
| Token | ✅ / ⚠️ / N/A | ... |
```

A bare "no regression" without the table is **not acceptable**.

#### Anti-patterns that bypass Gate 4

- "I didn't touch the slow path" — hot paths can be regressed by adjacent changes (e.g., adding an extra vault.read() inside a loop).
- "simplify didn't flag it" — simplify's Efficiency agent is a starting point, not a complete audit. The 5-dim walkthrough is mandatory.
- "Premature optimization" — true for speculative work, false when measuring the change you're about to ship.

### Gate 5 + Gate 6

Gate 6 is a **superset of Gates 1-5**: re-verifies everything is still green
*plus* release-specific hygiene. Automated by the `pre-release-gate`
skill before user approval (release Step 5c). The skill's REPORT phase
must include:

- All Gate 1 mechanical checks (lint/tsc/test/build) — re-run, do not trust cached
- All Gate 4 dimensions marked with explicit ✅ / ⚠️ / N/A based on the change scope
- Gate 5 docs verification (checklist sweep)
- Gate 6 release hygiene (TOC anchors, i18n completeness, Contributors policy, git commit format)

If any dimension regresses between commit and release time, Gate 6
**fails** even if Gate 1-4 passed at commit time.

### ⚠️ Anti-patterns

- "The tests pass, so it's fine" → Tests only cover what you thought to test
- "It's just a one-line change" → One-line changes are the most dangerous
- "I'll add tests later" → Tests must accompany the change
- "The PR review will catch it" → The reviewer has less context than you
- "ESLint passes, TypeScript errors are fine" → ESLint does NOT check type safety

### ⚠️ Obsidian Plugin Submission Rules — `document` is forbidden in production

**`document`** (the bare global) is **strictly forbidden** in production code. Obsidian is a multi-window application — `document` may refer to the wrong window. The only valid document reference is **`activeDocument`** (Obsidian's popout-window-aware wrapper).

**`obsidianmd/prefer-active-doc` is a no-disable rule** in the Obsidian Community Plugin review pipeline. You **cannot** use `// eslint-disable-next-line obsidianmd/prefer-active-doc` in any file that will be submitted for review — the review bot will reject it regardless of the comment's description.

**Test-environment differences must be solved in test setup, not production code.** If jsdom lacks `activeDocument`, stub it in `src/__tests__/__support__/setup.ts`:

```typescript
// eslint-disable-next-line obsidianmd/no-global-this
(globalThis as Record<string, unknown>).activeDocument = globalThis.document;
```

Production code then simply uses `activeDocument` directly — no fallback, no eslint-disable comments.

This rule exists because Obsidian's review ruleset is stricter than the local ESLint config. **Local `pnpm lint` passing does NOT guarantee Obsidian review will pass.**

## ⚠️ Editor Discipline — No Bulk Scripts for Code

Every code change via `Read` + `Edit`. No sed/awk/python AST for code. (2026-06-11: a brace-matching script broke 3 sites that 4-Gate still passed — wrong lexical block in `query-engine.ts`, unsafe `this: any` in `lint-controller.ts`.)

## ⚠️ Git Safety Protocol

- **NEVER commit or push without explicit user permission.** Non-negotiable.

## 📦 Development Workflow

1. `pnpm lint && pnpm test && npx tsc --noEmit && pnpm build` — all four must pass (Six-Gate Gate 1)

### Build modes

- `pnpm build` — **production** build (console.debug disabled, no sourcemap). Use for release.
- `pnpm build:dev` — **debug** build (inline sourcemap + console.debug preserved). Use when the user requests a local test build.
- `pnpm dev` — **watch** mode (rebuilds on file change, same as build:dev but stays running).

When the user says "build local debug file for testing" or asks for manual testing files:
1. Run `pnpm build:dev` to generate `main.js` (2MB+ with inline sourcemap)
2. Verify `main.js` ends with `//# sourceMappingURL=data:application/json;base64,...`
3. Confirm `console.debug` is NOT replaced (header should not contain `console.debug = function(){};`)
4. The 3 output files are: `main.js`, `manifest.json`, `styles.css`
5. Offer to zip them or tell the user the paths
2. Update relevant docs and memory
3. Present change summary for user review
4. Commit locally after user approval (do NOT push directly to main)
5. When ready to push: create a feature branch, push the branch, create a PR, **merge via `gh pr merge`** (or GitHub UI)
6. After PR merge: pull main, create tag (NO `v` prefix), push tag
7. Wait for GitHub Actions to create Draft Release
8. Generate release notes (via `/obsidian-plugin-release` skill)
9. **Main branch is protected** — direct pushes are rejected with `GH013`

```bash
# Push workflow (main is protected)
git checkout -b chore/vX.Y.Z-release
git push origin chore/vX.Y.Z-release
gh pr create --title "chore: bump version to X.Y.Z" --body "## Summary\n...\n\n## Test plan\n- [x] ..." --base main
gh pr merge <PR#> --merge --delete-branch
git checkout main && git pull origin main

# Tag (after PR merge, NO 'v' prefix)
git tag -a X.Y.Z -m "X.Y.Z"
git push origin X.Y.Z
```

## Tag & Release workflow

**Use `/obsidian-plugin-release` skill for complete release preparation.**

Tags are pushed AFTER the PR is merged to main:
```bash
# Ensure you're on the latest main with the merged commit
git checkout main && git pull origin main
git tag -a X.Y.Z -m "X.Y.Z"
git push origin X.Y.Z
# GitHub Actions creates the draft release automatically
```

**Before version bump commit**, verify ALL items in skill's Pre-Release Checklist:
- All 8 READMEs' "What's New" section REPLACED (not appended)
- TOC links match actual heading text exactly
- CHANGELOG.md entry added
- Lockfiles regenerated (pnpm + npm official registry)

---

## 📋 Karpathy Philosophy Compliance

- **Knowledge compounds** — query results flow back into wiki
- **Human-in-the-loop** — LLM suggests, user decides
- **Three-layer architecture** — Sources → Wiki → Schema
- **Incremental accumulation** — wiki is persistent, not one-shot

## 🎯 Python Zen Design Principles

- **Simple > Complex** — comment not framework
- **Flat > Nested** — linear code beats micro-methods
- **Solve when it hurts** — don't optimize before measuring
- **Explicit > Implicit** — function types ARE documentation

## 🔑 Key Design Decisions

- **Tier 1/2 duplicate detection**: Tier 1 always verified (high-precision), Tier 2 fills token budget
- **`Promise.allSettled` error isolation**: One failure doesn't crash the batch
- **Pollution defense at write gate**: Centralized regex catches ALL sources
- **LLM semantic page selection**: Meaning-based matching, not keyword

---

## 🌍 Internationalization

- **UI**: 8 languages, 269+ fields
- **Wiki output**: 8 languages + custom input
- **Code**: English only, minimal comments

## 📋 Git Commit Standards

English, conventional commits. `feat:` `fix:` `docs:` `refactor:` `test:` `chore:`

### Auto-close issues via commit message

When a commit resolves tracked Issues, append `Closes #N` (or `Fixes #N` / `Resolves #N`) at the end of the commit body. This triggers GitHub to auto-close the issue when the commit hits the default branch.

```bash
git commit -m "fix: batch P0 fixes

- #94: propagate AbortSignal to fix-runners
- #96: inject extractionGranularity into lint

Closes #94, #96, #99"
```

**NEVER** use `gh issue close` or the GitHub UI to close issues manually — let the commit message do it. This keeps the git history → issue link intact and avoids premature closure before the code reaches default branch.

## 🧪 Development Quality Closure (TDD + Planning)

**Mandatory development loop for every code change** (new feature, bug fix, refactor). This is a quality closure — skipping any step is a violation.

```
1. Deep thinking    → What is the problem? Edge cases? Failure modes?
2. Plan             → Files to change, function signatures, side effects
3. Write test       → Failing test that defines expected behavior
4. Confirm RED      → Run test, verify it fails for the right reason
5. Implement        → Minimum code to make the test pass
6. Confirm GREEN    → Run test, verify it passes
7. Refactor         → Clean up; tests must still pass
8. 4-Gate verify    → lint + tsc + test + build all clean
9. Six-Gate review  → side effects + breaking + performance + doc + release
```

**When tests are required** (mandatory):
- New exported function, class, or module
- New behavior branch (any new if/else path)
- **Bug fix** — the test reproduces the bug; the fix makes the test pass
- Refactor that changes observable behavior

**When tests are optional**:
- Pure configuration, type-only changes, documentation

**Pre-existing code**: when modifying a function with zero tests, add at least one test for the changed path first.

**Why this is a closure, not a checklist**: Each step depends on the previous. Skipping "design test" leads to misaligned implementation. Skipping "confirm RED" means you don't know if the test actually catches the bug. Skipping "refactor" accumulates technical debt. Skipping "4-Gate" lets broken code reach PR.

**Real example (2026-06-02)**: When extracting `parseSSEEvents`, the initial implementation was written first (TDD violation). User caught it. Corrected flow: 11 failing tests → confirmed all fail with `parseSSEEvents is not a function` → wrote minimal implementation → tests pass → fixed unused import warning + `isolatedModules` type export → 4-Gate green.

**🔴 Real example — TDD shell failure (2026-06-02, Issue #81)**: Wrote 4 `fixPollutedSources` tests, all using inline format `sources: ["..."]`. Production code took the **multi-line** path `sources:\n  - "..."`. A regex-only diff returned `fixed=2` but content didn't actually change. User discovered at runtime: "every Notice shows the same number, no real cleanup". This is the **shell test** failure mode — tests pass but don't verify behavior.

**Mandatory test rules (effective 2026-06-02)**:
1. **Cover ALL production code paths.** If a function branches on input format (inline vs multi-line, JSON vs YAML, etc.), write tests for EACH format. Inspect the production code to find all branches.
2. **Assert content mutation, not just return values.** After calling a mutating function, assert `output !== input` AND `output` contains the expected new content. Asserting `expect(fixed).toBe(N)` is necessary but not sufficient.
3. **Re-scan assertion for idempotency tests.** After one fix, re-invoke the detector on the output. If the detector still reports "polluted", the fix didn't actually work — the test must FAIL, not silently pass.
4. **Inspect actual output during debugging.** When a test passes suspiciously (e.g. "idempotent" passes on first run with no change), run a debug script that prints the function's actual output. Don't trust GREEN without seeing it.

**Test quality principle (root, 2026-06-02)**: A test that passes but does not faithfully simulate real-world behavior, does not cover corner cases, or is written merely to "make it pass" is a **shell test** — it provides false confidence and is worse than no test at all. **High-quality tests are the prerequisite for high-quality code.** If you cannot write a test that would catch a real bug in this function, the test is not yet ready. Write the test that would have caught the production bug — not the test that makes your implementation look right.

**Debug template** for "stuck counter" / "no real change" symptoms:
```ts
// src/__tests__/_tmp/debug.test.ts (delete after debugging)
import { fixX } from '../../core/x';
it('debug', () => {
  const r = fixX(input);
  console.log('OUTPUT:', r);
});
```

**Reference**: [[feedback-tdd-standard]] for full TDD standard with examples.

## ✅ Pre-Release Checklist

**六无门禁 Gate 1 验证：**

```bash
pnpm lint           # Gate 1: ESLint - 0 errors, 0 warnings
npx tsc --noEmit    # Gate 1: TypeScript - 0 errors, 0 warnings
pnpm test           # Gate 1: Tests - all pass, 0 failures
pnpm build          # Gate 1: Build - clean exit
```

**重要**：四个命令必须**全部通过**才能提交。单一工具通过不足够。Gates 2-6 在发布流程中依次验证。

---

## ⚠️ Development Protocol: Plan First, Then Execute

**Before starting any significant change** (refactoring, new modules, prompt modification, architectural decisions, or anything touching core engine files):

1. **Present your plan** — explain what, why, and how
2. **Wait for explicit user approval** before writing code or committing
3. **For multi-phase work**: pause and report after each phase

**Exceptions** (no prior approval needed): trivial one-line fixes, running lint/test/build, reading files, documenting existing code.

**Why**: The user is the domain expert on product vision. The AI has tooling capability but lacks product context. Propose, don't dispose.

## 🧪 TDD: Write Tests First

For any new function or behavior change: write a failing test first, then write the implementation, then refactor. When modifying untested core code, add at least one test for the path you're changing. See TDD Standard above.

---

**Maintainer:** Greener-Dalii | **Repository:** green-dalii/obsidian-llm-wiki
