/**
 * The template trust tier: "text substitution with escaping — no code runs"
 * (docs/design/SMART-BLOCKS.md). This is an eval-free subset of Handlebars, deliberately *not*
 * the real compiler: the webview runs under a strict CSP (`script-src 'nonce-…'`, no
 * `unsafe-eval`), and Handlebars compiles templates with `new Function`, which that CSP
 * forbids. Full Handlebars (and any author code) belongs to the sandboxed-iframe tier,
 * where it is isolated; the safe in-editor tier is pure string work.
 *
 * Supported: `{{path}}` (HTML-escaped), `{{{path}}}` (raw), `{{#if path}}…{{/if}}`,
 * `{{#unless path}}…{{/unless}}`, `{{#each path}}…{{/each}}` (with `{{this}}` and, for
 * object items, their keys). `path` is a dotted lookup; `this` refers to the current item.
 */

type Ctx = Record<string, unknown>;

interface TextNode {
  kind: 'text';
  text: string;
}
interface InterpNode {
  kind: 'interp';
  path: string;
  raw: boolean;
}
interface BlockNode {
  kind: 'if' | 'unless' | 'each';
  path: string;
  children: Node[];
}
type Node = TextNode | InterpNode | BlockNode;

const TOKEN = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lookup(ctx: Ctx, path: string): unknown {
  if (path === 'this') return ctx['this'];
  let cur: unknown = ctx;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Parse a template into an AST. Unbalanced blocks are tolerated (treated as text). */
function parse(src: string): Node[] {
  const root: Node[] = [];
  const stack: BlockNode[] = [];
  const top = () => (stack.length ? stack[stack.length - 1].children : root);
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    if (m.index > last) top().push({ kind: 'text', text: src.slice(last, m.index) });
    last = TOKEN.lastIndex;
    const raw = m[1] !== undefined;
    const expr = (m[1] ?? m[2]).trim();
    const open = /^#(if|unless|each)\s+(.+)$/.exec(expr);
    const close = /^\/(if|unless|each)$/.exec(expr);
    if (open) {
      const node: BlockNode = { kind: open[1] as BlockNode['kind'], path: open[2].trim(), children: [] };
      top().push(node);
      stack.push(node);
    } else if (close) {
      if (stack.length && stack[stack.length - 1].kind === close[1]) stack.pop();
    } else {
      top().push({ kind: 'interp', path: expr, raw });
    }
  }
  if (last < src.length) top().push({ kind: 'text', text: src.slice(last) });
  return root;
}

function renderNodes(nodes: Node[], ctx: Ctx): string {
  let out = '';
  for (const node of nodes) {
    if (node.kind === 'text') {
      out += node.text;
    } else if (node.kind === 'interp') {
      const value = lookup(ctx, node.path);
      out += node.raw ? String(value ?? '') : escapeHtml(value);
    } else if (node.kind === 'if') {
      if (truthy(lookup(ctx, node.path))) out += renderNodes(node.children, ctx);
    } else if (node.kind === 'unless') {
      if (!truthy(lookup(ctx, node.path))) out += renderNodes(node.children, ctx);
    } else {
      const list = lookup(ctx, node.path);
      if (Array.isArray(list)) {
        for (const item of list) {
          const childCtx: Ctx =
            item && typeof item === 'object'
              ? { ...ctx, ...(item as Ctx), this: item }
              : { ...ctx, this: item };
          out += renderNodes(node.children, childCtx);
        }
      }
    }
  }
  return out;
}

function truthy(v: unknown): boolean {
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

/** Render a template against a context, HTML-escaping interpolated values. */
export function renderTemplate(src: string, context: Ctx): string {
  return renderNodes(parse(src), context);
}
