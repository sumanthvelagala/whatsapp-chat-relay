# whatsapp-chat-relay

A self-hosted WhatsApp chat relay server. Lets visitors chat with you directly from your website, and you reply from your own WhatsApp — your number is never exposed.

An AI bot (powered by Groq) covers for you when you're busy. Once you reply from WhatsApp, the bot steps aside for that session.

---

## Key Features

**Why use this instead of just putting a WhatsApp link on your site?**

- **Privacy First** — Your phone number never appears on the public web. Visitors only see a chat widget; they never learn your number.
- **No Friction for Visitors** — They chat directly in the browser. No app switch, no "open WhatsApp", no extra steps.
- **Instant Notifications** — The moment a potential employer opens your contact page and sends a message, you get a ping on your own WhatsApp.
- **Automated Responses** — An AI bot answers common questions about your background and projects in your voice while you're away. You step in at any time and it steps aside.

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/yourname/whatsapp-chat-relay
cd whatsapp-chat-relay

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env

# Start the relay
npm start
```

On first run a QR code appears — scan it from **WhatsApp → Settings → Linked Devices → Link a Device**. Then drop the one-line widget script into your site and you're live.

See the [Getting Started](#getting-started) section for the full setup walkthrough.

---

## Why for Resumes?

Most developer portfolios end with a mailto link or a static contact form. This project replaces that with a live chat widget that routes messages directly to your phone.

The technical signal this sends is intentional. Building and self-hosting a real-time WebSocket relay, an AI fallback bot, and a zero-dependency embeddable widget demonstrates skills that a list of bullet points cannot: systems thinking, API integration, security awareness, and care for user experience. Recruiters notice the difference between a portfolio that says "I know React" and one that lets them start a conversation the moment they land on the page.

It also solves a real problem. Phone numbers left in public HTML get scraped. A relay keeps your number off the web entirely while still giving visitors a frictionless way to reach you.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Server | Express |
| Real-time | WebSocket (ws) |
| WhatsApp | whatsapp-web.js + Puppeteer |
| AI Bot | Groq API — Llama 3.3 70B |
| Widget | Vanilla JS (no framework, no build step) |

---

## How it works

```
Visitor types in the chat widget
         │  WebSocket
         ▼
  wa-chat-relay server
         │  whatsapp-web.js
         ▼
Message arrives on your WhatsApp:
  "💬 Chat #1

   Hey, I saw your portfolio!

   Reply: #1 your message"
         │
         ▼  You reply: "#1 Hey! Thanks for checking it out."
         │
  Server routes reply back
         │  WebSocket
         ▼
Reply appears in visitor's chat widget instantly
```

If you don't reply within a set delay (default 8 seconds), the AI bot replies in your style using the knowledge base in `server/knowledge.js`. Once you jump in from WhatsApp, the bot stops for that session.

---

## Project Structure

```
wa-chat-relay/
├── server/
│   ├── index.js          ← Express + WebSocket server, WhatsApp client, bot logic
│   └── knowledge.js      ← AI bot knowledge base — edit this with your info
├── widget/
│   ├── chat-widget.js    ← Drop-in embeddable chat widget (pure JS, no build needed)
│   └── wallpaper.png     ← WhatsApp-style background for the chat panel
├── .env.example          ← Copy to .env and fill in your values
├── .gitignore
└── package.json
```

---

## Getting Started

### Step 1 — Clone and install

```bash
git clone https://github.com/yourname/whatsapp-chat-relay
cd whatsapp-chat-relay
npm install
```

### Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values. See the full reference in the [Environment Variables](#environment-variables) section below.

**Minimum required:**

```env
WA_RECIPIENT=14155551234
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
```

### Step 3 — Customize the AI bot

Open `server/knowledge.js` and replace all the placeholder content with your real information. This is the system prompt the AI uses to reply as you.

See the [Customizing the Bot](#customizing-the-bot) section below for a full guide.

### Step 4 — Run the server

```bash
npm start
```

On first run, a QR code appears in the terminal. Scan it with WhatsApp:

**WhatsApp → Settings → Linked Devices → Link a Device**

The session is saved to `.wwebjs_auth/` — you won't need to scan again unless you delete that folder or log out.

### Step 5 — Embed the widget in your website

Paste this one line before `</body>` on any HTML page — no build tools, no React, no setup:

```html
<script
  src="https://your-server.com/widget/chat-widget.js"
  data-server="wss://your-server.com"
  data-token="your_api_secret"
  data-title="Chat with me"
  data-color="#25d366"
  defer
