# securemycameras.com — Project Context

## What this is
An Astro site on Cloudflare Workers for **securemycameras.com**.
Sells the **Secure Camera Setup Guide** — a 22-page PDF for non-technical homeowners. One-time purchase at **$19**.

## Stack
- **Framework:** Astro 5 (static output) + standalone Cloudflare Worker (`src/worker.ts`)
- **Interactive:** React (quiz component only, Astro island via `client:load`)
- **Styling:** Tailwind CSS (new pages) + inline CSS (landing page)
- **Hosting:** Cloudflare Workers + Assets (NOT Pages — Pages is deprecated)
- **Config:** `wrangler.toml`, `astro.config.mjs`
- **Checkout:** Paddle (overlay checkout via `Paddle.Checkout.open()`)
- **Email:** Kit (ConvertKit) — quiz email gate
- **File delivery:** R2 bucket `securemycameras-files`
- **Deploy:** GitHub Actions → `astro build && wrangler deploy` on push to main
- **Contact:** inquiry@salishsecurity.ai

## Architecture
Astro builds static HTML/JS into `./dist`. The Worker (`src/worker.ts`) handles API routes (`/api/subscribe`, `/api/paddle-webhook`, `/api/download`) and falls through to `env.ASSETS.fetch(request)` for static assets. This matches the salish-ai-security-lab pattern.

## Design system (landing page)
Light warm stone theme — different from salishsecurity.ai's dark theme.

| Token | Value |
|---|---|
| `--bg` | `#FAFAF9` |
| `--surface` | `#FFFFFF` |
| `--text-primary` | `#1C1917` |
| `--text-secondary` | `#57534E` |
| `--danger` | `#DC2626` |
| `--success` | `#059669` |
| `--border` | `#E7E5E4` |

Fonts: DM Sans (body), Space Mono (mono/labels)

## Design system (quiz)
Dark hacker theme — self-contained in the React component.

Background: `#0C0F14`. Fonts: JetBrains Mono + Outfit.

## Pages
| Route | File | Purpose |
|---|---|---|
| `/` | `src/pages/index.astro` | Landing page — hero, fear, what's inside, proof, for-who, pricing, FAQ |
| `/quiz` | `src/pages/quiz.astro` | Camera security quiz (React island) |
| `/success` | `src/pages/success.astro` | Post-purchase download page |
| `/legal/privacy` | `src/pages/legal/privacy.astro` | Privacy policy |
| `/legal/terms` | `src/pages/legal/terms.astro` | Terms of service |

## API Routes (handled by `src/worker.ts`)
| Route | Purpose |
|---|---|
| `POST /api/subscribe` | Quiz email → ConvertKit |
| `POST /api/paddle-webhook` | Paddle purchase → ConvertKit tag |
| `GET /api/download` | Serve PDF from R2 |

## Secrets (via `wrangler secret put`)
- `PADDLE_WEBHOOK_SECRET`
- `CONVERTKIT_API_SECRET`
- `CONVERTKIT_PURCHASE_TAG`
- `KIT_API_KEY`
- `KIT_FORM_ID`

## GitHub
- Repo: `salish-security/securemycameras`
- Deploy: push to `main` triggers `.github/workflows/deploy.yml`
- Repo secrets needed: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

## Pending
- [ ] Set Paddle client token + price ID in `index.astro` (replace `PADDLE_*_PLACEHOLDER`)
- [ ] Create Paddle product ($19 one-time)
- [ ] Create ConvertKit form + purchase tag
- [ ] Set Cloudflare secrets via `wrangler secret put`
- [ ] Set GitHub repo secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [ ] Create R2 bucket: `wrangler r2 bucket create securemycameras-files`
- [ ] Upload PDF: `wrangler r2 object put securemycameras-files/secure-your-cameras-guide.pdf --file=...`
- [ ] Add custom domain `securemycameras.com` in Cloudflare Workers
- [ ] Add Cloudflare Web Analytics script tag
