<!--
Thanks for contributing to Tianzhi LLM Wiki! Please fill out the sections below.
The "Third-party Libraries" block is required by the Obsidian Community
Plugin review checklist — leave it filled even if you didn't touch deps.
-->

## Summary

<!-- One-paragraph description of what this PR does and why. -->

## Test plan

<!-- Checklist of how you verified the change. Required before review. -->

- [ ] `pnpm lint` — 0 errors, 0 warnings
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm build` — clean exit, `main.js` / `manifest.json` / `styles.css` generated
- [ ] Manual smoke test in Obsidian (if UI change): describe what you tried

## Third-party Libraries

<!-- Required by the Obsidian Community Plugin review checklist.
If you did NOT add or remove dependencies, copy the block verbatim from
THIRD_PARTY_NOTICES.md. If you DID change dependencies, update
THIRD_PARTY_NOTICES.md first, then paste the updated block here. -->

### Runtime dependencies (bundled into `main.js`)

| Library | Version | License | Purpose |
|---------|---------|---------|---------|
| `react` | 18 | MIT | UI rendering for sidebar header / sync panel |
| `react-dom` | 18 | MIT | DOM mounting for React trees |
| `antd` | ^5.21.0 | MIT | Switch / Dropdown UI components |
| `@ant-design/cssinjs` | ^2.1.2 | MIT | antd CSS-in-JS scoped style isolation |
| `clsx` | ^2.1.1 | MIT | Conditional className composition |
| `tailwind-merge` | ^3.6.0 | MIT | Tailwind class conflict resolution |

### Dev dependencies (build & test only — NOT shipped)

`esbuild`, `typescript`, `eslint`, `tailwindcss`, `postcss`, `autoprefixer`,
`vitest`, `jsdom`, `@types/*`, `obsidian` (types only) — build / test only,
never included in the final `main.js`.

### Network access (declare only if changed)

- [ ] No new outbound network requests introduced.
- [ ] If new network requests were added, they:
  - [ ] go through Obsidian's built-in `requestUrl` (NOT axios / fetch / etc.)
  - [ ] fire only on explicit user action
  - [ ] do not transmit note content without user consent
  - [ ] are documented in `README.md` and `THIRD_PARTY_NOTICES.md`

## Breaking changes

- [ ] No breaking changes.
- [ ] Breaking changes described below with a migration path.

<!-- If checked, describe the change and how users should adapt. -->

## Checklist

- [ ] I have read [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [ ] My change does not introduce new dependencies without updating
      `THIRD_PARTY_NOTICES.md` and the "Third-party Libraries" block above
- [ ] My change does not introduce CDN-loaded scripts or remote `import()`
- [ ] My change does not auto-upload note content
