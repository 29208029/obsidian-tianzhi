// Utility functions for Wiki processing

import { VALID_ENTITY_TAGS, VALID_CONCEPT_TAGS, VALID_SOURCE_TAGS, LLMWikiSettings } from './types';
import { TEXTS } from './texts';

// Type-safe i18n accessor. Falls back to EN_TEXTS when key is missing in target language.
export function getText<K extends keyof typeof TEXTS.en>(
  language: string,
  key: K,
  replacements?: Record<string, string>
): string {
  const texts = TEXTS[language as keyof typeof TEXTS] || TEXTS.en;
  let text = texts[key] as unknown as string;
  if (!text) {
    text = TEXTS.en[key] as unknown as string;
  }
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

export function slugify(text: string, preserveCase = false): string {
  console.debug('slugify input:', text, 'length:', text?.length);

  if (!text || text.trim().length === 0) {
    console.warn('slugify: input text is empty');
    return 'untitled';
  }

  return computeSlug(text, preserveCase);
}

// Pure slug computation — no debug logs on normal path. Used for batch operations
// where thousands of silent calls are needed (e.g. matching 2141 existing pages).
// preserveCase skips the final toLowerCase() for file creation (Issue #111).
// All comparison/matching callers must NOT pass preserveCase so slugs stay
// case-insensitively comparable regardless of the user's slugCase setting.
export function computeSlug(text: string, preserveCase = false): string {
  if (!text || text.trim().length === 0) return 'untitled';

  const trimmed = text.trim();

  // Step 1: Remove ASCII control characters and filesystem-unsafe symbols
  const afterRemoveInvalid = trimmed
    .split('')
    .filter(c => c.charCodeAt(0) >= 32)
    .join('')
    .replace(/[/\\:*?"<>|,()'!?、，。；：！？（）【】《》]/g, '');

  if (afterRemoveInvalid.length === 0) return 'untitled-' + Date.now();

  // Step 2: Convert spaces and dots to dashes
  const afterSpaceToDash = afterRemoveInvalid.replace(/[\s.]+/g, '-');

  // Step 3: Merge multiple dashes
  const afterMergeDash = afterSpaceToDash.replace(/-+/g, '-');

  // Step 4: Remove leading and trailing dashes
  const finalSlug = afterMergeDash.replace(/^-|-$/g, '').trim();

  if (finalSlug.length === 0) return 'untitled-' + Date.now();

  return preserveCase ? finalSlug : finalSlug.toLowerCase();
}

// Filter out aliases that are redundant against a page's own filename.
// Obsidian resolves `[[X]]` to a file whose basename equals X (case-insensitive),
// so an alias that already equals the filename is a self-pointing no-op that only
// clutters frontmatter. This commonly happens on cross-type collisions where the
// colliding name is identical to the existing page's name (e.g. adding "Vigilanz"
// to vigilanz.md). Comparison is exact case-insensitive basename match — NOT slug
// based — because Obsidian does not collapse spaces/symbols when resolving links,
// so a space-variant like "Deep Learning" on deep-learning.md IS a useful alias
// and must be kept.
// Pure function (no IO) so the dedup rule can be unit-tested in isolation.
export function filterRedundantAliases(
  pagePath: string,
  candidateAliases: string[]
): string[] {
  const fileName = pagePath.split('/').pop() || '';
  const fileKey = fileName.replace(/\.md$/i, '').trim().toLowerCase();
  const seen = new Set<string>();
  return candidateAliases.filter(alias => {
    if (!alias || alias.trim().length === 0) return false;
    const key = alias.trim().toLowerCase();
    if (key === fileKey) return false; // already resolves to this file — redundant
    if (seen.has(key)) return false; // duplicate within the batch (case-insensitive)
    seen.add(key);
    return true;
  });
}

export async function parseJsonResponse(
  response: string,
  repairFn?: (malformedJson: string) => Promise<string>
): Promise<Record<string, unknown> | null> {
  console.debug('parseJsonResponse parsing started... response length:', response.length);

  try {
    // ===== Layer 1: Response Normalization =====
    // Normalize the raw response text before attempting JSON extraction.
    // Handles: markdown fences, prefill artifacts ({{ or missing {), trailing content.

    let normalized = response.trim();

    // Step 1.0: Strip reasoning/thinking blocks (ROADMAP P3 #11)
    // Thinking models can output pseudocode JSON inside <think>{...}</think>.
    // extractBalancedJson would otherwise grab the first '{' inside the think
    // block and ignore the real JSON after </think>. Strip early, before
    // brace-counting runs.
    normalized = normalized.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
    normalized = normalized.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');
    normalized = normalized.trim();

    // Step 1.1: Strip markdown code fences
    normalized = normalized.replace(/^```(?:json|markdown|md)?\s*\n?/, '');
    normalized = normalized.replace(/\n?```$/, '');
    normalized = normalized.trim();

    // Step 1.2: Prefill artifact correction
    // Prefill technique may result in:
    //   (a) {{...}   → model echoed the prefill { and also started with { → adjacent double brace
    //   (b) {\n{...} → same but with whitespace/newline between braces → call it "loose prefill"
    //   (c) "...}"   → provider stripped the prefill → missing opening brace

    if (normalized.startsWith('{{')) {
      // Remove the first { (prefill echo)
      normalized = normalized.substring(1);
      console.debug('Prefill echo "{{" detected, removing leading {');
    } else if (normalized.length > 1 && normalized[0] === '{') {
      // Check for "loose prefill": lone { on first line, then actual JSON starting with {
      // OR the LLM wrapped output in a code fence after echoing the prefill {
      const afterFirst = normalized.substring(1).trimStart();
      if (afterFirst.startsWith('{') || afterFirst.startsWith('```')) {
        normalized = afterFirst;
        console.debug('Newline-separated "{\n{" detected {\\n{，removing leading {');
      }
    }

    if (normalized.length > 0 && normalized[0] !== '{') {
      // Try prepending { and parse (prefill stripped by provider)
      const withBrace = '{' + normalized;
      try {
        console.debug("first char not '{', prepended '{' and parsed successfully");
        return JSON.parse(withBrace) as Record<string, unknown>;
      } catch {
        // Not a simple missing brace issue, continue normal flow
        console.debug("prepending '{' still failed, continuing");
      }
    }

    // Step 1.3: Trailing content detection via "after JSON at position N"
    // If JSON.parse reports position N, the prefix 0..N-1 is valid JSON.
    try {
      return JSON.parse(normalized) as Record<string, unknown>;
    } catch (directError) {
      const msg = directError instanceof SyntaxError ? directError.message : '';
      const afterMatch = msg.match(/after JSON at position (\d+)/);
      if (afterMatch) {
        const endPos = parseInt(afterMatch[1], 10);
        const prefix = normalized.substring(0, endPos);
        console.debug('extra content after JSON detected (position %d)，prefix extracted (length %d)', endPos, prefix.length);
        try {
          console.debug('prefix parsed successfully');
          return JSON.parse(prefix) as Record<string, unknown>;
        } catch {
          console.debug('prefix parse failed, continuing');
        }
      }
    }

    // ===== Layer 2: JSON Extraction =====
    // Extract JSON from normalized text using multiple strategies.

    // Step 2.1: Brace counting (precise extraction)
    const firstBrace = normalized.indexOf('{');
    if (firstBrace !== -1) {
      const balanced = extractBalancedJson(normalized, firstBrace);
      if (balanced) {
        const fixed = fixCommonJsonIssues(balanced);
        try {
          return JSON.parse(fixed) as Record<string, unknown>;
        } catch (braceError) {
          console.debug('brace-count extraction failed:', String(braceError).slice(0, 80));
        }

        // LLM repair on balanced extraction
        if (repairFn) {
          try {
            const repaired = await repairFn(balanced);
            const cleanedLlm = repaired.trim()
              .replace(/^```(?:json)?\s*\n?/, '')
              .replace(/\n?```$/, '')
              .trim();
            const final = fixCommonJsonIssues(cleanedLlm);
            return JSON.parse(final) as Record<string, unknown>;
          } catch (llmError) {
            console.error('LLM repair also failed (brace-count):', String(llmError).slice(0, 80));
          }
        }
      }
    }

    // Step 2.2: Greedy regex fallback (handles trailing text without embedded braces)
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const candidate = jsonMatch[0];
      const fixed = fixCommonJsonIssues(candidate);
      try {
        return JSON.parse(fixed) as Record<string, unknown>;
      } catch (regexError) {
        console.debug('greedy regex extraction failed:', String(regexError).slice(0, 80));
      }

      if (repairFn) {
        try {
          const repaired = await repairFn(candidate);
          const cleanedLlm = repaired.trim()
            .replace(/^```(?:json)?\s*\n?/, '')
            .replace(/\n?```$/, '')
            .trim();
          const final = fixCommonJsonIssues(cleanedLlm);
          return JSON.parse(final) as Record<string, unknown>;
        } catch (llmError) {
          console.error('LLM repair also failed (greedy regex):', String(llmError).slice(0, 80));
        }
      }
    }

    // Step 2.3: Diagnostic logging on total failure
    console.error('JSON parse completely failed (length %d)', response.length);
    console.error('first 200 chars after normalization:', normalized.substring(0, 200));
    console.error('last 200 chars after normalization:', normalized.substring(Math.max(0, normalized.length - 200)));
    return null;

  } catch (error) {
    console.error('parseJsonResponse exception:', error);
    return null;
  }
}

/** Extract the first balanced {…} JSON object via brace counting. */
function extractBalancedJson(text: string, startPos: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startPos; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.substring(startPos, i + 1);
      }
    }
  }

  return null;
}

