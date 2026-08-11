# End-user guides (screenshots + PDF)

Automated user guides driven by Playwright screenshots and localized prose.

## Documentation tree (plan)

Every build produces a **multi-guide tree** from [`docs-automation/guide-catalog.mjs`](../../docs-automation/guide-catalog.mjs). Do not hardcode the tree only in markdown — edit the catalog; assemble regenerates structure.

```
POSR Documentation
│
├── 📘 Employee Guide
│   ├── Login
│   ├── Menu
│   ├── Cart
│   ├── Payment
│   ├── Orders
│   ├── Session
│   ├── Settings
│   ├── Tables and dine-in (deep dive)   [planned]
│   └── Security re-authentication        [planned]
│
├── 📗 Manager Guide
│   ├── Summary                           [planned]
│   ├── Kitchen                           [planned]
│   ├── Order display                     [planned]
│   ├── Delivery                          [planned]
│   ├── Closing                           [planned]
│   ├── Reports (operations)              [planned]
│   └── Tip oversight                     [planned]
│
├── 📙 Inventory Guide
│   └── … stock, purchases, issues, wastes, counts [planned]
│
├── 📕 Accounts Guide
│   └── … expenses, ledgers [planned]
│
├── 📒 HR Guide
│   └── … employees, attendance, leave, tips [planned]
│
└── 📓 Administrator Guide
    └── … Manage, integrations, reports hub [planned]
```

See also [`STRUCTURE.md`](STRUCTURE.md) (refreshed on every `docs:guide:assemble`).

### Build output layout

| Path | Description |
|------|-------------|
| `dist/{lang}/index.html` | Hub — full tree + links to all guides |
| `dist/{lang}/index.md` | Hub markdown |
| `dist/{lang}/{guide}/user-guide.html` | Role guide (e.g. `employee`, `manager`) |
| `dist/{lang}/{guide}/user-guide.md` | Role guide markdown |
| `dist/{lang}/{guide}/posr-*-guide.pdf` | One PDF per role |
| `dist/{lang}/posr-documentation-hub.pdf` | Hub PDF |
| `dist/{lang}/user-guide.html` + `posr-user-guide.pdf` | **Legacy** employee-ready chapters only |

Guide titles/intros: `locales/{lang}/guides.json`. Chapter body: `locales/{lang}/{chapter}.json`. Chapter membership: `guide-catalog.mjs`.

## Coverage progress

| Wave | Guide | Chapter | Status |
|------|-------|---------|--------|
| 0 | Employee | Login | Done |
| 0 | Employee | Settings (all cards on Settings page) | Done |
| 1 | Employee | Menu & order taking | Done |
| 1 | Employee | Cart | Done |
| 1 | Employee | Payment screen | Done |
| 1 | Employee | Orders | Done |
| 1 | Employee | Session lock / logout / clock | Done |
| 1 | Employee | Tables / dine-in (deep dive) | Todo |
| 1 | Employee | Security re-auth | Todo |
| 2 | Manager | Summary, Kitchen, Order display | Todo |
| 2 | Manager | Delivery, Closing | Todo |
| 2 | Manager | Ops reports / tip oversight | Todo |
| 3 | Admin | Settings advanced / Manage-only options | Todo (Settings page cards documented under Employee) |
| 4 | Admin | Manage overview + tabs | Todo |
| 5 | Inventory | Inventory modules | Todo |
| 6 | Accounts / HR | Accounts + HR + tip distribution | Todo |
| 7 | Admin | Reports hub + packs | Todo |
| 8 | Admin | Integrations | Todo |

## Contents

| Path | Description |
|------|-------------|
| [`locales/`](locales/) | Guide copy JSON for all app languages (`guides.json` + chapters) |
| [`images/{lang}/`](images/) | Per-language UI screenshots |
| [`STRUCTURE.md`](STRUCTURE.md) | Tree snapshot from catalog |
| [`LOGIN.md`](LOGIN.md) … [`SESSION.md`](SESSION.md) | English browse chapters (employee-ready keys) |
| `dist/{lang}/` | Generated hub + guides + PDFs (*gitignored*) |
| [`docs-automation/guide-catalog.mjs`](../../docs-automation/guide-catalog.mjs) | **Source of truth** for guides and chapters |
| [`docs-automation/`](../../docs-automation/) | Playwright, assemble, PDF |

