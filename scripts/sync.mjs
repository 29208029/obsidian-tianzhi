#!/usr/bin/env node
// scripts/sync.mjs
//
// Copy main.js, styles.css, and manifest.json from the project root into
// the Obsidian vault's plugin folder, optionally watching for changes.
//
// Usage:
//   node scripts/sync.mjs            # one-shot copy
//   node scripts/sync.mjs --watch   # copy + watch for changes
//
// Why a custom script instead of cpx 1.5.0:
// cpx 1.5.0 + pnpm installs minimatch 3.1.5 which uses brace-expansion@5
// whose API no longer exports `expand`, causing cpx to throw on brace
// patterns like "{a,b,c}". This ~60-line script does the same job with
// zero dependencies and a tiny in-memory mtime cache.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_DIR = 'E:/obsidianTest/tianzhi-test/.obsidian/plugins/Tianzhi llm Wiki';
const FILES = ['main.js', 'styles.css', 'manifest.json'];
const POLL_INTERVAL_MS = 800;

const watchMode = process.argv.includes('--watch');

async function copyOne(file) {
  const src = join(PROJECT_ROOT, file);
  const dst = join(TARGET_DIR, file);
  if (!existsSync(src)) return;
  await mkdir(TARGET_DIR, { recursive: true });
  await copyFile(src, dst);
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] synced ${file}`);
}

async function copyAll() {
  for (const f of FILES) {
    try {
      await copyOne(f);
    } catch (err) {
      console.error(`failed to copy ${f}:`, err.message);
    }
  }
}

async function main() {
  console.log(`[sync] target: ${TARGET_DIR}`);
  await copyAll();

  if (!watchMode) return;

  console.log(`[sync] watching for changes (poll ${POLL_INTERVAL_MS}ms)... Ctrl+C to stop`);
  // fs.watch is unreliable across Windows editors (some use atomic save);
  // a small mtime poll is the most robust approach.
  const lastMtime = new Map();
  for (const f of FILES) {
    try {
      const s = await stat(join(PROJECT_ROOT, f));
      lastMtime.set(f, s.mtimeMs);
    } catch {
      /* file may not exist yet */
    }
  }

  setInterval(async () => {
    for (const f of FILES) {
      const path = join(PROJECT_ROOT, f);
      if (!existsSync(path)) continue;
      try {
        const s = await stat(path);
        const prev = lastMtime.get(f);
        if (prev === undefined || s.mtimeMs !== prev) {
          lastMtime.set(f, s.mtimeMs);
          await copyOne(f);
        }
      } catch (err) {
        console.error(`watch ${f} error:`, err.message);
      }
    }
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});