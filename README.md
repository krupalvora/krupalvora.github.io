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
