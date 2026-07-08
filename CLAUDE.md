# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Lloope v1 is a fully static (HTML + CSS + JavaScript) product catalog and admin panel for a Chilean CNC woodwork shop. There is no backend, no framework, no build step, and no package manager. All source is in a handful of plain files. Customer accounts, order history, and the admin login are the one exception — they optionally use Supabase (Postgres + Auth) called directly from the browser via RLS (see "Supabase integration" below). The only serverless code in the repo is `api/config.js`, a single zero-config Vercel function that exposes infrastructure config (Supabase URL/anon key, lloope-api URL) from environment variables — it doesn't touch data or auth logic, which remain entirely client-side against Supabase.

## Running locally

```
python -m http.server 8000
```

Then open `http://localhost:8000`. The public store (`index.html`) fetches `data/store.json` over HTTP — opening files via `file://` will cause that fetch to silently fail and fall back to `localStorage`/demo data, which is fine for admin work but differs from production behavior.

Admin login requires Supabase to be configured (see below) — without it, `admin.html` shows a clear "backend not configured" message instead of a login form.

## Architecture

### Data flow

```
Admin edits in admin.html
  → stored in localStorage (draft, browser-private)
  → "Publicar cambios" button downloads store.json
  → operator uploads store.json to hosting's data/ folder
  → index.html fetches data/store.json (all visitors see the update)
```

`orders` and `users` are **never** included in `store.json` (they stay private in the admin's browser). `payment.online.secretKey` is also stripped before publishing (see `Lloope.buildPublicBundle()`).

### Supabase integration (customer accounts + orders + admin login)

`lloope-data.js` exposes `Lloope.auth` (backed by a lazily-created `@supabase/supabase-js` client) for everything that needs a real shared source of truth instead of per-browser `localStorage`: customer signup/login, "Mis pedidos" (order history + status), and the admin panel's own login/role check. Config (`url`/`anonKey`/`apiUrl`) is data, not code — it's the `supabase` key (`Lloope.get('supabase')`), but it is **not editable from the admin UI**. It comes from environment variables set in the hosting dashboard (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LLOOPE_API_URL`), exposed to the browser by `api/config.js` (a zero-config Vercel serverless function) and fetched by `Lloope.fetchEnvConfig()`. `Lloope.loadPublicData()` calls this automatically and lets it override `store.json`/localStorage for those three fields; `admin.html`'s own `boot()` does the same before checking `Lloope.auth.isConfigured()`, caching the result into localStorage so every other admin call site that reads `Lloope.get('supabase')` keeps working unchanged. The admin UI (login screen, and Ajustes → Integraciones once logged in) only ever shows read-only status ("✓ Configurada" / "✗ Falta configurar") per variable — never an input field. `authMethod` (password/magiclink/otp for customer login) is the one part of this config that *is* still admin-editable, since it's a UX choice, not infrastructure. Public pages must call `Lloope.auth.init(DATA.supabase)` once in their own `boot()` after `loadPublicData()`. `Lloope.auth.isConfigured()` gates every call site; when false, `index.html`/`cart.html`/`producto.html` fall back to the original guest-profile-only behavior and `admin.html` shows a setup message (env vars still missing) instead of a broken login. See `PRODUCCION.md` §5 for the SQL schema (`profiles`, `orders`), RLS policies, and env var setup steps (SQL also mirrored in `Lloope.SUPABASE_SETUP_SQL` for the in-app Integraciones panel). On hosts without Vercel Functions (e.g. Cloudflare Pages) or in local dev, `fetchEnvConfig()` simply returns `null` and the site behaves as if no env vars were set — this is a graceful fallback, not an error.

Guest checkout (no account) is unaffected and still only sends a WhatsApp message — no Supabase row is created unless the customer is logged in.

### Key files

| File | Role |
|---|---|
| `lloope-data.js` | Shared data layer. Exposes `window.Lloope` with `get/set`, `loadPublicData()`, `fetchEnvConfig()`, `publish()`, cart, profile, and lead helpers. Also holds `LLOOPE_DEFAULTS` (seed data) and `LLOOPE_KEYS` (localStorage key map). |
| `index.html` | Public storefront. Hydrates from `data/store.json` → localStorage → `LLOOPE_DEFAULTS`. All CSS and JS are inline. Product cards link to `producto.html?id=X`. |
| `producto.html` | Standalone product detail page (gallery, price, meta, FAQ, add to cart) — replaces the old quick-view modal so each product has its own URL. |
| `cart.html` | Full cart page: quantity editing, coupon validation, boleta/factura toggle, WhatsApp checkout. |
| `faq.html` | General store FAQ (accordion), content managed in admin under Ajustes → Preguntas frecuentes. Linked from the footer. Separate from each product's own FAQ (`product.faq`). |
| `admin.html` | Admin panel (all sections: products, categories, images, contact, coupons, banners, orders, users, settings, etc.). |
| `api/config.js` | Vercel serverless function (zero-config). Exposes `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`LLOOPE_API_URL` env vars to the browser — see "Supabase integration" above. |
| `data/store.json` | The published snapshot visible to all visitors. Regenerated by "Publicar cambios". |

### localStorage keys

**Administrable content** (published in `store.json`): `lloope_settings`, `lloope_home`, `lloope_menu`, `lloope_products`, `lloope_categories`, `lloope_images`, `lloope_contact`, `lloope_cart_config`, `lloope_payment_config`, `lloope_legal_texts`, `lloope_coupons`, `lloope_banners`, `lloope_corp_logos`, `lloope_faq`, `lloope_field_options`, `lloope_welcome_popup`.

**Private admin data** (never published): `lloope_orders`, `lloope_users`.

**Visitor state** (each customer's browser, not admin): `lloope_cart_session`, `lloope_customer_profile`, `lloope_leads`, `lloope_used_coupons`.

### Design tokens

CSS variables are defined in `:root` inside `index.html`. Key palette: `--cream`, `--espresso`, `--wood` (`#B06B3E`), `--sage`. Three font families: `--serif` (Fraunces), `--sans` (Manrope), `--brand` (Jost).

## Known intentional limitations

- **Admin login** and **customer accounts** are real (Supabase Auth) only once `SUPABASE_URL`/`SUPABASE_ANON_KEY` are set as environment variables in the hosting dashboard (not admin UI, not code) — see `PRODUCCION.md` §5. Until then, admin login is disabled (not a fallback to hardcoded credentials) and customer accounts fall back to the old guest-profile mechanism.
- The `supabase` config key is deliberately excluded from `Lloope.resetAll()` ("Restaurar demo") — it's infrastructure config sourced from environment variables, not seed content.
- **Stock concurrency** cannot be enforced without a backend — overselling is mitigated by WhatsApp confirmation and a disclaimer on every order.
- **Single-use coupons** are enforced per-browser only (localStorage), not across devices.
- **Lead emails** from the welcome pop-up are stored locally only; no backend receives them unless EmailJS/Formspree/Brevo is wired into `submitLead()` in `index.html`.
- **Image uploads** are stored as base64 in localStorage; published `store.json` should use `img/...` relative paths or external URLs instead.

## Deployment

Recommended: **Cloudflare Pages** (static, free, HTTPS automatic, supports `_headers`, and enables Cloudflare Access for admin gating). Netlify is an equivalent alternative. See `PRODUCCION.md` for the full hosting, domain, and security guide.
