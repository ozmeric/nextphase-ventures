# NextPhase Ventures — System README
**Last updated: August 31, 2026**

---

## Overview

NextPhase Ventures (NPV) runs two interconnected systems:

1. **NPV Deal Checker** — automated pipeline that reads forwarded wholesaler emails, analyzes deals using AI, sends email alerts, and records leads
2. **NPV Project Management App** — web app at `nextphaseventures.co/project-management` for managing active fix-and-flip projects, expenses, tasks, quotes, vendors, milestones, and deal leads

Both systems share the same Google Sheet backend and are built on the same stack: React (CDN, no build step), Google Apps Script, Google Sheets, GitHub Pages, and Cloudflare.

---

## System Architecture

```
Wholesaler Email
      ↓
npvdealchecker@gmail.com
      ↓ (milliseconds — Gmail Pub/Sub push)
Google Cloud Pub/Sub → DealChecker.gs Web App (Apps Script)
      ↓
checkForNewDeals()
      ├── scrapeLinksFromEmail() — fetches URLs found in email body
      ├── extractAttachmentsFromEmail() — reads image + PDF attachments
      └── analyzeWithGemini() — sends text + images + PDFs to Gemini AI
            ↓
      writeLead() → Google Sheet "Leads" tab
      sendNotificationEmail() → Gmail to you + partner
      sendPushNotification() → Cloudflare Worker → VAPID push to devices
      ↓
NPV PM App → Leads tab (auto-polls every 2 min, push notification on arrival)
```

---

## File Inventory

### Apps Script Files

| File | Location | Purpose |
|---|---|---|
| `DealChecker.gs` | `npvdealchecker@gmail.com` Apps Script | Main deal analysis pipeline |
| `Code.gs` | NPV Apps Script (main account) | PM app backend — all CRUD operations |

### Frontend Files

| File | Location | Purpose |
|---|---|---|
| `index.html` | GitHub repo root | NPV PM app — full single-file React app |
| `sw.js` | GitHub repo root | Service worker — PWA caching + push notifications |
| `manifest.json` | GitHub repo root | PWA manifest — app name, icons, theme |

### Cloudflare Workers

| Worker | URL | Purpose |
|---|---|---|
| `nextphaseventures.weblinallc.workers.dev` | Proxy | PM app API proxy → NPV Apps Script |
| `npv-push-server.weblinallc.workers.dev` | Push server | VAPID web push notifications |

### Google Cloud (Project: `npv-deal-checker`)

| Resource | Name | Purpose |
|---|---|---|
| Pub/Sub Topic | `npv-deal-checker` | Receives Gmail push notifications |
| Pub/Sub Subscription | `npv-deal-checker-push` | Pushes to DealChecker Web App endpoint |
| KV Namespace | `npv-push-subscriptions` | Stores device push subscriptions |

---

## Google Sheet Structure

**Sheet ID:** `1Wq6bTO5ewz64NUd5uFoARjMMmq6aU_69h5f4459eWV4`

| Tab | Purpose | Written by |
|---|---|---|
| `Projects` | Project list (id, name, purchase price, rehab budget) | PM App |
| `2701 Lincoln Ave` | Expenses for Lincoln Ave project | PM App |
| `2801 Fairgate Rd` | Expenses for Fairgate project | PM App |
| `General Expenses` | Company-wide expenses | PM App |
| `[Project] - Tasks` | Tasks per project | PM App |
| `[Project] - Quotes` | Contractor quotes per project | PM App |
| `Milestones` | Project milestone data (JSON) | PM App |
| `Vendors` | Vendor directory (JSON) | PM App |
| `Management` | Management tasks, pipeline (JSON) | PM App |
| `Leads` | Deal leads from email analysis | DealChecker |

---

## Deal Checker — How It Works

### 1. Email Trigger
Forward any wholesaler deal email to `npvdealchecker@gmail.com`. Gmail instantly pushes a notification to Google Cloud Pub/Sub, which calls the DealChecker Web App endpoint within seconds.

### 2. Deduplication
The `doPost()` webhook uses `LockService` (Apps Script mutex) + a 60-second gap timer to ensure each email is processed exactly once, even when Pub/Sub sends multiple notifications for the same event.

### 3. Link Scraping
`scrapeLinksFromEmail()` extracts URLs from the email body and HTML, skips known non-deal domains (your own sites, unsubscribe links), and fetches up to 3 pages to extract property details. Tracking redirect links (emlnk, lt.php) are followed to their destination.

**Skipped domains:** `goodlifepropertygroup.com`, `nextphaseventures.co`, unsubscribe/social links

### 4. Attachment Extraction
`extractAttachmentsFromEmail()` reads:
- **Image attachments** (JPEG, PNG, WebP, GIF) — for property condition assessment
- **PDF attachments** — for comp reports, CMA, inspection reports
- **Word/Excel docs** — for any deal-related documents
- **Inline base64 images** from HTML email body

Up to 5 attachments total are sent to Gemini.

### 5. Gemini Analysis
`analyzeWithGemini()` sends the full context to Gemini (text + scraped pages + attachments) with the NPV analysis prompt. The model falls back through `gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-3.1-flash-lite` on 503 errors with retry logic.

