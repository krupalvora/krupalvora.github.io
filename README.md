# Portfolio - Krupal Vora

Bright, business-facing personal site for **Krupal Vora**, Senior Software Engineer
(ERP & Cloud Architecture). Built with plain **HTML, CSS, and vanilla JavaScript** -
no framework, no build step - and deployed on **GitHub Pages**.

## How it works

All copy and metrics live in **`content.json`**. `script.js` fetches that file and
renders every section into the semantic shell in `index.html`. To update text,
numbers, services, case studies, skills, or links, **edit `content.json` only** - no
need to touch the layout or styles.

### Files

| File | Purpose |
|------|---------|
| `index.html` | Semantic page shell + static SEO `<head>` (meta, Open Graph, Twitter, JSON-LD). The hero headline is baked in for crawlers/no-JS readers. |
| `content.json` | **Single source of content.** Edit this to update the site. |
| `script.js` | Renders `content.json` into the page; powers the nav and scroll behavior. |
| `styles.css` | Bright, professional theme. WCAG AA contrast on white; fully responsive. |
| `favicon.svg` | "KV" monogram favicon. |
| `llms.txt` | Plain-text profile mirror for AI agents / LLMs. |
| `robots.txt`, `sitemap.xml` | SEO crawl directives. |
| `assets/` | Headshot (`kv_headshot.jpg`), OG image (`kv_og.jpg`), resume PDF, brand logos. |
| `build-resume/` | Resume builder at `/build-resume` - see below. Self-contained (`index.html`, `app.js`, `builder.css`); reuses the site's design tokens from `styles.css`. |

## Resume builder - `/build-resume`

A private, client-side resume editor. Nothing is uploaded: the draft lives in the
browser's `localStorage` and autosaves on every keystroke.

- **Import** an existing resume by dropping a file or pasting text:
  - `.pdf` - text is extracted with [pdf.js](https://mozilla.github.io/pdf.js/)
    (loaded from cdnjs on demand) and parsed into the form. PDFs carry no
    bold/italic information, so re-add `**bold**` lead-ins after importing.
  - `.txt` / `.md` - parsed with the same section-aware parser.
  - `.json` - a file previously exported from the builder (lossless round-trip).
- **Edit** every field with a live A4 preview beside the form. Sections and the
  entries inside them can be reordered or removed. Unrecognised headings (e.g.
  "OPEN SOURCE CONTRIBUTIONS") import as custom sections, and new ones can be
  added.
- **Format** inline, in any bullet, title, heading or the summary:
  - `**bold lead-in**` → **bold lead-in**
  - `[PR #51644](https://github.com/frappe/erpnext/pull/51644)` → a link
  Links print as real PDF link annotations (clickable in the exported PDF) and
  flatten to `label (url)` in the plain-text export. Only `http(s)` and `mailto`
  URLs are linked; anything else renders as plain text.
- **Download PDF** prints the preview via the browser's print dialog
  ("Save as PDF"), so the output is real selectable text at A4 - not an image.
  `Cmd/Ctrl+S` does the same. **Export** also offers `.json` (the editable
  source of truth - keep this for future updates) and `.txt`.

### ATS notes

The printed PDF is built to survive resume parsers: single column, no tables,
text boxes, columns, images or icons, standard uppercase section headings, real
`<h1>`/`<h2>`/`<ul>` structure, and dates in `Mon YYYY - Mon YYYY` form.

Two details are deliberate rather than incidental:

- **Bullet glyphs are literal `•` characters**, not CSS `list-style` markers.
  Chrome omits `::marker` from a printed PDF's text layer, so a parser would see
  bullet text with no bullets - and the builder could not re-import its own PDF.
- **Links keep their label as the visible text**, so extraction yields
  "PR #51644" rather than a raw URL in the middle of a sentence.

When printing, turn **off** "Headers and footers" in the browser's print dialog -
otherwise Chrome stamps the page URL and date onto the PDF, which parsers read as
resume content. For a maximally conservative submission, use the `.txt` export.

Verified by extracting the printed PDF with pdf.js: coordinate-aware extraction
(what pdftotext / Apache Tika / PyMuPDF do) returns the resume in reading order,
one line per visual line, bullets included. Re-importing the tool's own printed
PDF reproduces every section, role, date, sub-group and bullet.

The page is `noindex` and excluded in `robots.txt`; it is deliberately not linked
from the site nav. To link it, add an entry to `content.json` → `nav`.

## SEO & AI-agent ("MCP") readiness

- Static `<title>`, meta description, canonical, Open Graph + Twitter Card tags.
- **JSON-LD** structured data (`Person` + `ProfilePage`) embedded in the HTML head.
- `llms.txt` - an LLM-readable plain-text profile (linked via `<link rel="alternate">`).
- `content.json` doubles as a clean, machine-readable profile endpoint.
- `sitemap.xml` + `robots.txt`.

> Note: true Model Context Protocol (MCP) needs a running server, which GitHub Pages
> can't host. The files above make the site maximally ingestible by SEO crawlers and
> AI agents on static hosting.

## Trust-bar logos

The "Experience across" bar renders text wordmarks by default. To switch to image
logos, drop files into `assets/logos/`, set each item's `logo` path in
`content.json` → `trustBar.items`, and set `trustBar.useLogos` to `true`.
(`frappe.png` and `hdfcergo.png` are already included.)

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Open `index.html` directly via `file://` won't work - the `fetch('content.json')`
call needs to be served over HTTP.)

## Deploy (GitHub Pages)

Push to the `krupalvora.github.io` repo's published branch. In **Settings → Pages**,
set the source to that branch's root. The site serves at `https://krupalvora.github.io/`.
