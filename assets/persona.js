/* ===== Operit 棋院 · 角色卡（下棋对象） =====
 * 设计原则：棋院不引入任何「新的 AI 助手」身份。
 *  · 默认「跟随 Operit 角色卡」：不注入任何人设，只补一段极短的棋规说明，
 *    说话的仍然是你在 Operit 里正在聊的那个角色。
 *  · 若宿主暴露了角色卡列表，可直接从列表里挑对手。
 *  · 在 Operit 之外（普通浏览器）可用本地角色卡，支持导入 SillyTavern / Operit 风格 JSON。
 */
(function (g) {
  "use strict";
  const A = (g.ChessArena = g.ChessArena || {});
  const LS_SEL = "operit_chess_persona_sel";
  const LS_CARDS = "operit_chess_persona_cards";
  const MAX_PERSONA = 420; // 人设注入上限（省 token）

  const FOLLOW = {
    id: "__follow__",
    name: "跟随 Operit 角色卡",
    emoji: "❖",
    follow: true,
    persona: "",
    desc: "不注入任何人设——说话的就是你在 Operit 里正在聊的那个角色。推荐在 Operit 内使用，也最省 token。",
  };

  const SAMPLES = [
    {
      id: "s_suqing", sample: true, emoji: "🌦", name: "苏卿",
      persona: "江南书院里长大的女子，说话温婉带点旧时腔调，喜欢在落子间隙说些园子里的琐事——雨打芭蕉、井边的青苔。棋风稳，不爱抢，但会在你松懈时悄悄收网。赢了会替你找台阶，输了会说下次再来。",
      style: "轻声、简短、偶尔用「呀」「罢了」这类语气词，不用网络流行语。",
      greeting: "雨才停，石桌还潮着。我先擦一擦——你要执黑还是执白？",
    },
    {
      id: "s_ache", sample: true, emoji: "🌘", name: "阿澈",
      persona: "清冷少年，话少，落子快而锐利，喜欢强攻。表面上懒得解释，但你走错了他会用一句短话把关键点戳出来。偶尔突然关心一下你，说完就装作没说过。",
      style: "短句，五到十五字为主，很少用感叹号。",
      greeting: "坐吧。别磨蹭，你先走。",
    },
    {
      id: "s_zhu", sample: true, emoji: "🎋", name: "竹先生",
      persona: "教了四十年棋的老先生，爱讲古谱和典故，会在你走坏棋时敲敲桌子，但从不真的生气。讲解时喜欢先问你一句「你觉得为什么」。",
      style: "语气长者、口语、爱举例子，每次只讲一个要点。",
      greeting: "来了？先别急着下。你说说，开局最要紧的是什么？",
    },
  ];

  function readJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  const P = A.Persona = {
    hostCards: [],   // 宿主（Operit）暴露的角色卡
    hostReady: false,

    localCards() {
      const raw = readJSON(LS_CARDS, null);
      return raw === null ? SAMPLES.slice() : raw;
    },
    saveLocal(list) { writeJSON(LS_CARDS, list); },

    all() { return [FOLLOW].concat(this.hostCards, this.localCards()); },

    selectedId() { try { return localStorage.getItem(LS_SEL) || FOLLOW.id; } catch (e) { return FOLLOW.id; } },
    select(id) {
      try { localStorage.setItem(LS_SEL, id); } catch (e) {}
      try { g.dispatchEvent(new CustomEvent("arena:persona", { detail: id })); } catch (e) {}
    },
    current() {
      const id = this.selectedId();
      return this.all().find((c) => c.id === id) || FOLLOW;
    },

    /* ---------- 宿主角色卡探测（字段名做多重兜底，探不到就静默） ---------- */
    async probeHost() {
      if (this.hostReady) return this.hostCards;
      this.hostReady = true;
      const host = g.host || g.operitHost || null;
      const norm = (c) => normalize(c, "host");
      // 1) 全局对象直挂
      const direct = g.operitCharacter || g.operitCharacters || (host && (host.character || host.characters));
      if (direct) {
        const arr = Array.isArray(direct) ? direct : [direct];
        this.hostCards = arr.map(norm).filter(Boolean);
      }
      // 2) toolCall 探测
      if (!this.hostCards.length && host && typeof host.toolCall === "function") {
        const tries = ["list_character_cards", "list_characters", "get_character_cards", "get_current_character"];
        for (const t of tries) {
          try {
            const r = await host.toolCall(t, {});
            const arr = Array.isArray(r) ? r : (r && (r.cards || r.characters || r.data)) || (r && r.name ? [r] : null);
            if (arr && arr.length) { this.hostCards = arr.map(norm).filter(Boolean); break; }
          } catch (e) { /* 下一个 */ }
        }
      }
      if (this.hostCards.length) {
        try { g.dispatchEvent(new CustomEvent("arena:persona-host", { detail: this.hostCards.length })); } catch (e) {}
      }
      return this.hostCards;
    },

    /* ---------- 增删改 / 导入 ---------- */
    upsert(card) {
      const list = this.localCards();
      const i = list.findIndex((c) => c.id === card.id);
      if (i >= 0) list[i] = card; else list.push(card);
      this.saveLocal(list);
      return card;
    },
    remove(id) {
      const list = this.localCards().filter((c) => c.id !== id);
      this.saveLocal(list);
      if (this.selectedId() === id) this.select(FOLLOW.id);
    },
    importText(text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error("不是合法 JSON"); }
      const arr = Array.isArray(obj) ? obj : [obj.data && obj.data.name ? obj.data : obj];
      const out = [];
      for (const raw of arr) {
        const c = normalize(raw, "local");
        if (c) { this.upsert(c); out.push(c); }
      }
      if (!out.length) throw new Error("没读到 name / description 字段");
      return out;
    },

    /* ---------- 供聊天使用 ---------- */
    displayName() { const c = this.current(); return c.follow ? (this.hostCards[0] && this.hostCards[0].name) || "TA" : c.name; },
    avatar() {
      const c = this.current();
      if (c.avatar) return '<img src="' + esc(c.avatar) + '" alt="">';
      return c.emoji || (c.name || "对").slice(0, 1);
    },
    greeting(gameName) {
      const c = this.current();
      if (c.follow) return null; // 跟随模式不伪造开场白，交给宿主角色
      if (c.greeting) return c.greeting;
      return "我们下一局" + (gameName || "棋") + "？你先。";
    },

    /**
     * 组装 system prompt。
     * @param {string} rules 该棋种的最小规则说明（各页传入，尽量短）
     * @param {number} limit 回复字数上限（由省 token 设置决定）
     */
    systemPrompt(rules, limit) {
      const c = this.current();
      const cap = "回复不超过" + (limit || 60) + "字。";
      if (c.follow) {
        // 关键：不注入任何人设，保持宿主角色卡的身份与语气
        return "保持你现有的身份与说话风格，不要自称 AI、助手或教练。" +
               "你正在和用户下棋，可以看到局面。" + rules + cap;
      }
      let s = "你是" + c.name + "。";
      if (c.persona) s += clip(c.persona, MAX_PERSONA);
      if (c.style) s += "说话风格：" + clip(c.style, 120);
      s += "始终以" + c.name + "的身份说话，不要自称 AI 或助手。你正在和用户下棋，能看到局面。";
      return s + rules + cap;
    },

    /* ---------- 选择器 UI ---------- */
    renderPicker(mount, onChange) {
      const self = this;
      function paint() {
        const cur = self.selectedId();
        const cards = self.all();
        mount.innerHTML =
          '<div class="persona-list">' +
          cards.map((c) => {
            const isSample = c.sample ? '<span class="tag">示例</span>' : "";
            const isHost = c.fromHost ? '<span class="tag">Operit</span>' : "";
            const ops = (c.follow || c.fromHost) ? "" :
              '<div class="ops"><button class="mini" data-edit="' + c.id + '">改</button>' +
              '<button class="mini" data-del="' + c.id + '">删</button></div>';
            return '<div class="persona' + (c.id === cur ? " active" : "") + '" data-pick="' + c.id + '">' +
              '<div class="face">' + (c.avatar ? '<img src="' + esc(c.avatar) + '">' : (c.emoji || "❖")) + "</div>" +
              "<div style=\"min-width:0\"><div class=\"nm\">" + esc(c.name) + isHost + isSample + "</div>" +
              '<div class="ds">' + esc(clip(c.desc || c.persona || "（无人设描述）", 96)) + "</div></div>" + ops +
            "</div>";
          }).join("") + "</div>" +
          '<div class="row" style="margin-top:11px">' +
          '<button class="btn sm" id="pNew">＋ 新建角色</button>' +
          '<button class="btn sm" id="pImp">导入 JSON</button>' +
          '<button class="btn sm ghost" id="pReset">恢复示例</button></div>' +
          '<div id="pEdit"></div>' +
          '<p class="note">聊天与解说全部由所选角色卡驱动，棋院不会另外插入一个 AI 助手。' +
          "在 Operit 内建议保持「跟随 Operit 角色卡」——说话的就是你正在聊的那个 TA。</p>";

        mount.querySelectorAll("[data-pick]").forEach((n) => n.addEventListener("click", (e) => {
          if (e.target.closest(".ops")) return;
          self.select(n.dataset.pick); paint();
          if (onChange) onChange(self.current());
          if (A.toast) A.toast("下棋对象：" + (self.current().follow ? "跟随 Operit 角色卡" : self.current().name));
        }));
        mount.querySelectorAll("[data-del]").forEach((n) => n.addEventListener("click", () => {
          self.remove(n.dataset.del); paint(); if (onChange) onChange(self.current());
        }));
        mount.querySelectorAll("[data-edit]").forEach((n) => n.addEventListener("click", () => {
          editor(self.all().find((c) => c.id === n.dataset.edit));
        }));
        mount.querySelector("#pNew").addEventListener("click", () => editor(null));
        mount.querySelector("#pImp").addEventListener("click", () => importer());
        mount.querySelector("#pReset").addEventListener("click", () => {
          self.saveLocal(SAMPLES.slice()); paint(); if (A.toast) A.toast("已恢复示例角色");
        });

        function editor(card) {
          const c = card || { id: "c_" + Date.now().toString(36), emoji: "🌸", name: "", persona: "", style: "", greeting: "" };
          mount.querySelector("#pEdit").innerHTML =
            '<div class="panel sub" style="margin-top:11px">' +
            '<div class="field"><label>名字</label><input type="text" id="eName" value="' + esc(c.name) + '" placeholder="TA 叫什么"></div>' +
            '<div class="field"><label>头像</label><input type="text" id="eEmoji" value="' + esc(c.emoji || "") + '" placeholder="emoji 或图片 URL"></div>' +
            '<div class="field" style="align-items:flex-start"><label>人设</label>' +
            '<textarea id="ePersona" rows="4" style="flex:1;min-width:180px" placeholder="性格、身份、棋风、和你的关系…">' + esc(c.persona || "") + "</textarea></div>" +
            '<div class="field"><label>说话风格</label><input type="text" id="eStyle" value="' + esc(c.style || "") + '" placeholder="短句 / 温婉 / 爱用旧时腔调"></div>' +
            '<div class="field"><label>开场白</label><input type="text" id="eGreet" value="' + esc(c.greeting || "") + '" placeholder="进入棋局时 TA 说的第一句"></div>' +
            '<div class="row"><button class="btn primary sm" id="eSave">保存</button>' +
            '<button class="btn sm ghost" id="eCancel">取消</button>' +
            '<span class="muted" style="font-size:12px">人设越长越费 token，建议 200 字内</span></div></div>';
          mount.querySelector("#eCancel").onclick = () => (mount.querySelector("#pEdit").innerHTML = "");
          mount.querySelector("#eSave").onclick = () => {
            const v = (id) => mount.querySelector(id).value.trim();
            if (!v("#eName")) { if (A.toast) A.toast("先给 TA 起个名字"); return; }
            const emoji = v("#eEmoji");
            const nc = {
              id: c.id, name: v("#eName"), persona: v("#ePersona"), style: v("#eStyle"), greeting: v("#eGreet"),
            };
            if (/^https?:\/\//.test(emoji)) nc.avatar = emoji; else nc.emoji = emoji || "🌸";
            self.upsert(nc); self.select(nc.id); paint();
            if (onChange) onChange(self.current());
            if (A.toast) A.toast("已保存：" + nc.name);
          };
        }
        function importer() {
          mount.querySelector("#pEdit").innerHTML =
            '<div class="panel sub" style="margin-top:11px">' +
            '<textarea id="iText" rows="5" style="width:100%" placeholder=\'粘贴角色卡 JSON（支持 {name, description, personality, first_mes} 或 Operit 导出格式）\'></textarea>' +
            '<div class="row" style="margin-top:8px"><button class="btn primary sm" id="iGo">导入</button>' +
            '<button class="btn sm ghost" id="iCancel">取消</button></div></div>';
          mount.querySelector("#iCancel").onclick = () => (mount.querySelector("#pEdit").innerHTML = "");
          mount.querySelector("#iGo").onclick = () => {
            try {
              const got = self.importText(mount.querySelector("#iText").value);
              self.select(got[0].id); paint();
              if (onChange) onChange(self.current());
              if (A.toast) A.toast("已导入 " + got.length + " 张角色卡");
            } catch (e) { if (A.toast) A.toast("导入失败：" + e.message); }
          };
        }
      }
      paint();
      // 宿主角色卡异步到位后刷新列表
      this.probeHost().then((cs) => { if (cs && cs.length) paint(); });
    },
  };

  /* ---------- 工具 ---------- */
  function normalize(raw, src) {
    if (!raw || typeof raw !== "object") return null;
    const d = raw.data && raw.data.name ? raw.data : raw;
    const name = d.name || d.char_name || d.title;
    if (!name) return null;
    const persona = [d.description, d.personality, d.scenario, d.prompt, d.systemPrompt, d.system_prompt]
      .filter(Boolean).join(" ");
    const c = {
      id: (src === "host" ? "h_" : "c_") + (d.id || name).toString().replace(/\s+/g, "_"),
      name: String(name),
      persona: clip(String(persona || ""), 1200),
      style: d.style || d.tone || "",
      greeting: d.first_mes || d.greeting || d.firstMessage || "",
      emoji: d.emoji || "❖",
      desc: clip(String(d.description || persona || ""), 96),
    };
    if (d.avatar && /^https?:\/\/|^data:/.test(String(d.avatar))) c.avatar = d.avatar;
    if (src === "host") c.fromHost = true;
    return c;
  }
  function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  A.esc = A.esc || esc;
})(typeof window !== "undefined" ? window : globalThis);
