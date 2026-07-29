import { describe, it, expect } from 'vitest';
import { examplesInSections, RAW_HTML_SECTIONS, type SpecExample } from './helpers/gfm-spec';
import { renderGitHubHtml } from '../src/shared/github-render';
import { roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * OMD vs the GitHub Flavored Markdown conformance suite (vendored under fixtures/gfm-spec), focused
 * on the **raw-HTML sections** — the target of the general raw-HTML work. Two axes:
 *
 *   1. **Export conformance** — OMD's markdown→HTML (the GitHub-preview/export pipeline,
 *      `renderGitHubHtml`) vs the spec's expected HTML, whitespace-normalized.
 *   2. **Round-trip no-loss** — the example's markdown through the editor and back; does it survive
 *      (after `normalizeMarkdown`)? This is the axis the dropped-`<br>` bug lived on.
 *
 * These are **ratchet** tests, not pass/100%: each section asserts `pass >= a recorded baseline`, so
 * the current gaps are documented, regressions fail, and improvements are locked in by bumping the
 * baseline. Each run prints a per-section scoreboard. Raise the baselines as the raw-HTML work lands.
 */

// Recorded baselines (GFM 0.29 snapshot). Bump upward as OMD's raw-HTML handling improves.
const EXPORT_BASELINE: Record<string, number> = {
  'HTML blocks': 40,
  'Entity and numeric character references': 9,
  'Raw HTML': 12,
  'Disallowed Raw HTML (extension)': 0
};
const ROUNDTRIP_BASELINE: Record<string, number> = {
  'HTML blocks': 29,
  'Entity and numeric character references': 9, // was 2; the omdEntity plugin preserves entities
  'Raw HTML': 13,
  'Disallowed Raw HTML (extension)': 1
};

/** Approximate HTML equivalence: collapse insignificant whitespace (good enough for a scoreboard). */
function normHtml(h: string): string {
  return h
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s+>/g, '>')
    .trim();
}

type Tally = Record<string, { pass: number; total: number; failed: number[] }>;

// `SPEC_VERBOSE=1 npx vitest run test/gfm-conformance.test.ts` lists the failing example numbers per
// section — the exact targets for the raw-HTML work.
const VERBOSE = !!process.env.SPEC_VERBOSE;

async function score(
  examples: SpecExample[],
  passes: (e: SpecExample) => Promise<boolean>
): Promise<Tally> {
  const t: Tally = {};
  for (const e of examples) {
    const row = (t[e.section] ??= { pass: 0, total: 0, failed: [] });
    row.total++;
    let ok = false;
    try {
      ok = await passes(e);
    } catch {
      ok = false;
    }
    if (ok) row.pass++;
    else row.failed.push(e.example);
  }
  return t;
}

function report(label: string, t: Tally): void {
  let pass = 0;
  let total = 0;
  const lines = [`\n=== ${label} ===`];
  for (const [section, r] of Object.entries(t)) {
    lines.push(`  ${String(r.pass).padStart(3)}/${String(r.total).padStart(3)}  ${section}`);
    if (VERBOSE && r.failed.length) lines.push(`         failing examples: ${r.failed.join(', ')}`);
    pass += r.pass;
    total += r.total;
  }
  lines.push(`  ---> ${pass}/${total} (${Math.round((100 * pass) / total)}%)`);
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

function assertRatchet(t: Tally, baseline: Record<string, number>): void {
  for (const [section, r] of Object.entries(t)) {
    const floor = baseline[section] ?? 0;
    expect(r.pass, `${section}: ${r.pass}/${r.total} dropped below baseline ${floor}`).toBeGreaterThanOrEqual(floor);
  }
}

describe('GFM conformance (raw-HTML sections)', () => {
  const examples = examplesInSections(RAW_HTML_SECTIONS);

  it('export: OMD HTML matches the spec (per-section ratchet)', async () => {
    const t = await score(examples, async (e) => normHtml(await renderGitHubHtml(e.markdown)) === normHtml(e.html));
    report('EXPORT CONFORMANCE', t);
    assertRatchet(t, EXPORT_BASELINE);
  }, 120000);

  it('round-trip: markdown survives open→save (per-section ratchet)', async () => {
    const t = await score(examples, async (e) => normalizeMarkdown(await roundTrip(e.markdown)) === normalizeMarkdown(e.markdown));
    report('ROUND-TRIP NO-LOSS', t);
    assertRatchet(t, ROUNDTRIP_BASELINE);
  }, 120000);
});