**Analysis output per deal:**
- Address, beds/baths/sqft/year built, neighborhood, condition
- ARV estimate with $/SF and reasoning
- Rehab estimate with line-item breakdown (demo, roof, HVAC, electrical, plumbing, drywall, flooring, kitchen, bathrooms, paint, exterior, contingency)
- Two MAO calculations:
  - **70% Rule MAO** = (ARV × 0.70) − Rehab
  - **New Formula MAO** = (ARV × 0.88) − Rehab − $100,000 target profit
  - **Suggested Offer** = lower of the two
- Full pro forma (closing costs, holding costs, financing points, selling costs, total project cost, net proceeds, projected profit, profit margin %, ROI %)
- Recommendation: Pursue / Negotiate / Pass
- Red flags list
- Data gaps list
- 3-4 sentence executive summary
- Confidence level and reason
- Image condition notes (if photos analyzed)
- Comp report notes (if PDF comps analyzed)

**Multiple deals per email:** If a wholesaler blast email lists multiple properties, Gemini extracts and returns one analysis object per property. Each gets its own sheet row, email alert, and push notification.

### 6. Recommendation Color Logic
- 🟢 **Green** = Pursue (good deal) OR Pass with no red flags (clean pass)
- 🟡 **Yellow** = Negotiate (work needed) OR Pass with red flags (concerns noted)
- 🔴 **Red** = Any recommendation where projected profit is negative

### 7. Output — Email Notification
HTML email sent to `nextphase.ventures25@gmail.com` containing:
- Recommendation badge (🟢/🟡/🔴) with confidence
- Source badges (🔗 Links scraped, 📷 N photos analyzed, 📄 N PDF comp reports)
- Key stats grid: Ask, Suggested Offer, ARV, Rehab, Projected Profit, Profit Margin, Beds/Baths, Sqft/Year, ARV $/SF, Hold Period
- Analysis summary
- Photo condition assessment (if images analyzed)
- ARV reasoning
- Rehab breakdown by line item
- Full pro forma
- Red flags
- Data gaps & assumptions
- Scraped URLs

### 8. Output — Leads Sheet
One row per deal written to the `Leads` tab with all analysis fields including the new MAO columns (`mao70`, `maoNew`, `wiggleRoom`, `suggestedOffer`, `neighborhood`, `holdingPeriodMonths`, `projectedProfit`, `profitMarginPct`).

### 9. Output — Push Notification
`sendPushNotification()` calls the Cloudflare Worker push server, which sends a VAPID web push to all subscribed devices. Works on iPhone (via PWA on home screen), Android, and desktop Chrome even when the app is closed.

---

## Gmail Watch — Real-Time Push

The Gmail watch (registered via `setupGmailWatch()`) tells Gmail to push notifications to the Pub/Sub topic the moment an email arrives. It expires every 7 days and is auto-renewed by a time-based trigger (`renewGmailWatch`) that runs every 6 days.

**Key Apps Script functions:**
- `setupGmailWatch()` — registers the Gmail watch, creates renewal trigger
- `renewGmailWatch()` — renews the watch (runs automatically every 6 days)
- `removePollTrigger()` — removes any old time-based poll triggers
- `testPubSubSetup()` — verifies all components are connected
- `listTriggers()` — shows all active triggers
- `resetDedup()` — clears dedup state (use if emails stop processing)
- `manuallyAnalyzeDeal()` — paste email body to test analysis without forwarding
- `testGemini()` — tests Gemini API connection and response
- `testWriteLead()` — tests sheet write without sending email

---

## PM App — Features

### Projects Tab
Dashboard per project showing rehab budget vs. actual spend, expense breakdown by category, and project summary.

### Expenses
Track all project expenses with date, category, vendor, and notes. Categories: Down Payment, Closing Costs, Loan Expenses, Labor, Demo/Cleanup, Materials, Permits, Utilities, Equipment, Professional Fees, Other.

### Tasks
Kanban-style task tracking (To Do / In Progress / Blocked / Done) with assignee, due date, category, priority, and milestone grouping.

### Quotes
Contractor quote management. Status: Pending / Accepted / Rejected. Accepting a quote automatically creates a corresponding expense entry.

### Planning
Timeline/milestone planning by week with notes.

### Vendors
Vendor directory organized by category with contact info and notes.

### Management
Company-level pipeline, general tasks, and milestone board across all projects.

### Leads
Deal leads from the email analyzer. Shows:
- **Collapsed card:** Address, recommendation badge, status badge, Ask / Offer / ARV / Profit, summary
- **Expanded card:** Full 12-stat grid, Analysis Summary, ARV Reasoning, Red Flags, Data Gaps, Status buttons, Notes, Add to Pipeline button
- **Filters:** by recommendation (Pursue/Negotiate/Pass) and status (New/Reviewing/Pursuing/Passed)
- **Auto-poll:** refreshes silently every 2 minutes
- **Push notifications:** browser notification when new leads arrive (requires Enable Alerts)

---

## Push Notification Setup

