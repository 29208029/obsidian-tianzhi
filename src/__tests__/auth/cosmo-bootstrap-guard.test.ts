import { describe, it, expect } from 'vitest';
import { shouldRunCosmoBootstrap } from '../../auth/cosmo-bootstrap-guard';

// 守门逻辑:决定是否进入 CosmoGPT auto-bootstrap 流水线。
// 这是「新账号登录后未能自动填 API KEY」bug 的核心防护点 ——
// 见 src/main.ts maybeRunCosmoBootstrap 的前置闸门。

describe('shouldRunCosmoBootstrap', () => {
  // ── 进入路径 ────────────────────────────────────────────────────

  it('cosmogpt provider: always allowed, regardless of apiKey', () => {
    expect(shouldRunCosmoBootstrap('cosmogpt', '')).toBe(true);
    expect(shouldRunCosmoBootstrap('cosmogpt', 'sk-existing-key')).toBe(true);
  });

  it('anthropic-compatible provider + empty apiKey: allowed (fresh login)', () => {
    expect(shouldRunCosmoBootstrap('anthropic-compatible', '')).toBe(true);
  });

  // ── 新账号回归点(本 bug 的核心)──────────────────────────────
  // DEFAULT_SETTINGS.provider === 'anthropic',新登录用户 apiKey 为空,
  // 必须允许进入 bootstrap,否则登录后无法自动填充。
  it('anthropic (default) provider + empty apiKey: allowed (NEW ACCOUNT REGRESSION)', () => {
    expect(shouldRunCosmoBootstrap('anthropic', '')).toBe(true);
  });

  it('anthropic (default) provider + existing apiKey: skipped (do not overwrite user key)', () => {
    expect(shouldRunCosmoBootstrap('anthropic', 'sk-user-configured')).toBe(false);
  });

  it('anthropic-compatible provider + existing apiKey: skipped (do not overwrite user key)', () => {
    expect(shouldRunCosmoBootstrap('anthropic-compatible', 'sk-user-configured')).toBe(false);
  });

  // ── 跳过路径 ────────────────────────────────────────────────────

  it('openai provider: always skipped', () => {
    expect(shouldRunCosmoBootstrap('openai', '')).toBe(false);
    expect(shouldRunCosmoBootstrap('openai', 'sk-key')).toBe(false);
  });

  it('lmstudio / ollama / other providers: always skipped', () => {
    expect(shouldRunCosmoBootstrap('lmstudio', '')).toBe(false);
    expect(shouldRunCosmoBootstrap('ollama', '')).toBe(false);
    expect(shouldRunCosmoBootstrap('some-unknown-provider', '')).toBe(false);
  });

  // ── 边界 ─────────────────────────────────────────────────────────

  it('whitespace-only apiKey treated as empty (allowed for anthropic family)', () => {
    // trim 语义由 main.ts 的 existingKey 检查负责;守门函数按「空字符串即未配置」
    // 判定。这里锁定:纯空白 apiKey 不会被本函数当成「已配置」而跳过。
    expect(shouldRunCosmoBootstrap('anthropic', '   ')).toBe(true);
  });
});
