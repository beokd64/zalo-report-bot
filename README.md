# ZaloReport Bot 🤖

A Zalo group bot built with **OpenClaw** that:
- 📋 Sends a weekly report alert to a group chat (Monday 8 AM by default, or manually triggered)
- 💬 Collects each member's **text reply + file attachments**
- 🤖 Uses **MiniMax AI** (via OpenClaw) to summarise the member's report (and notes whether attached files look relevant)
- 🗂️ Uploads files to **Google Drive**, organised into a folder per member
- 📝 Submits the report text, AI notes, and file links directly to a **Google Form**
- 🖥️ Includes a live dashboard to monitor, trigger manually, and change the schedule

---

## Workflow

```
 Weekly trigger (cron or manual)
        │
        ▼
 Bot posts alert in Zalo group
        │
        ▼
 Members reply: text + files
        │
        ▼
 AI summarises text + checks files  ──▶  Files uploaded to
        │                                Drive (per-member folder)
        ▼
 Submission posted to Google Form
 (Name, Week, Report, AI Notes, File links)
```

Each member's reply is debounced for 8 seconds (so multiple messages/files sent
in quick succession are treated as one submission), then processed and submitted once.

---

## Quick Start

### 1. Install
```bash
cd zalo-report-bot
npm install
cp .env.example .env
```

### 2. Set up the Google Form
1. Create a Google Form with these questions (all **short answer** or **paragraph**):
   - Name
   - Week
   - Report Text (paragraph)
   - AI Notes (paragraph)
   - File Links (paragraph)
   - (optional) User ID
2. Get the **Form ID**: open the form → Send → copy the link → the long string
   between `/forms/d/e/` and `/viewform` is your `GOOGLE_FORM_ID`.
3. Get the **entry IDs** for each field:
   - Click the **⋮** menu → **Get pre-filled link**
   - Fill in a unique placeholder for each field (e.g. "NAME_FIELD", "WEEK_FIELD")
   - Click **Get link** → copy it
   - The URL contains `entry.123456789=NAME_FIELD&entry.987654321=WEEK_FIELD...`
   - Match each `entry.XXXXXXXXX` to the field by its placeholder value
   - Paste these into `.env` as `GOOGLE_FORM_ENTRY_*`

### 3. Set up Google Drive + Service Account
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create/select a project
2. Enable **Google Drive API**
3. **IAM & Admin → Service Accounts** → Create service account → **Keys → Add Key → JSON**
4. Open the downloaded JSON, copy its entire contents into `.env` as `GOOGLE_SERVICE_ACCOUNT_JSON` (one line)
5. Create a folder in Google Drive (e.g. "Weekly Reports") → copy its ID from the URL → `GOOGLE_DRIVE_FOLDER_ID`
6. **Share that folder** with the service account's `client_email` (found in the JSON) as **Editor**

The bot will automatically create a subfolder per member (e.g. `Weekly Reports/Nguyen Van A/`) and upload their files there.

### 4. Set up Zalo / OpenClaw webhook
1. Register at [developers.zalo.me](https://developers.zalo.me) → create OA app → get **OA Access Token**
2. Set webhook URL: `https://your-server.com/webhook`
3. Subscribe to events: `user_send_text`, `user_send_file` (or whichever attachment events OpenClaw forwards)
4. Get your **Group ID** by sending a message in the group and checking the webhook payload's `group_id`

### 5. Run
```bash
npm start
# Dashboard: http://localhost:3000
```

---

## Dashboard Features

| Feature | Description |
|---|---|
| **Send Report Request** | Manually trigger the weekly alert |
| **Schedule presets** | Mon 8 AM, Mon 9 AM, Fri 8 AM, 1st of month |
| **Custom cron** | Any cron expression (Vietnam timezone) |
| **Live feed** | All group messages in real-time |
| **Member submissions** | Who has/hasn't submitted this week |
| **Close collection** | Lock the week manually |

---

## Environment Variables

| Variable | Description |
|---|---|
| `ZALO_OA_ACCESS_TOKEN` | Zalo OA token (expires ~25h — set up refresh if running long-term) |
| `ZALO_GROUP_ID` | Target group chat ID |
| `MINIMAX_API_KEY` | MiniMax AI API key (via OpenClaw) |
| `MINIMAX_MODEL` | MiniMax model name (default `MiniMax-M2`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service account JSON (one line) |
| `GOOGLE_DRIVE_FOLDER_ID` | Root Drive folder for member subfolders |
| `GOOGLE_FORM_ID` | Form ID from the form's share link |
| `GOOGLE_FORM_ENTRY_*` | `entry.XXXXXXXXX` field IDs from the pre-filled link |
| `PORT` | Server port (default 3000) |

---

## Notes on Google Forms file uploads

Google Forms' native "File upload" question type requires the responder to be
signed into Google and can't be filled by a service account. Instead, this bot
**uploads files to Drive itself** and writes the **shareable links** into a text
field on the form (`GOOGLE_FORM_ENTRY_FILES`). Form responses will show clickable
Drive links per member, and the Drive folder structure keeps the original files
organised by name.

---

## Deployment (Railway)

Push to GitHub → Railway → New Project → Deploy from GitHub → add all `.env`
values under Variables → Settings → Networking → Generate Domain.
