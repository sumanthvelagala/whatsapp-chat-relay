/**
 * wa-chat-relay
 * -------------
 * A self-hosted WhatsApp chat relay server.
 *
 * How it works:
 *  1. A visitor opens the chat widget on your website.
 *  2. They type a message — it arrives here via WebSocket.
 *  3. This server forwards it to your WhatsApp using whatsapp-web.js.
 *  4. You reply on WhatsApp with: #1 your reply
 *  5. The server routes your reply back to the visitor's chat widget in real time.
 *  6. If you don't reply within BOT_DELAY_SECONDS, an AI bot replies in your style.
 *  7. Once you reply from WhatsApp, the bot steps aside for that session.
 *
 * Your WhatsApp number is never exposed to visitors.
 *
 * Setup:
 *  1. Copy .env.example to .env and fill in your values.
 *  2. Edit server/knowledge.js with your info and chat style.
 *  3. Run: npm start
 *  4. Scan the QR code that appears with your WhatsApp.
 *  5. Point your frontend widget at this server's WebSocket URL.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import Groq from "groq-sdk";
import { SYSTEM_PROMPT } from "./knowledge.js";

const { Client, LocalAuth } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const {
  WA_RECIPIENT,       // Your WhatsApp number that receives messages
  ALLOWED_ORIGINS,    // Comma-separated list of allowed frontend origins
  API_SECRET,         // Optional secret key — clients must send this to connect
  GROQ_API_KEY,       // Groq API key for the AI bot
  PORT = 3001,
  CHROME_PATH,        // Optional: path to Chrome executable
} = process.env;

// How many seconds to wait before the bot replies (default: 8)
const BOT_DELAY_MS = parseInt(process.env.BOT_DELAY_SECONDS ?? "8", 10) * 1000;

const groq = new Groq({ apiKey: GROQ_API_KEY });

// ─── Session Store ─────────────────────────────────────────────────────────────
// Maps sessionId → { ws, number, history, humanActive, botTimer }
const sessions = new Map();
const ipSessions = new Map(); // ip → { number, history, humanActive, awaitingContact }
const botSentIds = new Set();
let waStatus = "initializing";
let sessionCounter = 0;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload) {
  for (const { ws } of sessions.values()) send(ws, payload);
}

// ─── AI bot reply ──────────────────────────────────────────────────────────────
async function sendBotReply(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || session.humanActive) return;

  if (!GROQ_API_KEY) {
    console.warn(`[#${session.number}] Bot skipped — GROQ_API_KEY not set`);
    return;
  }

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...session.history,
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return;

    session.history.push({ role: "assistant", content: text });

    const typingDelay = Math.min(1500 + text.length * 20, 4000);
    await new Promise((r) => setTimeout(r, typingDelay));

    if (!sessions.has(sessionId)) return;

    const askedForNumber = text.includes("[CONTACT_REQUEST]");
    const cleanText = text.replace(/\[CONTACT_REQUEST\]\s*/g, "").trim();
    if (askedForNumber) session.awaitingContact = true;
    send(session.ws, { type: "reply", text: cleanText, phoneRequest: askedForNumber });
    console.log(`[#${session.number}] Bot: ${text.slice(0, 80)}`);
  } catch (err) {
    console.error(`[#${session.number}] Bot error:`, err.message);
  }
}

// ─── WhatsApp Client ───────────────────────────────────────────────────────────
const puppeteerConfig = {
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
};

if (CHROME_PATH) {
  puppeteerConfig.executablePath = CHROME_PATH;
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: join(__dirname, "../.wwebjs_auth") }),
  puppeteer: puppeteerConfig,
});

