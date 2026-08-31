# NextPhase Ventures — Digital Infrastructure

Full-stack project management PWA and lead generation website for NextPhase Ventures, a fix & flip real estate company based in Richmond, VA. Built by Weblina LLC.

---

## Overview

Two live systems:

| System | URL | Purpose |
|---|---|---|
| Project Management App | `nextphaseventures.co/project-management` | Internal tool — expenses, tasks, quotes, planning, vendors |
| Lead Generation Website | `nextphaseventures.co` | Public — seller leads, before/after gallery, contact form |

---

## Project Management App

### Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend | React 18 (CDN, no build step), single HTML file | Free |
| Hosting | GitHub Pages | Free |
| Proxy | Cloudflare Worker (`nextphaseventures.weblinallc.workers.dev`) | Free |
| Backend | Google Apps Script | Free |
| Database | Google Sheets ("NPV Expenses") | Free |

### Features

- **Projects** — Multiple fix & flip projects + General Expenses
- **Dashboard** — Per-project spend summary, rehab budget progress bar
- **Expenses** — Acquisition vs Rehab categories, add/edit/delete
- **Tasks** — Status cycling, Interior/Exterior filters, milestone assignment
- **Quotes** — Multi-vendor comparison, accept → auto-converts to expense
- **Planning** — Milestone timeline per project, task progress bars, comments
- **Management** — Pipeline tracking, general tasks, general expenses link
- **Vendors** — Directory by category, phone/email, custom categories
- **PWA** — Installable as home screen app on iPhone and Android

### Authentication

PIN-protected. PIN validated server-side only — never stored in HTML source.

### Access

URL: `https://nextphaseventures.co/project-management`
PIN: stored securely (server-side in Apps Script)

---

## Architecture

```
[Browser / PWA]
      ↓ POST JSON (with PIN)
[Cloudflare Worker]
  nextphaseventures.weblinallc.workers.dev
      ↓ POST JSON (redirect: follow)
[Google Apps Script]
  Validates PIN, routes action
      ↓ read / write
[Google Sheets — "NPV Expenses"]
  Multiple tabs per project
```

### Cloudflare Worker

- **Worker name:** `nextphaseventures`
- **URL:** `https://nextphaseventures.weblinallc.workers.dev/`
- **Purpose:** Proxies all API calls, hides Apps Script URL from page source
- **CORS:** `Access-Control-Allow-Origin: *`
- **Redirect:** `redirect: "follow"` — required for Apps Script compatibility

To update the worker:
1. Cloudflare Dashboard → Workers & Pages → `nextphaseventures` → Edit Code
2. Update `APPS_SCRIPT_URL` if deploying a new Apps Script version
3. Click Deploy

### Google Apps Script

- **Sheet:** "NPV Expenses" (Google Sheets)
- **Deployment type:** Web App (Execute as: Me, Access: Anyone)
- **Current URL:** stored in Cloudflare Worker code

To redeploy after code changes:
1. Apps Script editor → Deploy → Manage deployments
2. Edit (pencil icon) → Version: New version → Deploy
3. **URL stays the same** — no need to update the Worker

### Google Sheets Tab Structure

| Tab | Contents |
|---|---|
| Projects | All project metadata |
| `{Project Name}` | Expenses for that project |
| `{Project Name} - Tasks` | Tasks (10 cols including milestone) |
| `{Project Name} - Quotes` | Quotes |
| Milestones | Per-project milestone JSON |
| Vendors | Vendor directory by category |
| Management | General tasks, pipeline milestones, statuses |

---

## Cloudflare Setup

Domain `nextphaseventures.co` is managed through Cloudflare (migrated from GoDaddy).

### DNS Records

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | ozmeric.github.io |

### Email Routing

Cloudflare Email Routing forwards `@nextphaseventures.co` addresses to `nextphase.ventures25@gmail.com`. MX records managed automatically by Cloudflare.

### Workers

| Worker | URL | Purpose |
|---|---|---|
| nextphaseventures | nextphaseventures.weblinallc.workers.dev | Apps Script proxy for project management app |

---

## GitHub Repository

**Repo:** `github.com/ozmeric/nextphase-ventures` (private)

### File Structure

```
/
├── index.html                    # Landing page (home)
├── how-it-works.html
├── our-work.html                 # Before/after gallery
├── faq.html
├── our-company.html
├── contact.html                  # Lead capture form
├── CNAME                         # nextphaseventures.co
├── img/
│   ├── before/                   # Before photos (6 images)
│   └── after/                    # After photos (19 images)
└── project-management/
    ├── index.html                # React PWA app
    ├── manifest.json             # PWA manifest
    ├── sw.js                     # Service worker
    ├── icon-192.png              # App icon
    └── icon-512.png              # App icon
```

---

## Lead Generation Website

### Pages

| Page | Purpose |
|---|---|
| Home | Hero, pillars, why sell to us, mission |
| How It Works | 5-step seller process |
| Our Work | Before/after gallery (2802 Fairgate Rd) |
| FAQ | 7 collapsible questions |
| Our Company | About NextPhase Ventures |
| Contact | Lead capture form |

### Lead Form Backend

- **Apps Script URL:** Separate deployment from project management app
- **Sheet:** "NextPhase Leads" (separate Google Sheet)
- **Notification email:** `nextphase.ventures25@gmail.com`
- **Fields:** Name, Phone, Email, Property Address, Condition, Timeline, Reason, Notes

---

## Projects in System

| Project | ID | Status | Purchase | Rehab Budget |
|---|---|---|---|---|
| 2701 Lincoln Ave | lincoln-2701 | Active | $320,000 | $120,000 |
| 2802 Fairgate Rd | fairgate-2802 | Sold | $355,000 | $86,087.24 |
| General Expenses | general-expenses | General | — | — |

---

## Development Notes

### Key Patterns

- **No build step** — React via CDN, `e()` instead of JSX
- **CDATA wrap** — Script tags wrapped in `//` to prevent `<` operators from being parsed as HTML
- **Modal isolation** — Modals as separate components with local state to prevent `autoFocus` focus stealing
- **Save-before-load guard** — `useRef` loaded flags prevent default state from overwriting Sheet data on startup
- **Force reload** — `reloadTick` counter forces `useEffect` to re-fetch even when `activeId` doesn't change

### Persistent Data (saved to Sheet)

| Data | Sheet Tab | Save Trigger |
|---|---|---|
| Expenses | `{Project Name}` | On add/edit/delete |
| Tasks | `{Project Name} - Tasks` | On add/edit/delete |
| Quotes | `{Project Name} - Quotes` | On add/edit/delete |
| Milestones | Milestones | Debounced 1.5s after change |
| Vendors | Vendors | Debounced 1.5s after change |
| Mgmt tasks/pipeline | Management | Debounced 1.5s after change |

### Deliberate Exclusions

- No Tidio live chat (creates response expectation)
- No Plaid bank sync (paid, low deal volume)
- No CSV import (minimal time savings)
- No deal analyzer web integration (manual Claude chat workflow preferred)

---

## Built By

**Weblina LLC** — Web Design & AI Solutions for Small Businesses

Powered by BuildFlow — Weblina LLC