// ---------- deterministic repair helpers ----------

function fixCommonJsonIssues(json: string): string {
  // (a) trailing commas before } or ]
  let fixed = json.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');

  // (b) unescaped content-quotes via state machine (fast, deterministic)
  fixed = escapeContentQuotes(fixed);

  // (c) missing comma between adjacent strings on separate lines
  //     "..." \n "..."  →  "...,\n"..."
  fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');

  // (a) again in case the above fixes introduced trailing commas
  fixed = fixed.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');

  return fixed;
}

function escapeContentQuotes(json: string): string {
  // State machine: track whether we're inside a string.
  // When we encounter " inside a string, peek ahead.
  //  - followed by : , } ] or end-of-input → structural close
  //  - otherwise → content quote → escape as \"
  const out: string[] = [];
  let inString = false;
  let i = 0;

  while (i < json.length) {
    const ch = json[i];

    // backslash inside string → copy the escape sequence literally
    if (ch === '\\' && inString) {
      out.push(ch);
      i++;
      if (i < json.length) out.push(json[i]);
      i++;
      continue;
    }

    if (!inString && ch === '"') {
      inString = true;
      out.push(ch);
      i++;
      continue;
    }

    if (inString && ch === '"') {
      // peek at the next significant character
      let peek = i + 1;
      while (peek < json.length && isJsonWhitespace(json[peek])) peek++;
      const nextCh = peek < json.length ? json[peek] : '';

      if (
        nextCh === ':' || nextCh === ',' || nextCh === '}' || nextCh === ']' ||
        peek >= json.length
      ) {
        // structural close
        inString = false;
        out.push(ch);
      } else {
        // content quote
        out.push('\\"');
      }
      i++;
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join('');
}

function isJsonWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

export interface FrontmatterData {
  reviewed?: boolean;
  type?: string;
  created?: string;
  updated?: string;
  sources?: string[];
  tags?: string[];
  aliases?: string[];
  [key: string]: unknown;
}

export function parseFrontmatter(content: string): FrontmatterData | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const result: FrontmatterData = {};
  const fmText = match[1];

  // Parse simple key-value pairs and arrays
  const lines = fmText.split('\n');
  let currentKey: string | null = null;
  let arrayValues: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      if (currentKey && arrayValues.length > 0) {
        result[currentKey] = arrayValues;
        arrayValues = [];
        currentKey = null;
      }
      continue;
    }

    // Check for array continuation (lines starting with - in YAML array)
    if (trimmed.startsWith('- ') && currentKey) {
      const value = trimmed.substring(2).trim();
      // Remove surrounding quotes if present
      arrayValues.push(value.replace(/^["']|["']$/g, ''));
      continue;
    }

    // If we were parsing an array and hit a non-array line, save it
    if (currentKey && arrayValues.length > 0 && !trimmed.startsWith('-')) {
      result[currentKey] = arrayValues;
      arrayValues = [];
      currentKey = null;
    }

    // Parse key: value
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();

    // Check if next line starts a YAML array
    const nextLine = lines[i + 1]?.trim();
    if (nextLine && nextLine.startsWith('- ')) {
      currentKey = key;
      arrayValues = [];
      continue;
    }

    // Simple value parsing
    if (key === 'reviewed') {
      result.reviewed = value === 'true';
    } else if (key === 'type') {
      result.type = value;
    } else if (key === 'created') {
      result.created = value;
    } else if (key === 'updated') {
      result.updated = value;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      // Inline array like ["a", "b"]
      try {
        result[key] = value
          .slice(1, -1)
          .split(',')
          .map(v => v.trim().replace(/^["']|["']$/g, ''))
          .filter(v => v);
      } catch {
        result[key] = value;
      }
    } else {
      result[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  // Handle array at end of frontmatter
  if (currentKey && arrayValues.length > 0) {
    result[currentKey] = arrayValues;
  }

  // Normalize array-typed fields: YAML single values (without brackets or list
  // notation) parse as strings, but callers expect arrays. Wrap strings in arrays.
  const ARRAY_FIELDS = ['aliases', 'sources', 'tags'];
  for (const field of ARRAY_FIELDS) {
    const val = result[field];
    if (typeof val === 'string') {
      result[field] = [val];
    } else if (!Array.isArray(val)) {
      delete result[field];
    }
  }

  return result;
}

/** Serialize value to YAML format for frontmatter */
function yamlStringify(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '\n' + value.map(v => `  - "${v}"`).join('\n');
  }
  if (typeof value === 'string') {
    // If string contains special chars, quote it
    // Note: [ and ] don't need escaping inside character class
    if (/[":[\]{}\n]/.test(value)) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  // For objects or any other unexpected type, return empty string
  // This should not happen with valid frontmatter data
  return '';
}

/** Extract body content after frontmatter */
export function extractBody(content: string): string {
  if (!content.startsWith('---')) return content;
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) return content;
  return content.substring(endIdx + 4).trim();
}

/** Merge frontmatter deterministically: preserve created, update sources (append), update date */
export function mergeFrontmatter(
  existingContent: string,
  newSourcePath: string
): { frontmatter: string; body: string; wasMerged: boolean } {
  const fm = parseFrontmatter(existingContent);
  const body = extractBody(existingContent);

  if (!fm) {
    // No existing frontmatter, treat as new
    return {
      frontmatter: '',
      body: existingContent,
      wasMerged: false
    };
  }

  // Merge sources array deterministically (programmatic, not LLM)
  const normalizeSourcePath = (s: string): string => {
    const trimmed = s.trim();
    if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
      return trimmed.slice(2, -2).trim();
    }
    return trimmed;
  };
  const existingSources = Array.isArray(fm.sources) ? fm.sources : [];
  const sourceSet = new Set<string>();
  for (const s of existingSources) {
    sourceSet.add(normalizeSourcePath(String(s)));
  }
  sourceSet.add(newSourcePath);
  const mergedSources = Array.from(sourceSet).map(s => `[[${s}]]`);

  // Preserve created, update updated
  const created = fm.created || new Date().toISOString().split('T')[0];
  const updated = new Date().toISOString().split('T')[0];

  // Build new frontmatter programmatically
  const lines: string[] = ['---'];

  if (fm.type) lines.push(`type: ${fm.type}`);
  lines.push(`created: ${created}`);
  lines.push(`updated: ${updated}`);

  if (mergedSources.length > 0) {
    lines.push(`sources:${yamlStringify(mergedSources)}`);
  }

  // Always emit tags: so the field is never silently dropped on merge.
  // An empty tags: is preferable to a missing field — it signals that tags
  // need to be set, rather than hiding the gap entirely (Issue #114).
  if (Array.isArray(fm.tags) && fm.tags.length > 0) {
    lines.push(`tags:${yamlStringify(fm.tags)}`);
  } else {
    lines.push('tags:');
  }

  if (fm.reviewed) {
    lines.push('reviewed: true');
  }

  if (Array.isArray(fm.aliases) && fm.aliases.length > 0) {
    lines.push(`aliases:${yamlStringify(fm.aliases)}`);
  }

  lines.push('---');

  return {
    frontmatter: lines.join('\n'),
    body,
    wasMerged: true
  };
}

export function preserveFrontmatterReviewTag(originalContent: string, newContent: string): string {
  const origFm = parseFrontmatter(originalContent);
  if (!origFm?.reviewed) return newContent;

  // If the new content does not already have reviewed: true, inject it
  if (newContent.startsWith('---')) {
    const endIdx = newContent.indexOf('\n---', 3);
    if (endIdx !== -1 && !newContent.substring(0, endIdx).includes('reviewed:')) {
      return newContent.substring(0, endIdx) + '\nreviewed: true' + newContent.substring(endIdx);
    }
  }
  return newContent;
}

export function cleanMarkdownResponse(response: string): string {
  console.debug('cleanMarkdownResponse input length:', response.length);

  let cleaned = response.trim();

  // Strip reasoning/thinking tags from reasoning models (DeepSeek-R1, QwQ, etc.)
  // These models emit <think>...</think> or <thinking>...</thinking> blocks during
  // inference that are not part of the intended output. Remove them before any
  // other processing so downstream parsers see only the final response.
  cleaned = cleaned.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');

  // Layer B2 (Issue #99): model-agnostic structural preamble detection.
  // Some models (e.g. Gemma 4) emit reasoning as plain text without
  // recognizable <think> tokens. When the response has a `## /#` header
  // but no frontmatter, the existing auto-prefix logic below cannot
  // classify the leading prose as frontmatter-like, so we proactively
  // discard it here. The `\n---\n` case is left to the existing
  // "removed preamble text before frontmatter" path below.
  if (cleaned.indexOf('\n---\n') === -1) {
    const headerMatch = cleaned.match(/\n#{1,2} \S/);
    if (headerMatch) {
      const cutIdx = cleaned.indexOf(headerMatch[0]);
      if (cutIdx > 0) {
        cleaned = cleaned.slice(cutIdx + 1).replace(/^\s+/, '');
      }
    }
  }

  // Remove markdown code block wrapping
  // Pattern 1: ```markdown ... ```
  // Pattern 2: ``` ... ```
  // Pattern 3: ```md ... ```

  const codeBlockPatterns = [
    /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/gm,  // Complete code block (multiline)
    /^```(?:markdown|md)?\s*([\s\S]*?)```$/gm,       // Complete code block (no newline)
    /^```(?:markdown|md)?\s*\n([\s\S]*)$/gm,         // Opening code block, no closing
    /^```(?:markdown|md)?\s*([\s\S]*)$/gm,           // Opening code block marker
  ];

  for (const pattern of codeBlockPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      // Extract code block content (remove ``` markers)
      cleaned = cleaned.replace(pattern, '$1').trim();
      console.debug('code block wrapping detected, removed');
      break;
    }
  }

  // If still has residual ````, manually remove opening and closing
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/, '');
    console.debug('removed opening code block marker');
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\n?```$/, '');
    console.debug('removed closing code block marker');
  }

  console.debug('cleanMarkdownResponse output length:', cleaned.length);
  console.debug('first 50 chars:', cleaned.substring(0, 50));

  // Ensure frontmatter starts at position 0 for Obsidian to parse it.
  // LLM may omit the opening --- or preface content with explanatory text.
  if (!cleaned.startsWith('---')) {
    const fmEnd = cleaned.indexOf('\n---\n');
    if (fmEnd !== -1) {
      const beforeFm = cleaned.substring(0, fmEnd);
      // Check if it looks like frontmatter: key:value lines, no markdown headings
      const looksLikeFrontmatter =
        beforeFm.includes(':') &&
        !beforeFm.startsWith('#') &&
        !beforeFm.startsWith('```') &&
        beforeFm.split('\n').filter(l => l.trim()).every(l => l.includes(':') || l.trim() === '');
      if (looksLikeFrontmatter) {
        cleaned = '---\n' + cleaned;
        console.debug('added missing opening ---');
      } else {
        cleaned = cleaned.substring(fmEnd + 1);
        console.debug('removed preamble text before frontmatter');
      }
    }
  }

  return cleaned.trim();
}

/**
 * Enforce frontmatter type and tags constraints.
 * - type: MUST be exactly "entity" or "concept" (based on page path)
 * - tags: MUST be an array of valid subtypes (entity_type or concept_type)
 *
 * This is a safety net in case LLM doesn't follow the prompt instructions.
 */
export function enforceFrontmatterConstraints(
  content: string,
  pageType: 'entity' | 'concept' | 'source',
  settings?: LLMWikiSettings
): string {
  if (!content.startsWith('---')) return content;

  const fmEnd = content.indexOf('\n---\n', 3);
  if (fmEnd === -1) return content;

  const fmText = content.substring(3, fmEnd);

  // Reviewed-guard (D4 design): when the page is marked `reviewed: true`
  // by the user, their intent for type / tags / aliases wins. The
  // function below is a safety net for LLM output, but the user has
  // explicitly accepted the current frontmatter — we must not silently
  // overwrite their choices (especially an empty `tags: []` they may
  // have intentionally set). Only programmatic safety nets still run:
  // LLM-hallucinated dates are stripped because the date system is
  // strictly programmatic, not user-authored.
  //
  // This aligns with the rest of the codebase:
  //   - lint-fixes.ts:439 skips reviewed pages
  //   - page-factory.ts:288/308 use minimal append on reviewed pages
  //   - prompts/generation.ts:206-241 has a dedicated preserveReviewed prompt
  if (/^reviewed:\s*true\s*$/m.test(fmText)) {
    const today = new Date().toISOString().split('T')[0];
    return content
      .replace(/^created:\s*\d{4}-\d{2}-\d{2}\s*$/m, `created: ${today}`)
      .replace(/^updated:\s*\d{4}-\d{2}-\d{2}\s*$/m, `updated: ${today}`);
  }

  let body = content.substring(fmEnd + 5);

  const today = new Date().toISOString().split('T')[0];

  // Parse existing frontmatter
  const lines = fmText.split('\n');
  const newLines: string[] = [];
  let typeLine = '';
  let collectedTags: string[] = [];
  let foundType = false;
  let foundTags = false;
  let foundAliases = false;
  let collectedAliases: string[] = [];
  let createdValue = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Strip LLM-hallucinated dates — dates are programmatic, not generative
    if (line.startsWith('created:')) {
      createdValue = line.substring(8).trim();
      continue;
    }
    if (line.startsWith('updated:')) {
      continue;
    }

    if (line.startsWith('type:')) {
      foundType = true;
      const currentType = line.substring(5).trim();
      // Force type to be entity/concept/source only
      if (pageType === 'entity' || pageType === 'concept') {
        typeLine = `type: ${pageType}`;
        // Collect original type as a tag if it was a valid subtype
        if (currentType && currentType !== 'entity' && currentType !== 'concept' && currentType !== pageType) {
          collectedTags.push(currentType);
        }
      } else {
        typeLine = `type: ${pageType}`;
      }
    } else if (line.startsWith('tags:')) {
      foundTags = true;
      // Collect existing tags from inline array format
      const tagsValue = line.substring(5).trim();
      if (tagsValue.startsWith('[') && tagsValue.endsWith(']')) {
        const inner = tagsValue.slice(1, -1).trim();
        if (inner) {
          collectedTags.push(...inner.split(',').map(t => t.trim().replace(/^["']|["']$/g, '')));
        }
      }
      // Handle YAML array continuation on next lines
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith('- ')) {
        const tagVal = lines[j].trim().substring(2).trim().replace(/^["']|["']$/g, '');
        if (tagVal) collectedTags.push(tagVal);
        j++;
      }
      if (j > i + 1) i = j - 1; // Skip processed lines
    } else if (line.startsWith('aliases:')) {
      foundAliases = true;
      // Collect aliases from inline or continuation format
      const aliasesValue = line.substring(8).trim();
      if (aliasesValue.startsWith('[') && aliasesValue.endsWith(']')) {
        const inner = aliasesValue.slice(1, -1).trim();
        if (inner) {
          collectedAliases.push(...inner.split(',').map(t => t.trim().replace(/^["']|["']$/g, '')));
        }
      }
      // Handle YAML array continuation on next lines
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith('- ')) {
        const aliasVal = lines[j].trim().substring(2).trim().replace(/^["']|["']$/g, '');
        if (aliasVal) collectedAliases.push(aliasVal);
        j++;
      }
      if (j > i + 1) i = j - 1;
    } else if (!line.startsWith('- ')) {
      newLines.push(line);
    }
  }

  // Rebuild frontmatter
  const result: string[] = ['---'];

  if (foundType) {
    result.push(typeLine);
  }

  // Programmatic date fields — never trust LLM-generated dates
  result.push(`created: ${createdValue || today}`);
  result.push(`updated: ${today}`);

  // Add other fields (preserving order), skipping any stale date lines
  for (const line of newLines) {
    if (!line.startsWith('type:') && !line.startsWith('tags:') && !line.startsWith('aliases:') &&
        !line.startsWith('created:') && !line.startsWith('updated:')) {
      result.push(line);
    }
  }

  // Add tags line
  if (foundTags || collectedTags.length > 0) {
    // Validate against the active vocabulary (Issue #85: user-configurable).
    // Default vocabulary is hardcoded VALID_*_TAGS; custom vocabulary comes
    // from settings.customEntityTags / customConceptTags. Falls back to default
    // when settings is omitted or when the mode is not 'custom'.
    //
    // Issue #85 v6: preserve LLM intent — keep ALL LLM-emitted tags in
    // the frontmatter. Tags inside the active vocabulary are accepted
    // outright; tags outside it are still written (the user can edit
    // them or expand their vocabulary later) but are flagged in
    // console.debug so the divergence is visible. Previously the
    // validator silently dropped out-of-vocab tags, which erased
    // legitimate LLM output when the user's vocabulary was too narrow.
    // Issue #85 v7: source pages now go through the same validation
    // pipeline as entity/concept, against the static VALID_SOURCE_TAGS
    // taxonomy (paper / document / article / …).
    const validSubtypes: readonly string[] = pageType === 'entity'
      ? (settings ? getActiveEntityTags(settings) : VALID_ENTITY_TAGS)
      : pageType === 'concept'
        ? (settings ? getActiveConceptTags(settings) : VALID_CONCEPT_TAGS)
        : pageType === 'source'
          ? (settings ? getActiveSourceTags(settings) : VALID_SOURCE_TAGS)
          : [];
    const dedupedTags: string[] = [];
    const outOfVocab: string[] = [];
    for (const tag of collectedTags) {
      if (!tag || tag === pageType) continue;
      if (dedupedTags.includes(tag)) continue;
      dedupedTags.push(tag);
      if (!validSubtypes.includes(tag)) outOfVocab.push(tag);
    }
    if (outOfVocab.length > 0) {
      // Issue #85 v6: surface the divergence to the user via console.debug
      // (no Notice — the user already saw a success Notice from the
      // ingestion; we don't want to spam a separate "tag mismatch"
      // pop-up. The debug log is enough to diagnose in DevTools.)
      console.debug(
        `[enforceFrontmatterConstraints] ${pageType} page retained ${outOfVocab.length} tag(s) not in active vocabulary (${validSubtypes.length} entries):`,
        outOfVocab
      );
    }
    if (dedupedTags.length > 0) {
      result.push(`tags: [${dedupedTags.join(', ')}]`);
    } else {
      // Preserve empty tags field rather than forcing a default — user intent must win.
      // Domain tags (e.g. "Mikrobiologie") survive here; they are outside the subtype
      // whitelist but are not wrong. Configurable vocabulary is tracked in Issue #85.
      result.push('tags:');
    }
  }

  // Add aliases line
  if (foundAliases || collectedAliases.length > 0) {
    const validAliases = collectedAliases.filter((v, i, a) => a.indexOf(v) === i && v);
    if (validAliases.length > 0) {
      result.push(`aliases:${yamlStringify(validAliases)}`);
    }
  }

  result.push('---');

  // CRITICAL: frontmatter closing delimiter MUST have blank line before body
  // Format: ---\n...\n---\n\n<body> (double newline after closing ---)
  return result.join('\n') + '\n\n' + body;
}

// Rate-limit failure detection and user notification.
// Shared across all parallel execution sites (ingestion, lint fixes, etc.).

export interface RateLimitInfo {
  count: number;
  rateLimitNames: string[];
  suggestedConcurrency: number;
  suggestedDelay: number;
}

export function detectRateLimitFailures(
  failedItems: Array<{ reason?: string; name?: string; type?: string }>,
  currentConcurrency: number,
  currentBatchDelay: number,
): RateLimitInfo | null {
  const rateLimitFailures = failedItems.filter(f =>
    /429|rate.?limit|too many requests|throttl/i.test(f.reason || '')
  );

  if (rateLimitFailures.length === 0) return null;

  return {
    count: rateLimitFailures.length,
    rateLimitNames: rateLimitFailures.map(f => f.name || f.reason || 'unknown'),
    suggestedConcurrency: Math.max(1, currentConcurrency - 1),
    suggestedDelay: currentBatchDelay < 100
      ? 500
      : Math.min(2000, Math.round(currentBatchDelay * 2))
  };
}

export function formatRateLimitNotice(
  info: RateLimitInfo,
  language: string,
): string {
  return getText(language, 'rateLimitDetected')
    .replace('{count}', String(info.count))
    .replace('{suggestedConcurrency}', String(info.suggestedConcurrency))
    .replace('{suggestedDelay}', String(info.suggestedDelay));
}

/**
 * Strip a leading "# " (H1) from a markdown title and promote all subsequent
 * "#" headings down by one level (H1 → H2, H2 → H3, etc.). Used to nest a
 * sub-report's title under a parent log entry heading.
 *
 * Example: "# Wiki Lint Report\n## Body\n### Detail" →
 *          "## Body\n#### Detail" (H1 stripped, H2 → H3, H3 → H4)
 */
export function nestReportUnderParent(report: string): string {
  const lines = report.split('\n');
  let h1Stripped = false;
  const out: string[] = [];
  for (const line of lines) {
    // ATX heading: one or more `#` chars at start, followed by space then text
    const m = /^(#+)\s/.exec(line);
    if (m) {
      if (!h1Stripped && m[1].length === 1) {
        // First H1: strip entirely (parent already provides title)
        h1Stripped = true;
        continue;
      }
      // Subsequent heading: promote one level (H2 → H3, H3 → H4, …)
      out.push('#' + line);
      h1Stripped = true; // defensive: any heading before first H1 should also strip-then-promote
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Truncate a list of items to a visible cap, with a "... N more" trailer
 * for the Modal display, or return the full list for log persistence.
 *
 * Issue: lint report > 20 dead links was truncated to "... 857 more" in BOTH
 * the modal AND the persisted log.md. Log should keep the full enumeration
 * (it's the persistent audit trail). This helper returns a (modal, log) pair
 * so the controller can write different content to each destination.
 */
export function truncateListForDisplay<T>(
  items: T[],
  formatItem: (item: T, index: number) => string,
  visibleCap = 20,
  moreTemplate = (n: number) => `- ... ${n} more`
): { modalReport: string; logReport: string } {
  const all = items.map(formatItem).join('\n');
  if (items.length <= visibleCap) {
    return { modalReport: all, logReport: all };
  }
  const visible = items.slice(0, visibleCap).map(formatItem).join('\n');
  return {
    modalReport: visible + '\n' + moreTemplate(items.length - visibleCap),
    logReport: all, // log keeps every entry
  };
}

// Truncate mentions to a reasonable token budget for merge/create prompts.
export function truncateMentions(
  mentions: string[] | undefined,
  maxChars = 500,
  sourcePath?: string
): string {
  if (!mentions || mentions.length === 0) return '';
  let result = '';
  if (sourcePath) {
    // Strip .md from left path; display name is the basename without extension
    const leftPath = sourcePath.replace(/\.md$/, '');
    const displayName = leftPath.split('/').pop() || leftPath;
    for (const m of mentions) {
      const line = `- ${m} — [[${leftPath}|${displayName}]]`;
      if (result.length + line.length + 1 > maxChars) {
        if (result.length > 0) break;
        const head = Math.max(0, maxChars - ` — [[${leftPath}|${displayName}]]`.length - 3);
        return `- ${m.substring(0, head)}... — [[${leftPath}|${displayName}]]`;
      }
      result += (result ? '\n' : '') + line;
    }
    return result;
  }
  // No source path — plain list
  for (const m of mentions) {
    const line = `- ${m}`;
    if (result.length + line.length + 1 > maxChars) {
      if (result.length > 0) break;
      return `- ${m.substring(0, Math.max(0, maxChars - 3))}...`;
    }
    result += (result ? '\n' : '') + line;
  }
  return result;
}

/**
 * Extract tags from a source note's frontmatter.
 * Used by summary page generation to preserve user-defined tags instead of
 * overwriting with LLM-derived concept names (Issue #90).
 *
 * @param content - Raw file content with optional YAML frontmatter
 * @returns Array of tag strings (trimmed, non-empty); [] if no frontmatter or no tags
 */
export function extractSourceTags(content: string): string[] {
  const fm = parseFrontmatter(content);
  if (!fm) return [];
  const raw = fm.tags;
  if (Array.isArray(raw)) {
    return raw.map(t => String(t).trim()).filter(t => t.length > 0);
  }
  return [];
}

// ── Tag vocabulary (Issue #85) ────────────────────────────────
// User-configurable controlled vocabulary. When tagVocabularyMode is 'default'
// the hard-coded VALID_*_TAGS arrays from types.ts are used (preserves backward
// compatibility for users who never set the mode). When 'custom', the user's
// customEntityTags / customConceptTags CSV strings are used (with default
// fallback if the user clears the input).
//
// Nested tag syntax (e.g. "Arzneimittel/Neurologie") is preserved verbatim;
// Obsidian's tag parser splits on "/" at display time.

/**
 * Active entity tag vocabulary for ingest / lint / fix-runners.
 * Falls back to the hardcoded defaults when settings.tagVocabularyMode is
 * not 'custom', or when the user has cleared the custom field.
 */
export function getActiveEntityTags(settings: LLMWikiSettings): string[] {
  const custom = (settings.customEntityTags ?? '').trim();
  if (settings.tagVocabularyMode === 'custom' && custom.length > 0) {
    const userTags = custom.split(',').map(t => t.trim()).filter(t => t.length > 0);
    return Array.from(new Set(userTags));
  }
  return [...VALID_ENTITY_TAGS];
}

/**
 * Active concept tag vocabulary. See getActiveEntityTags for behavior.
 */
export function getActiveConceptTags(settings: LLMWikiSettings): string[] {
  const custom = (settings.customConceptTags ?? '').trim();
  if (settings.tagVocabularyMode === 'custom' && custom.length > 0) {
    const userTags = custom.split(',').map(t => t.trim()).filter(t => t.length > 0);
    return Array.from(new Set(userTags));
  }
  return [...VALID_CONCEPT_TAGS];
}

/**
 * Issue #85 v7: source-page active vocabulary. Per design decision,
 * the source vocabulary is NOT user-configurable — it is a static
 * "form" taxonomy (paper / document / article / …) baked into
 * `VALID_SOURCE_TAGS`. This function exists for shape parity with
 * getActiveEntityTags / getActiveConceptTags so the audit + retag
 * runner can call `getActiveSourceTags(settings)` uniformly.
 */
export function getActiveSourceTags(settings: LLMWikiSettings): string[] {
  return [...VALID_SOURCE_TAGS];
}

/**
 * Normalize a custom-vocabulary CSV string to canonical form.
 * Trims whitespace, drops empty entries, dedupes case-insensitively
 * (keeping the first casing seen), joins with ", " for human-readable
 * persistence. Idempotent: normalizing an already-canonical string
 * returns it unchanged.
 */
export function normalizeVocabularyCsv(csv: string): string {
  if (!csv) return '';
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of csv.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result.join(', ');
}

/**
 * Check whether the user has supplied the minimum configuration required to
 * call an LLM — provider, model, and an API key (except for local providers
 * ollama / lmstudio which don't need one).
 *
 * Used by `requireLLMReady()` as a fallback path so users who filled in
 * provider/apiKey/model but never clicked "Test Connection" (which would set
 * `llmReady = true`) can still invoke core commands. Pure function — no
 * vault/notice side effects — so it's trivially testable.
 *
 * Mirrors the migration check in main.ts `loadSettings()` (Issue #120-era
 * user upgrade detection) so both code paths agree on what "configured"
 * means.
 */
export function hasLLMConfig(settings: LLMWikiSettings): boolean {
  if (!settings.provider?.trim()) return false;
  if (!settings.model?.trim()) return false;
  if (settings.provider === 'ollama' || settings.provider === 'lmstudio') {
    return true;
  }
  return !!settings.apiKey?.trim();
}

// ── Index parsing & local keyword matching ─────────────────────

interface PageRef {
  path: string;
  title: string;
  aliases: string[];
  score: number;
}

export function parseIndexForPages(indexContent: string): Omit<PageRef, 'score'>[] {
  const pages: Omit<PageRef, 'score'>[] = [];
  const lineRegex = /- \[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*(?:`aliases:\s*([^`]+)`)?/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(indexContent)) !== null) {
    const path = match[1];
    const aliasStr = match[2] || '';
    const title = path.split('/').pop() || path;
    const aliases = aliasStr.split(',').map(a => a.trim()).filter(Boolean);
    pages.push({ path, title, aliases });
  }
  return pages;
}

export function localKeywordMatch(query: string, pages: Omit<PageRef, 'score'>[]): PageRef[] {
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);
  const scored: PageRef[] = [];
  for (const page of pages) {
    let score = 0;
    const titleLower = page.title.toLowerCase();
    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 3;
      for (const alias of page.aliases) {
        if (alias.toLowerCase().includes(kw)) score += 2;
      }
    }
    if (score > 0) scored.push({ ...page, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

// Match extracted entity/concept names against existing wiki pages using
// slug + alias matching (same logic as resolvePagePath Fast path 2).
// Used for programmatic related_pages after extraction.
export function matchExtractedToExisting(
  extractedNames: string[],
  existingPages: Array<{ title: string; aliases?: string[] }>
): string[] {
  // Precompute slug values silently — page titles and aliases don't change
  const pageSlugs = existingPages.map(p => ({
    title: p.title,
    slug: computeSlug(p.title),
    aliasSlugs: (p.aliases || []).map(a => computeSlug(a)),
  }));

  const matched = new Set<string>();
  for (const name of extractedNames) {
    const targetSlug = computeSlug(name);
    const match = pageSlugs.find(p =>
      p.slug === targetSlug ||
      p.aliasSlugs.some(a => a === targetSlug)
    );
    if (match) matched.add(match.title);
  }
  return [...matched];
}

// Coerce a potentially non-array value to an array.
// Used for LLM output normalization where models may omit empty arrays
// or return non-array truthy values (e.g. entities: true). Pure function.
export function coerceToArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
}