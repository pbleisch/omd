/**
 * jsdom has no layout engine, so ProseMirror's scroll-into-view path (coordsAtPos ->
 * getClientRects) throws when a command dispatches a transaction that scrolls. The real
 * webview runs in a browser where this is defined; here we stub the geometry so command
 * tests can exercise the actual dispatch path. Read-only round-trip tests never hit this.
 *
 * A file that opts into the plain `node` environment (`// @vitest-environment node`) has no DOM to
 * stub, so the stubbing is skipped there.
 */
const emptyRect = () => ({
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => ({})
});

if (typeof Range !== 'undefined' && typeof Element !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = function () {
      return Object.assign([], { item: () => null }) as unknown as DOMRectList;
    };
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = emptyRect as unknown as () => DOMRect;
  }
  if (!Element.prototype.getClientRects || Element.prototype.getClientRects.toString().includes('[native code]') === false) {
    // jsdom returns an empty DOMRectList that lacks a usable first rect; give one back.
    Element.prototype.getClientRects = function () {
      return Object.assign([emptyRect()], { item: (i: number) => (i === 0 ? emptyRect() : null) }) as unknown as DOMRectList;
    };
  }
  Element.prototype.getBoundingClientRect = emptyRect as unknown as () => DOMRect;
  Element.prototype.scrollIntoView = () => {};
}
