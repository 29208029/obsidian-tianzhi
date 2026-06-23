# 🧠 天智 LLM Wiki — Obsidian AI 知识库插件

> 你写笔记，AI 来组织，你来提问。  
> 把笔记喂给 AI，自动提取实体和概念，构建互相链接的结构化 Wiki。  
> 用自然语言提问，答案基于**你自己的笔记**，并附 `[[双向链接]]` 回到原文。

**中文** | [English](../README.md)

![License](https://img.shields.io/badge/license-MIT-green?style=flat-square) ![Obsidian](https://img.shields.io/badge/obsidian-1.11.0%2B-purple?style=flat-square) ![Maintenance](https://img.shields.io/badge/maintenance-active-brightgreen?style=flat-square) ![Build](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square) ![Tests](https://img.shields.io/badge/tests-731%20passing-brightgreen?style=flat-square) ![Languages](https://img.shields.io/badge/i18n-8%20languages-informational?style=flat-square)

---

## 📑 目录

- [这是什么](#这是什么)
- [为什么用 Obsidian + LLM Wiki](#为什么用-obsidian--llm-wiki)
- [快速开始](#快速开始)
- [第三方依赖声明](#第三方依赖声明) 
- [功能特性](#功能特性)
- [命令](#命令)
- [架构](#架构)
- [隐私与安全](#隐私与安全)
- [FAQ](#faq)
- [贡献](#贡献)
- [许可证](#许可证)
- [致谢](#致谢)

---

## 这是什么？

你的笔记里藏着人、概念、关系 — 但现在它们只是散落在文件夹里的文件。想找谁和谁有关，得搜索、打标签、靠记忆。

**天智 LLM Wiki** 会读你写的笔记，提取出实体和概念，编织成结构化的 Wiki —— 带 `[[双向链接]]`、自动生成索引，还能像聊天一样基于**你自己的知识**问答。

「LLM 自动维护、三层 Wiki（来源 → Wiki → 模式）」的构想最早由 **Andrej Karpathy** 提出（见 [gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)）。天智是这个构想的独立实现，专为 Obsidian 用户打造。

---

## 为什么用 Obsidian + LLM Wiki？

Obsidian 擅长链接式思维，但所有链接都得自己手动建。

天智 LLM Wiki 反过来：**AI 跟着你一起长**。你写一条新概念，它帮你找出你自己可能漏掉的关联；你问个问题，它在你的知识图谱里走一圈，引用原文给你答案。

- **🔗 Graph View 活起来了** —— 新笔记不再只是文件，而是自动长出指向实体、概念、来源的链接。重复检测、死链修复、跨语言别名桥接，全部由插件自动维护。
- **💬 笔记学会回答你** —— 搜索变成对话。流式输出，每条答案都带 `[[wiki-links]]` 当面包屑，引你走回原文。
- **🧠 Obsidian 成为思考伙伴** —— 帮你发现隐藏的关联、标记矛盾、记住你忘了自己懂的东西。
- **🔌 天智大模型原生集成** —— 支持天智 IAM 登录，配置一次即可上手摄取、问答、同步。同时也支持 Anthropic / OpenAI / Gemini / DeepSeek / Kimi / GLM / Ollama / LM Studio / OpenRouter / 自定义端点等十几家 LLM 提供商。

---

## 快速开始

### 📦 安装

**🌟 推荐 — Obsidian 社区插件市场：**

1. Obsidian 打开 **设置 → 社区插件**
2. 点 **浏览**，搜「天智 LLM Wiki」（或 Tianzhi LLM Wiki）
3. 点 **安装** → **启用**

**⚙️ 手动安装（备选）：**

1. 从 [Releases](../../releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. Obsidian 打开 **设置 → 社区插件**，在「已安装插件」标签页点文件夹图标打开插件目录
3. 新建文件夹 `tianzhi`，把三个文件拖进去
4. 回到 Obsidian，点刷新按钮 —— 「天智大模型 Wiki」会出现在已安装插件列表
5. 开关打开即可启用

**🔨 本地开发构建：** `git clone`、`pnpm install`、`pnpm build`，产物为 `main.js`、`manifest.json`、`styles.css`。

### 🔑 配置 LLM 提供商

1. 打开 **设置 → 天智大模型 Wiki**
2. 下拉选一个提供商 — 或点「天智 IAM 登录」一键配置
3. 填入 API Key（Ollama 不需要）
4. 点 **拉取模型** 自动填模型列表，或手动输入模型名
5. 点 **测试连接** → **保存设置**

**🦙 Ollama（本地，无需 API Key）：** 安装 [Ollama](https://ollama.com)，`ollama pull` 一个模型，下拉选「Ollama (本地)」。

**🎛️ LM Studio（本地，无需 API Key）：** 安装 [LM Studio](https://lmstudio.ai)，启动其 OpenAI 兼容服务器（默认 `http://localhost:1234/v1`），下拉选「LM Studio (本地)」。

### 🎮 使用方法

| 操作 | 步骤 |
|------|------|
| **📥 摄取单条笔记** | `Cmd+P` → 「摄取单条笔记」— 选一条笔记，提取实体和概念 |
| **📂 从文件夹批量摄取** | `Cmd+P` → 「从文件夹摄取」— 选文件夹，批量生成 Wiki |
| **🔍 问答 Wiki** | `Cmd+P` → 「问答 Wiki」— 自然语言提问，流式输出带 `[[双向链接]]` |
| **🛠️ 检查 Wiki** | `Cmd+P` → 「检查 Wiki」— 健康扫描：重复、死链、孤立、缺别名 |
| **📋 重建索引** | `Cmd+P` → 「重建索引」— 重建 `wiki/index.md` |
| **💡 提议 schema 更新** | `Cmd+P` → 「提议 schema 更新」— LLM 分析 Wiki 提出 schema 改进 |
| **🛰️ 同步知识库** | 侧边栏点 **同步** 标签页 — 与天智知识库服务端推送/拉取 |

对同一笔记重复摄取时，会**增量更新**已存在的实体/概念页面（合并新信息），汇总页面会重新生成。

---

## 第三方依赖声明

> 所有运行时依赖已全部列出，没有任何运行时远程加载。

### 运行时依赖（已打包进 `main.js`）

下列所有库都在构建时通过 esbuild 打包进 `main.js`，随插件一起分发。**无 CDN 加载、无动态 import、无 `<script>` 注入**。

| 库 | 版本 | 协议 | 用途 | 仓库 |
|----|------|------|------|------|
| `react` | 18.x | MIT | 侧边栏头部 / 同步面板的 UI 渲染 | https://github.com/facebook/react |
| `react-dom` | 18.x | MIT | React 树的 DOM 挂载 | https://github.com/facebook/react |
| `antd` | ^5.21.0 | MIT | Switch / Dropdown UI 组件 | https://github.com/ant-design/ant-design |
| `@ant-design/cssinjs` | ^2.1.2 | MIT | antd CSS-in-JS 作用域样式隔离 | https://github.com/ant-design/cssinjs |
| `clsx` | ^2.1.1 | MIT | 条件 className 组合 | https://github.com/lukeed/clsx |
| `tailwind-merge` | ^3.6.0 | MIT | Tailwind 类冲突合并 | https://github.com/dcastil/tailwind-merge |

### 开发依赖（仅打包 / 测试用 — **不分发**）

`esbuild`、`typescript`、`eslint`、`tailwindcss`、`postcss`、`autoprefixer`、`vitest`、`jsdom`、`@types/*`、`obsidian`（仅类型） — **以上都不包含在最终交付的 `main.js` 中**。

### 网络访问说明

本插件**不打包任何第三方 HTTP 客户端**（没有 axios、没有 fetch 封装）。所有网络请求统一走 **Obsidian 自带的 `requestUrl`**（底层是 Electron `net` 模块）。**仅在用户显式操作时才发起请求**：

| 触发操作 | 目标地址 | 用途 |
|----------|----------|------|
| 设置里点「测试连接」 | 用户配置的 LLM 提供商 | 验证 LLM 凭证 |
| 摄取 / 问答 / 检查 命令 | 用户配置的 LLM 提供商 | 核心 LLM 调用 |
| IAM 登录面板点「登录」 | `cosmoplat.com` 域名 | 可选 SSO 登录 |
| 侧边栏点「同步」 | `cosmoplat.com` 域名 | 可选知识库同步 |

**无遥测、无笔记自动上传、无后台信标。**  
若使用本地 LLM 提供商（Ollama / LM Studio），数据完全不出本机。

### 文件系统访问

读取 vault 内任意笔记（摄取用）+ 插件自身 `data.json`（设置 / 缓存）+ `wiki/` 与 `schema/` 目录（检查 / 问答用）。  
**仅在 `wiki/` 和 `schema/` 下写文件**。源文件（`sources/` 或 vault 内任何位置）**永远不会被修改**。

在 frontmatter 里设 `reviewed: true` 可以保护手动编辑的页面不被 LLM 覆盖。

### 剪贴板访问

**仅**问答弹窗的「复制」按钮使用，且**仅在你点击时**触发。无剪贴板读取。

完整的逐库说明（版本、协议文本、精确使用位置）见 [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

---

## 功能特性

### 📊 知识质量
- **实体 / 概念提取** — LLM 识别人物、项目、理论、方法，通过 `[[双向链接]]` 互链
- **别名（Aliases）** — 翻译、缩写、别称；支撑跨语言重复检测
- **矛盾标记** — 当两个页面说法冲突时高亮提示
- **智能合并** — 重新摄取同一来源时增量更新已有页面，不产生重复

### 🛠️ 维护
- **Wiki 检查（Lint）** — 单次扫描覆盖：重复、死链、空页、孤立、缺别名、污染
- **一键智能修复** — 按因果顺序修复：别名 → 重复 → 死链 → 孤立 → 空页
- **自动维护（可选，默认关）** — 启动快速修复、文件监听、定期检查

### 💬 问答与反馈
- **流式输出** + `[[双向链接]]` 指回 Wiki
- **对话摄取** — 粘贴一段聊天记录，得到一个 Wiki 页面
- **8 语言 UI** — 中、英、日、韩、德、法、西、葡

### 🌐 LLM 与语言
- **12+ LLM 提供商** — Anthropic、Anthropic 兼容、Google Gemini、OpenAI、DeepSeek、Kimi、GLM、MiniMax、LM Studio、Ollama、OpenRouter、自定义端点
- **天智 IAM 登录** —  SSO，免去手动复制 API Key
- **5 档提取粒度** — Fine / Standard / Coarse / Minimal / Custom（1–300 项），深度和成本可控
- **并行页面生成** — `Promise.allSettled`，10+ 实体的来源速度提升 2–3 倍

### 🏗️ 架构与性能
- **可取消操作** — 摄取 / 问答 / 检查进行中点状态栏文字即可取消
- **让步扫描循环** — Lint 每 50 页让出一次 UI 线程，1200+ 页 Wiki 也不会卡顿
- **智能批量跳过** — 自动识别已摄取的笔记，跳过不重复处理

---

## 命令

| 命令 | 说明 |
|------|------|
| **📥 摄取单条笔记** | 选笔记 → 生成 Wiki 页面 |
| **📂 从文件夹摄取** | 选文件夹 → 批量生成 Wiki |
| **🔍 问答 Wiki** | 流式对话问答，带 `[[双向链接]]` |
| **🛠️ 检查 Wiki** | 健康扫描：重复、死链、孤立、别名 |
| **📋 重建索引** | 手动重建 `wiki/index.md` |
| **💡 提议 schema 更新** | LLM 分析 Wiki 提议 schema 改进 |
| **取消当前操作** | 干净停止摄取 / 问答 / 检查 |

---

## 架构

Karpathy 的三层分离：

```
sources/     # 📄 源文档（只读）
  ↓ 摄取
wiki/        # 🧠 LLM 生成的 Wiki 页面（实体 / 概念 / 索引 / 日志）
  ↓ 问答 / 维护
schema/      # 📋 Wiki 结构配置（命名、模板、分类）
```

**代码结构**（`src/`）：

```
wiki/                # Wiki 引擎
  wiki-engine.ts     # 🎯 编排器
  query-engine.ts    # 💬 流式问答
  source-analyzer.ts # 📊 迭代式批量提取
  page-factory.ts    # 🏗️ 实体/概念 CRUD + 合并
  lint-controller.ts # 🔍 检查编排
  lint-fixes.ts      # 🛠️ 修复逻辑
  lint/              # 检查子模块
schema/              # Schema 协同演化
sync/                # 天智 KB 同步（kb-client、sync-service）
auth/                # IAM 认证（IAMAuthService、IAMTokenManager）
ui/                  # UI（sidebar-view、settings、modals、React 面板）
lib/                 # 共享工具（cn 等）
llm-client.ts        # LLM 传输（全部走 Obsidian requestUrl）
prompts.ts / prompts/  # LLM 提示模板
texts/               # 国际化（8 种语言）
```

**生成的页面：**

- `wiki/sources/filename.md` — 📄 源文档汇总
- `wiki/entities/entity-name.md` — 👤 实体页面
- `wiki/concepts/concept-name.md` — 💡 概念页面
- `wiki/index.md` — 📑 自动索引
- `wiki/log.md` — 📝 操作日志

---

## 隐私与安全

- **无后端、无服务端、无遥测** —— 插件是纯本地软件，在 Obsidian 内运行
- **网络请求全部走 Obsidian `requestUrl`**（Electron `net` 模块），仅在用户显式操作时触发
- **源文件永远不被修改** —— 读取 vault 任意位置，只在 `wiki/` 和 `schema/` 下写入
- **API Key 存在本机** —— 写在 Obsidian 的 `data.json`，永远不上传
- **可选本地 LLM** —— Ollama / LM Studio 让所有数据留在本机
- **剪贴板** —— 仅问答弹窗的「复制」按钮使用

---

## FAQ

**最低要求？**
Obsidian v1.11.0+、桌面端（Windows / macOS / Linux）、一个 LLM 提供商 API Key。Ollama / LM Studio 可本机免 Key 运行。

**该选什么模型？**
长上下文模型最佳 —— Wiki 越大，LLM 需要的上下文越多。详细模型选择指南见 `docs/`。

**为什么 Lint 提示「缺别名」？**
别名支持上线前的页面没有别名字段。点 Lint 报告里的「补全别名」即可批量生成翻译和别称。

**HTTP 429 错误？**
把 **页面生成并发数** 降到 1–2，**批量延迟** 调到 500–800ms，或换提供商。

**怎么取消正在跑的操作？**
进行中点状态栏文字，或 `Ctrl+P` → 「取消当前操作」。

**能手动编辑 Wiki 页面吗？**
可以。frontmatter 设 `reviewed: true` 可防止覆盖。手动加的别名、标签、来源在合并时都会被保留。

**怎么获取帮助？**
提 [Issue](../../issues) 报 bug，[Discussions](../../discussions) 提问。

---

## 贡献

见 [`CONTRIBUTING.md`](../CONTRIBUTING.md)。欢迎 bug 报告、功能请求、PR —— 提交前请跑：

```bash
pnpm lint && pnpm test && npx tsc --noEmit && pnpm build
```

---

## 许可证

[MIT](../LICENSE) — © 2026 Tianzhi Team。

---

## 致谢

- **💡 构想** — [Andrej Karpathy 的 LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)，首次提出「LLM 维护三层 Wiki（来源 → Wiki → 模式）」的构想。天智是这个构想的独立实现，与 Karpathy 无隶属或背书关系。
- **🛠️ 平台** — [Obsidian Plugin API](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)。
- **🎨 UI** — [Ant Design](https://ant.design/) 组件、[Tailwind CSS](https://tailwindcss.com/) 工具类、[React](https://react.dev/)。
- **🔌 LLM 传输** — Obsidian 自带 `requestUrl`（Electron `net` 模块）—— 无第三方 HTTP 客户端。
