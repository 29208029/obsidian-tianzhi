// build-tailwind.mjs — 编译 src/styles/tailwind.css 并把结果**前置**
// 注入到项目根 styles.css,保留所有手写样式不被覆盖。
//
// 用法:
//   node scripts/build-tailwind.mjs           # 一次性构建
//   node scripts/build-tailwind.mjs --watch  # 监听模式
//
// 在 Windows 上 .bin/tailwindcss 是个 sh 脚本,Node spawn 无法直接执行,
// 所以这里改用 tailwindcss 包自带的 postcss-based CLI 接口
// (tailwindcss/lib/cli.js 兼容 Node 直接 require)。

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENTRY = resolve(ROOT, "src/styles/tailwind.css");
const TMP_OUT = resolve(ROOT, ".tw-tmp.css");
const STYLES = resolve(ROOT, "styles.css");
const isWatch = process.argv.includes("--watch");

// 直接 node 调用 tailwindcss 的 lib/cli.js (跨平台,避免 .bin sh 脚本)
const TW_CLI = resolve(ROOT, "node_modules/tailwindcss/lib/cli.js");
const args = [TW_CLI, ENTRY, "-o", TMP_OUT];
if (isWatch) args.push("--watch");

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  cwd: ROOT,
});

if (isWatch) {
  let lastSize = -1;
  const iv = setInterval(() => {
    try {
      if (!existsSync(TMP_OUT)) return;
      const st = statSync(TMP_OUT);
      if (st.size === lastSize) return;
      lastSize = st.size;
      mergeToStyles();
    } catch {
      /* ignore transient */
    }
  }, 250);
  process.on("SIGINT", () => {
    clearInterval(iv);
    child.kill();
    process.exit(0);
  });
} else {
  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[build-tailwind] tailwindcss CLI exited with ${code}`);
      process.exit(code ?? 1);
    }
    try {
      mergeToStyles();
      console.log("[build-tailwind] merged tailwind utilities into styles.css");
    } catch (e) {
      console.error("[build-tailwind] merge failed:", e);
      process.exit(1);
    }
  });
}

function mergeToStyles() {
  const tw = readFileSync(TMP_OUT, "utf8");
  const twBanner = `/* === Tailwind utilities (auto-generated) === */\n`;
  let base = "";
  if (existsSync(STYLES)) {
    base = readFileSync(STYLES, "utf8");
    const marker = "/* === Tailwind utilities (auto-generated) === */";
    const idx = base.indexOf(marker);
    if (idx >= 0) {
      base = base.slice(0, idx);
    }
  }
  writeFileSync(STYLES, base + "\n" + twBanner + tw, "utf8");
  if (!isWatch) {
    try { unlinkSync(TMP_OUT); } catch { /* ignore */ }
  }
}
