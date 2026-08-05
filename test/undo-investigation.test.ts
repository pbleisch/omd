import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';
import { buildCommands, type OmdCommand } from '../src/webview/commands/registry';
import { normalizeMarkdown } from '../src/shared/roundtrip';
import { createOmdEditor } from '../src/webview/editor';

/**
 * Investigation: why does undo merge separate edits into one step?
 * The reporter says waiting >0.5s doesn't help and it happens across paragraphs.
 *
 * FINDINGS:
 * 1. timeThreshold grouping (default 500ms, reduced to 200ms) — edits within the threshold
 *    undo as one step. This is expected ProseMirror behavior and contributes to the issue.
 *
 * 2. setMarkdown timer reset (PRIMARY CAUSE) — even when content is identical, setMarkdown
 *    dispatches a ProseMirror transaction that resets the history plugin's internal timer.
 *    This bridges two user edits into one undo group through a chain of intermediate
 *    setMarkdown transactions, regardless of how far apart the edits are.
 *
 * 3. In the real host flow, setMarkdown is called when pushDocument fires on the host
 *    (after applyingEditorEdit is reset). The lastSynced guard prevents most calls, but
 *    any timing gap where setMarkdown fires between edits creates the chaining effect.
 *
 * FIX NEEDED: Prevent setMarkdown from dispatching a transaction when content is identical,
 * OR use addToHistory:false without breaking position mapping.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withEditor(markdown: string) {
  const { handle } = await mountEditor(markdown);
  const view = handle.getView();
  const byId = new Map(buildCommands(view.state.schema).map((c) => [c.id, c]));
  const cmd = (id: string): OmdCommand => {
    const c = byId.get(id);
    if (!c) throw new Error(`no command ${id}`);
    return c;
  };
  const select = (from: number, to: number) =>
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
  return { handle, view, cmd, select };
}

describe('undo investigation — tracing transaction flow', () => {
  // --- Test 1: Does setMarkdown with identical content create an undo step? ---

  it('T1: setMarkdown with identical content — does it create an undo step?', async () => {
    const { handle, view, cmd, select } = await withEditor('hello\n');

    // Make one edit
    select(1, 1);
    cmd('h2').run(view);
    await wait(50);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('## hello\n');

    // setMarkdown with the SAME content
    handle.setMarkdown('## hello\n');
    await wait(50);

    // Undo — does it go back to 'hello' or stay at '## hello'?
    cmd('undo').run(view);
    await wait(50);

    // If setMarkdown created an undo step, we'd need 2 undos to reach 'hello'
    // If it didn't, one undo reaches 'hello'
    const afterOneUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T1: after one undo:', JSON.stringify(afterOneUndo));

    // Try a second undo
    cmd('undo').run(view);
    await wait(50);
    const afterTwoUndos = normalizeMarkdown(handle.getMarkdown());
    console.log('T1: after two undos:', JSON.stringify(afterTwoUndos));

    // The key question: did setMarkdown create an undo step?
    if (afterOneUndo === 'hello\n') {
      console.log('T1: setMarkdown did NOT create an undo step (good)');
    } else {
      console.log('T1: setMarkdown DID create an undo step (bad — this bridges edits)');
    }
  });

  // --- Test 2: Does setMarkdown bridge two edits into one undo group? ---

  it('T2: setMarkdown between two edits — does it bridge them into one undo group?', async () => {
    const { handle, view, cmd, select } = await withEditor('hello\n');

    // Edit 1: H2
    select(1, 1);
    cmd('h2').run(view);
    await wait(50);

    // Simulate host round-trip: setMarkdown with same content
    handle.setMarkdown('## hello\n');
    await wait(50);

    // Wait well past timeThreshold before edit 2
    await wait(600);

    // Edit 2: H3
    select(1, 1);
    cmd('h3').run(view);
    await wait(50);

    // Undo — should only undo edit 2 (H3 -> H2)
    cmd('undo').run(view);
    await wait(50);
    const afterFirstUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T2: after first undo:', JSON.stringify(afterFirstUndo));

    if (afterFirstUndo === '## hello\n') {
      console.log('T2: PASS — edits undo independently');
    } else if (afterFirstUndo === 'hello\n') {
      console.log('T2: FAIL — setMarkdown bridged the two edits into one undo group');
    }

    // Try more undos to map the full stack
    cmd('undo').run(view);
    await wait(50);
    console.log('T2: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
    cmd('undo').run(view);
    await wait(50);
    console.log('T2: after third undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 3: Multiple setMarkdown calls — do they compound? ---

  it('T3: multiple setMarkdown calls between edits', async () => {
    const { handle, view, cmd, select } = await withEditor('hello\n');

    // Edit 1
    select(1, 1);
    cmd('h2').run(view);
    await wait(50);

    // Multiple setMarkdown calls (simulating multiple host pushes)
    handle.setMarkdown('## hello\n');
    await wait(50);
    handle.setMarkdown('## hello\n');
    await wait(50);
    handle.setMarkdown('## hello\n');
    await wait(600);

    // Edit 2
    select(1, 1);
    cmd('h3').run(view);
    await wait(50);

    // Map the undo stack
    for (let i = 1; i <= 6; i++) {
      cmd('undo').run(view);
      await wait(50);
      console.log(`T3: after undo ${i}:`, JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
    }
  });

  // --- Test 4: setMarkdown with DIFFERENT content (trailing whitespace, etc.) ---

  it('T4: setMarkdown with slightly different content (trailing newline variation)', async () => {
    const { handle, view, cmd, select } = await withEditor('hello\n');

    // Edit 1
    select(1, 1);
    cmd('h2').run(view);
    await wait(50);

    // setMarkdown with extra trailing newline (normalized same, but bytes differ)
    handle.setMarkdown('## hello\n\n');
    await wait(600);

    // Edit 2
    select(1, 1);
    cmd('h3').run(view);
    await wait(50);

    // Map the undo stack
    for (let i = 1; i <= 5; i++) {
      cmd('undo').run(view);
      await wait(50);
      console.log(`T4: after undo ${i}:`, JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
    }
  });

  // --- Test 5: Cross-paragraph edits (the reporter's scenario) ---

  it('T5: editing two different paragraphs with setMarkdown between', async () => {
    const { handle, view, cmd } = await withEditor('first paragraph\n\nsecond paragraph\n');

    // Edit 1: bold "first"
    view.dispatch(view.state.tr.replaceRange(1, 6, view.state.schema.text('**first**')));
    await wait(50);

    // Simulate host round-trip
    handle.setMarkdown('**first** paragraph\n\nsecond paragraph\n');
    await wait(600);

    // Edit 2: bold "second" (different paragraph)
    view.dispatch(view.state.tr.replaceRange(25, 31, view.state.schema.text('**second**')));
    await wait(50);

    // Undo — should only undo edit 2
    cmd('undo').run(view);
    await wait(50);
    const afterFirstUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T5: after first undo:', JSON.stringify(afterFirstUndo));

    if (afterFirstUndo.includes('**first**')) {
      console.log('T5: PASS — first paragraph edit survives');
    } else {
      console.log('T5: FAIL — both edits undone together');
    }

    cmd('undo').run(view);
    await wait(50);
    console.log('T5: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 6: What does the markdownUpdated debounce actually do? ---

  it('T6: timing of markdownUpdated — does the debounce create intermediate transactions?', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    let updateCount = 0;
    const timestamps: number[] = [];
    const start = Date.now();

    const handle = await createOmdEditorWithTracking({
      root,
      initial: 'hello\n',
      onEdit: (_md) => {
        updateCount++;
        timestamps.push(Date.now() - start);
      }
    });

    const view = handle.getView();

    // Make an edit
    view.dispatch(view.state.tr.insertText(' world', 5));

    // Check when onEdit fires
    await wait(100);
    console.log('T6: after 100ms, onEdit fired', updateCount, 'times');

    await wait(250);
    console.log('T6: after 350ms total, onEdit fired', updateCount, 'times at:', timestamps);

    root.remove();
  });

  // --- Test 7: Does the history plugin see setMarkdown transactions? ---

  it('T7: inspecting ProseMirror history state directly', async () => {
    const { handle, view, cmd, select } = await withEditor('hello\n');

    // Get the history plugin state
    const getHistoryState = () => {
      for (const item of view.state.plugins) {
        const state = item.getState(view.state);
        if (state && 'depth' in state) {
          return {
            depth: state.depth,
            timeThreshold: item.spec.key ? 'has key' : 'no key',
          };
        }
      }
      return null;
    };

    const initial = getHistoryState();
    console.log('T7: initial history state:', JSON.stringify(initial));

    // Edit 1
    select(1, 1);
    cmd('h2').run(view);
    await wait(50);
    console.log('T7: after edit 1:', JSON.stringify(getHistoryState()));

    // setMarkdown
    handle.setMarkdown('## hello\n');
    await wait(50);
    console.log('T7: after setMarkdown:', JSON.stringify(getHistoryState()));

    // Edit 2
    select(1, 1);
    cmd('h3').run(view);
    await wait(50);
    console.log('T7: after edit 2:', JSON.stringify(getHistoryState()));

    // Undo
    cmd('undo').run(view);
    await wait(50);
    console.log('T7: after undo:', JSON.stringify(getHistoryState()));
    console.log('T7: doc after undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 8: Rapid edits within debounce window ---

  it('T8: two rapid edits (both within 300ms debounce) — how does undo behave?', async () => {
    const { handle, view, cmd, select } = await withEditor('hello\n');

    // Edit 1: H2
    select(1, 1);
    cmd('h2').run(view);

    // Edit 2: H3 — immediately, within debounce window
    select(1, 1);
    cmd('h3').run(view);

    await wait(50);

    // Simulate host round-trip (only fires once for the latest state)
    handle.setMarkdown('### hello\n');
    await wait(50);

    // Map undo stack
    for (let i = 1; i <= 4; i++) {
      cmd('undo').run(view);
      await wait(50);
      console.log(`T8: after undo ${i}:`, JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
    }
  });

  // --- Test 9: The exact reporter scenario — edit, wait >1s, edit different paragraph ---

  it('T9: exact reporter scenario — edit para 1, wait >1s, edit para 2', async () => {
    const { handle, view, cmd } = await withEditor('line one\n\nline two\n');

    // Edit line one: replace "line" with "EDIT" at start of doc
    view.dispatch(view.state.tr.replaceRange(1, 5, view.state.schema.text('EDIT')));
    await wait(200);

    // Simulate host round-trip for edit 1
    handle.setMarkdown('EDIT one\n\nline two\n');
    await wait(200);

    // Wait well past any threshold
    await wait(1500);

    // Edit line two (different paragraph) — find "line" in second paragraph
    const docText = handle.getMarkdown();
    const lineTwoStart = docText.indexOf('line two');
    view.dispatch(view.state.tr.replaceRange(lineTwoStart + 1, lineTwoStart + 5, view.state.schema.text('EDIT')));
    await wait(200);

    // Simulate host round-trip for edit 2
    handle.setMarkdown('EDIT one\n\nEDIT two\n');
    await wait(200);

    // Undo — should only undo line two edit
    cmd('undo').run(view);
    await wait(50);
    const afterFirstUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T9: after first undo:', JSON.stringify(afterFirstUndo));

    if (afterFirstUndo.includes('EDIT one')) {
      console.log('T9: PASS — line one edit survives');
    } else {
      console.log('T9: FAIL — both edits undone together');
    }

    cmd('undo').run(view);
    await wait(50);
    console.log('T9: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
    cmd('undo').run(view);
    await wait(50);
    console.log('T9: after third undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 10: Transaction tracer — count all transactions dispatched ---

  it('T10: transaction tracer — how many transactions does one edit + setMarkdown produce?', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    let txCount = 0;
    const txLog: string[] = [];

    const handle = await createOmdEditor({
      root,
      initial: 'hello\n',
      onEdit: () => {}
    });

    const view = handle.getView();

    // Monkey-patch dispatch to trace transactions
    const origDispatch = view.dispatch.bind(view);
    view.dispatch = (tr) => {
      txCount++;
      const labels: string[] = [];
      if (tr.getMeta('addToHistory') === false) labels.push('no-history');
      if (tr.docChanged) labels.push('doc-changed');
      if (tr.selection) labels.push('selection');
      txLog.push(`TX${txCount}: ${labels.join(',') || 'empty-meta'} | changed=${tr.docChanged}`);
      return origDispatch(tr);
    };

    // Edit 1: insert text
    view.dispatch(view.state.tr.insertText(' world', 5));
    await wait(100);
    console.log('T10: after edit 1, txCount =', txCount);
    txLog.forEach((l) => console.log('  ', l));

    // setMarkdown with same content
    handle.setMarkdown('hello world\n');
    await wait(100);
    console.log('T10: after setMarkdown, txCount =', txCount);
    txLog.slice(-5).forEach((l) => console.log('  ', l));

    // Edit 2: insert more text
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size));
    await wait(100);
    console.log('T10: after edit 2, txCount =', txCount);
    txLog.slice(-5).forEach((l) => console.log('  ', l));

    root.remove();
  });

  // --- Test 11: Does setMarkdown trigger markdownUpdated which fires onEdit? ---

  it('T11: does setMarkdown with identical content trigger onEdit?', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    let editCount = 0;
    const handle = await createOmdEditor({
      root,
      initial: 'hello\n',
      onEdit: () => editCount++
    });

    // Wait for initial settle
    await wait(400);
    console.log('T11: after init, editCount =', editCount);

    // setMarkdown with identical content
    handle.setMarkdown('hello\n');
    await wait(400);
    console.log('T11: after setMarkdown(same), editCount =', editCount);

    // setMarkdown with different content
    handle.setMarkdown('hello world\n');
    await wait(400);
    console.log('T11: after setMarkdown(diff), editCount =', editCount);

    root.remove();
  });

  // --- Test 12: Simulate the REAL host round-trip including splitThreads/withThreads ---

  it('T12: simulate real host round-trip with splitThreads/withThreads', async () => {
    const { handle, view, cmd } = await withEditor('first paragraph\n\nsecond paragraph\n');

    // Edit 1: modify first paragraph
    view.dispatch(view.state.tr.insertText(' EDITED', 5));
    await wait(100);

    // Simulate the REAL host path: getMarkdown → splitThreads → withThreads → setDocument
    const currentMd = handle.getMarkdown();
    // The host would do: withThreads(splitThreads(currentMd).body, [])
    // For a doc without threads, this is just the body as-is
    const hostRoundTrip = currentMd; // splitThreads/withThreads no-op for no-threads
    handle.setMarkdown(hostRoundTrip);
    await wait(100);

    // Wait well past timeThreshold
    await wait(600);

    // Edit 2: modify second paragraph
    const docAfter = handle.getMarkdown();
    const secondParaIdx = docAfter.indexOf('second');
    view.dispatch(view.state.tr.insertText(' EDITED', secondParaIdx + 6));
    await wait(100);

    // Undo — should only undo edit 2
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T12: after undo:', JSON.stringify(afterUndo));

    if (afterUndo.includes('first EDITED')) {
      console.log('T12: PASS — first paragraph edit survives');
    } else {
      console.log('T12: FAIL — both edits undone together');
    }

    cmd('undo').run(view);
    await wait(50);
    console.log('T12: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 13: What if setMarkdown content differs from editor due to Milkdown serialization? ---

  it('T13: setMarkdown with re-serialized content (Milkdown may change formatting)', async () => {
    const { handle, view, cmd } = await withEditor('hello\n');

    // Make an edit
    view.dispatch(view.state.tr.insertText(' world', 5));
    await wait(100);

    // Get what Milkdown serializes — this is what the host would receive
    const serialized = handle.getMarkdown();
    console.log('T13: serialized after edit:', JSON.stringify(serialized));

    // setMarkdown with the serialized content (simulating host round-trip)
    handle.setMarkdown(serialized);
    await wait(100);

    // Wait past timeThreshold
    await wait(600);

    // Make another edit
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size));
    await wait(100);

    // Undo stack mapping
    for (let i = 1; i <= 5; i++) {
      cmd('undo').run(view);
      await wait(50);
      console.log(`T13: after undo ${i}:`, JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
    }
  });

  // --- Test 14: What if setMarkdown is called multiple times (chaining scenario)? ---

  it('T14: repeated setMarkdown calls — can they chain two edits into one group?', async () => {
    const { handle, view, cmd } = await withEditor('hello\n');

    // Edit 1
    view.dispatch(view.state.tr.insertText(' world', 5));
    await wait(50);

    // Simulate multiple host pushes (e.g., from repeated onDidChangeTextDocument)
    // Each setMarkdown is 100ms apart — well within timeThreshold (200ms)
    handle.setMarkdown('hello world\n');
    await wait(100);
    handle.setMarkdown('hello world\n');
    await wait(100);
    handle.setMarkdown('hello world\n');
    await wait(100);
    handle.setMarkdown('hello world\n');
    await wait(100);
    handle.setMarkdown('hello world\n');
    await wait(100);

    // Edit 2 — total time from edit 1: ~650ms
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size));
    await wait(50);

    // Undo — does it undo both edits or just edit 2?
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T14: after undo:', JSON.stringify(afterUndo));

    if (afterUndo === 'hello world\n') {
      console.log('T14: PASS — edits undo independently');
    } else if (afterUndo === 'hello\n') {
      console.log('T14: FAIL — repeated setMarkdown chained edits into one group');
    }

    cmd('undo').run(view);
    await wait(50);
    console.log('T14: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 15: Simulate real VS Code latency (host round-trip takes 500ms+) ---

  it('T15: simulate slow host round-trip (500ms latency)', async () => {
    const { handle, view, cmd } = await withEditor('first line\nsecond line\n');

    // Edit 1: modify first line
    view.dispatch(view.state.tr.insertText(' EDITED', 5));
    await wait(50);

    // Simulate slow host round-trip (500ms — typical for real VS Code)
    await wait(500);
    handle.setMarkdown('first EDITED line\nsecond line\n');
    await wait(50);

    // Edit 2: modify second line (total time from edit 1: ~600ms)
    const docText = handle.getMarkdown();
    const secondIdx = docText.indexOf('second');
    view.dispatch(view.state.tr.insertText(' EDITED', secondIdx + 6));
    await wait(50);

    // Undo — should only undo edit 2
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T15: after undo:', JSON.stringify(afterUndo));

    if (afterUndo.includes('first EDITED')) {
      console.log('T15: PASS — first line edit survives');
    } else {
      console.log('T15: FAIL — slow round-trip chained edits');
    }

    cmd('undo').run(view);
    await wait(50);
    console.log('T15: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 16: What if the host round-trip arrives BETWEEN two rapid edits? ---

  it('T16: host round-trip between two rapid edits (the chaining scenario)', async () => {
    const { handle, view, cmd } = await withEditor('line one\nline two\n');

    // Edit 1 at T=0
    view.dispatch(view.state.tr.insertText(' X', 8));
    const t0 = Date.now();

    // Host round-trip arrives at T=250ms (within timeThreshold of both edits)
    await wait(250);
    handle.setMarkdown('line one X\nline two\n');

    // Edit 2 at T=300ms (50ms after setMarkdown)
    await wait(50);
    const docText = handle.getMarkdown();
    const lineTwoIdx = docText.indexOf('line two');
    view.dispatch(view.state.tr.insertText(' X', lineTwoIdx + 7));

    await wait(50);
    console.log('T16: total time from edit 1 to edit 2:', Date.now() - t0, 'ms');

    // Undo — does it undo both edits?
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T16: after undo:', JSON.stringify(afterUndo));

    if (afterUndo.includes('line one X')) {
      console.log('T16: PASS — edits undo independently');
    } else {
      console.log('T16: FAIL — setMarkdown between edits chained them');
    }

    cmd('undo').run(view);
    await wait(50);
    console.log('T16: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 17: Does Milkdown's replaceAll create a transaction that resets timeThreshold? ---

  it('T17: measure exact timing of setMarkdown transaction', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const timestamps: number[] = [];
    const start = Date.now();

    const handle = await createOmdEditor({
      root,
      initial: 'hello\n',
      onEdit: () => {}
    });

    const view = handle.getView();

    // Monkey-patch dispatch to record timestamps
    const origDispatch = view.dispatch.bind(view);
    view.dispatch = (tr) => {
      timestamps.push(Date.now() - start);
      return origDispatch(tr);
    };

    // Edit 1 at T=0
    view.dispatch(view.state.tr.insertText(' world', 5));

    // setMarkdown at T=200ms
    await wait(200);
    handle.setMarkdown('hello world\n');

    // Edit 2 at T=400ms
    await wait(200);
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size));

    await wait(50);
    console.log('T17: transaction timestamps (ms):', timestamps);
    console.log('T17: gaps between transactions:',
      timestamps.slice(1).map((t, i) => `${t - timestamps[i]}ms`).join(', '));

    root.remove();
  });

  // --- Test 18: Does setMarkdown with identical content reset the history timer? ---

  it('T18: does identical setMarkdown reset ProseMirror history timer?', async () => {
    const { handle, view, cmd } = await withEditor('hello\n');

    // Edit 1
    view.dispatch(view.state.tr.insertText(' world', 5));
    await wait(50);

    // setMarkdown with identical content — does this reset the timer?
    handle.setMarkdown('hello world\n');

    // Wait 250ms (past timeThreshold of 200ms)
    await wait(250);

    // Edit 2 — if timer was reset by setMarkdown, this would be within threshold
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size));
    await wait(50);

    // Undo — if setMarkdown reset the timer, both edits undo together
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T18: after undo:', JSON.stringify(afterUndo));

    if (afterUndo === 'hello world\n') {
      console.log('T18: PASS — identical setMarkdown did NOT reset timer');
    } else if (afterUndo === 'hello\n') {
      console.log('T18: FAIL — identical setMarkdown DID reset timer, chaining edits');
    } else {
      console.log('T18: UNEXPECTED — got:', afterUndo);
    }
  });

  // --- Test 19: What if we skip setMarkdown when content is identical? ---

  it('T19: skipping identical setMarkdown prevents chaining', async () => {
    const { handle, view, cmd } = await withEditor('hello\n');

    // Edit 1
    view.dispatch(view.state.tr.insertText(' world', 5));
    await wait(50);

    // Instead of calling setMarkdown, skip it (simulating the fix)
    // handle.setMarkdown('hello world\n'); // SKIPPED

    await wait(250);

    // Edit 2
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size));
    await wait(50);

    // Undo
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T19: after undo (no setMarkdown):', JSON.stringify(afterUndo));

    if (afterUndo === 'hello world\n') {
      console.log('T19: PASS — without setMarkdown, edits undo independently');
    } else {
      console.log('T19: UNEXPECTED:', afterUndo);
    }
  });

  // --- Test 20: Realistic host round-trip — setMarkdown with editor's own serialization ---

  it('T20: realistic host round-trip — setMarkdown(getMarkdown()) does not chain edits', async () => {
    const { handle, view, cmd, select } = await withEditor('alpha\nbeta\n');

    // Edit 1: make first line H2
    select(1, 1);
    cmd('h2').run(view);
    await wait(300); // wait for debounce

    // Simulate REAL host round-trip: push back what the editor serialized
    const serialized = handle.getMarkdown();
    console.log('T20: host round-trips:', JSON.stringify(serialized));
    handle.setMarkdown(serialized);
    await wait(100);

    // Wait past timeThreshold
    await wait(300);

    // Edit 2: make second line bold (move cursor to "beta" and select it)
    const docText = handle.getMarkdown();
    const betaIdx = docText.indexOf('beta');
    select(betaIdx, betaIdx + 4);
    cmd('bold').run(view);
    await wait(100);

    console.log('T20: after edit 2:', JSON.stringify(handle.getMarkdown()));

    // Undo — should only undo edit 2 (unbold beta)
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T20: after undo:', JSON.stringify(afterUndo));

    if (afterUndo.includes('## alpha')) {
      console.log('T20: PASS — H2 edit survives');
    } else {
      console.log('T20: FAIL — both edits undone together');
    }

    cmd('undo').run(view);
    await wait(50);
    console.log('T20: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 21: Multiple realistic round-trips between edits ---

  it('T21: multiple realistic host round-trips do not chain edits', async () => {
    const { handle, view, cmd, select } = await withEditor('title\n');

    // Edit 1: make H1
    select(1, 1);
    cmd('h1').run(view);
    await wait(300); // wait for debounce

    console.log('T21: after edit 1:', JSON.stringify(handle.getMarkdown()));

    // Multiple realistic host round-trips
    for (let i = 0; i < 5; i++) {
      handle.setMarkdown(handle.getMarkdown());
      await wait(100);
    }

    // Edit 2: make H3
    select(1, 1);
    cmd('h3').run(view);
    await wait(50);

    console.log('T21: after edit 2:', JSON.stringify(handle.getMarkdown()));

    // Undo — should only undo edit 2 (H3 -> H1)
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T21: after undo:', JSON.stringify(afterUndo));

    if (afterUndo === '# title\n') {
      console.log('T21: PASS — edits undo independently');
    } else if (afterUndo === 'title\n') {
      console.log('T21: FAIL — round-trips chained edits');
    } else {
      console.log('T21: UNEXPECTED:', afterUndo);
    }

    cmd('undo').run(view);
    await wait(50);
    console.log('T21: after second undo:', JSON.stringify(normalizeMarkdown(handle.getMarkdown())));
  });

  // --- Test 22: Debug — does setMarkdown dispatch a transaction for identical content? ---

  it('T22: debug — does setMarkdown dispatch a transaction for identical content?', async () => {
    const { handle, view, cmd, select } = await withEditor('title\n');

    // Edit 1: make H1
    select(1, 1);
    cmd('h1').run(view);
    await wait(300);

    const serialized = handle.getMarkdown();
    console.log('T22: serialized:', JSON.stringify(serialized));

    // Count transactions dispatched by setMarkdown
    let txCount = 0;
    const origDispatch = view.dispatch.bind(view);
    view.dispatch = (tr) => {
      txCount++;
      console.log(`T22: TX${txCount}: docChanged=${tr.docChanged}, addToHistory=${tr.getMeta('addToHistory')}`);
      return origDispatch(tr);
    };

    // Call setMarkdown with the same content
    handle.setMarkdown(serialized);
    await wait(100);

    console.log('T22: setMarkdown dispatched', txCount, 'transactions');

    if (txCount === 0) {
      console.log('T22: PASS — eq() prevented dispatch');
    } else {
      console.log('T22: FAIL — eq() returned false, transaction was dispatched');
    }

    // Try undo to see if a step was created
    cmd('undo').run(view);
    await wait(50);
    const afterUndo = normalizeMarkdown(handle.getMarkdown());
    console.log('T22: after undo:', JSON.stringify(afterUndo));
  });
});

// Helper for T6 — create editor with tracking
async function createOmdEditorWithTracking(opts: {
  root: HTMLElement;
  initial: string;
  onEdit: (md: string) => void;
}) {
  return createOmdEditor(opts);
}
