import { describe, it, expect } from 'vitest';
import { calculateBatchLimits, GRANULARITY_CONFIG, getCustomTypeCaps } from '../../core/batch-limits';

describe('calculateBatchLimits', () => {
  it('standard granularity ignores customLimits', () => {
    const result = calculateBatchLimits(100000, 'standard', { entityCap: 300, conceptCap: 300 });
    expect(result.initialBatchSize).toBe(GRANULARITY_CONFIG.standard.initialBatchSize);
    expect(result.maxTotalItems).toBe(GRANULARITY_CONFIG.standard.maxTotalItems);
  });

  it('custom granularity default (no customLimits) stays small', () => {
    const result = calculateBatchLimits(100000, 'custom');
    expect(result.initialBatchSize).toBe(5);
    expect(result.maxBatches).toBeGreaterThanOrEqual(2);
  });

  it('custom granularity scales batchSize to match user caps (300+300)', () => {
    const result = calculateBatchLimits(634212, 'custom', { entityCap: 300, conceptCap: 300 });
    // totalCap = 600 → batchSize should be 50 (capped), maxBatchesBase = ceil(600/50) = 12
    expect(result.initialBatchSize).toBe(50);
    expect(result.maxBatches).toBeGreaterThanOrEqual(12); // min(12*3, 319) = 36
  });

  it('custom granularity scales moderately for medium caps (50+50)', () => {
    const result = calculateBatchLimits(100000, 'custom', { entityCap: 50, conceptCap: 50 });
    // totalCap = 100 → batchSize = min(50, max(10, 100)) = 50, maxBatchesBase = ceil(100/50) = 2
    expect(result.initialBatchSize).toBe(50);
    expect(result.maxBatches).toBeGreaterThanOrEqual(2);
  });

  it('custom granularity stays conservative for small caps (5+5)', () => {
    const result = calculateBatchLimits(100000, 'custom', { entityCap: 5, conceptCap: 5 });
    // totalCap = 10 → not > 10 threshold, stays at default config.initialBatchSize: 5
    expect(result.initialBatchSize).toBe(5);
  });

  it('custom granularity with only entity cap set uses default for missing concept cap', () => {
    const result = calculateBatchLimits(100000, 'custom', { entityCap: 100 });
    // totalCap = 100 + 5 = 105 → batchSize = min(50, max(10, 105)) = 50, maxBatchesBase = ceil(105/50) = 3
    expect(result.initialBatchSize).toBe(50);
    expect(result.maxBatches).toBeGreaterThanOrEqual(3);
  });

  it('short content caps maxTotalItems even for fine granularity', () => {
    const result = calculateBatchLimits(5000, 'fine');
    // 5000 chars / 600 chars/item ≈ 9 items, capped at max(5, 9) = 9
    expect(result.maxTotalItems).toBeLessThanOrEqual(9);
  });
});

describe('getCustomTypeCaps', () => {
  it('returns null caps for non-custom granularity', () => {
    expect(getCustomTypeCaps({ extractionGranularity: 'standard' }))
      .toEqual({ entityCap: null, conceptCap: null });
  });

  it('returns user-defined caps for custom granularity', () => {
    expect(getCustomTypeCaps({ extractionGranularity: 'custom', customEntityLimit: 300, customConceptLimit: 200 }))
      .toEqual({ entityCap: 300, conceptCap: 200 });
  });

  it('falls back to 5 when limits are undefined', () => {
    expect(getCustomTypeCaps({ extractionGranularity: 'custom' }))
      .toEqual({ entityCap: 5, conceptCap: 5 });
  });
});
