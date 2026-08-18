/* ===== Operit 棋院 · 共享逻辑（聊天 / LLM 桥 / 本地教练） =====
 * 聊天身份 = 所选角色卡（默认跟随 Operit 当前角色卡），棋院不引入额外的 AI 助手。
 * 所有对外请求都过 Budget 预算：紧凑局面、解说节流、回复封顶、历史裁剪、缓存复用。
 */
(function (g) {
  "use strict";
  const A = (g.ChessArena = g.ChessArena || {});
  const P = () => A.Persona;
  const B = () => A.Budget;

  /* ---------- 提示条 ---------- */
  let toastTimer = null;
  A.toast = function (msg, ms = 1900) {
    let el = document.getElementById("__toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "__toast"; el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  };

  /* ---------- LLM 配置（OpenAI 兼容） ---------- */
  const LS_KEY = "operit_chess_llm";
  A.loadLLMConfig = function () {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  };
  A.saveLLMConfig = function (cfg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {}
  };

  A.LLM = {
    cfg() { return A.loadLLMConfig(); },
    isConfigured() { const c = this.cfg(); return !!(c.baseUrl && c.apiKey); },
    async complete(messages, opts = {}) {
      const c = this.cfg();
      if (!c.baseUrl || !c.apiKey) throw new Error("未配置 AI：请在「设置」里填 Base URL 与 API Key");
      const url = c.baseUrl.replace(/\/+$/, "") + "/chat/completions";
      const body = {
        model: c.model || "gpt-4o-mini",
        messages,
        temperature: opts.temperature != null ? opts.temperature : 0.75,
        stream: false,
        max_tokens: opts.maxTokens || B().maxTokens(),
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.apiKey },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error("AI 请求失败(" + res.status + ")" + (t ? "：" + t.slice(0, 160) : ""));
      }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message.content) || "";
    },
  };

  /* ---------- Operit 宿主桥 ---------- */
  A.Operit = {
    host() { return g.host || g.operitHost || null; },
    available() {
      const h = this.host();
      return !!(h && (typeof h.toolCall === "function" || typeof h.complete === "function"));
    },
    async chat(messages, opts = {}) {
      const h = this.host();
      if (h && typeof h.toolCall === "function") {
        try {
          const r = await h.toolCall("llm_chat", { messages, maxTokens: opts.maxTokens || B().maxTokens() });
          const t = r && (r.content || r.text || r.message);
          if (t) return t;
        } catch (e) { /* 回落 */ }
      }
      if (h && typeof h.complete === "function") {
        try {
          const r = await h.complete(messages);
          if (r) return typeof r === "string" ? r : (r.content || "");
        } catch (e) { /* 回落 */ }
      }
      return A.LLM.complete(messages, opts);
    },
  };

  A.hasAI = function () { return A.Operit.available() || A.LLM.isConfigured(); };

  /* ================= 聊天面板 ================= */
  A.Chat = class {
    /**
     * @param {HTMLElement} mount
     * @param {Object} opt
     *   game: string                棋种名（用于文案）
     *   rules: string               最小规则说明（尽量短，会进 system prompt）
     *   context: (mode)=>string     局面文本；mode="brief"（省）| "full"（完整棋盘）
     *   localTip: ()=>string        本地教练一句话（跳过请求时使用）
     */
    constructor(mount, opt) {
      this.mount = mount;
      this.opt = opt || {};
      this.hist = [];           // [{role,content}] 供裁剪后回传
      this.render();
      this.greet();
      g.addEventListener("arena:persona", () => { this.paintWho(); });
      P().probeHost().then(() => this.paintWho());
    }

    render() {
      this.mount.innerHTML =
        '<div class="chat">' +
          '<div class="who" id="chatWho"></div>' +
          '<div class="log" id="chatLog"></div>' +
          '<div class="input">' +
            '<textarea id="chatInput" placeholder="说点什么…（也可以不聊棋）"></textarea>' +
            '<button class="btn primary" id="chatSend">发送</button>' +
          "</div>" +
        "</div>";
      this.logEl = this.mount.querySelector("#chatLog");
      const input = this.mount.querySelector("#chatInput");
      this.mount.querySelector("#chatSend").addEventListener("click", () => this.sendFromInput());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendFromInput(); }
      });
      this.paintWho();
    }

    paintWho() {
      const w = this.mount.querySelector("#chatWho");
      if (!w) return;
      const c = P().current();
      const nm = c.follow ? "跟随 Operit 角色卡" : c.name;
      const tip = c.follow
        ? (P().hostCards.length ? "当前：" + P().hostCards[0].name : "由 Operit 里正在聊的角色说话")
        : "本地角色卡";
      w.innerHTML = '<span class="msg ai" style="display:inline-flex"><span class="av">' + P().avatar() + "</span></span>" +
        "<b>" + A.esc(nm) + "</b><span>· " + A.esc(tip) + "</span>";
    }

    greet() {
      const c = P().current();
      const gr = P().greeting(this.opt.game);
      if (gr) this.add("ai", gr);
      else this.sys("已跟随 Operit 角色卡：这里说话的就是你正在聊的 TA，棋院不会另开一个助手。可在「对手」里更换。");
    }

    add(role, text, ev) {
      const d = document.createElement("div");
      d.className = "msg " + role;
      const av = role === "user" ? "你" : P().avatar();
      d.innerHTML = '<div class="av">' + av + '</div><div><div class="bubble"></div><div class="ev"></div></div>';
      d.querySelector(".bubble").textContent = text;
      const evEl = d.querySelector(".ev");
      if (ev) evEl.innerHTML = ev; else evEl.remove();
      this.logEl.appendChild(d);
      this.logEl.scrollTop = this.logEl.scrollHeight;
      return d;
    }
    sys(text) {
      const d = document.createElement("div");
      d.className = "msg sys";
      d.innerHTML = '<div class="av" style="background:transparent;color:var(--muted);border:1px dashed var(--line)">·</div><div class="bubble"></div>';
      d.querySelector(".bubble").textContent = text;
      this.logEl.appendChild(d);
      this.logEl.scrollTop = this.logEl.scrollHeight;
      return d;
    }
    /* 不花 token 的本地一句话 */
    local(text) {
      return this.add("ai", text, '<span class="local-badge">本地 · 0 token</span>');
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

    /* 组装消息：system(角色卡+规则) + 裁剪历史 + 最新局面 + 用户话 */
    build(userText, ctxMode) {
      const sys = P().systemPrompt(this.opt.rules || "", B().replyLimit());
      const ctx = (this.opt.context && this.opt.context(ctxMode || (B().compact() ? "brief" : "full"))) || "";
      const msgs = [{ role: "system", content: sys }];
      for (const m of B().trim(this.hist)) msgs.push(m);
      msgs.push({ role: "user", content: (ctx ? "【局面】" + ctx + "\n" : "") + userText });
      return msgs;
    }

    async askAI(userText) {
      if (!A.hasAI()) {
        this.local(this.tipText() + "（还没接 AI：在「设置」填好接口，或在 Operit 内打开本页，TA 就能开口了）");
        B().saveSkip(260);
        return;
      }
      const messages = this.build(userText);
      const key = B().keyOf(messages);
      const hit = B().cacheGet(key);
      if (hit) { this.add("ai", hit, '<span class="local-badge">缓存 · 0 token</span>'); B().saveSkip(); return; }

      const bubble = this.add("ai", "…");
      try {
        const reply = (await A.Operit.chat(messages, { temperature: 0.8 })).trim();
        bubble.querySelector(".bubble").textContent = reply || "（没有回复）";
        B().note(messages, reply);
        B().cacheSet(key, reply);
        this.hist.push({ role: "user", content: userText }, { role: "assistant", content: reply });
        if (this.hist.length > 16) this.hist = this.hist.slice(-16);
      } catch (e) {
        bubble.querySelector(".bubble").textContent = "⚠️ " + e.message + "\n" + this.tipText();
      }
      this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    /**
     * 主动解说。kind="key" 关键时刻（将军/成三/终局…）；"routine" 普通一手。
     * 不满足预算时改用本地教练，一分钱 token 不花。
     */
    async narrate(kind, promptText) {
      if (!B().allowNarrate(kind) || !A.hasAI()) {
        if (kind === "key" || B().cfg().narrate === "every") this.local(this.tipText());
        B().saveSkip();
        return;
      }
      const messages = this.build(promptText);
      const key = B().keyOf(messages);
      const hit = B().cacheGet(key);
      if (hit) { this.add("ai", hit, '<span class="local-badge">缓存 · 0 token</span>'); B().saveSkip(); return; }
      try {
        const reply = (await A.Operit.chat(messages, { temperature: 0.75 })).trim();
        if (reply) {
          this.add("ai", reply);
          B().note(messages, reply);
          B().cacheSet(key, reply);
        }
      } catch (e) { this.local(this.tipText()); }
    }

    tipText() {
      const t = this.opt.localTip && this.opt.localTip();
      return t || A.Coach.tip(this.opt.game || "");
    }
  };

  /* ---------- 本地教练：无 LLM / 跳过请求时的零成本解说 ---------- */
  A.Coach = {
    lines: [
      "先看对手最想下哪一点，把那里守住，往往比自己往前冲更值。",
      "子力散着容易被各个击破，先把已有的连成一片。",
      "占先手时要制造两个威胁——对手只能挡一个。",
      "落子前默数一遍：这步之后我怕什么？",
      "中心比边角值钱，除非你在做局。",
      "被逼着应招的时候，找找有没有反将的机会。",
    ],
    tip(seed) {
      let h = 0; const s = String(seed) + Date.now().toString().slice(-4);
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return this.lines[Math.abs(h) % this.lines.length];
    },
  };

  /* ---------- 坐标工具 ---------- */
  A.coord = {
    toAlpha: (x) => String.fromCharCode(97 + x),
    num: (y, size) => size - y,
  };

  /* ---------- AI 接口设置面板 ---------- */
  A.renderSettings = function (mount) {
    const c = A.loadLLMConfig();
    const inOperit = A.Operit.available();
    mount.innerHTML =
      '<div class="field"><label>Base URL</label><input type="text" id="setBase" placeholder="https://api.openai.com/v1" value="' + A.esc(c.baseUrl || "") + '"></div>' +
      '<div class="field"><label>API Key</label><input type="password" id="setKey" placeholder="sk-..." value="' + A.esc(c.apiKey || "") + '"></div>' +
      '<div class="field"><label>模型</label><input type="text" id="setModel" placeholder="gpt-4o-mini" value="' + A.esc(c.model || "") + '"></div>' +
      '<div class="row"><button class="btn primary sm" id="setSave">保存</button>' +
      '<span class="tag" id="setState">' + (inOperit ? "已接入 Operit 宿主 ✓" : (A.LLM.isConfigured() ? "已配置 ✓" : "未配置")) + "</span></div>" +
      '<p class="note">在 Operit 内置浏览器里打开本页会自动走 Operit 的模型与角色卡，这里可以留空。' +
      "在普通浏览器里才需要填自己的 OpenAI 兼容接口。密钥只存在本机浏览器。</p>";
    mount.querySelector("#setSave").addEventListener("click", () => {
      A.saveLLMConfig({
        baseUrl: mount.querySelector("#setBase").value.trim(),
        apiKey: mount.querySelector("#setKey").value.trim(),
        model: mount.querySelector("#setModel").value.trim(),
      });
      mount.querySelector("#setState").textContent = A.LLM.isConfigured() ? "已配置 ✓" : "未配置";
      A.toast("已保存");
    });
  };

  /* ---------- 标签页：读 .tabs .tab[data-tab] → 切 #tab-<key> ---------- */
  A.bindTabs = function () {
    const tabs = Array.prototype.slice.call(document.querySelectorAll(".tabs .tab"));
    const show = (t) => {
      tabs.forEach((x) => {
        x.classList.toggle("active", x === t);
        const p = document.getElementById("tab-" + x.dataset.tab);
        if (p) p.classList.toggle("hidden", x !== t);
      });
    };
    tabs.forEach((t) => t.addEventListener("click", () => show(t)));
    const cur = tabs.find((t) => t.classList.contains("active")) || tabs[0];
    if (cur) show(cur);
  };

  /* ---------- 一次性挂载 对手 / 主题 / 省token / 接口 四个面板 ---------- */
  A.mountPanels = function (opt) {
    opt = opt || {};
    const byId = (id) => (id ? document.getElementById(id) : null);
    const pm = byId(opt.persona), tm = byId(opt.theme), bm = byId(opt.budget), sm = byId(opt.settings);
    if (pm && A.Persona) A.Persona.renderPicker(pm, opt.onPersona);
    if (tm && A.renderThemePicker) A.renderThemePicker(tm);
    if (bm && A.Budget) A.Budget.renderPanel(bm);
    if (sm) A.renderSettings(sm);
  };

  A.esc = A.esc || function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  };
})(typeof window !== "undefined" ? window : globalThis);