## Prerequisites

1. App stack running (SurrealDB + frontend).
2. Frontend: `npm run dev` (default `http://localhost:5173`).
3. One-time Chromium: `npx playwright install chromium`
4. Super-admin PIN (`DOCS_LOGIN_PIN`, often `5555`).
5. **Demo data required for Menu/Cart/Payment screenshots** (otherwise capture fails on purpose):
   - At least one **floor** with **tables**
   - Active **menus** with **categories** and **dishes**
   - At least one **payment type** (e.g. Cash)
   - Table selection visible (Settings → Table selection = not hidden)
6. Capture always runs **Reload cache** automatically before menu/payment shots.

> Capture **never** uses tableless mode. Capture does **not** complete (settle) orders.  
> Screenshots are taken **in the same UI language** as the guide chapter and stored under `images/{lang}/`.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `DOCS_BASE_URL` | `http://localhost:5173` | App origin |
| `DOCS_LOGIN_PIN` | `5555` | PIN for authenticated shots |
| `DOCS_USERNAME` / `DOCS_PASSWORD` | _(empty)_ | Optional form login credentials |
| `DOCS_GUIDE_LANG` | _(all langs)_ | Single language for capture (e.g. `es`, `pt-BR`) |
| `DOCS_GUIDE_LANGS` | all 10 | Comma list, e.g. `en,es,de` (ignored if `DOCS_GUIDE_LANG` set) |

## Regenerate

```bash
# Capture screenshots (can take ~30–60+ minutes for all languages)
DOCS_LOGIN_PIN=5555 npm run docs:guide:capture

# Assemble hub + 6 role guides (MD/HTML) and print PDFs
npm run docs:guide
# same as: npm run docs:guide:assemble && npm run docs:guide:pdf
```

Open: `docs/user-guide/dist/en/index.html` (hub). Role PDFs: `dist/en/employee/posr-employee-guide.pdf`, etc.

If capture fails with “No floor tables”, “No dishes”, or “No payment types”, fix demo data and reload cache, then re-run. Until a language is re-captured, assemble falls back to English UI images and notes that in the PDF.

## Chapters captured so far (Employee guide)

**Login** — PIN, form, method toggle  
**Settings** — nav, overview, all page cards: What’s new, cache, language, translate receipts, printers, print options, menus, service charges, closing cycle, auto check close, session security, auto clock-out, inclusive prices, currency symbol, on-screen keyboard, table selection, inventory, items visibility  
**Menu** — floor, table tile, covers pad (if enabled), ordering overview, categories, dishes  
**Cart** — cart with line items, To kitchen / Pay / Cancel  
**Payment** — tax/discount/coupon/service/tip require OK or Apply; tender panel  
**Orders** — list, filters, card, actions  
**Session** — lock, logout, clock  

## Maintenance

| Change | Action |
|--------|--------|
| UI layout | `docs:guide:capture` (langs), commit `images/{lang}/` |
| Wording | Edit `locales/{lang}/*.json`, then `docs:guide` |
| New chapter in a guide | Add JSON locales + Playwright story; **add key to `GUIDES` in `guide-catalog.mjs`** |
| New role guide | Add entry to `GUIDES` + `locales/*/guides.json` titles |
| Structure snapshot | Runs automatically in assemble → `STRUCTURE.md` |

## Notes

- Capture sets the app language via `app-page` localStorage (`DOCS_GUIDE_LANG`).
- Guide prose and screenshots are both per language under `locales/` and `images/`.
- Menu item **names** still come from your catalog (may stay in the language they were created).
- `dist/` is gitignored; share PDFs from local builds or CI.
- Images under ~2.5 KB are treated as failed captures and are not embedded in PDF.
- Planned chapters without locale JSON render as **Coming soon** so the tree stays complete every build.
