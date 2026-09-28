# Design system

Shared components live in `packages/ui` (consumed as source by the web app); tokens live in
`apps/web/src/app/globals.css`.

## Tokens

| Token                  | Use                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `brand-50 … brand-950` | ARC blue — primary actions, active states, links (`brand-600` = primary)                                                  |
| `ink-50 … ink-950`     | Cool neutral — text (`ink-900`), secondary text (`ink-500`), borders (`ink-200`), page bg (`ink-50`), sidebar (`ink-950`) |
| Accent                 | `cyan-400/500` for the IoT accent in gradients only                                                                       |
| Status                 | emerald = success/active, amber = warning, rose = danger/suspended, sky/violet = info                                     |
| Font                   | Geist Sans / Geist Mono (bundled via the `geist` package, no network needed)                                              |
| Radius                 | inputs & buttons `rounded-lg`, cards `rounded-2xl`, dialogs `rounded-2xl`                                                 |

## Components (`@arc/ui`)

`Button` (primary · secondary · ghost · destructive · destructive-outline · link; sizes sm · md · lg · icon),
`Card` (+ Header/Title/Description/Content/Footer), `Badge` (tones), `Input` (leading/trailing adornments),
`Select`, `Textarea`, `Field` (label + hint + error), `Dialog`, `DropdownMenu`, `Tabs`, `Avatar`
(initials, stable colour or brand colour), `Skeleton`, `EmptyState`, `Progress`, `cn()`.

## App patterns (`apps/web/src/components`)

- `shell/AppShell` — auth gate, sidebar (role-aware `shell/nav.ts`), topbar with org switcher and user menu.
- `shell/PageHeader` — title, description, breadcrumbs, actions. Every page starts with it.
- `dashboard/StatCard` — KPI tile. Use `grid-cols-2 xl:grid-cols-4`.
- Lists: Card > toolbar (segmented status + search + filter) > table > pagination; `EmptyState` when empty.
- Forms validate on the client with the **same zod schema** the API uses (`@arc/validation`), show errors inline, and toast on success.
- Loading states use `Skeleton`, never spinners for whole pages.

## Rules

- Business rules are enforced by the API; the UI only hides what a role can't do.
- New navigation items go in `shell/nav.ts` with the permission that unlocks them.
