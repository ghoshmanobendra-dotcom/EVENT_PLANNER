# Event Planner — AI event planning assistant

Event Planner helps people plan **weddings, birthdays and community events**. Describe the event once and it builds a complete, personalised plan:

- **Budget**: a category-by-category split that always adds up to exactly your budget, with a money-saving tip for each line and a contingency reserve.
- **Timeline**: milestones with real calendar dates counted back from your event day. Anything already overdue is pulled forward and flagged "Do now".
- **Vendor checklist**: what to look for, questions to ask and a book-by date for each vendor. Ticks are saved in your browser.
- **Personalised ideas**: theme, decor, food, activities and guest-experience ideas, each explaining why it fits *your* event.
- **Refine**: ask for changes in plain words ("make it cheaper", "more eco-friendly") and the plan is revised, not restarted.
- **Save and print**: the plan stays in your browser between visits, and *Print / Save PDF* produces a clean printout.

Plans can be written in English, Hindi, Tamil, Bengali, Spanish or French, with amounts in INR, USD, EUR, GBP or AED.

## How it works

```
Browser (public/: static HTML, CSS and ES modules from the Vercel CDN)
  │  POST /api/plan
  ▼
api/plan.js — Vercel Function (Node 24)
  rate limit → size-capped JSON body → zod validation → cache
  → prompt → Gemini (structured JSON output) → zod validation
  → deterministic enrichment (budget amounts, calendar dates) → JSON
```

**The model does the judgment and code does the arithmetic.** Gemini chooses categories, relative budget weights, tasks and "weeks before the event" offsets. Pure functions in `lib/planner.js` turn the weights into amounts that sum exactly to the budget (largest-remainder rounding) and turn the offsets into dates. Language models are unreliable at both, so plans never contain totals that don't add up or dates that have already passed.

| Path | Responsibility |
|---|---|
| `api/plan.js` | HTTP handler; dependencies injected so tests can swap in a fake model and clock |
| `lib/schema.js` | zod schemas: request validation, model-output validation, and the JSON Schema sent to Gemini |
| `lib/prompt.js` | System instruction and prompt assembly, grounded by `lib/event-types.js` |
| `lib/gemini.js` | Gemini call: structured output, timeout, one retry on transient errors |
| `lib/planner.js` | Budget allocation and scheduling (pure) |
| `lib/cache.js`, `lib/rate-limit.js`, `lib/http.js` | Small infrastructure helpers |
| `public/index.html`, `landing.css` | Landing page at `/`: static HTML with no JavaScript |
| `public/plan.html`, `app.js`, `render.js` | The planner at `/plan`: accessible vanilla JS with no framework and no build step |

`cleanUrls` in `vercel.json` serves `plan.html` at `/plan`. The landing page's event cards link to `/plan?type=wedding` (or `birthday`, `community`) to preselect the event type.

Both pages were designed in **Google Stitch** and then hand-ported to semantic HTML and plain CSS. Stitch's export loads the Tailwind CDN, Google Fonts and remote images. The port keeps its palette and layout but uses system fonts and makes no third-party requests, so the strict CSP holds. `test/pages.test.js` checks this on every page.

## Run locally

Requires **Node ≥ 20.6** and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
# 1. Install dependencies (includes the dev server)
npm install

# 2. Create your local env file and fill in the keys
copy .env.example .env          # Windows
# cp .env.example .env           # macOS / Linux

# Edit .env and set at minimum:
#   GEMINI_API_KEY=<your key from aistudio.google.com/apikey>
#   RESEND_API_KEY=<your key from resend.com>
#   CONTACT_TO_EMAIL=<inbox for contact form submissions>

# 3. Start the dev server (auto-restarts on file changes)
npm run dev
# → http://localhost:3000
```

`npm test` and `npm run lint` need no API keys or network — they use fakes for Gemini and Resend.

```bash
npm test               # unit, handler and SDK tests; no network needed
npm run lint
```

`GEMINI_MODEL` optionally overrides the default model, `gemini-2.0-flash-lite`. It returns a full plan in about 7–14 s. `gemini-2.0-flash` takes 28–139 s, which is too slow for a 60 s function limit.

## Security

- The API key exists only on the server, as a Vercel environment variable. `.env*` files are git-ignored.
- Both trust boundaries are validated with strict zod schemas: user input (allowlisted enums, bounded numbers, a date window, length-capped text with control characters stripped, unknown keys rejected, 32 KB body cap) and model output (anything off-schema returns a 502 and is never forwarded).
- User text reaches the model only as JSON inside tagged data blocks, which the system instruction says to treat as data, never as instructions.
- The UI renders with `textContent` only and never uses `innerHTML`. A strict Content-Security-Policy (`'self'` only, no inline scripts or styles), HSTS, `nosniff`, a referrer policy and a permissions policy are set in `vercel.json`.
- Requests are rate limited per client. Errors returned to users are generic, and logs record error codes only, never what users typed.
- Known limit: the rate limiter and response cache are in-memory per function instance. For heavier traffic, add a Vercel Firewall rate-limit rule and Vercel Runtime Cache.

## Accessibility

Semantic landmarks and a skip link; a label on every control; validation errors linked with `aria-describedby`, with focus moved to the first invalid field; a live region announcing progress; full keyboard operation with visible focus rings; and dark mode, reduced motion, layouts down to 320 px wide and a print stylesheet. Every text colour pair meets WCAG AA (4.5:1 or better), and control borders and focus rings meet 3:1, in both light and dark themes.

## Testing

`node --test` runs all tests with no test framework, at 100% line coverage. They cover budget rounding, scheduling, both validation boundaries, prompt construction (including the injection boundary), caching, rate limiting, the full handler with a fake model (success, cache hits, 400/413/415/429/500/502/504), the Gemini client against a mocked network (structured-output config, one retry on 503, no retry on 400, timeout), the browser's formatting helpers, and every HTML page (links resolve, nothing the CSP would block, one `h1`). CI (`.github/workflows/ci.yml`) runs lint, tests with coverage, and `npm audit` on every push.

> Plans are AI-generated suggestions. Always confirm prices and availability with vendors.

## Deploying to Vercel (later)

1. Push the repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new), import the repo, and click **Deploy**.
3. In **Project Settings → Environment Variables**, add the same keys that are in your `.env`:
   - `GEMINI_API_KEY` — mark as **Sensitive**
   - `GEMINI_MODEL` — optional
   - `RESEND_API_KEY` — mark as **Sensitive**
   - `CONTACT_TO_EMAIL`
4. Trigger a redeploy (or push a new commit). Vercel picks up `vercel.json` automatically for routing, headers and function config — no extra CLI steps needed.
