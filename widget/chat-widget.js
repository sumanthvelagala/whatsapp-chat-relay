/**
 * wa-chat-relay — Embeddable Chat Widget
 * ----------------------------------------
 * Drop this into any website with one line:
 *
 *   <script src="chat-widget.js" data-server="wss://your-server.com" defer></script>
 *
 * Optional attributes:
 *   data-server    — WebSocket URL of your wa-chat-relay server (required)
 *   data-token     — API secret if you set one on the server
 *   data-title     — Name shown in chat header (default: "Chat with me")
 *   data-color     — Primary hex color (default: #667eea)
 */

(function () {
  const script = document.currentScript;
  const SERVER = script?.getAttribute("data-server") || "ws://localhost:3001";
  const TOKEN  = script?.getAttribute("data-token") || "";
  const TITLE  = script?.getAttribute("data-title") || "Chat with me";
  const COLOR  = script?.getAttribute("data-color") || "#25d366";
  const HEADER = "#075e54";

  const WIDGET_DIR = script?.src ? script.src.substring(0, script.src.lastIndexOf('/') + 1) : '';
  const WA_BG_STYLE = `background-image:url('${WIDGET_DIR}wallpaper.png');background-size:cover;background-position:center`;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #wacr-wrapper { position:fixed; bottom:28px; right:28px; z-index:9999; display:flex; flex-direction:column; align-items:flex-end; gap:12px; font-family:system-ui,sans-serif; }
    #wacr-fab { width:54px; height:54px; border-radius:50%; background:${COLOR}; color:#fff; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 20px ${COLOR}88; transition:transform .2s,box-shadow .2s; position:relative; }
    #wacr-fab:hover { transform:scale(1.08); box-shadow:0 10px 28px ${COLOR}aa; }
    #wacr-fab-badge { position:absolute; top:-4px; right:-4px; background:#f87171; color:#fff; font-size:0.65rem; font-weight:700; min-width:17px; height:17px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #fff; padding:0 2px; }
    #wacr-panel { width:320px; background:#fff; border-radius:18px; box-shadow:0 20px 60px #0002; overflow:hidden; display:flex; flex-direction:column; animation:wacr-up .25s ease; }
    @keyframes wacr-up { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
    #wacr-header { padding:14px 16px; background:${HEADER}; display:flex; align-items:center; gap:10px; }
    #wacr-header-avatar { width:38px; height:38px; border-radius:50%; background:#ffffff33; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1rem; font-weight:700; flex-shrink:0; }
    #wacr-header-name { font-size:.95rem; font-weight:700; color:#fff; }
    #wacr-header-status { font-size:.72rem; color:#ffffffbb; }
    #wacr-messages { height:320px; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:8px; ${WA_BG_STYLE}; }
    .wacr-row { display:flex; }
    .wacr-row.bot { justify-content:flex-start; }
    .wacr-row.user { justify-content:flex-end; }
    .wacr-bubble { max-width:80%; padding:9px 13px; border-radius:16px; font-size:.88rem; line-height:1.5; position:relative; }
    .wacr-bubble.bot { background:#fff; color:#333; border-bottom-left-radius:4px; box-shadow:0 1px 2px #0002; }
    .wacr-bubble.user { background:#dcf8c6; color:#111; border-bottom-right-radius:4px; box-shadow:0 1px 2px #0002; }
    .wacr-typing { display:flex; gap:4px; align-items:center; padding:12px 16px !important; }
    .wacr-typing span { width:7px; height:7px; border-radius:50%; background:#aaa; animation:wacr-bounce 1.2s infinite; }
    .wacr-typing span:nth-child(2){animation-delay:.2s} .wacr-typing span:nth-child(3){animation-delay:.4s}
    @keyframes wacr-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
    #wacr-input-row { display:flex; align-items:center; padding:10px; gap:7px; border-top:1px solid #eee; background:#f0f0f0; }
    #wacr-input { flex:1; border:none; border-radius:20px; padding:9px 14px; font-size:.88rem; outline:none; font-family:inherit; background:#fff; }
    #wacr-send { width:38px; height:38px; border-radius:50%; background:${HEADER}; color:#fff; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity .2s,transform .2s; }
    #wacr-send:disabled { opacity:.4; cursor:not-allowed; }
    #wacr-send:not(:disabled):hover { transform:scale(1.1); }
  `;
  document.head.appendChild(style);

  // ── HTML ────────────────────────────────────────────────────────────────────
  const wrapper = document.createElement("div");
  wrapper.id = "wacr-wrapper";
  wrapper.innerHTML = `
    <div id="wacr-panel" style="display:none">
      <div id="wacr-header">
        <div id="wacr-header-avatar">${TITLE.charAt(0).toUpperCase()}</div>
        <div>
          <div id="wacr-header-name">${TITLE}</div>
          <div id="wacr-header-status">🟡 Connecting...</div>
        </div>
      </div>
      <div id="wacr-messages"></div>
      <div id="wacr-input-row">
        <input id="wacr-input" placeholder="Message..." />
        <button id="wacr-send" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>
    </div>
    <button id="wacr-fab" aria-label="Open chat">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
    </button>
  `;
  document.body.appendChild(wrapper);

  // ── State ───────────────────────────────────────────────────────────────────
  const panel   = document.getElementById("wacr-panel");
  const fab     = document.getElementById("wacr-fab");
  const msgs    = document.getElementById("wacr-messages");
  const input   = document.getElementById("wacr-input");
  const sendBtn = document.getElementById("wacr-send");
  const statusEl = document.getElementById("wacr-header-status");

  // phase: "chat" | "phone-request" | "done"
  let phase = "chat", waStatus = "initializing", open = false;
  let ws = null, replyTimer = null, hasConnected = false, unreadCount = 0;
  const sessionId = Math.random().toString(36).slice(2, 8);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function addMsg(sender, text) {
    removeTyping();
    const row = document.createElement("div");
    row.className = `wacr-row ${sender}`;
    const bubble = document.createElement("div");
    bubble.className = `wacr-bubble ${sender}`;
    bubble.textContent = text;
    row.appendChild(bubble);
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;

    if (!open && sender === "bot") {
      unreadCount++;
      updateBadge();
    }
  }

  function updateBadge() {
    let badge = document.getElementById("wacr-fab-badge");
    if (unreadCount > 0 && !open) {
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "wacr-fab-badge";
        fab.appendChild(badge);
      }
      badge.textContent = unreadCount;
    } else {
      badge?.remove();
    }
  }

  function setStatus(s) {
    waStatus = s;
    const map = {
      ready:        "🟢 Online",
      qr:           "🟡 Scan QR in terminal",
      disconnected: "🔴 Offline",
      initializing: "🟡 Connecting...",
    };
    statusEl.textContent = map[s] || "🟡 Connecting...";
    if (s === "ready" && phase === "chat") {
      sendBtn.disabled = false;
      input.placeholder = "Message...";
    }
  }

  function showTyping() {
    if (document.getElementById("wacr-typing")) return;
    const row = document.createElement("div");
    row.className = "wacr-row bot";
    row.id = "wacr-typing";
    row.innerHTML = `<div class="wacr-bubble bot wacr-typing"><span></span><span></span><span></span></div>`;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    document.getElementById("wacr-typing")?.remove();
  }

  // ── WebSocket — connect on first open only ───────────────────────────────────
  function connectWS() {
    if (hasConnected) return;
    hasConnected = true;

    const url = TOKEN ? `${SERVER}?token=${TOKEN}` : SERVER;
    ws = new WebSocket(url);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "init", sessionId }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "status") {
        setStatus(data.status);
      } else if (data.type === "history") {
        (data.messages || []).forEach((m) => addMsg(m.sender, m.text));
        if (data.phase === "phone-request") {
          phase = "phone-request";
          input.placeholder = "Your phone number or email...";
        }
      } else if (data.type === "sent") {
        if (!data.silent) {
          // Show typing indicator, start fallback timer
          showTyping();
          clearTimeout(replyTimer);
          replyTimer = setTimeout(() => {
            removeTyping();
            phase = "phone-request";
            input.placeholder = "Your phone number or email...";
            addMsg("bot", "I am sorry, I am a bit tied up right now. Could you please leave your phone number or email so I can reach out to you?");
          }, 20000);
        }
      } else if (data.type === "reply") {
        clearTimeout(replyTimer);
        removeTyping();
        addMsg("bot", data.text);
        if (data.phoneRequest) {
          phase = "phone-request";
          input.placeholder = "Your phone number or email...";
        } else {
          phase = "chat";
        }
      } else if (data.type === "error") {
        clearTimeout(replyTimer);
        removeTyping();
        addMsg("bot", `⚠️ ${data.message}`);
        sendBtn.disabled = false;
      }
    };

    ws.onclose = () => setStatus("disconnected");
  }

  // ── Send logic ────────────────────────────────────────────────────────────────
  function handleSend() {
    const val = input.value.trim();
    if (!val || sendBtn.disabled || phase === "done") return;
    input.value = "";
    addMsg("user", val);

    if (phase === "chat") {
      if (ws?.readyState !== WebSocket.OPEN) {
        addMsg("bot", "Connection lost. Please refresh.");
        return;
      }
      // Input stays enabled — user can keep sending messages
      ws.send(JSON.stringify({ type: "message", text: val }));
      return;
    }

    if (phase === "phone-request") {
      const isPhone = /[\d\s\-\+\(\)]{7,}/.test(val);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

      if (isPhone || isEmail) {
        sendBtn.disabled = true;
        input.placeholder = "";
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "message", text: `📞 ${val}` }));
        }
        showTyping();
        setTimeout(() => {
          removeTyping();
          phase = "done";
          input.disabled = true;
          addMsg("bot", "Got it. I will reach out to you soon.");
        }, 1500);
      } else {
        // Not contact info — forward to WA silently, server won't trigger bot
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "message", text: val }));
        }
      }
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  fab.addEventListener("click", () => {
    open = !open;
    panel.style.display = open ? "flex" : "none";
    panel.style.flexDirection = "column";
    fab.innerHTML = open
      ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
      : `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>`;

    if (open) {
      unreadCount = 0;
      updateBadge();
      input.focus();
      connectWS(); // connect on first open only
      if (waStatus === "ready" && phase === "chat") sendBtn.disabled = false;
    }
  });
})();
