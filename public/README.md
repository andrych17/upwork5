# MeetDoConnect site folder

Skip the swiping. Start doing.

This folder is a static website. Any static host can serve it as is. It installs to a phone's home screen like an app (a progressive web app). The booking buttons on the home page are a prototype: bookings, credits, reminders, buddy picks and reports are not saved, and nothing is sent or charged yet.

## What is in the folder

| File | What it is |
| --- | --- |
| `index.html` | Home page with the prototype calendar, reminder settings, leaderless room demo, activity buddy demo, safety, membership and FAQ |
| `widgets-while-you-wait.html` | Word Rush, a free speed word game for the "while you wait" page. One file with its own word list. Works offline once loaded, no backend needed |
| `rules.html` | Community Rules (plain-language draft) |
| `terms.html` | Terms of Service **draft template**; fill in the [BRACKETS] and have a lawyer review it |
| `privacy.html` | Privacy Policy **draft template**; match it to the tools you really use and have a lawyer review it |
| `offline.html` | Shown when someone opens the site with no connection |
| `manifest.webmanifest` | Lets phones install the site as an app |
| `sw.js` | Service worker that keeps the pages available offline |
| `assets/pages.css` | Shared styles for the text pages |
| `icons/` | App icons (SVG, 192, 512 and maskable 512) |
| `prototypes/lantern-calendar-v1.html` | The earlier calendar-only prototype, kept for reference |

## Put it on your domain with Cloudflare Pages

Menu names can change, so follow the labels on screen.

1. Create a free Cloudflare account.
2. In the dashboard, go to Workers & Pages, create a new Pages project and choose the option to upload files directly.
3. Name the project and upload the contents of this folder, with `index.html` at the top level, not inside another folder. Deploy.
4. Open the project, find Custom domains, and add your MeetDoConnect domain. Cloudflare will tell you which DNS records to set at your domain registrar (or to move your nameservers to Cloudflare).
5. Wait for the domain to show as active, then visit it. Confirm it loads over https.
6. Check the install behavior: in Chrome, open the site, then DevTools, then the Application tab, and look at Manifest and Service Workers. On Android, Chrome may offer to install it. On iPhone, open the site in Safari, tap Share, then Add to Home Screen.

Each time you change files, upload the folder again. If you change the file list, change `CACHE` in `sw.js` (for example to `meetdoconnect-v2`) so phones pick up the new copy.

## Before you take payments or members

- Replace every `[BRACKET]` in `terms.html`, `privacy.html` and `rules.html` (dates, legal name, email, prices, state).
- Have a lawyer review the Terms and Privacy pages. They are starting outlines, not legal advice.
- Remove the yellow draft notices and the HTML comments at the top of those two pages when they are final.
- In `index.html`, the prices and times are examples. Search for `$24`, `$4`, `$8` and the Central times and change them to your final numbers.

## What to build next so it works for real

The page is the front end. To make it live you need:

1. **Accounts, credits, bookings, buddy picks and reports:** a hosted database with sign-in, such as Supabase. Its free tier pauses a project after a week of inactivity, so move to a paid plan at launch.
2. **Payments:** Stripe checkout for the membership and extra credits.
3. **Video:** an embeddable service such as JaaS (Jitsi as a Service), authorized by a small server step so only booked members enter a room.
4. **Reminders:** an email service triggered from the database (confirmation, 48 hours, 24 hours, 1 hour, Sunday credits, after-session buddy picks). Texts need each member's opt-in and carrier registration.
5. **Push notifications on phones:** web push through the installed app, which on iPhone needs iOS 16.4 or later.

Nothing here has been tested against live Stripe, Supabase or JaaS accounts.

## Word Rush notes (`widgets-while-you-wait.html`)

- Everyone who enters the same deal code gets the same tiles in the same order, so friends on different devices can compare scores without a server. Live head-to-head rooms would need the database from step 1 above.
- The word list is built from the open Hunspell en_US (SCOWL) dictionary: about 37,000 words of 2 to 7 letters. It is smaller than a full tournament list, so a few valid words will be rejected. Keep the SCOWL/Hunspell credit in the footer and check its license text before a commercial launch.
- A short built-in filter removes strong profanity. Add more words to the `BLOCKED` list in the script as needed.
- Tile values, tile counts and scoring are original to this game, not copied from any commercial word game.
