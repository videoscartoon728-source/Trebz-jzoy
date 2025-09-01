(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const messagesEl = $("#messages");
  const form = $("#chatForm");
  const input = $("#userInput");
  const modelSelect = $("#modelSelect");
  const sysPromptEl = $("#systemPrompt");
  const tempEl = $("#temp");
  const tempOut = $("#tempOut");
  const clearBtn = $("#clearBtn");

  const stored = JSON.parse(localStorage.getItem("or-chat-state") || "{}");
  sysPromptEl.value = stored.systemPrompt || "You are a helpful AI assistant. Answer briefly.";
  modelSelect.value = stored.model || (window.DEFAULT_MODEL || "openrouter/auto");
  tempEl.value = stored.temperature ?? 0.7;
  tempOut.textContent = tempEl.value;

  const state = { messages: stored.messages || [] };
  state.messages.forEach(renderMessage);

  tempEl.addEventListener("input", () => (tempOut.textContent = tempEl.value));

  clearBtn.addEventListener("click", () => {
    if (!confirm("Clear this conversation?")) return;
    state.messages = [];
    messagesEl.innerHTML = "";
    persist();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const userMsg = { role: "user", content: text };
    state.messages.push(userMsg);
    renderMessage(userMsg);
    persist();

    try {
      toggleSending(true);
      const resText = await callOpenRouter(state.messages, {
        model: modelSelect.value,
        systemPrompt: sysPromptEl.value.trim(),
        temperature: parseFloat(tempEl.value),
      });
      const assistantMsg = { role: "assistant", content: resText };
      state.messages.push(assistantMsg);
      renderMessage(assistantMsg);
      persist();
    } catch (err) {
      console.error(err);
      renderMessage({ role: "assistant", content: "⚠️ Error: " + (err.message || String(err)) });
    } finally {
      toggleSending(false);
    }
  });

  function toggleSending(isSending) {
    $("#sendBtn").disabled = isSending;
    if (isSending) {
      const row = document.createElement("div");
      row.className = "msg assistant";
      row.id = "pendingRow";
      row.innerHTML = `<div class="spinner"></div><div class="bubble">Thinking…</div>`;
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      const row = $("#pendingRow");
      if (row) row.remove();
    }
  }

  function renderMessage(msg) {
    const row = document.createElement("div");
    row.className = "msg " + (msg.role === "user" ? "user" : "assistant");
    row.innerHTML = `<div class="bubble">${escapeHtml(msg.content).replace(/`([^`]+)`/g, '<code class="code">$1</code>')}</div>`;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c]));
  }

  function persist() {
    localStorage.setItem("or-chat-state", JSON.stringify({
      systemPrompt: sysPromptEl.value,
      model: modelSelect.value,
      temperature: parseFloat(tempEl.value),
      messages: state.messages.slice(-50),
    }));
  }

  async function callOpenRouter(history, opts) {
    const apiKey = window.OPENROUTER_API_KEY;
    if (!apiKey || apiKey.includes("YOUR_OPENROUTER_API_KEY_HERE")) {
      throw new Error("Missing API key. Edit config.js and set window.OPENROUTER_API_KEY.");
    }

    const systemPrompt = opts.systemPrompt || "";
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push(...history);

    const payload = {
      model: opts.model || "openrouter/auto",
      messages,
      temperature: typeof opts.temperature === "number" ? opts.temperature : 0.7,
    };

    const headers = {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    };
    if (window.APP_SITE_URL) headers["HTTP-Referer"] = String(window.APP_SITE_URL);
    if (window.APP_TITLE) headers["X-Title"] = String(window.APP_TITLE);

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${txt}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response");
    return content;
  }
})();
