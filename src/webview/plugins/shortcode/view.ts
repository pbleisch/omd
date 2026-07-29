import { $view } from '@milkdown/utils';
import type { NodeView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { codicon } from '../../codicons';
import { shortcodeLeafSchema, shortcodeContainerSchema } from './schema';
import { parseParams, stringifyParams, buildOpen } from '../../../shared/shortcode';
import { getBlock, onBlocksChanged } from '../../blocks/registry';
import { renderLeafOutput } from '../../blocks/render';
import { CALLOUT_KINDS, isCalloutKind } from '../../blocks/callout-kinds';
import { updateManagedCallout, readManagedParams } from '../../blocks/promote';
import type { EditableBlock } from '../../blocks/edit-properties';
import { hoverEnter, hoverLeave, openBlockPanel } from '../../ui/hover-panel';
import { openParamPopover } from '../../ui/popover';
import { renderToc } from '../../blocks/toc';
import { onEditorUpdate } from '../../commands/state-events';
import { parseChartData, toChartConfig, isChartType, type ChartType } from '../../blocks/chart';
import { renderChartSvg } from '../../blocks/chart-svg';
import {
  blockActions,
  copyCanvasPng,
  copyText,
  saveCanvasPng,
  saveTextFile,
  saveImageAsPng
} from '../../blocks/block-actions';
import Chart from 'chart.js/auto';
import type { EditorView } from 'prosemirror-view';
import { parseYouTubeId, youTubeThumbnail } from '../../blocks/media';
import { buildResizeChrome, containerWidthOf, inlineEdit } from '../media/chrome';
import { cardTitle, applyLinkcardMeta, requestLinkMeta } from '../../blocks/linkcard';
import {
  aiScope,
  aiContext,
  requestPrompt,
  cancelPrompt,
  applyAiResult,
  commitAiParam,
  type AiScope,
  type PromptFailure
} from '../../blocks/ai';
import { getModels, onModelsChanged } from '../../blocks/models-registry';
import { hostnameOf } from '../../../shared/linkMeta';
import { post } from '../../vscode';

/**
 * Block chrome for smart blocks (docs/design/STYLE.md): a header bar — icon + name left,
 * a summary right — above the block's content. The container's body is a real editable
 * surface (its markdown children); the leaf is an atom with a static summary until a block
 * definition gives it a richer rendering in P5. `.omd-block--<name>` scopes each block's
 * CSS so one can't leak into another.
 *
 * The wrapper is deliberately not `contenteditable=false` on the container, or the body
 * couldn't be edited; instead only the header opts out, matching the mermaid NodeView.
 */

function header(name: string, actions?: HTMLElement): HTMLElement {
  // Prefer the discovered definition's label + icon; fall back to the raw shortcode name
  // when the block is unknown (e.g. a shortcode for a block that isn't installed here).
  const def = getBlock(name);
  const bar = document.createElement('div');
  bar.className = 'omd-block-header';
  bar.contentEditable = 'false';

  const left = document.createElement('span');
  left.className = 'omd-block-name';
  left.append(codicon(def?.icon ?? 'symbol-namespace'));
  const label = document.createElement('span');
  label.textContent = def?.title ?? name;
  left.appendChild(label);
  // User-authored code runs sandboxed; mark it so trust is legible (docs/design/SMART-BLOCKS.md).
  if (def?.trust === 'sandboxed') {
    const shield = codicon('shield');
    shield.classList.add('omd-block-shield');
    shield.title = 'Sandboxed block — runs with no network or page access';
    left.appendChild(shield);
  }

  const right = document.createElement('span');
  right.className = 'omd-block-header-right';
  // No gear: params are edited via the hover property panel (and inline editing for titles/labels).
  if (actions) right.appendChild(actions);

  bar.append(left, right);
  return bar;
}

type ContainerKind =
  | 'callout'
  | 'smartcallout'
  | 'tabs'
  | 'tab'
  | 'chart'
  | 'youtube'
  | 'linkcard'
  | 'ai'
  | 'generic';

class ContainerView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private readonly kind: ContainerKind;
  private active = 0;
  private canvas?: HTMLCanvasElement;
  private chart?: Chart;
  private svgTimer?: ReturnType<typeof setTimeout>;
  private editingTab = false;
  private genericHeader?: HTMLElement;
  private offBlocks?: () => void;
  private ytFrame?: HTMLElement;
  private ytImg?: HTMLImageElement;
  private ytCaption?: HTMLElement;
  private ytReadout?: HTMLElement;
  private editingCaption = false;
  private smartIcon?: HTMLElement;
  private lcCard?: HTMLAnchorElement;
  private aiTabs?: HTMLElement;
  private aiPromptInput?: HTMLTextAreaElement;
  private aiScopeSelect?: HTMLSelectElement;
  private aiModelHost?: HTMLElement;
  private aiStream?: HTMLElement;
  private aiEmpty?: HTMLElement;
  private aiRunBtn?: HTMLButtonElement;
  private aiRunIcon?: HTMLElement;
  private aiNonce?: string;
  private offModels?: () => void;

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined
  ) {
    const name = node.attrs.name as string;
    this.kind = isCalloutKind(name)
      ? 'callout'
      : name === 'callout'
        ? 'smartcallout'
        : name === 'tabs'
          ? 'tabs'
          : name === 'tab'
            ? 'tab'
            : name === 'chart'
              ? 'chart'
              : name === 'youtube'
                ? 'youtube'
                : name === 'linkcard'
                  ? 'linkcard'
                  : name === 'ai'
                    ? 'ai'
                    : 'generic';
    this.dom = document.createElement('div');
    this.contentDOM = document.createElement('div');

    if (this.kind === 'callout') {
      this.buildCallout();
    } else if (this.kind === 'smartcallout') {
      this.buildSmartCallout();
    } else if (this.kind === 'tabs') {
      this.buildTabs();
    } else if (this.kind === 'chart') {
      this.buildChart();
    } else if (this.kind === 'youtube') {
      this.buildYouTube();
    } else if (this.kind === 'linkcard') {
      this.buildLinkcard();
    } else if (this.kind === 'ai') {
      this.buildAi();
    } else if (this.kind === 'tab') {
      // A tab panel is chrome-free — the parent's strip already names it.
      this.dom.className = 'omd-tab-panel';
      this.contentDOM.className = 'omd-block-content';
      this.dom.appendChild(this.contentDOM);
    } else {
      this.dom.className = `omd-smart-block omd-block--${name}`;
      this.genericHeader = this.buildGenericHeader(name);
      this.dom.appendChild(this.genericHeader);
      this.contentDOM.className = 'omd-block-body omd-block-content';
      this.dom.appendChild(this.contentDOM);
      this.applyGridColumns();
      if (name === 'gallery') this.dom.appendChild(this.buildGalleryAdd());
      // A discovered (non-shipped) block's definition may arrive after this first render; refresh
      // the header so its icon/title stop showing the "unknown block" fallback ({}).
      this.offBlocks = onBlocksChanged(() => {
        const fresh = this.buildGenericHeader(name);
        this.genericHeader?.replaceWith(fresh);
        this.genericHeader = fresh;
      });
    }
    // Hover-to-reveal works for every block kind (chart included) — the listener resolves
    // the live definition, so it self-gates to blocks that declare editable params.
    this.wireHover();
  }

  /** Reflect a generic block's `columns` param onto the DOM (the gallery grid reads it). */
  private applyGridColumns(): void {
    const cols = parseParams(this.node.attrs.params as string).columns;
    if (cols && cols !== 'auto') this.dom.dataset.columns = String(cols);
    else delete this.dom.dataset.columns;
  }

  /** The editable block at this position, or null when it declares no params. */
  private resolveEditable(): EditableBlock | null {
    const pos = this.getPos();
    if (pos == null) return null;
    const node = this.view.state.doc.nodeAt(pos);
    // The AI block edits its params in its own Prompt tab, so it opts out of the hover panel to
    // avoid two competing editors.
    if (node?.attrs.name === 'ai') return null;
    const def = node ? getBlock(node.attrs.name as string) : undefined;
    return node && def?.params?.length ? { kind: 'shortcode', node, pos, def } : null;
  }

  /** Open the property panel immediately (the header gear). */
  private openProps(): void {
    const block = this.resolveEditable();
    if (block) openBlockPanel(this, this.view, block);
  }

  /** Reveal the panel on hover; dismiss when the pointer leaves both block and panel. */
  private wireHover(): void {
    this.dom.addEventListener('mouseenter', () =>
      hoverEnter(this, this.view, () => this.resolveEditable())
    );
    this.dom.addEventListener('mouseleave', () => hoverLeave(this));
  }

  /**
   * A tabs block: a strip of labels above the panels, one visible at a time. Which panel
   * shows is driven by `data-active` on the wrapper and plain CSS — never by mutating the
   * panels themselves, which would make ProseMirror redraw and lose the selection.
   */
  private buildTabs(): void {
    this.dom.className = 'omd-tabs';
    const strip = document.createElement('div');
    strip.className = 'omd-tabs-strip';
    strip.contentEditable = 'false';
    this.contentDOM.className = 'omd-tabs-body';
    this.dom.append(strip, this.contentDOM);
    this.renderStrip();

    // Find reveals a match inside an inactive tab by switching to that tab (see find-plugin).
    this.dom.addEventListener('omd:reveal', (e) => {
      const panels = Array.from(this.contentDOM.children);
      const idx = panels.findIndex((p) => p.contains(e.target as Node));
      if (idx >= 0 && idx !== this.active) {
        this.active = idx;
        this.renderStrip();
      }
    });
  }

  /**
   * A chart block: the rendered chart over an editable data table, with a Preview/Data
   * toggle (the smart-block header pattern). The table is the source of truth and the GFM
   * fallback — the chart is derived from it, never serialized.
   */
  private buildChart(): void {
    this.dom.className = 'omd-smart-block omd-block--chart';
    this.dom.dataset.mode = 'preview';

    const params = parseParams(this.node.attrs.params as string);
    const bar = document.createElement('div');
    bar.className = 'omd-block-header';
    bar.contentEditable = 'false';

    const left = document.createElement('span');
    left.className = 'omd-block-name';
    left.append(codicon('graph-line'));
    const label = document.createElement('span');
    label.className = 'omd-chart-title';
    label.textContent = String(params.title ?? 'Chart');
    left.appendChild(label);

    const actions = document.createElement('span');
    actions.className = 'omd-block-tabs';
    for (const mode of ['preview', 'data'] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'omd-block-tab' + (mode === 'preview' ? ' omd-block-tab--active' : '');
      btn.textContent = mode === 'preview' ? 'Chart' : 'Data';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.dom.dataset.mode = mode;
        actions.querySelectorAll('.omd-block-tab').forEach((b, i) =>
          b.classList.toggle('omd-block-tab--active', i === (mode === 'preview' ? 0 : 1))
        );
        if (mode === 'preview') this.renderChart();
      });
      actions.appendChild(btn);
    }

    bar.append(left, actions, this.actionsGroup());

    const preview = document.createElement('div');
    preview.className = 'omd-chart-preview';
    this.canvas = document.createElement('canvas');
    preview.appendChild(this.canvas);

    this.contentDOM.className = 'omd-block-body omd-block-content omd-chart-data';
    this.dom.append(bar, preview, this.contentDOM);
    this.renderChart();
  }

  /** Draw (or redraw) the chart from the body table. */
  private renderChart(): void {
    if (!this.canvas) return;
    this.chart?.destroy();
    this.chart = undefined;

    const params = parseParams(this.node.attrs.params as string);
    const type: ChartType = isChartType(params.type) ? params.type : 'bar';
    const data = parseChartData(this.node);
    const empty = this.dom.querySelector('.omd-chart-empty');
    empty?.remove();

    if (!data) {
      const note = document.createElement('div');
      note.className = 'omd-chart-empty';
      note.textContent = 'Add a table of data to draw a chart.';
      this.canvas.parentElement?.appendChild(note);
      return;
    }
    // Defer a frame so the canvas has been laid out and Chart.js can size to its container.
    requestAnimationFrame(() => {
      if (!this.canvas || !this.canvas.isConnected) return;
      try {
        this.chart = new Chart(this.canvas, toChartConfig(type, data, String(params.title ?? '')));
      } catch {
        // No 2D context (e.g. a headless environment) — leave the data table as the fallback
        // rather than tearing down the block.
        this.dom.dataset.mode = 'data';
      }
    });
  }

  /** Build a generic block's header for the current definition (re-run when the registry updates). */
  /**
   * A YouTube block: a resizable / alignable / captionable thumbnail "player", using the same
   * media chrome as images. `width`/`caption` live in the shortcode params; alignment wraps the
   * container in the `aligned` (`<div align>`) node. The GitHub-visible body (the linked
   * thumbnail) is kept in the DOM but hidden — it's what renders on GitHub and what round-trips.
   */
  private buildYouTube(): void {
    this.dom.className = 'omd-smart-block omd-block--youtube';
    this.genericHeader = this.buildGenericHeader('youtube');
    this.dom.appendChild(this.genericHeader);

    this.ytFrame = document.createElement('div');
    this.ytFrame.className = 'omd-yt-frame omd-img--sizable';
    this.ytFrame.contentEditable = 'false';
    this.ytImg = document.createElement('img');
    this.ytImg.className = 'omd-yt-thumb';
    this.ytImg.draggable = false;
    const play = document.createElement('span');
    play.className = 'omd-yt-play';
    this.ytFrame.append(this.ytImg, play);

    // Only the drag handles live on the canvas now; size / align / caption moved to the shared
    // property panel (media-cluster unification), which the container's hover reveals below.
    const chrome = buildResizeChrome({
      host: this.ytFrame,
      // Resize the block itself so the decoration stays tight around the video (the frame is
      // 100% of the block). Handles anchor to the frame; width is applied to the block.
      target: this.dom,
      containerWidth: () => containerWidthOf(this.dom, this.ytFrame!),
      onCommit: (w) => this.commitYtParam('width', w),
      stockSizes: false
    });
    this.ytReadout = chrome.readout;

    this.ytCaption = document.createElement('figcaption');
    this.ytCaption.className = 'omd-img-caption';
    this.ytCaption.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.startYtCaptionEdit();
    });

    // The body holds the GitHub-visible `[![thumb](thumb)](watch)`; hidden in OMD but kept for
    // round-trip and editing via the property panel.
    this.contentDOM.className = 'omd-block-body omd-yt-body';
    this.dom.append(this.ytFrame, this.ytCaption, this.contentDOM);
    this.renderYouTube();
  }

  private renderYouTube(): void {
    if (!this.ytFrame || !this.ytImg || !this.ytReadout || !this.ytCaption) return;
    const params = parseParams(this.node.attrs.params as string);
    const id = parseYouTubeId(String(params.url ?? ''));
    this.ytImg.src = id ? youTubeThumbnail(id) : '';
    // Width sizes the block (so its decoration stays tight); the frame is 100% of it. No width →
    // fall back to the CSS default (Large), centred.
    const w = (params.width as string) || null;
    this.ytFrame.style.width = '';
    this.dom.style.width = !w ? '' : /%$/.test(w) ? w : `${w}px`;
    this.ytReadout.textContent = w ?? 'auto';
    if (!this.editingCaption) {
      const cap = String(params.caption ?? '');
      this.ytCaption.textContent = cap;
      this.dom.classList.toggle('omd-img--captioned', cap.length > 0);
    }
  }

  /**
   * A link card: a clickable preview (title / description / site / thumbnail) drawn from the cached
   * shortcode params, over a hidden `[title](url)` body that is what GitHub shows and what round-
   * trips. Nothing is fetched here — the card renders from params on load; the header's Refresh
   * action re-fetches on demand (docs/design/FORMATS.md coexistence form).
   */
  private buildLinkcard(): void {
    this.dom.className = 'omd-smart-block omd-block--linkcard';
    const actions = document.createElement('span');
    actions.className = 'omd-linkcard-actions';
    actions.append(this.linkcardRefreshButton(), this.actionsGroup());
    this.genericHeader = header('linkcard', actions);
    this.dom.appendChild(this.genericHeader);

    this.lcCard = document.createElement('a');
    this.lcCard.className = 'omd-linkcard';
    this.lcCard.contentEditable = 'false';
    this.lcCard.rel = 'noreferrer';
    this.lcCard.addEventListener('mousedown', (e) => e.preventDefault()); // open on click, don't select
    this.lcCard.addEventListener('click', (e) => {
      e.preventDefault();
      const url = this.mediaUrl();
      if (url) post({ type: 'openTarget', target: url });
    });

    // The GitHub-visible `[title](url)` link; kept for round-trip but hidden in OMD.
    this.contentDOM.className = 'omd-block-body omd-linkcard-body';
    this.dom.append(this.lcCard, this.contentDOM);
    this.renderLinkcard();
  }

  private linkcardRefreshButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'omd-block-action';
    btn.title = 'Refresh preview';
    btn.appendChild(codicon('refresh'));
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      void this.refreshLinkcard();
    });
    return btn;
  }

  private async refreshLinkcard(): Promise<void> {
    const url = this.mediaUrl();
    if (!url) return;
    this.dom.dataset.loading = 'true';
    try {
      const meta = await requestLinkMeta(url);
      const pos = this.getPos();
      if (meta && pos != null) applyLinkcardMeta(this.view, pos, url, meta);
    } finally {
      delete this.dom.dataset.loading;
    }
  }

  private renderLinkcard(): void {
    if (!this.lcCard) return;
    const params = parseParams(this.node.attrs.params as string);
    const url = String(params.url ?? '');
    const desc = String(params.description ?? '');
    const site = String(params.site ?? '') || hostnameOf(url);
    const image = String(params.image ?? '');

    this.lcCard.setAttribute('href', url || '#');
    this.lcCard.classList.toggle('omd-linkcard--has-image', Boolean(image));

    const text = document.createElement('div');
    text.className = 'omd-linkcard-text';
    const titleEl = document.createElement('div');
    titleEl.className = 'omd-linkcard-title';
    titleEl.textContent = cardTitle(params);
    text.appendChild(titleEl);
    if (desc) {
      const d = document.createElement('div');
      d.className = 'omd-linkcard-desc';
      d.textContent = desc;
      text.appendChild(d);
    }
    if (site) {
      const s = document.createElement('div');
      s.className = 'omd-linkcard-site';
      s.textContent = site;
      text.appendChild(s);
    }

    const children: HTMLElement[] = [text];
    if (image) {
      const img = document.createElement('img');
      img.className = 'omd-linkcard-image';
      img.src = image;
      img.alt = '';
      img.draggable = false;
      // A dead image URL shouldn't leave a broken-image box in the card.
      img.addEventListener('error', () => {
        img.remove();
        this.lcCard?.classList.remove('omd-linkcard--has-image');
      });
      children.push(img);
    }
    this.lcCard.replaceChildren(...children);
  }

  /**
   * The `ai` built-in (docs/design/FORMATS.md, `omd:ai`). A Result/Prompt tab pair like chart's
   * Chart/Data: the cached generated markdown (the GitHub-visible, round-tripping body) shows by
   * default; the Prompt tab holds the editable prompt, context scope, and model picker. Nothing runs
   * on load — Run sends the prompt to the host (only it can reach a model) and streams the answer
   * into the body. See webview/blocks/ai and webview/blocks/models-registry.
   */
  private buildAi(): void {
    this.dom.className = 'omd-smart-block omd-block--ai';
    const params = parseParams(this.node.attrs.params as string);
    const hasPrompt = Boolean(String(params.prompt ?? '').trim());
    // A filled block opens on its Result; an empty one opens on Prompt so it's ready to edit.
    this.dom.dataset.mode = hasPrompt ? 'result' : 'prompt';

    const bar = document.createElement('div');
    bar.className = 'omd-block-header';
    bar.contentEditable = 'false';
    const left = document.createElement('span');
    left.className = 'omd-block-name';
    left.append(codicon('sparkle'));
    const nameLabel = document.createElement('span');
    nameLabel.textContent = 'AI';
    left.appendChild(nameLabel);

    this.aiTabs = document.createElement('span');
    this.aiTabs.className = 'omd-block-tabs';
    for (const mode of ['result', 'prompt'] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'omd-block-tab' + (mode === this.dom.dataset.mode ? ' omd-block-tab--active' : '');
      btn.textContent = mode === 'result' ? 'Result' : 'Prompt';
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.setAiMode(mode);
      });
      this.aiTabs.appendChild(btn);
    }

    const actions = document.createElement('span');
    actions.className = 'omd-ai-actions';
    actions.append(this.aiRunButton(), this.actionsGroup());

    bar.append(left, this.aiTabs, actions);
    this.dom.appendChild(bar);

    // Prompt panel — shown only in Prompt mode (CSS-gated on data-mode).
    this.dom.appendChild(this.buildAiPromptPanel(params));

    // Result area — the live stream, an empty-state note, and the cached body.
    const result = document.createElement('div');
    result.className = 'omd-ai-result';
    this.aiStream = document.createElement('div');
    this.aiStream.className = 'omd-ai-stream';
    this.aiStream.contentEditable = 'false';
    this.aiEmpty = document.createElement('div');
    this.aiEmpty.className = 'omd-ai-empty';
    this.aiEmpty.contentEditable = 'false';
    this.aiEmpty.textContent = 'No result yet — edit the prompt and press Run.';
    this.contentDOM.className = 'omd-block-body omd-ai-body';
    result.append(this.aiStream, this.aiEmpty, this.contentDOM);
    this.dom.appendChild(result);

    this.updateAiEmpty();
    // Re-render the model picker whenever the host pushes a new model list.
    this.offModels = onModelsChanged(() => this.renderModelControl());
  }

  /** A labelled form row (`.omd-field`), matching the property panel's field styling. */
  private aiField(label: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'omd-field';
    const name = document.createElement('span');
    name.className = 'omd-field-label';
    name.textContent = label;
    wrap.append(name, control);
    return wrap;
  }

  private buildAiPromptPanel(params: Record<string, unknown>): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'omd-ai-prompt-panel';
    panel.contentEditable = 'false';
    // Keep ProseMirror from grabbing the selection or intercepting keystrokes when the form
    // controls are used — otherwise PM's keymap swallows Backspace/arrows in the prompt textarea.
    panel.addEventListener('mousedown', (e) => e.stopPropagation());
    panel.addEventListener('keydown', (e) => e.stopPropagation());

    this.aiPromptInput = document.createElement('textarea');
    this.aiPromptInput.className = 'omd-ai-prompt-input';
    this.aiPromptInput.rows = 3;
    this.aiPromptInput.placeholder = 'Ask the model to write something…';
    this.aiPromptInput.value = String(params.prompt ?? '');
    this.aiPromptInput.addEventListener('change', () =>
      this.commitAi('prompt', this.aiPromptInput!.value.trim())
    );
    panel.appendChild(this.aiField('Prompt', this.aiPromptInput));

    this.aiScopeSelect = document.createElement('select');
    this.aiScopeSelect.className = 'omd-field-input';
    for (const [val, lbl] of [
      ['none', 'Just the prompt'],
      ['document', 'The whole document']
    ] as const) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = lbl;
      this.aiScopeSelect.appendChild(o);
    }
    this.aiScopeSelect.value = aiScope(params);
    this.aiScopeSelect.addEventListener('change', () =>
      this.commitAi('scope', this.aiScopeSelect!.value)
    );
    panel.appendChild(this.aiField('Context', this.aiScopeSelect));

    this.aiModelHost = document.createElement('div');
    this.aiModelHost.className = 'omd-ai-model-host';
    panel.appendChild(this.aiField('Model', this.aiModelHost));
    this.renderModelControl();

    return panel;
  }

  /**
   * The model picker: a dropdown of the host-discovered models (labelled by name, valued by
   * family), with a "Default" option; or a free-text field when none are available (AI off / no
   * provider installed), so a family can still be typed. A stored-but-now-unavailable family stays
   * selectable so it isn't silently dropped.
   */
  private renderModelControl(): void {
    if (!this.aiModelHost) return;
    const current = String(parseParams(this.node.attrs.params as string).model ?? '');
    const models = getModels();
    this.aiModelHost.replaceChildren();

    if (models.length === 0) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'omd-field-input';
      input.placeholder = 'Default (setting) — e.g. gpt-4o';
      input.value = current;
      input.addEventListener('change', () => this.commitAi('model', input.value.trim()));
      this.aiModelHost.appendChild(input);
      return;
    }

    const select = document.createElement('select');
    select.className = 'omd-field-input';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Default (setting)';
    select.appendChild(def);
    let known = current === '';
    for (const m of models) {
      const o = document.createElement('option');
      o.value = m.family;
      o.textContent = m.vendor && m.vendor !== 'copilot' ? `${m.name} · ${m.vendor}` : m.name;
      if (m.family === current) known = true;
      select.appendChild(o);
    }
    if (!known && current) {
      const o = document.createElement('option');
      o.value = current;
      o.textContent = `${current} (unavailable)`;
      select.appendChild(o);
    }
    select.value = current;
    select.addEventListener('change', () => this.commitAi('model', select.value));
    this.aiModelHost.appendChild(select);
  }

  /** Persist one `ai` param from a control edit. */
  private commitAi(key: string, value: string): void {
    const pos = this.getPos();
    if (pos != null) commitAiParam(this.view, pos, key, value);
  }

  private setAiMode(mode: 'result' | 'prompt'): void {
    this.dom.dataset.mode = mode;
    this.aiTabs
      ?.querySelectorAll('.omd-block-tab')
      .forEach((b, i) => b.classList.toggle('omd-block-tab--active', i === (mode === 'result' ? 0 : 1)));
    if (mode === 'prompt') this.aiPromptInput?.focus();
    this.updateAiEmpty();
  }

  private aiRunButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'omd-block-action';
    btn.title = 'Run prompt';
    this.aiRunIcon = codicon('refresh');
    btn.appendChild(this.aiRunIcon);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // While a run is in flight the same button cancels it.
      if (this.aiNonce) cancelPrompt(this.aiNonce);
      else void this.runAi();
    });
    this.aiRunBtn = btn;
    return btn;
  }

  private setAiRunIcon(name: 'refresh' | 'stop-circle', title: string): void {
    if (!this.aiRunBtn) return;
    const next = codicon(name);
    this.aiRunIcon?.replaceWith(next);
    this.aiRunIcon = next;
    this.aiRunBtn.title = title;
  }

  /** Show the empty-state note only when there's no body, no stream, and nothing running. */
  private updateAiEmpty(): void {
    if (!this.aiEmpty) return;
    const bodyText = (this.contentDOM.textContent ?? '').trim();
    const streamText = (this.aiStream?.textContent ?? '').trim();
    const show = !bodyText && !streamText && !this.dom.dataset.loading;
    this.aiEmpty.style.display = show ? '' : 'none';
  }

  private async runAi(): Promise<void> {
    if (this.aiNonce) return; // already running
    const pos = this.getPos();
    if (pos == null) return;
    const prompt = (this.aiPromptInput?.value ?? '').trim();
    if (!prompt) {
      this.setAiMode('prompt');
      this.aiPromptInput?.focus();
      return;
    }
    // Persist the current control values so a save/reopen matches exactly what was run.
    this.commitAi('prompt', prompt);
    const scope: AiScope = this.aiScopeSelect?.value === 'document' ? 'document' : 'none';
    const modelCtl = this.aiModelHost?.querySelector('select, input') as
      | HTMLSelectElement
      | HTMLInputElement
      | null;
    const model = (modelCtl?.value ?? '').trim() || undefined;
    const context = aiContext(scope);

    this.setAiMode('result');
    this.dom.dataset.loading = 'true';
    this.dom.classList.add('omd-ai--streaming');
    if (this.aiStream) this.aiStream.textContent = '';
    this.updateAiEmpty();
    this.setAiRunIcon('stop-circle', 'Stop');

    const { nonce, done } = requestPrompt({ prompt, context, model }, (chunk) => {
      if (this.aiStream) this.aiStream.textContent += chunk;
    });
    this.aiNonce = nonce;
    try {
      const text = await done;
      const after = this.getPos();
      if (after != null) applyAiResult(this.view, after, text);
      if (this.aiStream) this.aiStream.textContent = '';
    } catch (err) {
      const failure = err as PromptFailure;
      this.renderAiError(failure?.message || 'AI run failed.');
    } finally {
      this.aiNonce = undefined;
      delete this.dom.dataset.loading;
      this.dom.classList.remove('omd-ai--streaming');
      this.setAiRunIcon('refresh', 'Run prompt');
      this.updateAiEmpty();
    }
  }

  private renderAiError(message: string): void {
    if (!this.aiStream) return;
    const err = document.createElement('div');
    err.className = 'omd-ai-error';
    err.textContent = message;
    this.aiStream.replaceChildren(err);
    this.updateAiEmpty();
  }

  /** Set (or clear, when empty) a single youtube param, rebuilding the opener bytes. */
  private commitYtParam(key: string, value: string): void {
    const pos = this.getPos();
    if (pos == null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node || node.attrs.name !== 'youtube') return;
    const params = parseParams(node.attrs.params as string);
    if (value) params[key] = value;
    else delete params[key];
    const p = stringifyParams(params);
    if (p === node.attrs.params) return;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        params: p,
        openRaw: buildOpen('youtube', p)
      })
    );
    this.view.focus();
  }

  private startYtCaptionEdit(): void {
    if (!this.ytCaption) return;
    this.editingCaption = true;
    this.dom.classList.add('omd-img--captioned');
    if (!this.ytCaption.textContent) this.ytCaption.textContent = '';
    inlineEdit(this.ytCaption, {
      editingClass: 'omd-img-caption--editing',
      onCommit: (text) => this.commitYtParam('caption', text),
      onCancel: () => this.renderYouTube(),
      onEnd: () => {
        this.editingCaption = false;
        this.view.focus();
      }
    });
  }

  /** The gallery's "Add image" footer — prompts for a URL and appends an image to the body. */
  private buildGalleryAdd(): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'omd-gallery-add';
    btn.contentEditable = 'false';
    btn.append(codicon('add'));
    const label = document.createElement('span');
    label.textContent = 'Add image';
    btn.appendChild(label);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const r = btn.getBoundingClientRect();
      openParamPopover({
        anchor: { left: r.left, bottom: r.bottom },
        label: 'Image URL',
        value: '',
        onCommit: (url) => this.appendGalleryImage(url.trim())
      });
    });
    return btn;
  }

  /** Append `![](url)` as a new paragraph at the end of the gallery body. */
  private appendGalleryImage(url: string): void {
    if (!url) return;
    const pos = this.getPos();
    if (pos == null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node) return;
    const schema = this.view.state.schema;
    const img = schema.nodes.image.create({ src: url, alt: '' });
    const para = schema.nodes.paragraph.create(null, img);
    const at = pos + node.nodeSize - 1; // just inside the container's closing token
    this.view.dispatch(this.view.state.tr.insert(at, para).scrollIntoView());
    this.view.focus();
  }

  private buildGenericHeader(name: string): HTMLElement {
    return header(name, this.actionsGroup());
  }

  /**
   * The common header actions (copy / save / delete). Copy and save export the block's preview
   * in the format that fits it: a chart is a PNG (from its canvas); a YouTube block is its watch
   * URL / thumbnail image; a gallery is its image URLs; every other block exports its text.
   */
  private actionsGroup(): HTMLElement {
    return blockActions({
      view: this.view,
      getPos: this.getPos,
      onCopy: () => this.copyPreview(),
      onSave: () => this.savePreview()
    });
  }

  private copyPreview(): void | Promise<void> {
    const name = this.node.attrs.name as string;
    if (this.kind === 'chart' && this.canvas) return copyCanvasPng(this.canvas);
    if (name === 'youtube' || name === 'linkcard') return copyText(this.mediaUrl()); // the link
    if (name === 'gallery') return copyText(this.galleryUrls().join('\n'));
    return copyText(this.previewText());
  }

  private async savePreview(): Promise<void> {
    const name = this.node.attrs.name as string;
    if (this.kind === 'chart' && this.canvas) {
      saveCanvasPng(this.canvas, this.exportName());
      return;
    }
    if (name === 'youtube') {
      // The video can't be saved; the thumbnail is the closest preview. Fall back to the URL
      // when the thumbnail can't be rasterized (no CORS on the image host).
      const img = this.contentDOM.querySelector('img');
      const ok = img ? await saveImageAsPng(img.src, this.exportName()) : false;
      if (!ok) saveTextFile(this.mediaUrl(), `${this.exportName()}.txt`);
      return;
    }
    if (name === 'gallery') {
      saveTextFile(this.galleryUrls().join('\n'), `${this.exportName()}.txt`);
      return;
    }
    if (name === 'linkcard') {
      saveTextFile(this.mediaUrl(), `${this.exportName()}.txt`);
      return;
    }
    saveTextFile(this.previewText(), `${this.exportName()}.txt`);
  }

  private previewText(): string {
    return (this.contentDOM.textContent ?? '').trim();
  }

  /** The media block's URL parameter (the YouTube watch link). */
  private mediaUrl(): string {
    return String(parseParams(this.node.attrs.params as string).url ?? '');
  }

  /** The resolved image URLs rendered in a gallery's body (skipping ProseMirror's spacer img). */
  private galleryUrls(): string[] {
    return [...this.contentDOM.querySelectorAll('img:not(.ProseMirror-separator)')]
      .map((img) => (img as HTMLImageElement).src)
      .filter(Boolean);
  }

  private exportName(): string {
    const p = parseParams(this.node.attrs.params as string);
    return String(p.title ?? this.node.attrs.name ?? 'block');
  }

  /** Labels come from each child `tab` container's `label` param. */
  private tabLabels(): string[] {
    const labels: string[] = [];
    this.node.forEach((child, _offset, i) => {
      const label = parseParams(child.attrs.params as string).label;
      labels.push(typeof label === 'string' && label ? label : `Tab ${i + 1}`);
    });
    return labels;
  }

  private renderStrip(): void {
    const strip = this.dom.querySelector('.omd-tabs-strip');
    if (!strip) return;
    const labels = this.tabLabels();
    if (this.active >= labels.length) this.active = Math.max(0, labels.length - 1);
    strip.replaceChildren(
      ...labels.map((label, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'omd-tab' + (i === this.active ? ' omd-tab--active' : '');
        btn.textContent = label;
        btn.title = 'Double-click to rename';
        btn.addEventListener('mousedown', (e) => {
          if (btn.isContentEditable) return; // renaming — don't switch tabs
          e.preventDefault();
          // Switch in place — rebuilding the strip here would replace the button between the
          // two clicks of a double-click, so `dblclick` (rename) would never fire.
          this.setActiveTab(i);
        });
        btn.addEventListener('dblclick', (e) => {
          e.preventDefault();
          this.startTabRename(btn, i);
        });
        return btn;
      }),
      this.actionsGroup() // copy / save / delete, right-aligned in the strip
    );
    this.dom.dataset.active = String(this.active);
  }

  /** Switch the visible tab without rebuilding the strip (keeps button identity for dblclick). */
  private setActiveTab(i: number): void {
    this.active = i;
    this.dom
      .querySelector('.omd-tabs-strip')
      ?.querySelectorAll('.omd-tab')
      .forEach((b, idx) => b.classList.toggle('omd-tab--active', idx === i));
    this.dom.dataset.active = String(i);
  }

  /** Inline-rename a tab: make its button editable, commit the new label to the child's params. */
  private startTabRename(btn: HTMLButtonElement, index: number): void {
    this.editingTab = true;
    btn.contentEditable = 'true';
    btn.classList.add('omd-tab--editing');
    btn.focus();
    const range = document.createRange();
    range.selectNodeContents(btn);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const finish = (commit: boolean) => {
      btn.removeEventListener('blur', onBlur);
      btn.removeEventListener('keydown', onKey);
      this.editingTab = false;
      btn.contentEditable = 'false';
      btn.classList.remove('omd-tab--editing');
      if (commit) this.commitTabLabel(index, (btn.textContent ?? '').trim());
      else this.renderStrip();
    };
    const onBlur = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      // Keep keystrokes out of ProseMirror's keymap while renaming (else Backspace etc. run
      // document commands instead of editing the label).
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true); // commit directly — a programmatic blur() doesn't reliably fire the listener
        this.view.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
        this.view.focus();
      }
    };
    btn.addEventListener('blur', onBlur);
    btn.addEventListener('keydown', onKey);
  }

  private commitTabLabel(index: number, label: string): void {
    const tabsPos = this.getPos();
    if (tabsPos == null) return;
    const tabsNode = this.view.state.doc.nodeAt(tabsPos);
    if (!tabsNode) return;
    let pos = tabsPos + 1; // into the tabs container's content, before the first child
    for (let j = 0; j < index; j++) pos += tabsNode.child(j).nodeSize;
    const tab = this.view.state.doc.nodeAt(pos);
    if (!tab || tab.attrs.name !== 'tab') return;
    const params = { ...parseParams(tab.attrs.params as string), label };
    const p = stringifyParams(params);
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...tab.attrs, params: p, openRaw: buildOpen('tab', p) })
    );
  }

  /** While renaming a tab or editing a youtube caption, that field owns the keyboard/pointer. */
  stopEvent(event: Event): boolean {
    if (this.editingTab && (event.target as HTMLElement | null)?.classList?.contains('omd-tab--editing'))
      return true;
    const t = event.target as HTMLElement | null;
    if (this.kind === 'youtube' && t) {
      if (this.editingCaption && this.ytCaption?.contains(t)) return true;
      if (t !== this.ytImg && t.closest('.omd-img-handle, .omd-img-toolbar')) return true;
    }
    if (this.kind === 'smartcallout' && t?.closest('.omd-smartcallout-delete')) return true;
    return false;
  }

  /** A managed callout: the callout frame, a params-driven title, and a gear to edit it. */
  /**
   * The OMD **smart callout** (`omd:callout`): a shortcode carrying `icon`/`color` around a
   * blockquote whose first line is the (bold) title. The title and body are ordinary editable
   * content; the icon and accent colour are chrome driven by the params (edited via the hover
   * property panel). On disk it's a `<div>`-free titled blockquote GitHub renders as a normal
   * blockquote, so it degrades gracefully.
   */
  private buildSmartCallout(): void {
    this.dom.className = 'omd-smartcallout';
    const icon = document.createElement('span');
    icon.className = 'omd-smartcallout-icon';
    icon.contentEditable = 'false';
    this.smartIcon = icon;

    const del = document.createElement('button');
    del.className = 'omd-smartcallout-delete';
    del.type = 'button';
    del.contentEditable = 'false';
    del.title = 'Delete callout';
    del.appendChild(codicon('trash'));
    del.addEventListener('mousedown', (e) => e.preventDefault());
    del.addEventListener('click', (e) => {
      e.preventDefault();
      const pos = this.getPos();
      if (pos == null) return;
      const node = this.view.state.doc.nodeAt(pos);
      if (node) this.view.dispatch(this.view.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
      this.view.focus();
    });

    this.contentDOM.className = 'omd-smartcallout-body';
    this.dom.append(icon, del, this.contentDOM);
    this.renderSmartCallout();
  }

  private renderSmartCallout(): void {
    if (!this.smartIcon) return;
    const params = parseParams(this.node.attrs.params as string);
    this.dom.style.setProperty('--omd-callout-accent', String(params.color || '#4daafc'));
    this.smartIcon.replaceChildren(codicon(String(params.icon || 'info')));
  }

  private buildCallout(): void {
    const kind = CALLOUT_KINDS[this.node.attrs.name];
    this.dom.className = `omd-callout omd-callout--${this.node.attrs.name} omd-callout--managed`;
    this.dom.style.setProperty('--omd-callout-accent', kind.accent);

    const title = document.createElement('div');
    title.className = 'omd-callout-title';
    title.style.color = kind.accent;
    title.contentEditable = 'false';

    const label = document.createElement('span');
    label.className = 'omd-callout-title-label';
    label.append(codicon(kind.icon));
    const text = document.createElement('span');
    text.className = 'omd-callout-title-text';
    label.appendChild(text);

    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'omd-callout-gear';
    gear.title = 'Callout settings';
    gear.appendChild(codicon('settings-gear'));
    gear.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = this.getPos();
      if (pos == null) return;
      openParamPopover({
        anchor: this.view.coordsAtPos(pos + 1),
        label: 'Title',
        value: String(readManagedParams(this.node).title ?? ''),
        onCommit: (value) => updateManagedCallout(this.view, pos, { title: value })
      });
    });

    // Callouts are styled prose, not export-bearing blocks — no copy/save/delete chrome.
    title.append(label, gear);
    this.contentDOM.className = 'omd-block-body omd-block-content';
    this.dom.append(title, this.contentDOM);
    this.applyTitle(text);
  }

  private applyTitle(textEl: Element): void {
    const kind = CALLOUT_KINDS[this.node.attrs.name];
    const custom = String(readManagedParams(this.node).title ?? '');
    textEl.textContent = custom || kind.label;
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type || node.attrs.name !== this.node.attrs.name) return false;
    this.node = node;
    if (this.kind === 'callout') {
      const textEl = this.dom.querySelector('.omd-callout-title-text');
      if (textEl) this.applyTitle(textEl);
    } else if (this.kind === 'smartcallout') {
      this.renderSmartCallout();
    } else if (this.kind === 'tabs') {
      this.renderStrip(); // labels/count may have changed
    } else if (this.kind === 'chart') {
      // The chart is derived from the body table, so any edit to it redraws.
      const title = this.dom.querySelector('.omd-chart-title');
      if (title) title.textContent = String(parseParams(node.attrs.params as string).title ?? 'Chart');
      if (this.dom.dataset.mode === 'preview') this.renderChart();
      // Keep the embedded preview SVG in sync with the data. Only from update() (an edit),
      // never the constructor (load) — so opening a file never rewrites the SVG (#chart-preview).
      this.scheduleSvg();
    } else if (this.kind === 'youtube') {
      this.renderYouTube();
    } else if (this.kind === 'linkcard') {
      this.renderLinkcard();
    } else if (this.kind === 'ai') {
      // Sync the prompt controls from params on an external change (undo, host reload), but never
      // yank a field the user is editing, and don't disturb an in-flight run.
      if (!this.aiNonce) {
        const p = parseParams(node.attrs.params as string);
        if (this.aiPromptInput && document.activeElement !== this.aiPromptInput) {
          this.aiPromptInput.value = String(p.prompt ?? '');
        }
        if (this.aiScopeSelect && document.activeElement !== this.aiScopeSelect) {
          this.aiScopeSelect.value = aiScope(p);
        }
        const modelCtl = this.aiModelHost?.querySelector('select, input');
        if (modelCtl && document.activeElement !== modelCtl) this.renderModelControl();
      }
      this.updateAiEmpty();
    } else if (this.kind === 'generic') {
      this.applyGridColumns();
    }
    return true;
  }

  destroy(): void {
    this.chart?.destroy();
    clearTimeout(this.svgTimer);
    if (this.aiNonce) cancelPrompt(this.aiNonce);
    this.offModels?.();
    this.offBlocks?.();
  }

  /**
   * Regenerate the chart's embedded preview SVG from its current data, debounced so it doesn't
   * churn on every keystroke. Deterministic, so an unchanged chart re-derives identical bytes
   * (no dispatch, no spurious dirty); a real data/type/title change moves it once and settles.
   */
  private scheduleSvg(): void {
    clearTimeout(this.svgTimer);
    this.svgTimer = setTimeout(() => this.regenerateSvg(), 400);
  }

  private regenerateSvg(): void {
    const params = parseParams(this.node.attrs.params as string);
    const type: ChartType = isChartType(params.type) ? params.type : 'bar';
    const fresh = renderChartSvg(type, parseChartData(this.node), String(params.title ?? ''));
    if (fresh === (this.node.attrs.svg as string)) return; // unchanged — nothing to write
    const pos = this.getPos();
    if (pos == null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node || node.type !== this.node.type) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, svg: fresh }));
  }

  /** Our chrome (the strip, the active attribute) is not a content change ProseMirror needs. */
  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (mutation.type === 'selection') return false;
    if (mutation.type === 'attributes') return true;
    return !this.contentDOM.contains(mutation.target as Node);
  }
}