client.on("qr", (qr) => {
  waStatus = "qr";
  broadcast({ type: "status", status: "qr" });
  console.log("\n📱 Scan this QR code with WhatsApp:\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => console.log("✅ Authenticated — session saved."));

client.on("ready", () => {
  waStatus = "ready";
  broadcast({ type: "status", status: "ready" });
  console.log("✅ WhatsApp ready.\n");
});

client.on("disconnected", (reason) => {
  waStatus = "disconnected";
  broadcast({ type: "status", status: "disconnected" });
  console.warn("⚠️  WhatsApp disconnected:", reason);
  console.log("🔄 Reinitializing WhatsApp...");
  setTimeout(() => client.initialize(), 5000);
});

// ─── Handle owner's replies from WhatsApp ──────────────────────────────────────
// Reply format: #1 your reply text
function handleReply(msg) {
  console.log(`[WA] Message received — fromMe:${msg.fromMe} body:"${msg.body?.slice(0, 60)}"`);
  if (!msg.fromMe) return;
  if (botSentIds.has(msg.id._serialized)) { console.log(`[WA] Skipped — bot sent`); return; }

  const match = msg.body.match(/^#(\d+)\s+([\s\S]+)/);
  if (!match) { console.log(`[WA] No match for reply format`); return; }

  const num = parseInt(match[1], 10);
  const replyText = match[2].trim();

  const matched = [...sessions.entries()].filter(([, s]) => s.number === num);

  if (matched.length === 0) {
    const active = [...sessions.values()].map((s) => `#${s.number}`).join(", ") || "none";
    console.log(`[WA] No session #${num}. Active: ${active}`);
    return;
  }

  for (const [, session] of matched) {
    clearTimeout(session.botTimer);
    session.botTimer = null;
    session.humanActive = true;
    session.history.push({ role: "assistant", content: replyText });
    send(session.ws, { type: "reply", text: replyText });
    console.log(`[#${session.number}] Human reply sent`);
  }
}

client.on("message_create", handleReply);
client.on("message", handleReply);
client.initialize();

// ─── Express + WebSocket Server ────────────────────────────────────────────────
const app = express();

const allowedOrigins = ALLOWED_ORIGINS
  ? ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : "*";

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Serve the widget files statically
app.use("/widget", express.static(join(__dirname, "../widget")));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", whatsapp: waStatus, activeSessions: sessions.size });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  let sessionId = null;
  const ip = req.socket.remoteAddress;

  // ── Optional API secret check ─────────────────────────────────────────────
  if (API_SECRET) {
    const url = new URL(req.url, `http://localhost`);
    const token = url.searchParams.get("token");
    if (token !== API_SECRET) {
      ws.close(1008, "Unauthorized");
      return;
    }
  }

  send(ws, { type: "status", status: waStatus });

  ws.on("message", async (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // ── init ────────────────────────────────────────────────────────────────
    if (data.type === "init") {
      sessionId = data.sessionId;
      const existing = ipSessions.get(ip);

      if (existing) {
        sessions.set(sessionId, {
          ws,
          number: existing.number,
          history: existing.history,
          humanActive: existing.humanActive,
          awaitingContact: existing.awaitingContact,
          botTimer: null,
        });
        send(ws, {
          type: "history",
          messages: existing.history.map((m) => ({
            sender: m.role === "user" ? "user" : "bot",
            text: m.content,
          })),
          phase: existing.awaitingContact ? "phone-request" : "chat",
        });
        console.log(`[#${existing.number}] Visitor reconnected (IP match)`);
      } else {
        const number = ++sessionCounter;
        sessions.set(sessionId, {
          ws,
          number,
          history: [],
          humanActive: false,
          awaitingContact: false,
          botTimer: null,
        });
        console.log(`[#${number}] Visitor connected`);
      }
      return;
    }

    // ── message ─────────────────────────────────────────────────────────────
    if (data.type === "message") {
      if (!sessionId || !sessions.has(sessionId)) {
        send(ws, { type: "error", message: "Session not initialized." });
        return;
      }
      if (waStatus !== "ready") {
        send(ws, { type: "error", message: "WhatsApp not connected yet. Please wait." });
        return;
      }
      if (!WA_RECIPIENT) {
        send(ws, { type: "error", message: "Server misconfigured — WA_RECIPIENT missing." });
        return;
      }

      const session = sessions.get(sessionId);
      session.history.push({ role: "user", content: data.text });

      const waText =
        `💬 *Chat #${session.number}*\n\n` +
        `${data.text}\n\n` +
        `_Reply: #${session.number} your message_`;

      try {
        const sent = await client.sendMessage(`${WA_RECIPIENT}@c.us`, waText);
        botSentIds.add(sent.id._serialized);
        send(ws, { type: "sent", silent: session.awaitingContact });
        console.log(`[#${session.number}]: ${data.text}`);

        // Phone number received — disable bot for this session
        if (data.text.startsWith("📞")) {
          clearTimeout(session.botTimer);
          session.botTimer = null;
          session.humanActive = true;
          session.awaitingContact = false;
        } else if (!session.humanActive && !session.awaitingContact) {
          clearTimeout(session.botTimer);
          session.botTimer = setTimeout(() => sendBotReply(sessionId), BOT_DELAY_MS);
        }
      } catch (err) {
        console.error("Send error:", err.message);
        if (err.message?.includes("detached Frame")) {
          waStatus = "disconnected";
          broadcast({ type: "status", status: "disconnected" });
          console.log("🔄 Detached frame — reinitializing WhatsApp...");
          setTimeout(() => client.initialize(), 5000);
        }
        send(ws, { type: "error", message: "Failed to deliver. Try again." });
      }
    }
  });

  ws.on("close", () => {
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        clearTimeout(session.botTimer);
        ipSessions.set(ip, {
          number: session.number,
          history: session.history,
          humanActive: session.humanActive,
          awaitingContact: session.awaitingContact,
        });
        console.log(`[#${session.number}] Disconnected (session saved for IP)`);
      }
      sessions.delete(sessionId);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 wa-chat-relay running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Bot delay: ${BOT_DELAY_MS / 1000}s`);
  if (!GROQ_API_KEY) console.warn("   ⚠️  GROQ_API_KEY not set — bot replies disabled");
  console.log("\nInitializing WhatsApp...\n");
});