### Enable on a Device
1. Open the PM app → Leads tab → click **🔔 Enable Alerts**
2. Allow notifications when browser prompts
3. Button changes to **🔔 Alerts On** — device is subscribed

### iPhone Requirements
Must be added to home screen as a PWA:
1. Open app in Safari → Share → Add to Home Screen
2. Open from home screen (not Safari)
3. Then click Enable Alerts

### Push Server (Cloudflare Worker)
- URL: `https://npv-push-server.weblinallc.workers.dev`
- Endpoints:
  - `GET /vapid-public-key` — returns VAPID public key for subscription
  - `POST /subscribe` — registers a device subscription
  - `DELETE /subscribe` — removes a subscription
  - `POST /push` — sends push to all subscribers (called by DealChecker)
  - `GET /subscribers` — lists all subscribed devices
- Auth: `Authorization: Bearer npv-push-2026`
- Storage: Cloudflare KV namespace `npv-push-subscriptions`

---

## MAO Calculation Reference

### 70% Rule (Quick Screen)
```
MAO = (ARV × 0.70) − Rehab
```
Quick filter. Bakes profit + all costs into the ratio.

### New Formula / Target Profit Method (Precise)
```
MAO = (ARV × 0.88) − Rehab − $100,000
```
- **0.88** = 1 − 8% selling costs − 4% closing/holding buffer
- **$100,000** = NPV target profit per deal
- More accurate on higher ARV properties ($300K+)

### Suggested Offer
Always the **lower** of both MAOs — the conservative recommendation.

### Pro Forma Costs Used
- Acquisition closing costs: 4% of purchase price
- Holding costs: $3,500/month × hold period
- Financing points: 2% of loan amount (90% LTV)
- Selling costs: 8% of ARV

---

## Richmond, VA Market Defaults

| Neighborhood | ARV $/SF |
|---|---|
| Fan / Museum District / Monument Ave | $280–$400 |
| Near West End / Westham / Tuckahoe | $200–$320 |
| Henrico County (standard) | $160–$220 |
| North Side / Lakeside | $150–$200 |
| South Side / Manchester | $140–$190 |
| Chesterfield County | $150–$200 |

**Rehab condition tiers:**
- Light/Cosmetic: $15–$30/SF
- Moderate: $30–$60/SF
- Heavy/Full Rehab: $60–$100/SF
- Full Gut + Structural: $100–$150+/SF

**Key vendor benchmarks (from 2701 Lincoln Ave actuals):**
- HVAC full system: $14,000–$18,000
- Mold remediation: $6,750–$25,000 (always get 3+ bids)
- Roof replacement: $7,500–$16,000
- Drywall whole house: $12,000–$18,000
- Windows whole house: $10,000–$16,000
- Monthly carry (Kiavi): ~$3,500/month

---

## Deployment

### GitHub → PM App
Push to `main` branch → Cloudflare auto-deploys to `nextphaseventures.co/project-management`

### DealChecker Updates
1. Edit `DealChecker.gs` in Apps Script
2. Save
3. Deploy → Manage deployments → Edit → New version → Deploy
4. Update Pub/Sub subscription endpoint URL if it changed

### NPV Backend Updates
1. Edit `Code.gs` in Apps Script
2. Save
3. Deploy → Manage deployments → Edit → New version → Deploy

---

## Credentials & Keys

| Item | Location |
|---|---|
| Gemini API Key | `CONFIG.GEMINI_API_KEY` in `DealChecker.gs` |
| VAPID Public Key | Cloudflare Worker env variable `VAPID_PUBLIC_KEY` |
| VAPID Private Key | Cloudflare Worker env variable `VAPID_PRIVATE_KEY` |
| Push Auth Token | `CONFIG.PUSH_AUTH_TOKEN` in `DealChecker.gs` / Cloudflare env `AUTH_TOKEN` |
| Apps Script PIN | `var PIN = "2025"` in `Code.gs` |
| NPV Sheet ID | `1Wq6bTO5ewz64NUd5uFoARjMMmq6aU_69h5f4459eWV4` |

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Emails not being analyzed | Check Apps Script Executions tab. Run `testPubSubSetup()`. Verify Pub/Sub subscription endpoint ends in `/exec` not `/dev`. |
| Getting duplicate analyses | Run `resetDedup()` then `fixTriggers()` in Apps Script. Verify only one `renewGmailWatch` trigger exists. |
| Gemini 503 errors | Transient — model fallback handles automatically (tries 3 models). Wait and retry. |
| Push notifications not arriving | Open app → Leads → Enable Alerts. iPhone: must be on home screen. Run `testPubSubSetup()` to verify watch is active. |
| Gmail watch expired | Run `setupGmailWatch()` to re-register. Should auto-renew every 6 days. |
| Links not being scraped | Check email for tracking/redirect URLs. Sharepoint links require login — forward photos as attachments instead. |
| App shows blank page | Check browser console for JS errors. Usually a duplicate `const` declaration — search for duplicate `RECOMMENDATION_COLORS` or `leads` state. |
| Leads tab empty | Verify `Code.gs` is deployed with `getLeads` action in `doPost`. Hit Refresh in the Leads tab. |
