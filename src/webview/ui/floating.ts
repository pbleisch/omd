/**
 * The one floating-layer primitive (Phase 0). Every transient surface that hangs over the
 * editor — the param popover, the context menu, and (later) the block property panel —
 * routes through here, so anchoring, viewport-flipping, and dismissal behave identically
 * and there is no second, drifting implementation (Principle 4).
 *
 * Behaviour: anchor to a viewport rect, place below by default and flip above when the
 * layer would clip the bottom edge, clamp horizontally so it never overflows the right
 * edge, and dismiss on outside-click or Escape. Panels pinned to a moving anchor may pass
 * `reposition` to track it on scroll/resize.
 */

/** A viewport-space anchor. `bottom` is where a below-placed layer starts. */
export interface FloatingAnchor {
  left: number;
  top: number;
  bottom: number;
}

export interface FloatingOptions {
  anchor: FloatingAnchor;
  /** The content placed inside the floating container. */
  content: HTMLElement;
  /** Extra class on the container (in addition to `omd-floating`). */
  className?: string;
  /** Preferred vertical placement; flips to the other side if it would clip. */
  placement?: 'below' | 'above';
  /** Gap in px between the anchor and the layer. Default 4. */
  offset?: number;
  /** Called when dismissed by outside-click or Escape (not on programmatic `close`). */
  onDismiss?: () => void;
  /**
   * Recompute the anchor when the page scrolls or resizes. Return `null` to close the
   * layer (e.g. the anchored element scrolled out of the document). Used by panels that
   * must stay pinned to a block as the document moves.
   */
  reposition?: () => FloatingAnchor | null;
}

export interface FloatingHandle {
  readonly el: HTMLElement;
  /** Remove the layer and detach all listeners. Does not fire `onDismiss`. */
  close(): void;
  /** Re-place the layer against a fresh anchor. */
  place(anchor: FloatingAnchor): void;
}

/** Position `el` against `anchor`, flipping/clamping to stay within the viewport. */
function placeElement(
  el: HTMLElement,
  anchor: FloatingAnchor,
  placement: 'below' | 'above',
  offset: number
): void {
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const rect = el.getBoundingClientRect();
  const width = rect.width || el.offsetWidth || 0;
  const height = rect.height || el.offsetHeight || 0;

  // Vertical: honour the preference, flip when the chosen side would clip and the other
  // side has more room. With no layout (jsdom) heights are 0 and we keep the preference.
  let top: number;
  const belowTop = anchor.bottom + offset;
  const aboveTop = anchor.top - offset - height;
  const clipsBelow = vh > 0 && belowTop + height > vh;
  const clipsAbove = aboveTop < 0;
  if (placement === 'below') {
    top = clipsBelow && !clipsAbove ? aboveTop : belowTop;
  } else {
    top = clipsAbove && !clipsBelow ? belowTop : aboveTop;
  }

  // Horizontal: clamp so the right edge stays on screen.
  let left = anchor.left;
  if (vw > 0 && width > 0 && left + width > vw) left = Math.max(4, vw - width - 4);
  if (left < 0) left = 4;

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(Math.max(top, 0))}px`;
}

export function openFloating(opts: FloatingOptions): FloatingHandle {
  const placement = opts.placement ?? 'below';
  const offset = opts.offset ?? 4;

  const el = document.createElement('div');
  el.className = opts.className ? `omd-floating ${opts.className}` : 'omd-floating';
  el.style.position = 'fixed';
  el.appendChild(opts.content);
  document.body.appendChild(el);

  placeElement(el, opts.anchor, placement, offset);

  let closed = false;
  const place = (anchor: FloatingAnchor) => {
    if (!closed) placeElement(el, anchor, placement, offset);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    if (opts.reposition) {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    }
    el.remove();
  };

  const dismiss = () => {
    if (closed) return;
    close();
    opts.onDismiss?.();
  };

  function onOutside(e: MouseEvent) {
    if (!el.contains(e.target as Node)) dismiss();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  }
  function onReposition() {
    const next = opts.reposition?.();
    if (next === null || next === undefined) dismiss();
    else place(next);
  }

  // Deferred so the click that opened the layer doesn't immediately dismiss it.
  setTimeout(() => {
    if (closed) return;
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    if (opts.reposition) {
      window.addEventListener('scroll', onReposition, true);
      window.addEventListener('resize', onReposition);
    }
  }, 0);

  return { el, close, place };
}
