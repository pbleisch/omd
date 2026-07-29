# Example smart blocks

Two worked, copy-start smart blocks. Neither is shipped with OMD — they exist to show the file
shape and the two trust tiers an author can use. The full walkthrough is
[`docs/contributing/AUTHORING-SMART-BLOCKS.md`](../../docs/contributing/AUTHORING-SMART-BLOCKS.md).

| Block | Kind | Tier | Shows |
|---|---|---|---|
| [`badge/`](badge/) | leaf | `template` | An eval-free string template with `{{param}}` interpolation and inline styling. |
| [`metric/`](metric/) | leaf | `sandboxed` | Author `render.js` building DOM from `params` in the isolated iframe. |

## Try one

Copy a block's directory into the discovery path for your workspace or user profile:

```bash
# workspace-local (shared with the repo, shadows a user or shipped block of the same name)
mkdir -p .omd/blocks && cp -r examples/blocks/badge .omd/blocks/

# or personal (your home directory, available in every workspace)
mkdir -p ~/.omd/blocks && cp -r examples/blocks/metric ~/.omd/blocks/
```

Reopen the `.md` file (discovery runs per document); the block appears in the slash menu under its
`group`. A workspace block shadows a user block shadows a shipped one, by `name`.
