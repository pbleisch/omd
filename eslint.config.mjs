import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Pragmatic lint for a TypeScript codebase. `no-undef` is off because the TypeScript compiler
 * already resolves identifiers across the host (Node) and webview (DOM) — eslint's own no-undef
 * doesn't understand TS lib/globals and would only produce false positives. Style is left to the
 * existing conventions; these rules aim at real defects (unused code, unreachable branches).
 */
export default tseslint.config(
  {
    ignores: [
      'out/**',
      'media/**',
      'node_modules/**',
      '.vscode-test/**',
      'dev/**',
      'test/preview/**',
      'coverage/**',
      '*.mjs'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // no-explicit-any is off by choice (the codebase uses typed `any` at library seams), which
    // makes its pre-existing inline disable comments redundant — don't flag those.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-undef': 'off',
      // The columns coexistence form embeds a literal non-breaking space on purpose (FORMATS.md).
      'no-irregular-whitespace': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true }
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  }
);
