# Media

OMD gives images, video, and galleries a rich editing UX — resize handles, alignment, captions —
all stored in **GitHub-renderable coexistence forms**. Hover any image for its controls.

<!-- omd:toc {"ordered":false,"maxLevel":"2"} -->

## Local media linking

Media doesn't have to be remote. This image is a **local file** in this wiki, referenced with a
relative path (`media/sample-wide.svg`) — it travels with the repo and renders on GitHub:

![A local sample image](media/sample-wide.svg)

## Sizing

A bare `![](…)` stays plain markdown. The moment you resize it, OMD writes a GitHub-honored
`<img width>` — still just an image to any reader:

<img src="media/sample-wide.svg" width="320" alt="Sized to 320px">

## Captions

A caption wraps the image in a `<figure>` / `<figcaption>` (GitHub renders both):

<figure>
  <img src="media/sample-wide.svg" width="420" alt="Captioned sample">
  <figcaption>A captioned figure — the caption is editable inline.</figcaption>
</figure>

## Alignment

Alignment reuses the `<div align>` form GitHub understands. Here the image is centered:

<div align="center">

<img src="media/omd-logo.svg" width="140" alt="Centered logo">

</div>

## YouTube

The YouTube block renders a resizable, alignable, captionable thumbnail "player". On disk it keeps a
plain linked thumbnail so GitHub shows a clickable preview; `width`/`caption` live in the shortcode
and alignment in the `<div align>` wrapper:

<div align="center">

<!-- omd:youtube {"url":"https://youtu.be/dQw4w9WgXcQ","width":"480","caption":"A captioned, centered video"} -->

[![Watch on YouTube](https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg)](https://youtu.be/dQw4w9WgXcQ)

<!-- /omd:youtube -->

</div>

## Gallery

A responsive image grid. In OMD each thumbnail has a hover **remove** button and there's an **Add
image** control; on disk it's just a set of images GitHub lays out inline:

<!-- omd:gallery {"columns":"3"} -->

![](media/sample-wide.svg)![](media/omd-logo.svg)

![](media/sample-wide.svg)![](media/omd-logo.svg)

![](media/sample-wide.svg)![](media/omd-logo.svg)

<!-- /omd:gallery -->

---

_Next: [[Tables]] →_
