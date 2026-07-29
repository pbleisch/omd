import type { EditorToHost, HostToEditor } from '../shared/messages';

interface VsCodeApi {
  postMessage(msg: EditorToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/**
 * The host bridge is acquired lazily, and only once. Doing it at module load would make this
 * module unimportable anywhere `acquireVsCodeApi` is absent — headless tests and the dev
 * preview before its stub installs — which in turn makes it unsafe for editor plugins to
 * import. When there is no host (a test), sends are simply dropped.
 */
let api: VsCodeApi | null | undefined;

function hostApi(): VsCodeApi | null {
  if (api === undefined) {
    api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  }
  return api;
}

/** Typed send to the host; a no-op when running without one. */
export function post(msg: EditorToHost): void {
  hostApi()?.postMessage(msg);
}

/** Typed subscription to host messages. */
export function onHostMessage(handler: (msg: HostToEditor) => void): void {
  window.addEventListener('message', (e: MessageEvent<HostToEditor>) => handler(e.data));
}

/** Convenience logger that surfaces in the host's OMD output channel. */
export function log(level: 'info' | 'warn' | 'error', message: string): void {
  post({ type: 'log', level, message });
}
