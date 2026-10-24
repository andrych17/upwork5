# MeetDoConnect

> **Skip the swiping. Start doing.**  
> Live alcohol-free evenings online: make something, work beside someone, or wind down with friends in small rooms of ~5.

**Live Website:** [https://meetdoconnect.com](https://meetdoconnect.com)

---

## Overview

MeetDoConnect is a membership-based web application for live, alcohol-free online social evenings. Members receive 3 weekly credits to book interactive sessions (quiet co-working, wind-downs, cooking contests, and social games) hosted in small rooms with rotating roles and optional cameras. Afterward, members can mutual-match for private buddy chats.

This repository contains the front-end prototype and marketing web app, built with **Next.js 16** (App Router, TypeScript, Tailwind CSS v4). It compiles into a static website (`output: 'export'`) served globally via **Cloudflare Workers Static Assets** with full offline **PWA** support.

---

## Tech Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.4 (App Router) | Static export (`output: 'export'`), SSG |
| **Language** | TypeScript 6.0 | Strict type safety, typed routes |
| **Styling** | Tailwind CSS v4 | Native CSS tokens, responsive layout, dark/light mode |
| **Hosting & CDN** | Cloudflare Workers Assets | Global edge delivery, automated SSL/TLS |
| **Mobile & Offline** | Progressive Web App (PWA) | Service Worker (`sw.js`), Web App Manifest |
| **Search & AI Discovery** | SEO, AEO, GEO | Schema.org JSON-LD, `sitemap.xml`, `robots.txt`, `llms.txt` |

---

## Project Structure

```text
site/
├── app/                              # Next.js App Router (Pages & Metadata)
│   ├── (docs)/                       # Legal pages (Rules, Terms, Privacy)
│   ├── activities/                   # Activity directory & 13 individual slug pages
│   │   └── [slug]/
│   ├── evenings/                     # Interactive calendar prototype
│   ├── how-it-works/                 # Feature breakdown & buddy system explanation
│   ├── llms.txt/                     # AI assistant discovery endpoint
│   ├── membership/                   # Pricing, credit tiers & FAQ
│   ├── offline/                      # Fallback screen when internet is lost
│   ├── safety/                       # Community safety, reporting & moderation rules
│   ├── schedule/                     # Booking calendar (prototype, saves in the browser)
│   ├── slow-chess/                   # Slow Chess, played over days by sharing a link
│   ├── widgets-while-you-wait/       # Word Rush standalone game widget
│   ├── globals.css                   # Tailwind v4 configuration & design tokens
│   ├── layout.tsx                    # Root HTML shell, fonts, header & footer
│   ├── not-found.tsx                 # 404 page
│   ├── page.tsx                      # Homepage & interactive demo widgets
│   ├── robots.ts                     # Search engine crawler permissions
│   └── sitemap.ts                    # Auto-generated XML sitemap
├── components/                       # Shared UI & Interactive Prototypes
│   ├── demos.tsx                     # Interactive calendar, room & buddy match demos
│   ├── install-button.tsx            # PWA install prompt button for mobile & desktop
│   ├── schedule.tsx                  # Schedule screen and its browser-only store
│   ├── slow-chess.tsx                # Slow Chess board, game link and saved games
│   ├── ui.tsx                        # Core UI components (Button, Shell, Card, Badge)
│   └── word-rush.tsx                 # Word Rush game UI container
├── lib/                              # Data, Business Logic & Utilities
│   ├── placeholders.ts               # Legal template blanks (LLC name, email, dates)
│   ├── schedule/rules.ts             # Booking, credit, cancel, card and payment rules (ported from rules.js)
│   ├── slow-chess/engine.ts          # Chess rules, notation and the game link format
│   ├── sessions.ts                   # Mock schedule data, credit rules & cancellation policy
│   ├── site.ts                       # Metadata, navigation links & SEO configuration
│   └── word-rush/                    # Game engine rules, tile scoring & dictionary
├── public/                           # Static Assets
│   ├── icons/                        # PWA app icons (192x192, 512x512, maskable)
│   ├── manifest.webmanifest          # PWA installation manifest
│   ├── og.png                        # Social share card (1200x630)
│   └── sw.js                         # Offline cache service worker
├── scripts/                          # Build & Quality Assurance Scripts
│   ├── build-demo.ts                 # Demo build generator with content guard
│   ├── check.ts                      # Pre-deploy asset & link integrity checker
│   ├── guard.js                      # DevTools & content protection trap for preview
│   ├── test-chess.ts                 # Slow Chess engine tests (perft counts, mate, links)
│   ├── test-engine.ts                # Word Rush game engine automated test suite
│   └── test-schedule.ts              # Schedule rules tests (credits, cancels, cards, payments)
├── wrangler.json                     # Cloudflare Workers Static Assets configuration
└── next.config.ts                    # Next.js build configuration (Static HTML Export)
```

---

## Local Development

### Prerequisites
* **Node.js**: `v22.18.0` or newer
* **npm**: `v10.0.0` or newer

### Setup & Commands

```bash
# 1. Install dependencies
npm install

# 2. Run local development server (http://localhost:3000)
npm run dev

# 3. Run automated tests (Word Rush, Schedule rules and Slow Chess engine)
npm test

# 4. Check TypeScript types
npm run typecheck

# 5. Run ESLint code analysis
npm run lint

# 6. Format code with Prettier and Tailwind class sorter
npm run format

# 7. Build production static bundle (outputs to out/ and runs check.ts)
npm run build
```

---

## Deployment (Cloudflare)

The site is configured to deploy directly to **Cloudflare Workers Static Assets** or **Cloudflare Pages**.

### Deploy via Wrangler CLI

```bash
# Build static pages and deploy to Cloudflare
npm run build
npx wrangler deploy
```

`wrangler.json` automatically maps the `./out` directory to Cloudflare's edge network without requiring server-side runtime code:

```json
{
  "name": "upwork5",
  "compatibility_date": "2024-09-23",
  "assets": {
    "directory": "./out"
  }
}
```

### Domain & DNS Configuration

1. **Custom Domain**: Bound to `meetdoconnect.com` and `www.meetdoconnect.com`.
2. **Worker Route Pattern**: Ensure the route pattern is set to `meetdoconnect.com/*` (with wildcard `/*`) so sub-routes, sitemaps, and PWA manifests route properly.
3. **SSL / HTTPS**:
   * **Mode**: Full (or Flexible).
   * **Always Use HTTPS**: Enabled (redirects `http://` to `https://`).
   * **Automatic HTTPS Rewrites**: Enabled.

---

## Progressive Web App (PWA)

MeetDoConnect installs directly to a user's device without requiring an App Store or Google Play Store download.

* **Android (Chrome)**: Tap the in-app "Install the app" button or open Chrome menu (`⋮`) > **Install app** / **Add to Home screen**.
* **iOS / iPadOS (Safari)**: Tap the **Share** button (`⎋`) > select **Add to Home Screen**.
* **Desktop (Chrome / Edge)**: Click the **Install** monitor icon on the right side of the address bar.
* **Offline Support**: When offline, visitors are served `/offline` from cache, while the Word Rush game remains fully playable.

---

## Search, AI & Discovery (SEO / AEO / GEO)

The codebase is optimized for traditional search engines, voice assistants, and Generative AI engines:

* **SEO (Search Engine Optimization)**:
  * Unique meta titles, descriptions, canonical URLs, and Open Graph share cards (`/og.png`) for all 31 routes.
  * Validated `/sitemap.xml` and `/robots.txt`.
* **AEO (Answer Engine Optimization)**:
  * Direct concise answers under each page headline for voice search and answer snippets.
  * Structured JSON-LD schemas: `Organization`, `WebSite`, `FAQPage`, `ItemList`, `BreadcrumbList`, `HowTo`, and `WebApplication`.
* **GEO (Generative Engine Optimization)**:
  * Dedicated [`/llms.txt`](https://meetdoconnect.com/llms.txt) plain-text reference summarizing the community model, credit system, and session rules so AI models (ChatGPT, Claude, Perplexity, Gemini) can accurately recommend the platform.

---

## Pre-Launch Legal Checklist

Before opening the site to real paid members:

1. **Fill in Placeholders**:
   * Edit `lib/placeholders.ts` to provide the legal business entity name, registration state, support email, and effective date.
   * `npm run build` will flag any remaining `[BRACKET]` placeholders.
2. **Legal Review**:
   * Have a licensed attorney review the Community Rules, Terms of Service, and Privacy Policy templates.
3. **Pricing & Times**:
   * Verify session credit costs and subscription prices in `app/membership/page.tsx` and `lib/sessions.ts`.

---

## Roadmap: Next Milestones (Backend & Real Application)

The current front end is built to seamlessly graduate into a full-stack SaaS application:

1. **Authentication & Member Accounts**:
   * Integration with Supabase or PostgreSQL for secure member login, passwordless magic links, and profile management.
2. **Booking & Credit Engine**:
   * Backend persistence for 3 weekly credits, the 24-hour cancellation cutoff, and "Bad Hair Day" cards.
3. **Payment Processing**:
   * Stripe Checkout & Customer Portal for recurring monthly memberships ($24/mo) and add-on credit packs.
4. **Live Video Rooms**:
   * Embedded rooms via Jitsi as a Service (JaaS) or Daily.co, authenticated so only booked members can join.
5. **Real-Time Buddy Chat**:
   * WebSocket/Supabase Realtime messaging unlocked when two session attendees mutually select each other.
6. **Automated Reminders**:
   * Email/SMS reminders (48-hour supply card notice, 24-hour lock-in, 1-hour room link).

---

## License

Private and confidential. All rights reserved by **MeetDoConnect**.
