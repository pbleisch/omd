import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

/**
 * The Mocha entry point VS Code calls inside the extension host. It discovers the compiled
 * `*.test.js` files next to it and runs them; `vscode` is a real module here.
 */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60_000 });
  const testsRoot = __dirname;

  // Sorted, so file order is deterministic across platforms and glob versions. `activation.test.js`
  // sorting first is load-bearing: it asserts the extension is *not* yet active, which is only true
  // before any other suite has touched it.
  const files = (await glob('**/*.test.js', { cwd: testsRoot })).sort();
  for (const f of files) mocha.addFile(path.resolve(testsRoot, f));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => (failures > 0 ? reject(new Error(`${failures} test(s) failed`)) : resolve()));
  });
}
