import { describe, it, expect } from 'vitest';
import { buildDefaultSchemaBody } from '../../schema/schema-manager';

describe('buildDefaultSchemaBody', () => {
  const body = buildDefaultSchemaBody();

  it('includes all required page templates', () => {
    expect(body).toContain('## Entity Page Template');
    expect(body).toContain('## Concept Page Template');
    expect(body).toContain('## Source Page Template');
  });

  it('Source Page Template documents the tags inheritance rule (Issue #90)', () => {
    // The source page tags MUST be inherited from the source note frontmatter,
    // not LLM-derived. This preserves the user's tag vocabulary.
    expect(body).toMatch(/## Source Page Template[\s\S]*?tags.*inherit/i);
    expect(body).toMatch(/do NOT use LLM-derived/i);
  });

  it('Date Fields section documents that created/updated are programmatic, not LLM-generated', () => {
    expect(body).toContain('## Date Fields');
    // The rule: dates are filled by the system, not by the LLM
    expect(body).toMatch(/created.*updated.*programmatic/i);
    expect(body).toMatch(/never LLM-generated|not LLM-generated|system.*override/i);
  });

  it('Mentions section uses academic-footnote style format', () => {
    // Expect: "Verbatim quote" — [[source-name|display-name]]
    expect(body).toMatch(/## Mentions Format/);
    expect(body).toMatch(/-\s+"[^"]+"\s*—\s*\[\[/);
  });

  it('preserves all original section headings for backward compatibility', () => {
    expect(body).toContain('## Wiki Structure');
    expect(body).toContain('## Naming Conventions');
    expect(body).toContain('## Content Rules');
    expect(body).toContain('## Classification Rules');
    expect(body).toContain('## Multi-Source Merge Rules');
    expect(body).toContain('## Maintenance Policies');
  });

  it('preserves entity and concept subtype valid lists', () => {
    // Entity: person, organization, project, product, event, place, other
    expect(body).toMatch(/person[\s\S]*?organization[\s\S]*?project[\s\S]*?product[\s\S]*?event[\s\S]*?place[\s\S]*?other/);
    // Concept: theory, method, field, phenomenon, standard, term, other
    expect(body).toMatch(/theory[\s\S]*?method[\s\S]*?field[\s\S]*?phenomenon[\s\S]*?standard[\s\S]*?term[\s\S]*?other/);
  });
});
