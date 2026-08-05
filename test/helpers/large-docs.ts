/**
 * Generators for large markdown documents to test undo behavior on realistic-scale docs.
 * The bug reporter specifically noted the issue appears on "very large documents".
 *
 * Large docs matter because:
 * - getMarkdown() serialization is slower → wider timing gaps in the setMarkdown round-trip
 * - More ProseMirror nodes → slower doc.eq() comparisons
 * - Realistic document structure (nested lists, tables, code blocks) stresses the parser
 */

/** Generate a large document with mixed content types (headings, lists, tables, code). */
export function generateMixedDocument(numSections: number): string {
  const sections: string[] = [];

  for (let i = 1; i <= numSections; i++) {
    sections.push(`## Section ${i}\n`);

    // Paragraph
    sections.push(
      `This is paragraph ${i} with some content to establish document size. ` +
      `It contains multiple sentences to simulate realistic prose writing. ` +
      `The quick brown fox jumps over the lazy dog.\n`
    );

    // Unordered list (every other section)
    if (i % 2 === 0) {
      sections.push(`- Item ${i}.1`);
      sections.push(`- Item ${i}.2`);
      sections.push(`- Item ${i}.3\n`);
    }

    // Ordered list
    if (i % 3 === 0) {
      sections.push(`1. Step ${i}.a`);
      sections.push(`2. Step ${i}.b`);
      sections.push(`3. Step ${i}.c\n`);
    }

    // Code block (every 5th section)
    if (i % 5 === 0) {
      sections.push('```javascript\n');
      sections.push(`function example${i}() {`);
      sections.push(`  return ${i};`);
      sections.push('}\n');
      sections.push('```\n');
    }

    // Table (every 7th section)
    if (i % 7 === 0) {
      sections.push(`| Column A | Column B |`);
      sections.push(`|----------|----------|`);
      sections.push(`| ${i}.1    | value A  |`);
      sections.push(`| ${i}.2    | value B  |\n`);
    }

    // Blockquote (every 4th section)
    if (i % 4 === 0) {
      sections.push(`> This is a blockquote in section ${i}.\n`);
    }

    // Horizontal rule (every 10th section)
    if (i % 10 === 0) {
      sections.push('---\n');
    }
  }

  return sections.join('\n');
}

/** Generate a large document that is mostly prose (many paragraphs, minimal structure). */
export function generateProseDocument(numParagraphs: number): string {
  const paragraphs: string[] = [];

  for (let i = 1; i <= numParagraphs; i++) {
    paragraphs.push(
      `Paragraph ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. ` +
      `Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ` +
      `Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`
    );
  }

  return paragraphs.join('\n\n');
}

/** Generate a large document with deeply nested lists (stresses parser serialization). */
export function generateNestedListsDocument(numTopItems: number): string {
  const items: string[] = [];

  for (let i = 1; i <= numTopItems; i++) {
    items.push(`- Level 1 item ${i}`);
    items.push(`  - Level 2 item ${i}.a`);
    items.push(`    - Level 3 item ${i}.a.1`);
    items.push(`      - Level 4 item ${i}.a.1.x`);
    items.push(`      - Level 4 item ${i}.a.1.y`);
    items.push(`    - Level 3 item ${i}.a.2`);
    items.push(`  - Level 2 item ${i}.b`);
    items.push(`    - Level 3 item ${i}.b.1`);
  }

  return items.join('\n') + '\n';
}

/** Generate a large document with many tables (GFM feature, complex serialization). */
export function generateTablesDocument(numTables: number): string {
  const parts: string[] = [];

  for (let i = 1; i <= numTables; i++) {
    parts.push(`## Table ${i}\n`);
    parts.push('| Col A | Col B | Col C | Col D |');
    parts.push('|-------|-------|-------|-------|');
    for (let r = 1; r <= 10; r++) {
      parts.push(`| ${i}.${r}.a | ${i}.${r}.b | ${i}.${r}.c | ${i}.${r}.d |`);
    }
    parts.push('');
  }

  return parts.join('\n') + '\n';
}

/** Generate a document with code blocks interspersed with prose (common in technical docs). */
export function generateTechnicalDoc(numSections: number): string {
  const sections: string[] = [];

  for (let i = 1; i <= numSections; i++) {
    sections.push(`## ${['Introduction', 'Setup', 'Configuration', 'API Reference', 'Examples'][i % 5]} ${i}\n`);
    sections.push(
      `This section describes the functionality for module ${i}. ` +
      `It covers the key concepts, usage patterns, and edge cases.\n`
    );

    sections.push('```typescript\n');
    sections.push(`interface Module${i} {`);
    sections.push(`  id: number;`);
    sections.push(`  name: string;`);
    sections.push(`  execute(): Promise<boolean>;`);
    sections.push('}\n');
    sections.push('```\n');

    sections.push(
      `The \`Module${i}\` interface defines the contract for all implementations. ` +
      `It requires an \`id\`, a \`name\`, and an asynchronous \`execute\` method.\n`
    );

    // Task list (every 3rd section)
    if (i % 3 === 0) {
      sections.push(`- [ ] Implement Module${i}`);
      sections.push(`- [x] Design interface`);
      sections.push(`- [ ] Write tests\n`);
    }
  }

  return sections.join('\n');
}

/** A convenience map of preset sizes for quick reference in tests. */
export const PRESETS = {
  /** ~100 sections → ~800-1000 lines, ~30KB */
  small: () => generateMixedDocument(100),
  /** ~300 sections → ~2500-3000 lines, ~90KB */
  medium: () => generateMixedDocument(300),
  /** ~500 sections → ~4000-5000 lines, ~150KB */
  large: () => generateMixedDocument(500),
  /** ~1000 sections → ~8000-10000 lines, ~300KB */
  xlarge: () => generateMixedDocument(1000),
  /** ~3000 sections → ~25000 lines, ~900KB */
  mega: () => generateMixedDocument(3000),
  /** ~5000 sections → ~42000 lines, ~1.5MB */
  giga: () => generateMixedDocument(5000),
  /** ~12000 sections → ~100000 lines, ~3.6MB */
  tera: () => generateMixedDocument(12000),
} as const;
