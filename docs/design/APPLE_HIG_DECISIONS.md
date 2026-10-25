# Hilal UI decisions and Apple HIG research

Date: 2026-10-23

## Source retrieval

Requested entry point: https://developer.apple.com/tutorials/data/design/human-interface-guidelines.json

Retrieval was attempted with the web tool and Python HTTPS. The web tool reported that the URL was inaccessible; HTTPS failed with `Temporary failure in name resolution`. No official JSON content was retrieved. No section slugs or quotations are claimed as verified. Layout, typography, color, materials, lists/tables, and navigation section URLs must be discovered from the actual JSON index when network access is restored.

The decisions below use established interface design principles, adapted to a desktop-first administration product. They are not presented as sourced quotations or verified Apple requirements.

## Decisions

| Area          | Decision                                                                                                   | Reason                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Layout        | Fixed desktop navigation; a single main content column; compact modal navigation below 1000px              | Keep daily tasks predictable while preserving content space on tablets and phones.          |
| Typography    | Local system stack, with Azerbaijani text and a restrained 12–32px operational scale                       | Readable text without remote font downloads. The login brand statement uses a larger scale. |
| Color         | Burgundy brand, warm near-white canvas, white working surfaces                                             | Keep the official Hilal identity recognizable and status colors distinct.                   |
| Materials     | Solid surfaces, subtle tinted shadows, blur only behind modal dialogs                                      | Hierarchy without decorative glass or competing layers.                                     |
| Tables        | Semantic table, search, contact filters, local pagination and contained horizontal scroll on small screens | Preserve comparable columns and honest backend capabilities.                                |
| Navigation    | Exact active route, Azerbaijani labels, legacy redirects, breadcrumbs                                      | Avoid broken links and multiple highlighted sidebar items.                                  |
| Accessibility | Visible focus, native modal focus handling, real labels, live errors, 44px mobile controls, reduced motion | Support keyboard, screen readers, and touch.                                                |
| Data          | Only API branch counts; no invented revenue, trends, user counts, or charts                                | Statistics must describe real available data.                                               |

## Official branding

The user supplied the official Hilal Kursları image. It was copied byte-for-byte from `/tmp/codex-clipboard-uCCuqp.png` to `apps/web/public/branding/hilal-logo.png`. The 400×400 image retains its original pixels, white background, proportions, and color. Its dominant burgundy is approximately RGB(72,15,48), alongside the requested primary #480830.

## Integration boundaries

The existing NestJS routes and response shapes are unchanged. Next.js proxies `/api/*` to `API_ORIGIN` (default `http://127.0.0.1:3001`). The client consumes the actual `{access_token}` response and `/auth/me`. Tokens stay in React memory and disappear on reload. Persistent sessions are disabled honestly until backend refresh support exists.

Role-based UI controls are usability restrictions only. They do not replace missing backend guards. No database changes or deployment are included.
