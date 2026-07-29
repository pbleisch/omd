import * as path from 'path';
import { runTests } from '@vscode/test-electron';

/**
 * Launches a real VS Code with the OMD extension and runs the host-side integration suite
 * *inside* the extension host (`@vscode/test-electron`). This is the only automated way to
 * exercise behaviour the jsdom/webview tests can't reach — open/save/round-trip and the
 * document's dirty state — because those live in the host process, not the webview.
 *
 * Run with `npm run test:integration` (which builds the extension + this suite first).
 */
async function main(): Promise<void> {
  try {
    // out/integration-test/runTests.js → repo root is two levels up.
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    // A small fixture wiki opened as the workspace, so backlinks/diagnostics have real files to
    // scan (`findFiles` needs a workspace folder). It lives in source (not compiled) — just `.md`.
    const workspace = path.join(extensionDevelopmentPath, 'src', 'integration-test', 'fixtures', 'wiki');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // A throwaway profile so the run never touches the user's VS Code state; open the fixture wiki.
      launchArgs: [
        workspace,
        '--disable-extensions',
        '--user-data-dir',
        path.join(extensionDevelopmentPath, '.vscode-test', 'user-data')
      ]
    });
  } catch (err) {
    console.error('Integration tests failed to run:', err);
    process.exit(1);
  }
}

void main();
