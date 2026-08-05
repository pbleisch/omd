import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';
import { buildCommands, type OmdCommand } from '../src/webview/commands/registry';
import { createOmdEditor } from '../src/webview/editor';
import { generateMixedDocument, generateProseDocument, generateTablesDocument } from './helpers/large-docs';

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
  return { handle, view, cmd };
}

describe('undo on large documents', () => {
  it('L1: setMarkdown round-trip does not chain edits on a ~30KB doc', async () => {
    const doc = generateMixedDocument(100);
    const { handle, view, cmd } = await withEditor(doc);

    // Edit 1: append at end
    view.dispatch(view.state.tr.insertText(' EDIT-1', view.state.doc.content.size));
    await wait(300);

    // Simulate host round-trip
    handle.setMarkdown(handle.getMarkdown());
    await wait(300);

    // Edit 2: append at end again
    view.dispatch(view.state.tr.insertText(' EDIT-2', view.state.doc.content.size));
    await wait(100);

    // Undo should only undo edit 2
    cmd('undo').run(view);
    await wait(50);

    const afterUndo = handle.getMarkdown();
    expect(afterUndo).toContain('EDIT-1');
    expect(afterUndo).not.toContain('EDIT-2');
  }, 30000);

  it('L2: multiple setMarkdown round-trips on a ~80KB doc do not chain edits', async () => {
    const doc = generateMixedDocument(300);
    const { handle, view, cmd } = await withEditor(doc);

    // Edit 1
    view.dispatch(view.state.tr.insertText(' EDIT-1', view.state.doc.content.size));
    await wait(300);

    // Multiple round-trips (simulating repeated host pushes)
    for (let i = 0; i < 3; i++) {
      handle.setMarkdown(handle.getMarkdown());
      await wait(100);
    }

    // Edit 2
    view.dispatch(view.state.tr.insertText(' EDIT-2', view.state.doc.content.size));
    await wait(100);

    cmd('undo').run(view);
    await wait(50);

    const afterUndo = handle.getMarkdown();
    expect(afterUndo).toContain('EDIT-1');
    expect(afterUndo).not.toContain('EDIT-2');
  }, 60000);

  it('L3: prose-only ~40KB doc — edits undo independently', async () => {
    const doc = generateProseDocument(200);
    const { handle, view, cmd } = await withEditor(doc);

    // Edit 1
    view.dispatch(view.state.tr.insertText(' EDIT-1', view.state.doc.content.size));
    await wait(300);

    handle.setMarkdown(handle.getMarkdown());
    await wait(300);

    // Edit 2
    view.dispatch(view.state.tr.insertText(' EDIT-2', view.state.doc.content.size));
    await wait(100);

    cmd('undo').run(view);
    await wait(50);

    const afterUndo = handle.getMarkdown();
    expect(afterUndo).toContain('EDIT-1');
    expect(afterUndo).not.toContain('EDIT-2');
  }, 30000);

  it('L4: ~22KB tables doc — setMarkdown does not dispatch for identical content', async () => {
    const doc = generateTablesDocument(50);
    const { handle, view } = await withEditor(doc);

    // Measure serialization time on a large doc
    const t0 = Date.now();
    const serialized = handle.getMarkdown();
    const serializeMs = Date.now() - t0;
    console.log(`L4: serialized ${Math.round(serialized.length / 1024)}KB in ${serializeMs}ms`);

    // Count transactions from setMarkdown
    let txCount = 0;
    const origDispatch = view.dispatch.bind(view);
    view.dispatch = (tr) => {
      txCount++;
      return origDispatch(tr);
    };

    handle.setMarkdown(serialized);
    await wait(100);

    console.log(`L4: setMarkdown dispatched ${txCount} transactions`);
    expect(txCount).toBe(0);
  }, 30000);

  it('L5: ~130KB doc — setMarkdown dispatches 0 transactions for identical content', async () => {
    const doc = generateMixedDocument(500);
    const { handle, view } = await withEditor(doc);

    // Measure serialization time on this doc size
    const t0 = Date.now();
    const md = handle.getMarkdown();
    const serializeMs = Date.now() - t0;
    console.log(`L5: 500-section doc (${Math.round(md.length / 1024)}KB) serialized in ${serializeMs}ms`);

    // Count transactions from setMarkdown
    let txCount = 0;
    const origDisp = view.dispatch.bind(view);
    view.dispatch = (tr) => { txCount++; return origDisp(tr); };

    handle.setMarkdown(md);
    await wait(100);

    console.log(`L5: setMarkdown dispatched ${txCount} transactions`);
    expect(txCount).toBe(0);
  }, 30000);

  it('M1: ~900KB doc — serialization and undo still work', async () => {
    const doc = generateMixedDocument(3000);
    console.log(`M1: generated ${Math.round(doc.length / 1024)}KB, ${doc.split('\n').length} lines`);

    const { handle, view, cmd } = await withEditor(doc);

    // Measure serialization
    const t0 = Date.now();
    const md = handle.getMarkdown();
    console.log(`M1: serialized ${Math.round(md.length / 1024)}KB in ${Date.now() - t0}ms`);

    // Edit 1
    view.dispatch(view.state.tr.insertText(' EDIT-1', view.state.doc.content.size));
    await wait(500);

    handle.setMarkdown(handle.getMarkdown());

    // Edit 2 (immediately after setMarkdown, within timeThreshold)
    view.dispatch(view.state.tr.insertText(' EDIT-2', view.state.doc.content.size));
    await wait(100);

    cmd('undo').run(view);
    await wait(50);

    const afterUndo = handle.getMarkdown();
    expect(afterUndo).toContain('EDIT-1');
    expect(afterUndo).not.toContain('EDIT-2');
  }, 120000);

  it('M2: ~1.5MB doc — serialization and undo still work', async () => {
    const doc = generateMixedDocument(5000);
    console.log(`M2: generated ${Math.round(doc.length / 1024)}KB, ${doc.split('\n').length} lines`);

    const { handle, view, cmd } = await withEditor(doc);

    // Measure serialization
    const t0 = Date.now();
    const md = handle.getMarkdown();
    console.log(`M2: serialized ${Math.round(md.length / 1024)}KB in ${Date.now() - t0}ms`);

    // Edit 1
    view.dispatch(view.state.tr.insertText(' EDIT-1', view.state.doc.content.size));
    await wait(500);

    handle.setMarkdown(handle.getMarkdown());

    // Edit 2 (immediately after setMarkdown, within timeThreshold)
    view.dispatch(view.state.tr.insertText(' EDIT-2', view.state.doc.content.size));
    await wait(100);

    cmd('undo').run(view);
    await wait(50);

    const afterUndo = handle.getMarkdown();
    expect(afterUndo).toContain('EDIT-1');
    expect(afterUndo).not.toContain('EDIT-2');
  }, 180000);

  // ~3min — skip in CI, run with LARGE_DOC=true
  it.skipIf(!process.env.LARGE_DOC)('M3: ~3.6MB doc — serialization and undo still work', async () => {
    const doc = generateMixedDocument(12000);
    console.log(`M3: generated ${Math.round(doc.length / 1024)}KB, ${doc.split('\n').length} lines`);

    const { handle, view, cmd } = await withEditor(doc);

    // Measure serialization
    const t0 = Date.now();
    const md = handle.getMarkdown();
    console.log(`M3: serialized ${Math.round(md.length / 1024)}KB in ${Date.now() - t0}ms`);

    // Edit 1
    view.dispatch(view.state.tr.insertText(' EDIT-1', view.state.doc.content.size));
    await wait(500);

    handle.setMarkdown(handle.getMarkdown());

    // Edit 2 (immediately after setMarkdown, within timeThreshold)
    view.dispatch(view.state.tr.insertText(' EDIT-2', view.state.doc.content.size));
    await wait(100);

    cmd('undo').run(view);
    await wait(50);

    const afterUndo = handle.getMarkdown();
    expect(afterUndo).toContain('EDIT-1');
    expect(afterUndo).not.toContain('EDIT-2');
  }, 300000);
});
