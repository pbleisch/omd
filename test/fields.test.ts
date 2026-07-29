import { describe, it, expect } from 'vitest';
import { createField, normalizeWidth } from '../src/webview/ui/fields';

/**
 * Phase 0 foundation: the typed field renderers the property panel (Phase 2) and the
 * front-matter panel (Phase 8) build their forms from. Each field must read its value back
 * with the right JS type — a number field yields a number, a boolean a boolean — so a
 * form's output can be written straight back into block params.
 */

describe('typed fields', () => {
  it('string field round-trips text', () => {
    const f = createField({ type: 'string', label: 'Title', value: 'Hello' });
    const input = f.el.querySelector('input')!;
    expect(input.value).toBe('Hello');
    input.value = 'World';
    expect(f.getValue()).toBe('World');
  });

  it('number field yields a number, not a string', () => {
    const f = createField({ type: 'number', label: 'Count', value: 3 });
    const input = f.el.querySelector('input')!;
    input.value = '42';
    const v = f.getValue();
    expect(v).toBe(42);
    expect(typeof v).toBe('number');
  });

  it('number field falls back to 0 on non-numeric input', () => {
    const f = createField({ type: 'number', label: 'Count' });
    (f.el.querySelector('input') as HTMLInputElement).value = 'abc';
    // jsdom lets a number input hold non-numeric text; getValue must still be a number.
    expect(f.getValue()).toBe(0);
  });

  it('boolean field yields a boolean from a checkbox', () => {
    const f = createField({ type: 'boolean', label: 'Enabled', value: true });
    const box = f.el.querySelector('input') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(f.getValue()).toBe(true);
    box.checked = false;
    expect(f.getValue()).toBe(false);
  });

  it('enum field renders options and reads the selection', () => {
    const f = createField({ type: 'enum', label: 'Type', value: 'bar', options: ['bar', 'line', 'pie'] });
    const select = f.el.querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBe(3);
    expect(f.getValue()).toBe('bar');
    select.value = 'pie';
    expect(f.getValue()).toBe('pie');
  });

  it('color field defaults to a valid hex when no value given', () => {
    const f = createField({ type: 'color', label: 'Color' });
    expect(String(f.getValue())).toMatch(/^#[0-9a-f]{6}$/i);
  });

  describe('segmented field', () => {
    const segs = [
      { value: '200', label: 'S' },
      { value: '400', label: 'M' },
      { value: '100%', label: 'Full' }
    ];

    it('marks the initial value active and reads it back', () => {
      const f = createField({ type: 'segmented', label: 'Width', segments: segs, value: '400' });
      const btns = f.el.querySelectorAll<HTMLButtonElement>('.omd-seg');
      expect(btns.length).toBe(3);
      expect(btns[1].classList.contains('omd-seg--active')).toBe(true);
      expect(f.getValue()).toBe('400');
    });

    it('clicking selects a value; clicking the active one clears it (deselect)', () => {
      let changes = 0;
      const f = createField({
        type: 'segmented',
        label: 'Align',
        segments: segs,
        value: '',
        onChange: () => changes++
      });
      const btns = f.el.querySelectorAll<HTMLButtonElement>('.omd-seg');
      btns[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(f.getValue()).toBe('100%');
      expect(changes).toBe(1);
      // re-clicking the active button deselects, so alignment can be removed / width returns to auto
      btns[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(f.getValue()).toBe('');
      expect(changes).toBe(2);
    });

    it('keeps a value that matches no button (custom width) with nothing active', () => {
      const f = createField({ type: 'segmented', label: 'Width', segments: segs, value: '512' });
      expect(f.el.querySelector('.omd-seg--active')).toBeNull();
      expect(f.getValue()).toBe('512'); // untouched, so a custom drag size isn't clobbered
    });
  });

  describe('width field', () => {
    const segs = [
      { value: '200', label: 'S' },
      { value: '400', label: 'M' },
      { value: '100%', label: 'Full' }
    ];

    it('normalizeWidth: bare number and px are px; percent keeps its unit; junk is empty', () => {
      expect(normalizeWidth('500')).toBe('500');
      expect(normalizeWidth('500px')).toBe('500');
      expect(normalizeWidth(' 500PX ')).toBe('500');
      expect(normalizeWidth('80%')).toBe('80%');
      expect(normalizeWidth('')).toBe('');
      expect(normalizeWidth('auto')).toBe('');
      expect(normalizeWidth('0')).toBe('');
    });

    it('renders stock buttons plus a text input, and reflects the initial value', () => {
      const f = createField({ type: 'width', label: 'Width', segments: segs, value: '400' });
      expect(f.el.querySelectorAll('.omd-seg').length).toBe(3);
      const input = f.el.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('400');
      expect((f.el.querySelectorAll('.omd-seg')[1] as HTMLElement).classList.contains('omd-seg--active')).toBe(true);
    });

    it('typing a specific value normalizes it and clears any active stock button', () => {
      let changes = 0;
      const f = createField({ type: 'width', label: 'Width', segments: segs, value: '400', onChange: () => changes++ });
      const input = f.el.querySelector('input') as HTMLInputElement;
      input.value = '500px';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      expect(f.getValue()).toBe('500');
      expect(input.value).toBe('500'); // re-canonicalized in place
      expect(f.el.querySelector('.omd-seg--active')).toBeNull();
      expect(changes).toBe(1);
    });

    it('clicking a stock button fills the input and reads back that value', () => {
      const f = createField({ type: 'width', label: 'Width', segments: segs, value: '' });
      const input = f.el.querySelector('input') as HTMLInputElement;
      (f.el.querySelectorAll('.omd-seg')[2] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(f.getValue()).toBe('100%');
      expect(input.value).toBe('100%');
    });
  });
});
