# Admin panel override (`apps/web` /admin)

This file wins over [MASTER.md](../MASTER.md) for the admin panel. MASTER describes the customer storefront; the admin panel is an operations console for staff and needs a denser system.

Values live in `apps/web/src/components/admin-ui/admin.css` (Foundations) and `ops.css` (this layer, loaded after it). Components use the `--fx-*` tokens only.

## 1. Direction

**Data-dense operations console**, chosen with the ui-ux-pro-max skill (style: Data-Dense Dashboard).

- Flat and crisp. Hierarchy comes from weight, hairlines and colour blocks. No solid "shelf" shadows and no 3D key buttons.
- Elevation only on what floats: popovers, dialogs, drawers, toasts (`--fx-elevate`).
- Dense but readable: 38px buttons, 40px inputs, 10px table cell padding, 13–14px text.
- The dashboard is a **command center**: today's numbers, an action inbox, order aging, the runs on the road, then trends.

Avoid: made-up numbers (a block with no data says so), "live" without a fresh source, colour as the only signal.

## 2. Colour

| Token | Use |
|---|---|
| `--fx-primary` / `--fx-primary-text` | Actions, links, the active tab underline. |
| `--fx-primary-soft` | Icon tiles, the active bottom-nav item. |
| `--fx-gold` | Needs you: counts on the nav and the bell, the active sidebar rail, financial confirm buttons. |
| `--fx-live` | The pulsing "Live" dot, shown only while dashboard summaries are fresh. Stale turns it amber. |
| `--fx-viz-good/warning/serious/critical` | Order aging bands and run progress. Always paired with a label. |
| Status tints (`--fx-*-bg`, `--fx-*-text`) | Badges and inbox icons. |

Every text pair passes WCAG AA in light and dark. The focus ring is a two-tone ring (surface gap, then primary) so it keeps 3:1 on every surface.

## 3. Type

- Inter for interface and tables; Space Grotesk (`--fx-font-display`) for the wordmark and KPI values.
- All numbers use tabular figures (`.fx-num`).
- Labels: 10.5px uppercase, tracked. Body: 13.5–14px.

## 4. Patterns

| Pattern | Where | Rule |
|---|---|---|
| KPI strip | Command center | 6 tiles at 1280px+, 3 on tablet, 2 on phones. A tile that has somewhere to go is a link. |
| Action inbox | Command center | Approvals, returns, COD recovery and transfers in one list: urgent first, then oldest first. Filter chips show counts. |
| Underline tabs | Every module with several views | One row, scrolls sideways on phones. |
| Maker-checker | Approvals, returns, payouts, commission publish | The confirm dialog asks for a written reason, kept in the audit log. |
| Gold count | Sidebar, bell | Real counts from the API only; first page, so "100+" when there are more. |

## 5. Motion

- 100–180ms ease-out for hover and press; presses scale and never move the layout.
- The live dot pulses; the refresh icon spins while loading.
- `prefers-reduced-motion` stops every animation and transition in this layer.
