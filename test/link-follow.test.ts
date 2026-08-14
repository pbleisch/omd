import { describe, it, expect, beforeEach } from 'vitest';
import type { EditorToHost } from '../src/shared/messages';

/**
 * Following an inline link (src/webview/plugins/link-follow.ts). The rule under test is the
 * interaction contract: a **plain** click never navigates (it places the cursor — this is a
 * WYSIWYG editor), a Cmd/Ctrl+click follows, and every inline link form follows the same way.
 * The webview cannot resolve a path, so "follows" means either scrolling this document (a bare
 * `#anchor`) or one message to the host.
 *
 * The host bridge is stubbed before the editor is imported so `post()` is observable; without a
 * stub `src/webview/vscode.ts` drops sends on the floor.
 */
const sent: EditorToHost[] = [];
(globalThis as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({
  postMessage: (msg: EditorToHost) => void sent.push(msg),
  getState: () => undefined,
  setState: () => {}
});

const { mountEditor } = await import('./helpers/editor');
const { parseHref, externalUrl, pathCandidates, schemeOf } = await import('../src/shared/links');

/** A click carrying both follow modifiers, so the assertion holds on either platform. */
function click(el: Element, mod: boolean): void {
  el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: mod, ctrlKey: mod })
  );
}

const posted = () => sent.filter((m) => m.type === 'openLink' || m.type === 'openTarget');

beforeEach(() => {
  sent.length = 0;
});

describe('following an ordinary markdown link', () => {
  it('does nothing on a plain click — that click belongs to the cursor', async () => {
    const { root } = await mountEditor('See [the design](docs/DESIGN.md) for more.\n');
    const a = root.querySelector('a[href="docs/DESIGN.md"]')!;
    expect(a).toBeTruthy();
    click(a, false);
    expect(posted()).toEqual([]);
  });

  it('asks the host to open it on Cmd/Ctrl+click, with the href exactly as written', async () => {
    const { root } = await mountEditor('See [the design](docs/DESIGN.md) for more.\n');
    click(root.querySelector('a[href="docs/DESIGN.md"]')!, true);
    expect(posted()).toEqual([{ type: 'openLink', href: 'docs/DESIGN.md' }]);
  });

  it('sends an upward path unchanged — resolution is the host\'s job, relative to the doc', async () => {
    const { root } = await mountEditor('Back to [the readme](../README.md).\n');
    click(root.querySelector('a[href="../README.md"]')!, true);
    expect(posted()).toEqual([{ type: 'openLink', href: '../README.md' }]);
  });

  it('sends a file link that carries an anchor whole, so the host can reveal the heading', async () => {
    const { root } = await mountEditor('See [the CLI](QUICKSTART.md#the-cli).\n');
    click(root.querySelector('a[href="QUICKSTART.md#the-cli"]')!, true);
    expect(posted()).toEqual([{ type: 'openLink', href: 'QUICKSTART.md#the-cli' }]);
  });

  it('sends an external URL to the host, which opens the browser', async () => {
    const { root } = await mountEditor('See [example](https://example.com).\n');
    click(root.querySelector('a[href="https://example.com"]')!, true);
    expect(posted()).toEqual([{ type: 'openLink', href: 'https://example.com' }]);
  });

  it('sends a non-markdown target like any other — the host picks the editor', async () => {
    const { root } = await mountEditor('The [diagram](media/diagram.png) shows it.\n');
    click(root.querySelector('a[href="media/diagram.png"]')!, true);
    expect(posted()).toEqual([{ type: 'openLink', href: 'media/diagram.png' }]);
  });
});

describe('a same-document anchor scrolls the editor, with no host round-trip', () => {
  it('moves the selection to the matching heading', async () => {
    const { root, handle } = await mountEditor(
      'Jump to [the section](#some-section).\n\n## Some Section\n\nBody.\n'
    );
    click(root.querySelector('a[href="#some-section"]')!, true);
    expect(posted()).toEqual([]); // the editor already holds the document
    expect(handle.getView().state.selection.$from.parent.type.name).toBe('heading');
  });

  it('stays put, and still sends nothing, when no heading matches', async () => {
    const { root, handle } = await mountEditor('Jump to [nowhere](#nope).\n\n## Real.\n');
    const before = handle.getView().state.selection.from;
    click(root.querySelector('a[href="#nope"]')!, true);
    expect(posted()).toEqual([]);
    expect(handle.getView().state.selection.from).toBe(before);
  });
});

