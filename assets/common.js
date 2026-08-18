/* ===== Operit 棋院 · 共享逻辑（聊天 / LLM 桥 / 教练 / 工具） ===== */
(function (global) {
  "use strict";
  const A = (global.ChessArena = global.ChessArena || {});

  /* ---------- 提示条 ---------- */
  let toastTimer = null;
  A.toast = function (msg, ms = 1800) {
    let el = document.getElementById("__toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "__toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  };

  /* ---------- 设置（LLM 配置，OpenAI 兼容） ---------- */
  const LS_KEY = "operit_chess_llm";
  A.loadLLMConfig = function () {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch (e) { return {}; }
  };
  A.saveLLMConfig = function (cfg) {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  };

  /* ---------- LLM 调用（OpenAI 兼容 /chat/completions） ---------- */
  A.LLM = {
    cfg() { return A.loadLLMConfig(); },
    isConfigured() {
      const c = this.cfg();
      return !!(c.baseUrl && c.apiKey);
    },
    /**
     * messages: [{role, content}]
     * opts: { temperature, json:bool, signal }
     * 返回模型文本（Promise<string>）
     */
    async complete(messages, opts = {}) {
      const c = this.cfg();
      if (!c.baseUrl || !c.apiKey) {
        throw new Error("未配置 AI：请在「设置」中填写 Base URL 与 API Key");
      }
      const url = c.baseUrl.replace(/\/+$/, "") + "/chat/completions";
      const body = {
        model: c.model || "gpt-4o-mini",
        messages,
        temperature: opts.temperature != null ? opts.temperature : 0.7,
        stream: false,
      };
      if (opts.json) body.response_format = { type: "json_object" };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + c.apiKey,
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error("AI 请求失败(" + res.status + "): " + t.slice(0, 200));
      }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message.content) || "";
    },
  };

  /* ---------- Operit 宿主桥（在 Operit 内置浏览器中优先使用其 AI） ---------- */
  A.Operit = {
    available() {
      // Operit 可能在 window 上暴露 host / operitHost 等桥；这里做防御式探测
      return !!(global.host && typeof global.host.toolCall === "function") ||
             !!(global.operitHost);
    },
    // 若 Operit 暴露了 chat/completion，优先走它；否则回落 HTTP
    async chat(messages, opts) {
      if (this.available() && global.host && global.host.toolCall) {
        try {
          const r = await global.host.toolCall("llm_chat", { messages, opts });
          if (r && r.content) return r.content;
        } catch (e) { /* 回落 */ }
      }
      return A.LLM.complete(messages, opts);
    },
  };

  /* ---------- 聊天面板 ---------- */
  A.Chat = class {
    /**
     * @param {HTMLElement} mount 容器
     * @param {Object} opt
     *   systemPrompt(): string  返回系统提示
     *   context(): string       返回当前局面文本（注入到用户消息前）
     *   onUser(text): void       用户发消息后的钩子（可选）
     */
    constructor(mount, opt) {
      this.mount = mount;
      this.opt = opt || {};
      this.logEl = null;
      this.render();
      this.greet();
    }
    render() {
      this.mount.innerHTML = `
        <div class="chat">
          <div class="log" id="chatLog"></div>
          <div class="input">
            <textarea id="chatInput" placeholder="和 AI 聊聊这盘棋…（如：我这步怎么样？）"></textarea>
            <button class="btn primary" id="chatSend">发送</button>
          </div>
        </div>`;
      this.logEl = this.mount.querySelector("#chatLog");
      const input = this.mount.querySelector("#chatInput");
      const send = this.mount.querySelector("#chatSend");
      const fire = () => this.sendFromInput();
      send.addEventListener("click", fire);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fire(); }
      });
    }
    greet() {
      this.add("ai", "我是你的 AI 棋伴。可以陪你下棋，也能随时讲解局面。试试问我：「我这步有什么问题？」或「下一步该怎么走？」");
    }
    add(role, text, ev) {
      const d = document.createElement("div");
      d.className = "msg " + role;
      const av = role === "user" ? "你" : "AI";
      d.innerHTML = `<div class="av">${av}</div><div><div class="bubble"></div>${ev ? '<div class="ev"></div>' : ""}</div>`;
      d.querySelector(".bubble").textContent = text;
      if (ev) d.querySelector(".ev").textContent = ev;
      this.logEl.appendChild(d);
      this.logEl.scrollTop = this.logEl.scrollHeight;
      return d;
    }
    sendFromInput() {
      const input = this.mount.querySelector("#chatInput");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      this.userSay(text);
    }
    userSay(text) {
      this.add("user", text);
      if (this.opt.onUser) this.opt.onUser(text);
      this.askAI(text);
    }
    async askAI(userText) {
      const thinking = this.add("ai", "思考中…");
      const sys = (this.opt.systemPrompt && this.opt.systemPrompt()) || "你是一个友好的棋类教练。";
      const ctx = (this.opt.context && this.opt.context()) || "";
      const messages = [
        { role: "system", content: sys },
        { role: "user", content: (ctx ? "【当前局面】\n" + ctx + "\n\n" : "") + userText },
      ];
      try {
        const reply = await A.Operit.chat(messages, { temperature: 0.8 });
        thinking.querySelector(".bubble").textContent = reply.trim() || "（AI 没有回复）";
        thinking.querySelector(".bubble").parentElement.querySelector(".ev") &&
          (thinking.querySelector(".bubble").parentElement.querySelector(".ev").textContent = "AI · " + new Date().toLocaleTimeString());
        this.logEl.scrollTop = this.logEl.scrollHeight;
      } catch (e) {
        thinking.querySelector(".bubble").textContent = "⚠️ " + e.message + "\n（未配置 AI 也能继续下棋；配置后我就能实时讲解）";
      }
    }
    /* AI 主动解说（由对局逻辑调用，例如落子后） */
    async narrate(promptText) {
      const sys = (this.opt.systemPrompt && this.opt.systemPrompt()) || "你是一个简洁的棋类解说。";
      const ctx = (this.opt.context && this.opt.context()) || "";
      const messages = [
        { role: "system", content: sys },
        { role: "user", content: (ctx ? "【当前局面】\n" + ctx + "\n\n" : "") + promptText },
      ];
      try {
        const reply = await A.Operit.chat(messages, { temperature: 0.7 });
        this.add("ai", reply.trim());
      } catch (e) { /* 静默：无网不强制解说 */ }
    }
  };

  /* ---------- 本地教练（无 LLM 时的降级解说） ---------- */
  A.Coach = {
    tip(evalText) {
      const lines = [
        "控制中心通常比边角更有价值。",
        "先手时要主动制造「活三/活四」这类多重威胁。",
        "防守时也别只堵，留意能否反将一军。",
        "每一步都问自己：对手最想下哪里？先把那点看住。",
        "把棋子连成网络，比零散分布更强。",
      ];
      return lines[Math.abs(hash(evalText)) % lines.length];
    },
  };
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  /* ---------- 棋盘坐标工具 ---------- */
  A.coord = {
    toAlpha: (x) => String.fromCharCode(97 + x), // a,b,c...
    num: (y, size) => size - y,                   // 棋盘坐标（底=1）
  };

  /* ---------- 设置面板（注入到指定容器） ---------- */
  A.renderSettings = function (mount) {
    const c = A.loadLLMConfig();
    mount.innerHTML = `
      <div class="panel">
        <h3>AI 设置（OpenAI 兼容）</h3>
        <p class="muted" style="margin-top:0">在 Operit 内可复用其已配置模型；在 Operit 外填入你的接口。配置后 AI 即可实时讲解与「大师级」落子。</p>
        <div class="row" style="margin-bottom:10px">
          <label class="muted">Base URL</label>
          <input type="text" id="setBase" style="flex:1;min-width:200px" placeholder="https://api.openai.com/v1" value="${c.baseUrl || ""}">
        </div>
        <div class="row" style="margin-bottom:10px">
          <label class="muted">API Key</label>
          <input type="password" id="setKey" style="flex:1;min-width:200px" placeholder="sk-..." value="${c.apiKey || ""}">
        </div>
        <div class="row" style="margin-bottom:12px">
          <label class="muted">Model</label>
          <input type="text" id="setModel" style="flex:1;min-width:160px" placeholder="gpt-4o-mini" value="${c.model || ""}">
        </div>
        <div class="row">
          <button class="btn primary" id="setSave">保存</button>
          <span class="tag" id="setState">${A.LLM.isConfigured() ? "已配置 ✓" : "未配置"}</span>
        </div>
      </div>`;
    mount.querySelector("#setSave").addEventListener("click", () => {
      A.saveLLMConfig({
        baseUrl: mount.querySelector("#setBase").value.trim(),
        apiKey: mount.querySelector("#setKey").value.trim(),
        model: mount.querySelector("#setModel").value.trim(),
      });
      mount.querySelector("#setState").textContent = A.LLM.isConfigured() ? "已配置 ✓" : "未配置";
      A.toast("AI 设置已保存");
    });
  };

})(typeof window !== "undefined" ? window : globalThis);
