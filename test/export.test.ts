import { describe, it, expect } from 'vitest';
import {
  markdownToHtmlFragment,
  buildHtmlDocument,
  exportToHtml
} from '../src/host/export';

/**
 * P7 HTML export. The pipeline is unified/remark/remark-gfm → remark-html with math rendered
 * host-side by MathJax (a second engine, distinct from the editor's KaTeX). Raw HTML passes
 * through so OMD's GFM-visible forms render, while its machinery renders as nothing.
 */

describe('markdown → html fragment', () => {
  it('renders GFM (bold, lists, task lists, tables)', async () => {
    const html = await markdownToHtmlFragment(
      '**b** _i_\n\n- one\n- [x] done\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n'
    );
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  it('renders math as self-contained SVG via MathJax', async () => {
    const html = await markdownToHtmlFragment('Inline $E = mc^2$ and $$x^2 + y^2$$\n');
    expect(html).toContain('<svg');
    // The SVG is standalone — no external script or font reference needed to display it.
    expect(html).not.toContain('MathJax.js');
  });

  it('passes real HTML through so coexistence forms render', async () => {
    const html = await markdownToHtmlFragment(
      '<div align="center">\n\n![x](y.png)\n\n</div>\n'
    );
    expect(html).toContain('align="center"');
    expect(html).toContain('<img');
  });

  it('strips leftover OMD shortcode machinery entirely', async () => {
    const html = await markdownToHtmlFragment(
      'Before\n\n<!-- omd:date {"value":"2026-01-02"} -->\n\nAfter\n'
    );
    // The OMD-look export removes shortcode comments (was: passed through as invisible comments).
    expect(html).toContain('<p>Before</p>');
    expect(html).toContain('<p>After</p>');
    expect(html).not.toContain('omd:date');
  });

  it('renders emoji shortcodes (:tada: → 🎉)', async () => {
    const html = await markdownToHtmlFragment('Ship it :tada: and :rocket:.\n');
    expect(html).toContain('🎉');
    expect(html).toContain('🚀');
    expect(html).not.toContain(':tada:');
  });

  it('gives headings GitHub-style ids, de-duplicated', async () => {
    const html = await markdownToHtmlFragment('# My Heading\n\n## My Heading\n');
    expect(html).toMatch(/<h1[^>]*id="my-heading"/);
    expect(html).toMatch(/<h2[^>]*id="my-heading-1"/);
  });

  it('does not autolink @mention / #123 without a repo context (matches GitHub)', async () => {
    // markdownToHtmlFragment passes no repoSlug, so bare mentions/issues stay text.
    const html = await markdownToHtmlFragment('Ping @alice and see #123.\n');
    expect(html).not.toContain('github.com/alice');
    expect(html).not.toContain('/issues/123');
  });

  it('renders wikilinks as links (GitHub-Wiki style, case preserved), skipping code', async () => {
    const html = await markdownToHtmlFragment('See [[Roadmap]] and [[the plan|Big Roadmap]]. `[[x]]`\n');
    expect(html).toContain('<a href="Roadmap">Roadmap</a>');
    expect(html).toContain('<a href="Big-Roadmap">the plan</a>');
    expect(html).toContain('<code>[[x]]</code>'); // inside inline code → untouched
  });

  it('renders GitHub alerts as styled callouts (not literal [!NOTE] text)', async () => {
    const html = await markdownToHtmlFragment('> [!NOTE]\n> Heads up.\n');
    expect(html).toContain('markdown-alert markdown-alert-note');
    expect(html).toContain('octicon'); // the GitHub alert icon
    expect(html).not.toContain('[!NOTE]'); // the marker is consumed, not shown
  });

  it('title-cases the alert label (Warning, not WARNING), leaving prose literals alone', async () => {
    const html = await markdownToHtmlFragment('> [!WARNING]\n> Careful.\n\nA literal WARNING here.\n');
    expect(html).toMatch(/markdown-alert-title[\s\S]*?>Warning<\/p>/);
    expect(html).not.toMatch(/>WARNING<\/p>/); // the alert label isn't upper-case
    expect(html).toContain('literal WARNING here'); // prose text untouched
  });

  it('syntax-highlights code fences with Shiki (inline theme vars)', async () => {
    const html = await markdownToHtmlFragment('```js\nconst x = 1;\n```\n');
    expect(html).toContain('class="shiki');
    expect(html).toContain('--shiki-light'); // light/dark inline colours, no external CSS
  });

  it('emits mermaid fences as <pre class="mermaid"> for a runtime to render', async () => {
    const html = await markdownToHtmlFragment('```mermaid\ngraph TD; A-->B;\n```\n');
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('graph TD'); // source preserved (degrades readably without a runtime)
    expect(html).not.toContain('class="shiki'); // not run through the highlighter
  });
});

describe('OMD-look export (block styling, content only)', () => {
  it('renders a smart callout as a styled box with accent + icon + title', async () => {
    const html = await markdownToHtmlFragment(
      '<!-- omd:callout {"icon":"info","color":"#4daafc"} -->\n\n> **Title**\n>\n> Body.\n\n<!-- /omd:callout -->\n'
    );
    expect(html).toContain('class="omd-callout"');
    expect(html).toContain('--omd-accent:#4daafc');
    expect(html).toContain('<svg'); // the icon
    expect(html).toContain('<strong>Title</strong>'); // body markdown preserved
    expect(html).not.toContain('<!-- omd:callout'); // machinery stripped
  });

  it('renders a link card from its params, dropping the fallback link', async () => {
    const html = await markdownToHtmlFragment(
      '<!-- omd:linkcard {"url":"https://x.com","title":"X","description":"d","site":"x.com"} -->\n\n[X](https://x.com)\n\n<!-- /omd:linkcard -->\n'
    );
    expect(html).toContain('class="omd-linkcard"');
    expect(html).toContain('omd-linkcard-title');
    expect(html).toContain('href="https://x.com"');
    // the bare [X](url) fallback paragraph is not emitted separately
    expect(html).not.toContain('<p><a href="https://x.com">X</a></p>');
  });

  it('renders a date token as a chip', async () => {
    const html = await markdownToHtmlFragment('Due 📅 2026-07-27 today.\n');
    expect(html).toContain('class="omd-date-chip"');
    expect(html).toContain('📅 2026-07-27');
  });

  it('renders tabs as labeled stacked sections (no switch controls)', async () => {
    const html = await markdownToHtmlFragment(
      '<!-- omd:tabs {} -->\n\n<!-- omd:tab {"label":"One"} -->\n\nA\n\n<!-- /omd:tab -->\n\n<!-- omd:tab {"label":"Two"} -->\n\nB\n\n<!-- /omd:tab -->\n\n<!-- /omd:tabs -->\n'
    );
    expect(html).toContain('class="omd-tabs-export"');
    expect(html).toContain('>One<');
    expect(html).toContain('>Two<');
    expect(html).not.toContain('<!-- omd:tab'); // machinery stripped
  });

  it('wraps a gallery body in an image grid (not a flat list)', async () => {
    const html = await markdownToHtmlFragment(
      '<!-- omd:gallery {"columns":"3"} -->\n\n![a](a.png)\n\n![b](b.png)\n\n<!-- /omd:gallery -->\n'
    );
    expect(html).toContain('class="omd-gallery-export"');
    expect(html).toContain('data-columns="3"');
    expect(html).toContain('src="a.png"');
    expect(html).toContain('src="b.png"');
    expect(html).not.toContain('omd:gallery'); // machinery stripped
  });

  it('leaves the chart SVG+table coexistence body intact', async () => {
    const html = await markdownToHtmlFragment(
      '<!-- omd:chart {"type":"bar"} -->\n\n<svg role="img"><rect/></svg>\n\n| Q | V |\n| - | - |\n| 1 | 2 |\n\n<!-- /omd:chart -->\n'
    );
    expect(html).toContain('<svg'); // the cached chart image survives
    expect(html).toContain('<table>'); // the data table survives
    expect(html).not.toContain('omd:chart'); // only the comment machinery is stripped
  });

  it('renders YAML front matter as a table (as GitHub does)', async () => {
    const html = await markdownToHtmlFragment('---\ntitle: Shown\n---\n\n# Body\n');
    expect(html).toMatch(/<h1[^>]*>Body<\/h1>/);
    expect(html).toContain('omd-frontmatter');
    expect(html).toContain('title');
    expect(html).toContain('Shown');
  });
});

describe('document shell', () => {
  it('wraps a fragment in a titled, self-contained document', () => {
    const doc = buildHtmlDocument('<p>Body</p>', 'My Doc', '.markdown-body{color:red}');
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('<title>My Doc</title>');
    expect(doc).toContain('markdown-body{color:red}'); // css inlined, not linked
    expect(doc).toContain('<article class="markdown-body">');
    expect(doc).not.toContain('<link'); // nothing external to fetch
  });

  it('escapes the title', () => {
    expect(buildHtmlDocument('', '<script>x</script>', '')).toContain(
      '&lt;script&gt;x&lt;/script&gt;'
    );
  });

  it('inlines the mermaid runtime only when the fragment has a diagram', () => {
    const runtime = '/*MERMAID_RUNTIME*/';
    // A doc with a mermaid block gets the runtime + init script.
    const withDiagram = buildHtmlDocument('<pre class="mermaid">graph TD;A--&gt;B</pre>', 't', '', runtime);
    expect(withDiagram).toContain('/*MERMAID_RUNTIME*/');
    expect(withDiagram).toContain('window.mermaid.run');
    // A doc without one doesn't carry the 3.5 MB runtime.
    const noDiagram = buildHtmlDocument('<p>no diagrams here</p>', 't', '', runtime);
    expect(noDiagram).not.toContain('/*MERMAID_RUNTIME*/');
    // And no runtime supplied → never inlined.
    expect(buildHtmlDocument('<pre class="mermaid">x</pre>', 't', '')).not.toContain('window.mermaid.run');
  });
});

describe('full export', () => {
  it('strips comment-thread metadata (an export is a reader artifact)', async () => {
    const md =
      '# Doc\n\nBody.\n\n<!-- omd-threads\n- id: t1\n  status: open\n  comments: []\n-->\n';
    const html = await exportToHtml(md, 'Doc', '/* css */');
    expect(html).not.toContain('omd-threads');
    expect(html).toMatch(/<h1[^>]*>Doc<\/h1>/);
    expect(html).toContain('markdown-body');
  });
});