describe('every inline link form follows the same way', () => {
  it('a wikilink goes by page name (openTarget), on Cmd/Ctrl+click only', async () => {
    const { root } = await mountEditor('See [[the plan|Roadmap]] today.\n');
    const el = root.querySelector('.omd-wikilink')!;
    click(el, false);
    expect(posted()).toEqual([]);
    click(el, true);
    expect(posted()).toEqual([{ type: 'openTarget', target: 'Roadmap' }]);
  });

  it('a mention is a real link, so it goes by href', async () => {
    const { root } = await mountEditor('Ping [@alice](https://github.com/alice) about it.\n');
    click(root.querySelector('.omd-mention')!, true);
    expect(posted()).toEqual([{ type: 'openLink', href: 'https://github.com/alice' }]);
  });

  it('an issue link does too', async () => {
    const { root } = await mountEditor('Fixes [#12](https://github.com/acme/omd/issues/12).\n');
    click(root.querySelector('.omd-issue')!, true);
    expect(posted()).toEqual([
      { type: 'openLink', href: 'https://github.com/acme/omd/issues/12' }
    ]);
  });

  it('a reference-style link follows its resolved destination (#33)', async () => {
    const { root } = await mountEditor('See [the design][d].\n\n[d]: docs/DESIGN.md\n');
    const a = root.querySelector('.omd-link-reference')!;
    expect(a).toBeTruthy();
    click(a, true);
    expect(posted()).toEqual([{ type: 'openLink', href: 'docs/DESIGN.md' }]);
  });
});

describe('the follow affordance', () => {
  it('arms the editor while the modifier is held and disarms on release', async () => {
    const { handle } = await mountEditor('See [the design](docs/DESIGN.md).\n');
    const dom = handle.getView().dom;
    expect(dom.classList.contains('omd-follow-armed')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true, ctrlKey: true }));
    expect(dom.classList.contains('omd-follow-armed')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    expect(dom.classList.contains('omd-follow-armed')).toBe(false);
  });

  it('tells the reader where the link goes and how to follow it', async () => {
    const { root } = await mountEditor('See [the backlog](BUGS.md) now.\n');
    const el = [...root.querySelectorAll<HTMLElement>('[title]')].find((e) =>
      e.getAttribute('title')?.startsWith('BUGS.md')
    );
    expect(el?.getAttribute('title')).toMatch(/^BUGS\.md\nFollow link \((⌘|Ctrl) \+ click\)$/);
  });
});

describe('reading a link destination (shared/links)', () => {
  it('splits the fragment off the path', () => {
    expect(parseHref('QUICKSTART.md#the-cli')).toEqual({
      path: 'QUICKSTART.md',
      fragment: 'the-cli'
    });
    expect(parseHref('docs/DESIGN.md')).toEqual({ path: 'docs/DESIGN.md', fragment: '' });
    expect(parseHref('#Some-Section')).toEqual({ path: '', fragment: 'some-section' });
  });

  it('unwraps the pointy-bracket form and decodes the fragment', () => {
    expect(parseHref('<my doc.md>')).toEqual({ path: 'my doc.md', fragment: '' });
    expect(parseHref('a.md#caf%C3%A9')).toEqual({ path: 'a.md', fragment: 'café' });
  });

  it('tries the percent-decoded name first, then the literal one', () => {
    expect(pathCandidates('my%20doc.md')).toEqual(['my doc.md', 'my%20doc.md']);
    expect(pathCandidates('plain.md')).toEqual(['plain.md']);
    expect(pathCandidates('100%.md')).toEqual(['100%.md']); // malformed escape, not an error
  });

  it('follows only the three schemes a document legitimately links out with', () => {
    expect(externalUrl('https://example.com')).toBe('https://example.com');
    expect(externalUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(externalUrl('//example.com/x')).toBe('https://example.com/x');
    expect(externalUrl('javascript:alert(1)')).toBeNull();
    expect(externalUrl('vscode://foo')).toBeNull();
    expect(externalUrl('docs/DESIGN.md')).toBeNull();
  });

  it('does not mistake a Windows drive letter for a scheme', () => {
    expect(schemeOf('c:/tmp/x.md')).toBe('');
    expect(schemeOf('https://x')).toBe('https');
  });
});
