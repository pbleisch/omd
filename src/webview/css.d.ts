// CSS-as-text: esbuild's `text` loader turns a `.css` import into a string.
declare module '*.css' {
  const content: string;
  export default content;
}
