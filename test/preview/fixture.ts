/**
 * Browser preview harness fixture. Bundled to `test/preview/fixture.js` and loaded by
 * `test/preview/index.html`, which runs the real webview bundle in a plain browser (stubbing
 * `acquireVsCodeApi`) for fast visual/interaction checks without launching VS Code.
 *
 * This exposes the real shipped block set so smart-block params/hover/context register exactly
 * as the host would wire them; the page feeds it (plus a document + media base) on `ready`.
 */
import { SHIPPED_BLOCKS } from '../../src/shared/blocks';

/** A compact document exercising the common constructs, used when no `?doc=` is given. */
const SAMPLE = [
  '# Preview',
  '',
  'Edit the **document**, not its _source_. Regular, `code`, ~~strike~~, and a footnote.[^1]',
  '',
  '> [!TIP]',
  '> Native GFM alerts render richly.',
  '',
  '<!-- omd:tabs {} -->',
  '',
  '<!-- omd:tab {"label":"One"} -->',
  '',
  'First panel.',
  '',
  '<!-- /omd:tab -->',
  '',
  '<!-- omd:tab {"label":"Two"} -->',
  '',
  'Second panel.',
  '',
  '<!-- /omd:tab -->',
  '',
  '<!-- /omd:tabs -->',
  '',
  '<table><tr><td>',
  '',
  '### Left',
  '',
  'A column.',
  '',
  '</td><td>',
  '',
  '### Right',
  '',
  'Another column.',
  '',
  '</td></tr></table>',
  '',
  '| Name | Role | City |',
  '| --- | --- | --- |',
  '| Ada | Author | London |',
  '| Alan | Editor | Cambridge |',
  '',
  '[^1]: A native GFM footnote.',
  ''
].join('\n');

declare global {
  interface Window {
    __OMD_FIXTURE__?: { blocks: typeof SHIPPED_BLOCKS; sample: string };
  }
}

window.__OMD_FIXTURE__ = { blocks: SHIPPED_BLOCKS, sample: SAMPLE };
