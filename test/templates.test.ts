import { describe, it, expect } from 'vitest';
import {
  parseTemplateFile,
  resolveTemplates,
  fillTemplate,
  titleFromFileName,
  ensureMdExtension,
  renderNewDocument,
  SHIPPED_TEMPLATES,
  type TemplateDefinition
} from '../src/shared/templates';

/**
 * P7 templates. Discovered the same three-layer way as blocks; a template is a markdown file
 * whose front matter is metadata and whose body is the scaffold. The pure model is tested
 * here — the VS Code prompt/IO around it is thin glue.
 */

describe('parsing a template file', () => {
  it('takes title/description from front matter and the body as content', () => {
    const def = parseTemplateFile(
      'meeting',
      '---\ntitle: Meeting Notes\ndescription: Agenda etc.\n---\n# {{title}}\n\nBody.\n',
      'workspace'
    );
    expect(def).toMatchObject({
      name: 'meeting',
      title: 'Meeting Notes',
      description: 'Agenda etc.',
      source: 'workspace'
    });
    expect(def?.content).toBe('# {{title}}\n\nBody.\n');
  });

  it('uses the file name as the title when there is no front matter', () => {
    const def = parseTemplateFile('notes', '# Just a body\n', 'user');
    expect(def?.title).toBe('notes');
    expect(def?.content).toBe('# Just a body\n');
  });

  it('survives bad front matter by keeping the whole file', () => {
    const def = parseTemplateFile('x', '---\nbad: [unclosed\n---\nBody.\n', 'user');
    expect(def?.title).toBe('x');
    expect(def?.content).toContain('Body.');
  });

  it('rejects an invalid template name', () => {
    expect(parseTemplateFile('Bad Name', 'x', 'user')).toBeNull();
  });
});

describe('three-layer resolution', () => {
  const t = (name: string, source: TemplateDefinition['source'], title = name): TemplateDefinition => ({
    name,
    title,
    content: '',
    source
  });

  it('workspace shadows user shadows shipped', () => {
    const resolved = resolveTemplates(
      [t('meeting', 'workspace', 'WS Meeting')],
      [t('meeting', 'user'), t('journal', 'user')],
      [t('meeting', 'shipped'), t('blank', 'shipped')]
    );
    const meeting = resolved.find((r) => r.name === 'meeting');
    expect(meeting?.source).toBe('workspace');
    expect(resolved.map((r) => r.name).sort()).toEqual(['blank', 'journal', 'meeting']);
  });

  it('sorts by title', () => {
    const resolved = resolveTemplates([], [], [t('b', 'shipped', 'Bravo'), t('a', 'shipped', 'Alpha')]);
    expect(resolved.map((r) => r.title)).toEqual(['Alpha', 'Bravo']);
  });
});

describe('variable substitution', () => {
  it('fills title and date, tolerating whitespace', () => {
    expect(fillTemplate('# {{title}} on {{ date }}', { title: 'Plan', date: '2026-07-23' })).toBe(
      '# Plan on 2026-07-23'
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(fillTemplate('{{author}}', { title: 't', date: 'd' })).toBe('{{author}}');
  });
});

describe('new-document helpers', () => {
  it('derives a readable title from a file name', () => {
    expect(titleFromFileName('design-notes.md')).toBe('Design notes');
    expect(titleFromFileName('q3_review')).toBe('Q3 review');
    expect(titleFromFileName('.md')).toBe('Untitled');
  });

  it('ensures a single .md extension', () => {
    expect(ensureMdExtension('plan')).toBe('plan.md');
    expect(ensureMdExtension('plan.md')).toBe('plan.md');
  });

  it('renders a shipped template with its variables filled', () => {
    const meeting = SHIPPED_TEMPLATES.find((t) => t.name === 'meeting-notes')!;
    const out = renderNewDocument(meeting, 'team-sync.md', new Date(2026, 6, 23));
    expect(out).toContain('# Team sync');
    expect(out).toContain('📅 2026-07-23');
    expect(out).not.toContain('{{'); // every placeholder filled
  });
});

describe('shipped templates are well-formed', () => {
  it('every shipped template has content and a title', () => {
    for (const t of SHIPPED_TEMPLATES) {
      expect(t.title).toBeTruthy();
      expect(t.content).toBeTruthy();
      expect(t.source).toBe('shipped');
    }
  });
});