></script>
```

**Widget attributes:**

| Attribute | Required | Default | Description |
|---|---|---|---|
| `data-server` | Yes | — | WebSocket URL of your server (`wss://` in production) |
| `data-token` | Only if `API_SECRET` is set | — | Must match `API_SECRET` in your `.env` |
| `data-title` | No | `Chat with me` | Name shown in the chat header |
| `data-color` | No | `#25d366` | Primary color (hex) for the FAB button |

> The widget also serves `wallpaper.png` from `/widget/wallpaper.png` — make sure both files are in the same folder.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values below.

### Required

| Variable | Description |
|---|---|
| `WA_RECIPIENT` | Your WhatsApp number that receives visitor messages. Country code + number, no `+` or spaces. Example: `14155551234` for +1 415 555 1234. **Use a different number than the one you reply from** — the simplest setup is a spare WhatsApp account or a second SIM. |
| `GROQ_API_KEY` | Groq API key for the AI bot. Free tier available at [console.groq.com](https://console.groq.com). Without this, the bot is disabled and you reply manually. |

### Optional

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on. |
| `BOT_DELAY_SECONDS` | `8` | How many seconds to wait for your reply before the bot steps in. Set higher if you want more time to reply yourself before the bot fires. |
| `ALLOWED_ORIGINS` | *(all)* | Comma-separated list of allowed frontend origins for CORS. Example: `https://yoursite.com,https://www.yoursite.com`. Leave blank to allow all origins (fine locally; lock down in production). |
| `API_SECRET` | *(none)* | If set, the widget must include `data-token="your_secret"` to connect. Prevents random people from connecting to your WebSocket server. |
| `CHROME_PATH` | *(auto)* | Path to Chrome/Chromium executable. Only needed if auto-detection fails. macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Linux: `/usr/bin/google-chrome`. |

---

## Customizing the Bot

Open `server/knowledge.js`. This file contains the system prompt sent to the AI on every bot reply.

The file is structured as a template with placeholder comments. Replace everything between the `<!-- Replace ... -->` markers with your real information.

### What to fill in

**1. Who you are (top of the prompt)**

A short 2-3 sentence bio: your name, current status (student/engineer/etc.), what you're looking for.

```js
// Example:
// I'm Jane Smith, a CS grad student at MIT, graduating May 2025.
// I'm into distributed systems and backend engineering.
// Looking for full-time SWE roles.
```

**2. Education**

Your degree(s), university name, GPA (if strong), and relevant courses.

**3. Projects**

This is the most important section. List your projects sorted by most recently updated. For each one include:
- Project name and last-updated date
- 2-3 sentence description: what it does, how it works, key tech used
- GitHub link

The bot uses these descriptions to answer questions about your work. The more specific, the better.

**4. Experience**

Job title, company, date range, and 2-3 sentences on what you built or achieved.

**5. Skills**

Languages, frameworks, cloud tools, what you're currently learning.

**6. What you're looking for**

1-2 sentences on the kind of roles or opportunities you want.

### Tone rules (already in the template)

The template includes 9 strict reply rules that control how the bot speaks:

| Rule | Behavior |
|---|---|
| RULE 1 | Exact replies for "Hi", "Hello", "Hey" |
| RULE 2 | Exact replies for casual questions like "what are you up to?" or "how are you?" |
| RULE 2B | Gibberish or unrecognizable input → "I didn't get you." |
| RULE 2C | Short acknowledgments after small talk ("good", "ok", "fine") → "Good." and stop — don't keep casual chat alive |
| RULE 3 | When visitor says they're a recruiter — ask what they're hiring for first, don't pitch yourself |
| RULE 4 | Only answer project/skill questions with a short 2-3 sentence response |
| RULE 5 | Respond to compliments briefly without over-explaining |
| RULE 6 | For pure casual conversation (movies, sports, etc.) — use the fallback to ask for contact info |
| RULE 7 | Never end the conversation yourself — no "goodbye", "take care", etc. |
| Multiple messages | If visitor sends several messages in a row, read them all together, skip gibberish, answer meaningful ones in one short reply |

The fallback message (used when the bot doesn't know how to answer) is:

> "I am sorry, I am a bit tied up right now. Could you please leave your phone number or email so I can reach out to you?"

When the visitor provides their contact info, the bot confirms and the chat session ends gracefully.

---

## Replying from WhatsApp

Every message you receive on WhatsApp looks like this:

```
💬 Chat #1

Hey, I saw your portfolio and wanted to ask about the RAG project.

Reply: #1 your message
```

To reply, type in that same WhatsApp chat:

```
#1 Yeah! It's a RAG system that answers questions from uploaded PDFs using ChromaDB.
```

The reply appears instantly in the visitor's chat widget. Your WhatsApp number is never exposed to them.

**How session numbers work:**
- Each new visitor gets a sequential number: `#1`, `#2`, `#3`, etc.
- Numbers reset when you restart the server.
- If a visitor disconnects and reconnects from the same IP, their session is restored — same number, same chat history. No new number assigned.

**When the bot has already replied:**
- Once you reply with `#1 ...`, the bot is disabled for that session.
- All subsequent replies from the bot are suppressed — you're in full control of that conversation.

**Holding the bot (without sending a reply):**

Since WhatsApp doesn't expose typing detection, use the hold command to cancel the bot timer while you compose your reply:

```
#1 hold
```

This immediately disables the bot for that session without sending anything to the visitor. Then take your time and send your actual reply whenever ready:

```
#1 your actual reply
```

---

## Deployment

> **Important:** This server requires a persistent Node.js process because whatsapp-web.js runs a Chromium browser in the background. Serverless platforms (Vercel, Netlify, Cloudflare Workers) will not work.

**Recommended platforms:**

| Platform | Cost | Notes |
|---|---|---|
| Oracle Cloud Free Tier | Free (always) | 2 free VMs — best option for zero cost |
| Railway | ~$5/mo | Easiest deploy — connect GitHub, click deploy |
| Fly.io | Free tier available | Good persistent process support |
| DigitalOcean Droplet | $4/mo | Full control, always-on VM |
| Any VPS | Varies | Most flexible |

### Oracle Cloud setup (recommended free option)

1. Create a free account at [cloud.oracle.com](https://cloud.oracle.com)
2. Launch a free ARM VM (Ampere A1 — 4 OCPUs, 24 GB RAM free)
3. SSH into your VM and install Node.js 20+, Google Chrome
4. Clone this repo, run `npm install`, create your `.env`
5. Use `pm2` to keep the server running: `pm2 start server/index.js --name wa-chat-relay`
6. Set up a reverse proxy (nginx) with SSL (certbot) so you can use `wss://`

### Resetting WhatsApp session

To force a new QR code scan (e.g. after logging out or switching phones):

```bash
rm -rf .wwebjs_auth
npm start
```

A new QR code will appear. Scan it to link again.

---

## Security

- **`API_SECRET`** — Always set this in production. Without it, anyone who discovers your server URL can connect and impersonate a visitor.
- **`ALLOWED_ORIGINS`** — Restrict which domains can connect. Set this to your website's URL in production.
- **`wss://`** — Always use secure WebSockets in production. Requires an SSL certificate on your server (use certbot/Let's Encrypt).
- **`.wwebjs_auth/`** — Contains your WhatsApp session token. Treat it like a password. It is already in `.gitignore` — never commit it or share it.
- **`GROQ_API_KEY`** — Never commit your `.env` file. The `.gitignore` excludes it.

---

## License

MIT