class LeafView implements NodeView {
  dom: HTMLElement;
  private body: HTMLElement;
  private headerEl: HTMLElement;
  private unsubscribe?: () => void;
  private offBlocks?: () => void;

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined
  ) {
    this.dom = document.createElement('div');
    this.dom.className = `omd-smart-block omd-block--${node.attrs.name}`;
    this.dom.contentEditable = 'false';
    this.headerEl = this.buildHeader();
    this.dom.appendChild(this.headerEl);
    this.body = document.createElement('div');
    this.body.className = 'omd-block-body omd-block-leaf-body';
    this.dom.appendChild(this.body);
    this.renderBody();
    // A `toc` derives its output from *other* nodes, so its own `update` never fires when
    // headings change; follow every state update instead.
    if (node.attrs.name === 'toc') {
      this.unsubscribe = onEditorUpdate(() => this.renderBody());
    }
    // A discovered block's definition may arrive after this first render; refresh the header
    // (icon/title) and body so they stop showing the "unknown block" fallback.
    this.offBlocks = onBlocksChanged(() => {
      const fresh = this.buildHeader();
      this.headerEl.replaceWith(fresh);
      this.headerEl = fresh;
      this.renderBody();
    });
    this.wireHover();
  }

  private buildHeader(): HTMLElement {
    const name = this.node.attrs.name as string;
    return header(name, this.actionsGroup());
  }

  /** The editable block at this position, or null when it declares no params. */
  private resolveEditable(): EditableBlock | null {
    const pos = this.getPos();
    if (pos == null) return null;
    const node = this.view.state.doc.nodeAt(pos);
    const def = node ? getBlock(node.attrs.name as string) : undefined;
    return node && def?.params?.length ? { kind: 'shortcode', node, pos, def } : null;
  }

  /** Open the property panel immediately (the header gear). */
  private openProps(): void {
    const block = this.resolveEditable();
    if (block) openBlockPanel(this, this.view, block);
  }

  /** The common header actions (copy / save / delete). A leaf's preview is its rendered text. */
  private actionsGroup(): HTMLElement {
    return blockActions({
      view: this.view,
      getPos: this.getPos,
      onCopy: () => copyText((this.body.textContent ?? '').trim()),
      onSave: () => saveTextFile((this.body.textContent ?? '').trim(), `${String(this.node.attrs.name)}.txt`)
    });
  }

  /** Reveal the panel on hover; dismiss when the pointer leaves both block and panel. */
  private wireHover(): void {
    this.dom.addEventListener('mouseenter', () =>
      hoverEnter(this, this.view, () => this.resolveEditable())
    );
    this.dom.addEventListener('mouseleave', () => hoverLeave(this));
  }

  /** Render tiered output (built-in / template / sandboxed); fall back to the block name. */
  private renderBody(): void {
    this.teardownFrames();
    const name = this.node.attrs.name as string;
    // `toc` is a built-in whose output depends on the document, not just its params.
    const output =
      name === 'toc'
        ? renderToc(this.view, parseParams(this.node.attrs.params))
        : (() => {
            const def = getBlock(name);
            return def ? renderLeafOutput(def, parseParams(this.node.attrs.params)) : null;
          })();
    this.body.replaceChildren(output ?? document.createTextNode(name));
    this.body.classList.toggle('omd-block-leaf-body--rendered', output !== null);
  }

  /** Signal any sandbox iframes to drop their window message listeners. */
  private teardownFrames(): void {
    this.body
      .querySelectorAll('iframe.omd-sandbox-frame')
      .forEach((f) => f.dispatchEvent(new Event('omd-teardown')));
  }

  destroy(): void {
    this.teardownFrames();
    this.unsubscribe?.();
    this.offBlocks?.();
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type || node.attrs.name !== this.node.attrs.name) return false;
    const paramsChanged = node.attrs.params !== this.node.attrs.params;
    this.node = node;
    if (paramsChanged) this.renderBody();
    return true;
  }
}

export const shortcodeContainerView = $view(
  shortcodeContainerSchema.node,
  () => (node, view, getPos) =>
    new ContainerView(node as ProseNode, view as EditorView, getPos as () => number | undefined)
);

export const shortcodeLeafView = $view(
  shortcodeLeafSchema.node,
  () => (node, view, getPos) =>
    new LeafView(node as ProseNode, view as EditorView, getPos as () => number | undefined)
);
