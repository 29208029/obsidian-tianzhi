import { describe, it, expect } from 'vitest';
import { bodyWordSet, computeJaccard } from '../../../wiki/lint/duplicate-detection';

// ── bodyWordSet ────────────────────────────────────────────────────────────────

describe('bodyWordSet', () => {
  it('returns unique meaningful words, filtering stopwords and short words', () => {
    const words = bodyWordSet('The wiki is a knowledge base that compiles information');
    expect(words.has('wiki')).toBe(true);
    expect(words.has('knowledge')).toBe(true);
    expect(words.has('compiles')).toBe(true);
    expect(words.has('information')).toBe(true);
    // Stopwords and short words filtered
    expect(words.has('the')).toBe(false);
    expect(words.has('is')).toBe(false);
    expect(words.has('a')).toBe(false);
    expect(words.has('that')).toBe(false);
  });

  it('produces low Jaccard for different-topic texts', () => {
    const wA = bodyWordSet(
      'A log file is a chronological append-only record detailing operational history of events. ' +
      'Entries track system events such as ingests queries maintenance passes providing audit timeline.',
    );
    const wB = bodyWordSet(
      'Query is an advanced knowledge interaction process where artificial intelligence is prompted ' +
      'to synthesize information from multiple source pages producing cohesive answers with citations.',
    );
    const sim = computeJaccard(wA, wB);
    expect(sim).toBeLessThan(0.2);
  });

  it('produces non-empty set for CJK text', () => {
    const words = bodyWordSet('深度学习是人工智能的核心技术之一 机器学习是基础');
    expect(words.size).toBeGreaterThan(0);
  });

  it('produces high Jaccard for similar CJK texts', () => {
    const shared = '深度学习是人工智能的核心技术之一 机器学习是深度学习的基础 神经网络架构';
    const wA = bodyWordSet(shared + ' 图像识别卷积网络');
    const wB = bodyWordSet(shared + ' 自然语言处理变换器');
    const sim = computeJaccard(wA, wB);
    expect(sim).toBeGreaterThanOrEqual(0.2);
  });

  it('produces low Jaccard for different-topic CJK texts', () => {
    const wA = bodyWordSet('深度学习是人工智能的核心技术 神经网络用于图像识别任务');
    const wB = bodyWordSet('历史是人类文明的记录 古代文化与现代社会的联系');
    const sim = computeJaccard(wA, wB);
    expect(sim).toBeLessThan(0.2);
  });
});
