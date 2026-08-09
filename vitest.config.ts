import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 20000,

    // vitest 4's default reporter no longer prints console output from *passing* tests,
    // which silently hides the FULL ROUND-TRIP census that hard gate 1 is read from in CI.
    reporters: ['verbose'],

    // @milkdown/ctx schedules an uncleared 3s setTimeout whose callback calls the bare global
    // removeEventListener. If a worker's jsdom env is torn down inside that window the timer
    // throws a ReferenceError with no test to attribute it to. Ignore only that exact shape.
    onUnhandledError(error) {
      if (
        error.name === 'ReferenceError' &&
        /(add|remove)EventListener is not defined/.test(error.message ?? '') &&
        /@milkdown\/ctx/.test(error.stack ?? '')
      ) {
        return false;
      }
    }
  }
});
