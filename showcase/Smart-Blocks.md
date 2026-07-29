Smart Blocks

Smart blocks are OMD's rich, interactive constructs. Each one is stored in a **coexistence form** —
a bit of GitHub-allowed HTML or a fenced comment — so a plain-markdown reader (GitHub, another
editor) still sees something sensible, while OMD renders the live block. Insert them from the `/`
slash menu.

<!-- omd:toc {"ordered":false,"maxLevel":"2"} -->

## Smart callouts

The OMD **smart callout** gives you a custom **title, icon, and colour** (icon + colour via the
hover property panel; the title is the bold first line). On disk it's a shortcode around a titled
blockquote, so GitHub shows a normal titled blockquote:

<!-- omd:callout {"icon":"light-bulb","color":"#a371f7"} -->

> **Pro tip**
>
> Title and body are real markdown; the icon and colour are the block's params.

<!-- /omd:callout -->

Plain GFM alerts (the five fixed types, no chrome) work too — see [[GFM Fidelity]].

## Collapsible

A real `<details>` element — GitHub folds it, and so does OMD (double-click the summary to rename):

<details>
<summary>Click to expand the details</summary>

Anything can go inside — **formatting**, lists, code, even other blocks.

- Fully editable
- Round-trips as native `<details>`

</details>

## Tabs

Tabbed panels, one visible at a time. On GitHub the panels simply stack; in OMD they're a tab strip:

<!-- omd:tabs {} -->

<!-- omd:tab {"label":"Install"} -->

Run `npm install`, then press <kbd>F5</kbd> to launch the extension host.

<!-- /omd:tab -->

<!-- omd:tab {"label":"Configure"} -->

Drop a block manifest into `.omd/blocks/` to add your own smart block.

<!-- /omd:tab -->

<!-- omd:tab {"label":"Use"} -->

Open any `.md` file — OMD is the default editor for markdown.

<!-- /omd:tab -->

<!-- /omd:tabs -->

## Columns

Side-by-side layout stored as a coexistence `<table>` (GitHub renders the columns as table cells):

<table><tr><td>

### Capture

Write in plain markdown, no lock-in.

</td><td>

### Enrich

Add blocks, media, and links inline.

</td><td>

### Share

Push to GitHub — it renders the same.

</td></tr></table>

## Chart

The chart block keeps its **data table** as the source of truth (and the GitHub fallback) plus a
cached SVG preview. OMD draws a live, interactive chart from the table; GitHub shows the SVG and the
table beneath it.

<!-- omd:chart {"type":"bar","title":"Quarterly revenue"} -->

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300" width="100%" role="img" aria-label="Quarterly revenue">
<style>.grid{stroke:#d0d7de}.tick{fill:#57606a;font:11px sans-serif}.title{fill:#1f2328;font:600 14px sans-serif}@media(prefers-color-scheme:dark){.grid{stroke:#30363d}.tick{fill:#8b949e}.title{fill:#e6edf3}}</style>
<text class="title" x="320" y="20" text-anchor="middle">Quarterly revenue</text>
<line class="grid" x1="46" y1="260" x2="626" y2="260"/>
<rect x="90" y="120" width="90" height="140" fill="#4daafc"/>
<rect x="240" y="80" width="90" height="180" fill="#4daafc"/>
<rect x="390" y="50" width="90" height="210" fill="#4daafc"/>
<rect x="540" y="70" width="60" height="190" fill="#4daafc"/>
<text class="tick" x="135" y="278" text-anchor="middle">Q1</text>
<text class="tick" x="285" y="278" text-anchor="middle">Q2</text>
<text class="tick" x="435" y="278" text-anchor="middle">Q3</text>
<text class="tick" x="570" y="278" text-anchor="middle">Q4</text>
</svg>

| Quarter | Revenue |
| ------- | ------- |
| Q1      | 120     |
| Q2      | 150     |
| Q3      | 170     |
| Q4      | 160     |

<!-- /omd:chart -->

## Link card

The link card caches a page's preview — title, description, site, image — in the shortcode and shows
a rich, clickable card. The body is a plain `[title](url)` link, so GitHub shows an ordinary link
while OMD draws the card. Metadata is fetched host-side only when you insert or refresh the card.

<!-- omd:linkcard {"url":"https://github.com","title":"GitHub · Change is constant. GitHub keeps you ahead.","description":"Join the world's most widely adopted, AI-powered developer platform where millions of developers, businesses, and the largest open source community build software that advances humanity.","image":"https://images.ctfassets.net/8aevphvgewt8/4pe4eOtUJ0ARpZRE4fNekf/f52b1f9c52f059a33170229883731ed0/GH-Homepage-Universe-img.png","site":"GitHub"} -->

[GitHub · Change is constant. GitHub keeps you ahead.](https://github.com)

<!-- /omd:linkcard -->

## AI block

The AI block runs an **embedded prompt** against a VS Code language model and caches the generated
markdown as its body — so GitHub shows the result and the file round-trips. It's **off by default**
(`omd.ai.enabled`), the host makes the call (the webview has no network), and it runs only when you
press **Run** — never on load. Set its context to `document` to include the whole page as context, or
`none` to send just the prompt.

<!-- omd:ai {"prompt":"Provide a list of 3-5 ways one can use the AI smart block in a document.  Be clever, make it useful.","scope":"document","model":"oswe-vscode"} -->

- **Content Generation**: Use the AI smart block to generate introductory paragraphs or summaries for sections of your document, saving time on writing and ensuring clarity.

- **Idea Brainstorming**: Leverage the AI block to brainstorm ideas for topics, headings, or themes relevant to your document, enhancing creativity and depth.

- **Code Snippet Creation**: Request the AI to generate code snippets or examples relevant to your content, providing practical illustrations for technical documents.

- **FAQ Section Development**: Utilize the AI block to create a list of frequently asked questions and their answers, improving the document's usability and addressing common queries.

- **Editing and Proofreading**: Ask the AI to review sections of your document for grammar, style, and coherence, helping to refine your writing and enhance professionalism.

<!-- /omd:ai -->

## Inline blocks

A resolved date token 📅 2026-07-26 renders as a chip. Footnotes[^sb] and a table of contents (top
of this page) are blocks too. See [[Media]] for the media blocks and [[Wiki Workflow]]
for inline references.

---

[^sb]: Inserted from the slash menu, stored as native GFM footnotes.

_Next: [[Media]] →_
