import { parse as parseYaml } from 'yaml';
import { toIsoDate } from './dates';

/**
 * New-document templates. Discovered the *same three-layer way as blocks*
 * (workspace → user → shipped, first match wins), so a team scaffolds new docs by dropping a
 * file into the repo — no rebuild. A template is simply a markdown file: its YAML front matter
 * carries the title/description, and its body is the scaffold. That keeps templates authorable
 * with the same tool they scaffold.
 */

export type TemplateSource = 'workspace' | 'user' | 'shipped';

export interface TemplateDefinition {
  /** Identity, from the file name; used for shadowing across layers. */
  name: string;
  title: string;
  description?: string;
  /** The scaffold body (front matter stripped). */
  content: string;
  source: TemplateSource;
}

/** A template name: lowercase, digits, dashes. */
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Build a template from a markdown file. The leading YAML front matter (if any and parseable)
 * supplies `title`/`description`; the rest is the scaffold. Bad front matter is not fatal —
 * the file name becomes the title and the whole text is used, because a template that scaffolds
 * *something* is better than one dropped for a metadata typo.
 */
export function parseTemplateFile(
  name: string,
  text: string,
  source: TemplateSource
): TemplateDefinition | null {
  if (!NAME_RE.test(name)) return null;
  let title = name;
  let description: string | undefined;
  let content = text;

  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (m) {
    try {
      const fm = parseYaml(m[1]) as Record<string, unknown> | null;
      if (fm && typeof fm.title === 'string' && fm.title) title = fm.title;
      if (fm && typeof fm.description === 'string') description = fm.description;
    } catch {
      /* keep the file-name title and use the whole text */
    }
    content = text.slice(m[0].length);
  }
  return { name, title, description, content, source };
}

/** First match wins by name — workspace shadows user shadows shipped — then sort by title. */
export function resolveTemplates(
  workspace: TemplateDefinition[],
  user: TemplateDefinition[],
  shipped: TemplateDefinition[]
): TemplateDefinition[] {
  const byName = new Map<string, TemplateDefinition>();
  for (const def of [...workspace, ...user, ...shipped]) {
    if (!byName.has(def.name)) byName.set(def.name, def);
  }
  return [...byName.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** Substitute the handful of variables a scaffold may use, filled at creation time. */
export function fillTemplate(content: string, vars: { title: string; date: string }): string {
  return content
    .replace(/\{\{\s*title\s*\}\}/g, vars.title)
    .replace(/\{\{\s*date\s*\}\}/g, vars.date);
}

/** A human title derived from a chosen file name (`design-notes.md` → "Design notes"). */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Untitled';
}

/** Ensure a `.md` extension without doubling it. */
export function ensureMdExtension(fileName: string): string {
  return /\.md$/i.test(fileName) ? fileName : `${fileName}.md`;
}

/** The scaffold content for a chosen template and file name, with variables filled. */
export function renderNewDocument(
  template: TemplateDefinition,
  fileName: string,
  now = new Date()
): string {
  return fillTemplate(template.content, {
    title: titleFromFileName(fileName),
    date: toIsoDate(now)
  });
}

/**
 * The templates OMD ships (the lowest-precedence layer). They double as a tour of OMD's own
 * constructs — a date token, a callout, task lists, a table — so a new document starts rich.
 */
export const SHIPPED_TEMPLATES: TemplateDefinition[] = [
  {
    name: 'blank',
    title: 'Blank document',
    description: 'Just a title to start from.',
    content: '# {{title}}\n\n',
    source: 'shipped'
  },
  {
    name: 'meeting-notes',
    title: 'Meeting notes',
    description: 'Attendees, agenda, decisions, and action items.',
    content: [
      '# {{title}}',
      '',
      '📅 {{date}}',
      '',
      '## Attendees',
      '',
      '- ',
      '',
      '## Agenda',
      '',
      '1. ',
      '',
      '## Decisions',
      '',
      '> [!NOTE]',
      '> Record what was decided and why.',
      '',
      '## Action items',
      '',
      '- [ ] ',
      ''
    ].join('\n'),
    source: 'shipped'
  },
  {
    name: 'design-doc',
    title: 'Design document',
    description: 'Context, proposal, alternatives, and risks.',
    content: [
      '# {{title}}',
      '',
      '📅 {{date}}',
      '',
      '## Context',
      '',
      'What problem are we solving, and why now?',
      '',
      '## Proposal',
      '',
      'The approach in one or two paragraphs.',
      '',
      '## Alternatives considered',
      '',
      '| Option | Pros | Cons |',
      '| --- | --- | --- |',
      '|  |  |  |',
      '',
      '## Risks',
      '',
      '> [!WARNING]',
      '> Call out what could go wrong.',
      ''
    ].join('\n'),
    source: 'shipped'
  }
];
