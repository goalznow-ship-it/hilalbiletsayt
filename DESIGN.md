# Design

Source of truth for Hilal Bilet Sistemi UI. Read before changing the interface.

## Aesthetic direction

Calm professional administration: deep burgundy navigation, warm ivory canvas, crisp white surfaces, compact and deliberate typography.

## Dials

- Design variation: 5/10; product consistency takes priority.
- Motion: 2/10; functional feedback only.
- Density: 6/10; daily desktop work with responsive mobile fallbacks.

## Brand and tokens

- Official image: `apps/web/public/branding/hilal-logo.png`; preserve all pixels and proportions.
- Primary #480830; secondary burgundy #702047; observed logo burgundy #480F30.
- Central tokens and Tailwind mapping: `apps/web/src/app/globals.css`.
- System font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif.
- Spacing: 4/8/12/16/20/24/32/40/48px. Controls: 42–50px, at least 44px on mobile.
- Radius: 6px badges, 10px controls, 14px panels, 18px feature surfaces and dialogs.
- Semantic states use text plus icon/dot; color is never the only signal.
- Shadows are burgundy-tinted and subtle. Respect reduced-motion preferences.

## Layout and components

- Sidebar: 256px desktop, 218px compact desktop; modal Sheet below 1000px.
- Main pages: PageHeader, EmptyState, ErrorMessage, StatusBadge, existing Base UI Button/Input/Skeleton/Sheet and a keyboard-accessible profile Menu.
- Branches: native modal dialogs; semantic table with contained horizontal scrolling; contact filters; local pagination of active records.
- Login: split burgundy/white composition; compact brand on phones; password toggle and explicit form errors.
- Dashboard: API branch count, unavailable metrics labeled, no fabricated charts.
- Unimplemented modules share an honest development placeholder.

## Integration and limits

- Keep NestJS API contracts unchanged. API requests use same-origin `/api` proxy.
- Access token only in memory. Refreshing loses session; no persistent-login promise.
- Backend remains responsible for role and branch authorization. Existing backend audit defects are not repaired by styling.
- System fonts and installed Lucide icons; no new dependencies.

## Research

See `docs/design/APPLE_HIG_DECISIONS.md`. Official HIG JSON could not be retrieved because network access failed.

Last updated: 2026-10-23.

## V2 refinement

- Use the requested warm ivory #F8F4F6 canvas. Supporting text is at least 12px; primary body text is 15px, navigation 14px, section titles 17px, and KPI values 38px.
- Group navigation into administration, examination processes, and system. Upcoming modules remain usable links to honest placeholders, with a distinct muted treatment and screen-reader status.
- Keep the header at 68px. Use a semantic breadcrumb and retain the existing profile and branch controls.
- The dashboard banner uses only concentric line work, removing the tilted decorative icon and artificial numerical index.
- Login keeps the split layout, with a 380px form, 50px fields, restrained burgundy line work, and a compact branded mobile view.
- Existing authentication, API, session lifetime, branch operations, and logo pixels remain unchanged.
