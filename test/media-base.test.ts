import { describe, it, expect, afterEach } from 'vitest';
import { setMediaBase, resolveMediaSrc } from '../src/webview/blocks/media-base';

describe('resolveMediaSrc', () => {
  afterEach(() => setMediaBase(''));

  it('joins a relative path to the media base', () => {
    setMediaBase('https://file+.vscode-resource.vscode-cdn.net/ws/showcase');
    expect(resolveMediaSrc('media/logo.svg')).toBe(
      'https://file+.vscode-resource.vscode-cdn.net/ws/showcase/media/logo.svg'
    );
    expect(resolveMediaSrc('./media/logo.svg')).toBe(
      'https://file+.vscode-resource.vscode-cdn.net/ws/showcase/media/logo.svg'
    );
  });

  it('resolves ../ against the base', () => {
    setMediaBase('https://host/ws/pages');
    expect(resolveMediaSrc('../assets/x.png')).toBe('https://host/ws/assets/x.png');
  });

  it('leaves absolute and data srcs untouched', () => {
    setMediaBase('https://host/ws/showcase');
    expect(resolveMediaSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(resolveMediaSrc('http://example.com/a.png')).toBe('http://example.com/a.png');
    expect(resolveMediaSrc('data:image/svg+xml,<svg/>')).toBe('data:image/svg+xml,<svg/>');
  });

  it('is a no-op when no base is set (harness / first paint)', () => {
    expect(resolveMediaSrc('media/logo.svg')).toBe('media/logo.svg');
  });
});
