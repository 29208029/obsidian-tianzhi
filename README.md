# 🧠 Tianzhi LLM Wiki — AI Knowledge Base for Obsidian

> AI-powered structured knowledge base that ingests your notes and generates a
> connected Wiki — entities, concepts, and bidirectional links. Chat with your
> knowledge; answers are grounded in *your* notes, with `[[wiki-links]]` back
> to every source.

**English** | [中文](docs/README_CN.md)

![License](https://img.shields.io/badge/license-MIT-green?style=flat-square) ![Obsidian](https://img.shields.io/badge/obsidian-1.11.0%2B-purple?style=flat-square) ![Maintenance](https://img.shields.io/badge/maintenance-active-brightgreen?style=flat-square) ![Build](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square) ![Tests](https://img.shields.io/badge/tests-731%20passing-brightgreen?style=flat-square) ![Languages](https://img.shields.io/badge/i18n-8%20languages-informational?style=flat-square)

---

## 📑 Contents

- [💡 What is Tianzhi LLM Wiki?](#-what-is-tianzhi-llm-wiki)
- [⚡ Why Obsidian + LLM Wiki?](#-why-obsidian--llm-wiki)
- [🚀 Quick Start](#-quick-start)
- [📦 Third-party Libraries](#-third-party-libraries)
- [✨ Features](#-features)
- [⌨️ Commands](#️-commands)
- [🏗️ Architecture](#️-architecture)
- [🔒 Privacy & Security](#-privacy--security)
- [❓ FAQ](#-faq)
- [🤝 Contributing](#-contributing)
- [📜 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)

---

## 💡 What is Tianzhi LLM Wiki?

You write. AI organizes. You ask. That's it.

Your notes are full of people, concepts, and connections — but right now they
live as files in folders, and finding what relates to what means searching,
tagging, and hoping you remember the thread.

**Tianzhi LLM Wiki** reads what you write, pulls out entities and concepts, and
weaves them into a structured Wiki — with `[[bidirectional links]]`, an
auto-generated index, and a chat interface that answers questions from *your*
knowledge, not the internet.

The idea of an LLM-curated, three-layer Wiki (sources → wiki → schema) was
first articulated by **Andrej Karpathy** (see
[gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f));
Tianzhi is an independent implementation of that vision, tailored for
Obsidian users.

---

## ⚡ Why Obsidian + LLM Wiki?

Obsidian is brilliant at linked thinking — but you're the one doing all the
linking.

Tianzhi LLM Wiki flips that. Instead of you building the graph by hand, the
AI grows it with you. Drop a note about a new concept; it finds the
connections you'd miss. Ask a question; it walks your own knowledge graph and
brings back answers with citations.

- **🔗 Your Graph View comes alive.** New notes don't just sit there — they
  sprout links to entities, concepts, and sources. The plugin maintains the
  graph: duplicate detection, dead-link fixing, language bridging via
  aliases.
- **💬 Your notes learn to talk back.** Search becomes conversation.
  "What did I write about X?" becomes a dialogue, with streaming responses
  and `[[wiki-links]]` as breadcrumbs.
- **🧠 Obsidian becomes a thinking partner.** It surfaces hidden
  connections, flags contradictions, remembers what you forgot you knew.
- **🔌 Built-in Tianzhi LLM support.** First-class integration with
  Tianzhi IAM auth — log in once and you're ready to ingest, query, and sync.
  Other providers (Anthropic, OpenAI, Gemini, DeepSeek, Kimi, GLM, Ollama,
  LM Studio, OpenRouter, custom endpoints) are equally supported.

---

## 🚀 Quick Start

### 📦 Installation

**🌟 Recommended — Obsidian Community Plugin Market:**

1. In Obsidian, open **Settings → Community plugins**
2. Click **Browse** and search for **Tianzhi LLM Wiki**
3. Click **Install**, then **Enable**

**⚙️ Manual (alternative):**

1. Download `main.js`, `manifest.json`, `styles.css` from
   [Releases](../../releases)
2. In Obsidian, go to **Settings → Community plugins**, then on the
   **Installed plugins** tab click the folder icon to open the plugins
   directory
3. Create a folder named `tianzhi`, drop the three files inside
4. Back in Obsidian, click the refresh icon — **Tianzhi LLM Wiki** will appear
   under **Installed plugins**
5. Toggle it on to enable

**🔨 Development build:** `git clone`, `pnpm install`, `pnpm build`. Output:
`main.js`, `manifest.json`, `styles.css`.

### 🔑 Configure an LLM Provider

1. Open **Settings → Tianzhi LLM Wiki**
2. Pick a provider from the dropdown — or sign in with **Tianzhi IAM** for
   one-click setup
3. Enter your API key (not needed for Ollama)
4. Click **Fetch Models** to populate the model dropdown, or type a model
   name manually
5. Click **Test Connection**, then **Save Settings**

**🦙 Ollama (local, no API key):** Install [Ollama](https://ollama.com),
pull a model, then select "Ollama (Local)" in the provider dropdown.

**🎛️ LM Studio (local, no API key):** Install
[LM Studio](https://lmstudio.ai), start its local OpenAI-compatible server
(default `http://localhost:1234/v1`), then select "LM Studio (Local)".

### 🎮 Usage

| Method | How |
|--------|-----|
| **📥 Ingest single source** | `Cmd+P` → "Ingest single source" — select a note to extract entities and concepts |
| **📂 Ingest from folder** | `Cmd+P` → "Ingest from folder" — batch-generate Wiki from all notes in a folder |
| **🔍 Query wiki** | `Cmd+P` → "Query wiki" — ask questions, get streaming answers with `[[wiki-links]]` |
| **🛠️ Lint wiki** | `Cmd+P` → "Lint wiki" — health scan: duplicates, dead links, orphans, missing aliases |
| **📋 Regenerate index** | `Cmd+P` → "Regenerate index" — rebuild `wiki/index.md` |
| **💡 Suggest schema updates** | `Cmd+P` → "Suggest schema updates" — LLM proposes schema improvements |
| **🛰️ Sync knowledge base** | Click the sidebar **Sync** tab — push/pull with the Tianzhi KB server |

Re-ingesting the same source does incremental updates on entity/concept pages;
summary pages are regenerated.

---

## 📦 Third-party Libraries

> **This section is the Obsidian Community Plugin review checklist.**
> All runtime dependencies are listed below; none are loaded over the network
> at runtime.

### Runtime dependencies (bundled into `main.js`)

All libraries below are bundled at build time via esbuild and shipped inside
`main.js`. No remote loading, no dynamic imports, no `<script>` injection.

| Library | Version | License | Purpose | Repo |
|---------|---------|---------|---------|------|
| `react` | 18.x | MIT | UI rendering for sidebar header / sync panel | https://github.com/facebook/react |
| `react-dom` | 18.x | MIT | DOM mounting for React trees | https://github.com/facebook/react |
| `antd` | ^5.21.0 | MIT | Switch / Dropdown UI components | https://github.com/ant-design/ant-design |
| `@ant-design/cssinjs` | ^2.1.2 | MIT | antd CSS-in-JS scoped style isolation | https://github.com/ant-design/cssinjs |
| `clsx` | ^2.1.1 | MIT | Conditional className composition | https://github.com/lukeed/clsx |
| `tailwind-merge` | ^3.6.0 | MIT | Tailwind class conflict resolution | https://github.com/dcastil/tailwind-merge |

### Dev dependencies (build & test only — NOT shipped)

`esbuild`, `typescript`, `eslint`, `tailwindcss`, `postcss`, `autoprefixer`,
`vitest`, `jsdom`, `@types/*`, `obsidian` (types only) — used only at build /
test time. **None of these are included in the final `main.js`.**

### Network access

This plugin **does not ship any third-party HTTP client** (no axios, no fetch
wrapper). All network requests go through **Obsidian's built-in `requestUrl`**
(Electron `net` module under the hood). Requests are made **only when the user
explicitly triggers an action**:

| Trigger | Endpoint | Purpose |
|---------|----------|---------|
| Click "Test Connection" in settings | User-configured LLM provider | Verify LLM credentials |
| Ingest / Query / Lint commands | User-configured LLM provider | Core LLM calls |
| "Login" in the IAM auth panel | `cosmoplat.com` domain | Optional SSO sign-in |
| Click "Sync" in the sidebar | `cosmoplat.com` domain | Optional knowledge-base sync |

**There is no telemetry, no auto-upload of note content, no background
beacon.** When local LLM providers (Ollama, LM Studio) are used, no data
leaves your machine.

### File system access

The plugin reads notes from your vault and writes pages under `wiki/` and
`schema/`. **Source files are never modified.** A "reviewed" flag in
frontmatter (`reviewed: true`) protects manually-edited pages from overwrite.

### Clipboard access

Used **only** by the "Copy" button in the Query modal, and **only** when you
click it.

For the full per-library breakdown (versions, license texts, exact usage
locations), see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

## ✨ Features

### 📊 Knowledge quality
- **Entity & concept extraction** — LLM identifies people, projects,
  theories, methods, and links them via `[[wiki-links]]`
- **Aliases** — translations, acronyms, alternate names; powers cross-language
  duplicate detection
- **Contradiction flagging** — the plugin highlights when two pages say
  conflicting things
- **Smart merge** — re-ingesting a source incrementally updates existing
  pages rather than creating duplicates

### 🛠️ Maintenance
- **Lint wiki** — single health scan covers duplicates, dead links, empty
  pages, orphans, missing aliases, and pollution
- **Smart Fix All** — one-click, causality-ordered repair: aliases →
  duplicates → dead links → orphans → empty pages
- **Auto-maintenance** (optional, OFF by default) — startup quick fixes,
  file watcher, periodic lint

### 💬 Query & feedback
- **Streaming responses** with `[[wiki-links]]` back into your Wiki
- **Conversation ingest** — paste a chat, get a Wiki page out
- **8-language UI** — English, 中文, 日本語, 한국어, Deutsch, Français,
  Español, Português

### 🌐 LLM & language
- **12+ LLM providers** — Anthropic, Anthropic-Compatible, Google Gemini,
  OpenAI, DeepSeek, Kimi, GLM, MiniMax, LM Studio, Ollama, OpenRouter, custom
- **Tianzhi IAM auth** — first-class SSO; no manual API key copy-paste
- **5 extraction granularities** — Fine / Standard / Coarse / Minimal / Custom
  (1–300 items) — balance depth vs. cost
- **Parallel page generation** — `Promise.allSettled` for 2–3× speedup on
  sources with 10+ entities

### 🏗️ Architecture & performance
- **Cancel-able operations** — click the status bar text to cancel ingest /
  query / lint mid-flight
- **Yielding scan loop** — Lint yields to Obsidian's UI thread every 50
  pages; no multi-second freezes on 1200+ page wikis
- **Smart batch skip** — already-ingested files are detected and skipped

---

## ⌨️ Commands

| Command | Description |
|---------|-------------|
| **📥 Ingest single source** | Select a note → generate Wiki pages |
| **📂 Ingest from folder** | Pick a folder → batch-generate Wiki |
| **🔍 Query wiki** | Conversational Q&A with streaming + `[[wiki-links]]` |
| **🛠️ Lint wiki** | Health scan: duplicates, dead links, orphans, aliases |
| **📋 Regenerate index** | Manually rebuild `wiki/index.md` |
| **💡 Suggest schema updates** | LLM proposes schema improvements |
| **Cancel current operation** | Stop a running ingest/query/lint cleanly |

---

## 🏗️ Architecture

Karpathy's three-layer separation:

```
sources/     # 📄 Your source documents (read-only)
  ↓ ingest
wiki/        # 🧠 LLM-generated Wiki pages (entities / concepts / index / log)
  ↓ query / maintain
schema/      # 📋 Wiki structure configuration (naming, templates, categories)
```

**Code layout** (`src/`):

```
wiki/                # Wiki engine
  wiki-engine.ts     # 🎯 Orchestrator
  query-engine.ts    # 💬 Streaming query
  source-analyzer.ts # 📊 Iterative batch extraction
  page-factory.ts    # 🏗️ Entity/concept CRUD + merge
  lint-controller.ts # 🔍 Lint orchestration
  lint-fixes.ts      # 🛠️ Fix logic
  lint/              # Lint sub-modules
schema/              # Schema co-evolution
sync/                # Tianzhi KB sync (kb-client, sync-service)
auth/                # IAM auth (IAMAuthService, IAMTokenManager)
ui/                  # UI (sidebar-view, settings, modals, React panels)
lib/                 # Shared utils (cn, etc.)
llm-client.ts        # LLM transport (all via Obsidian requestUrl)
prompts.ts / prompts/  # LLM prompt templates
texts/               # i18n (8 languages)
```

**Generated pages:**

- `wiki/sources/filename.md` — 📄 Source summary
- `wiki/entities/entity-name.md` — 👤 Entity pages
- `wiki/concepts/concept-name.md` — 💡 Concept pages
- `wiki/index.md` — 📑 Auto-generated index
- `wiki/log.md` — 📝 Operation log

---

## 🔒 Privacy & Security

- **No backend, no server, no telemetry.** The plugin is purely local
  software running inside Obsidian.
- **Network calls only via Obsidian `requestUrl`** (Electron `net` module),
  only on explicit user action.
- **Source files are never modified.** The plugin reads from anywhere in the
  vault; it writes only under `wiki/` and `schema/`.
- **API keys stay on your machine.** Stored in Obsidian's `data.json`,
  never uploaded.
- **Local LLM option.** Ollama and LM Studio keep all data on-device.
- **Clipboard access** is limited to the Query modal's Copy button.

---

## ❓ FAQ

**Minimum requirements?**
Obsidian v1.11.0+, desktop (Windows / macOS / Linux), and an LLM provider
API key. Ollama / LM Studio work locally with no API key.

**Which model should I use?**
Long-context models work best — the larger your Wiki, the more context the
LLM needs. See `docs/` for a model selection guide.

**Why does Lint show "missing aliases" on older pages?**
Pages generated before alias support don't include aliases. Click **Complete
Aliases** in the Lint report to batch-generate translations and alternate
names.

**Why am I getting HTTP 429 errors?**
Lower **Page Generation Concurrency** to 1–2, increase **Batch Delay** to
500–800ms, or switch providers.

**How do I cancel a running operation?**
Click the status bar text during an operation, or use `Ctrl+P` →
"Cancel current operation".

**Can I manually edit Wiki pages?**
Yes. Set `reviewed: true` in frontmatter to protect from overwrite. Manual
aliases, tags, and sources are preserved during merges.

**How do I get help?**
Open an [Issue](../../issues) for bugs or [Discussions](../../discussions)
for questions.

---

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Bug reports, feature requests, and
PRs are welcome — please run `pnpm lint && pnpm test && npx tsc --noEmit &&
pnpm build` before submitting.

---

## 📜 License

[MIT](LICENSE) — © 2026 Tianzhi Team.

---

## 🙏 Acknowledgments

- **💡 Concept** — [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f),
  the original vision of an LLM-curated, three-layer Wiki (sources → wiki →
  schema). Tianzhi is an independent implementation, not affiliated with or
  endorsed by Karpathy.
- **🛠️ Platform** — [Obsidian Plugin API](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin).
- **🎨 UI** — [Ant Design](https://ant.design/) components,
  [Tailwind CSS](https://tailwindcss.com/) utilities,
  [React](https://react.dev/).
- **🔌 LLM transport** — Obsidian's built-in `requestUrl` (Electron `net`
  module) — no third-party HTTP client.
