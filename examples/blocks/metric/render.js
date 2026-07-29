// Sandboxed render code. Runs in an isolated iframe with only `params` and `root` in scope —
// no network, no access to the editor's DOM, cookies, or storage. Build your output as DOM
// under `root`; do not inject untrusted strings as HTML. See
// docs/contributing/authoring-smart-blocks.md.

var wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px';

var value = document.createElement('div');
value.style.cssText = 'font-size:2em;font-weight:600;line-height:1';
var unit = params.unit ? ' ' + params.unit : '';
value.textContent = String(params.value != null ? params.value : '') + unit;
wrap.appendChild(value);

var label = document.createElement('div');
label.style.cssText = 'opacity:.7;font-size:.9em';
label.textContent = String(params.label != null ? params.label : '');
wrap.appendChild(label);

root.appendChild(wrap);
