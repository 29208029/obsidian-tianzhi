# Third-party Notices

> **Audience:** Obsidian Community Plugin reviewers and downstream
> maintainers. This file is the authoritative per-library breakdown.
>
> For the high-level summary, see [`README.md`](README.md) → **Third-party
> Libraries**.

Tianzhi LLM Wiki is distributed under the MIT License (see
[`LICENSE`](LICENSE)). It bundles a small set of third-party open-source
libraries at build time. All bundled libraries use MIT-compatible licenses
(MIT, BSD-2-Clause, Apache-2.0, ISC) and present no copyleft conflict with
this plugin's MIT license.

## Inventory

### Runtime dependencies — bundled into `main.js`

| # | Library | Version (package.json) | License | Upstream | What we use it for | Where in source |
|---|---------|------------------------|---------|----------|--------------------|-----------------|
| 1 | `react` | `18` (exact) | MIT | https://github.com/facebook/react | UI rendering for sidebar header and sync panel React trees | `src/ui/sidebar-view.ts`, `src/ui/sidebar-header-react.tsx`, `src/ui/sync-panel-react.tsx` |
| 2 | `react-dom` | `18` (exact) | MIT | https://github.com/facebook/react | DOM mounting for React trees via `createRoot` / `flushSync` | `src/ui/sidebar-view.ts` |
| 3 | `antd` | `^5.21.0` | MIT | https://github.com/ant-design/ant-design | `Switch` (sync panel) and `Dropdown` (sidebar user menu) | `src/ui/sync-panel-react.tsx`, `src/ui/sidebar-header-react.tsx` |
| 4 | `@ant-design/cssinjs` | `^2.1.2` | MIT | https://github.com/ant-design/cssinjs | Scoped `<style>` containers so antd's CSS-in-JS doesn't leak across Obsidian popout windows; uses `StyleProvider` + `createCache` | `src/ui/sidebar-view.ts` |
| 5 | `clsx` | `^2.1.1` | MIT | https://github.com/lukeed/clsx | Conditional `className` composition in the shared `cn()` helper | `src/lib/utils.ts` |
| 6 | `tailwind-merge` | `^3.6.0` | MIT | https://github.com/dcastil/tailwind-merge | Resolves conflicting Tailwind utility classes inside `cn()` | `src/lib/utils.ts` |

### Dev dependencies — build / test only, **not shipped**

The following are declared in `package.json` `devDependencies` and used only
during local development. **None of them are included in the final `main.js`,
`manifest.json`, or `styles.css` that users install.**

- **Build:** `esbuild` (MIT), `typescript` (Apache-2.0),
  `tailwindcss` (MIT), `postcss` (MIT), `autoprefixer` (MIT),
  `npm-run-all2` (MIT)
- **Lint:** `eslint` (MIT), `@typescript-eslint/eslint-plugin` (MIT),
  `@typescript-eslint/parser` (MIT), `eslint-plugin-obsidianmd` (MIT)
- **Test:** `vitest` (MIT), `jsdom` (MIT)
- **Types:** `@types/node` (MIT), `@types/react` (MIT),
  `@types/react-dom` (MIT), `tslib` (0BSD), `obsidian` (MIT — types only,
  the real `obsidian` module is provided by Obsidian at runtime)

## Network access — what talks to the internet?

**No third-party HTTP client is bundled.** All network requests go through
**Obsidian's built-in `requestUrl`** (Electron `net` module). The plugin
contains zero usage of `axios`, `fetch`, `node-fetch`, `got`, `ky`, or any
other HTTP library.

Network requests fire **only** in response to explicit user actions:

| # | Trigger | Destination | Code path |
|---|---------|-------------|-----------|
| 1 | Click **Test Connection** in settings | User-configured LLM provider | `src/ui/settings.ts`, `src/llm-client.ts` |
| 2 | Run **Ingest / Query / Lint** | User-configured LLM provider | `src/llm-client.ts`, `src/wiki/wiki-engine.ts` |
| 3 | Click **Login** in the IAM auth panel | `cosmoplat.com` domain (Tianzhi IAM) | `src/auth/IAMAuthService.ts`, `src/auth/IAMTokenManager.ts`, `src/auth/cosmo-gpt-bootstrap.ts` |
| 4 | Click **Sync** in the sidebar | `cosmoplat.com` domain (Tianzhi KB) | `src/sync/kb-client.ts`, `src/sync/sync-service.ts` |

There is **no telemetry, no auto-upload of note content, and no background
beacon**. A note: when local LLM providers (Ollama, LM Studio) are used, no
data leaves the user's machine.

## File system access — what does the plugin read / write?

- **Read:** any note in the user's vault (for ingestion), the plugin's own
  `data.json` (settings + cache), `wiki/` and `schema/` directories (for
  lint and query).
- **Write:** only files under `wiki/` and `schema/`. **Source files in
  `sources/` (or anywhere else) are never modified.**
- A `reviewed: true` flag in frontmatter protects manually-edited pages
  from being overwritten by the LLM.

## Clipboard access

Used **only** by the "Copy" button in the Query modal. No clipboard read;
write is gated behind an explicit click.

## Lockfiles

Both `package-lock.json` (npm) and `pnpm-lock.yaml` (pnpm) are committed at
the repository root. Reviewers can verify declared versions against these
files.

## Audit history

| Date | Action |
|------|--------|
| 2026-06-22 | Removed dead dependencies `axios`, `lucide-react`, `class-variance-authority` — declared but never imported from `src/`. Network requests are 100% via Obsidian `requestUrl`. |
