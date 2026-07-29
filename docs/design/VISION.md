# OMD — Vision

Editing a markdown file should feel like editing a page in Confluence or Notion —
and the file on disk should still be plain markdown that renders on GitHub with
nothing installed.

**To get there we need to make it so you edit the document, not its source.** No raw `**`, no visible HTML comments, no
"click to preview." What has a rendered form is shown rendered. The markup is machinery;
the writer never has to see it.

To do that we have to set some limits and make some tradeoffs.  

**The round-trip is critical.** Open a file, save it without editing, and it comes back
byte-for-byte. Everything the editor offers has to survive the return to clean
GitHub-flavored markdown. A feature that dazzles on screen but doesn't round-trip has
failed, however good it looks.

Yet we need to hide the details somewhere.  So ODM uses some custom markup tags hidden in HTML comments within the markdown document.  If your other editors or renderers don't ignore HTML comments then OMD-flavored markdown documents will have some extra visible goo. 

## For whom

Engineers and teams who keep their docs in the repo and work in VS Code.

Those that want the best of both visual editors and accessible text documents.

## Not this

- Not a new file format — the artifact is always a valid `.md` file.
- Not a preview pane beside source — you edit the rendered document directly.
- Not an AI tool — OMD is a surface for a person writing. No model is assumed present or
  required; AI is one opt-in block, off by default.

## The taste to aim for

The rich blocks of Confluence with the quiet restraint of Linear: controls stay hidden
until the cursor asks for them. When a behavior is unclear, ask two questions — *what
would a careful writer prefer?* and *does it still round-trip?* If you can't answer both,
keep searching.
