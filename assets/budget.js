/* ===== Operit 棋院 · Token 预算 =====
 * 省 token 的六件事：
 *  1) 紧凑局面：用 FEN / 着法列表代替整盘 dump（围棋 19×19 一次省 ~350 token）
 *  2) 解说节流：默认只在关键时刻（将军 / 成三 / 吃大子 / 终局）请求解说，普通落子走本地教练
 *  3) 回复封顶：max_tokens 跟随「回复长度」设置
 *  4) 历史裁剪：只带最近 N 轮，且把历史里的旧局面剥掉（局面只保留最新一份）
 *  5) 结果缓存：同局面 + 同问题直接复用，不再请求
 *  6) 本地优先：落子由本地引擎负责，大模型只管说话（默认不让大模型执子）
 */
(function (g) {
  "use strict";
  const A = (g.ChessArena = g.ChessArena || {});
  const LS_CFG = "operit_chess_budget";
  const LS_MET = "operit_chess_meter";

  const DEF = {
    narrate: "key",    // off | key | every
    replyLimit: 60,    // 字
    history: 2,        // 轮
    compact: true,     // 紧凑局面
    cache: true,       // 复用缓存
  };

  const cache = new Map();
  const session = { calls: 0, in: 0, out: 0, saved: 0 };

  const B = A.Budget = {
    /* ---------- 配置 ---------- */
    cfg() {
      let c = {};
      try { c = JSON.parse(localStorage.getItem(LS_CFG)) || {}; } catch (e) {}
      return Object.assign({}, DEF, c);
    },
    set(k, v) {
      const c = this.cfg(); c[k] = v;
      try { localStorage.setItem(LS_CFG, JSON.stringify(c)); } catch (e) {}
      try { g.dispatchEvent(new CustomEvent("arena:budget", { detail: c })); } catch (e) {}
    },
    maxTokens() { return Math.round(this.cfg().replyLimit * 1.9) + 24; },
    replyLimit() { return this.cfg().replyLimit; },
    compact() { return this.cfg().compact !== false; },

    /* ---------- 估算 ---------- */
    est(s) {
      s = String(s == null ? "" : s);
      const cjk = (s.match(/[\u3000-\u303F\u3400-\u9FFF\uFF00-\uFFEF]/g) || []).length;
      return Math.round(cjk * 0.9 + (s.length - cjk) / 3.6);
    },
    estMsgs(messages) {
      return (messages || []).reduce((n, m) => n + B.est(m.content) + 4, 0);
    },

    /* ---------- 计量 ---------- */
    total() {
      let t = {};
      try { t = JSON.parse(localStorage.getItem(LS_MET)) || {}; } catch (e) {}
      return Object.assign({ calls: 0, in: 0, out: 0, saved: 0 }, t);
    },
    session() { return session; },
    note(messages, reply) {
      const i = this.estMsgs(messages), o = this.est(reply);
      session.calls++; session.in += i; session.out += o;
      const t = this.total(); t.calls++; t.in += i; t.out += o;
      try { localStorage.setItem(LS_MET, JSON.stringify(t)); } catch (e) {}
      this.lastCost = i + o;
      this._emit();
    },
    /* 跳过一次请求：按上次实际开销估算省下的量 */
    saveSkip(approx) {
      const v = approx || this.lastCost || 300;
      session.saved += v;
      const t = this.total(); t.saved += v;
      try { localStorage.setItem(LS_MET, JSON.stringify(t)); } catch (e) {}
      this._emit();
    },
    resetTotal() {
      try { localStorage.removeItem(LS_MET); } catch (e) {}
      session.calls = session.in = session.out = session.saved = 0;
      this._emit();
    },
    _emit() { try { g.dispatchEvent(new CustomEvent("arena:meter")); } catch (e) {} },

    /* ---------- 解说节流 ---------- */
    /** kind: "key"（将军/成三/终局等）| "routine"（普通一手） */
    allowNarrate(kind) {
      const m = this.cfg().narrate;
      if (m === "off") return false;
      if (m === "every") return true;
      return kind === "key";
    },

    /* ---------- 历史裁剪：只留最近 N 轮，且剥掉旧局面 ---------- */
    trim(historyMsgs) {
      const n = this.cfg().history * 2;
      if (n <= 0) return [];
      const keep = historyMsgs.slice(-n);
      return keep.map((m) =>
        m.role === "user" ? { role: "user", content: stripCtx(m.content) } : m
      );
    },

    /* ---------- 缓存 ---------- */
    keyOf(messages) {
      let s = "";
      for (const m of messages) s += m.role + "|" + m.content + "\n";
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) | 0;
      return h + ":" + s.length;
    },
    cacheGet(k) { return this.cfg().cache !== false ? cache.get(k) : undefined; },
    cacheSet(k, v) { if (this.cfg().cache !== false) { if (cache.size > 60) cache.clear(); cache.set(k, v); } },

    /* ---------- 面板 ---------- */
    renderPanel(mount) {
      const c = this.cfg();
      const opt = (v, cur, t) => '<option value="' + v + '"' + (String(cur) === String(v) ? " selected" : "") + ">" + t + "</option>";
      mount.innerHTML =
        '<div class="field"><label>AI 解说</label><select id="bNar">' +
          opt("key", c.narrate, "只在关键时刻（推荐·省）") +
          opt("off", c.narrate, "关闭（最省）") +
          opt("every", c.narrate, "每手都说（费）") +
        "</select></div>" +
        '<div class="field"><label>回复长度</label><select id="bLim">' +
          opt(40, c.replyLimit, "40 字（最省）") +
          opt(60, c.replyLimit, "60 字（推荐）") +
          opt(120, c.replyLimit, "120 字") +
          opt(200, c.replyLimit, "200 字（费）") +
        "</select></div>" +
        '<div class="field"><label>记忆轮数</label><select id="bHis">' +
          opt(0, c.history, "0 轮（最省）") +
          opt(2, c.history, "2 轮（推荐）") +
          opt(4, c.history, "4 轮") +
          opt(6, c.history, "6 轮（费）") +
        "</select></div>" +
        '<div class="row" style="gap:14px;margin-bottom:4px">' +
          '<label class="row" style="gap:6px"><input type="checkbox" id="bCmp"' + (c.compact ? " checked" : "") + "> 紧凑局面</label>" +
          '<label class="row" style="gap:6px"><input type="checkbox" id="bCch"' + (c.cache ? " checked" : "") + "> 复用缓存</label>" +
        "</div>" +
        '<div class="meter" id="bMeter"></div>' +
        '<div class="row" style="margin-top:9px"><button class="btn sm ghost" id="bReset">清零统计</button>' +
        '<span class="muted" style="font-size:12px" id="bTotal"></span></div>' +
        '<p class="note" id="bTips"></p>';

      const meter = () => {
        const s = B.session(), t = B.total();
        mount.querySelector("#bMeter").innerHTML =
          '<div><div class="v">' + s.calls + '</div><div class="k">本局请求</div></div>' +
          '<div><div class="v">' + fmt(s.in + s.out) + '</div><div class="k">本局约耗 token</div></div>' +
          '<div><div class="v" style="color:var(--win)">' + fmt(s.saved) + '</div><div class="k">本局约省</div></div>';
        mount.querySelector("#bTotal").textContent = "累计：" + t.calls + " 次 / 约 " + fmt(t.in + t.out) + " token，已省约 " + fmt(t.saved);
        const cc = B.cfg();
        mount.querySelector("#bTips").textContent =
          "当前生效：" + (cc.compact ? "紧凑局面（FEN/着法列表）· " : "") +
          ({ off: "不主动解说 · ", key: "仅关键时刻解说 · ", every: "每手解说 · " }[cc.narrate]) +
          "回复≤" + cc.replyLimit + "字 · 记忆" + cc.history + "轮" + (cc.cache ? " · 复用缓存" : "") +
          "。落子由本地引擎负责，大模型只管说话——这一项省得最多。";
      };
      mount.querySelector("#bNar").onchange = (e) => { B.set("narrate", e.target.value); meter(); };
      mount.querySelector("#bLim").onchange = (e) => { B.set("replyLimit", +e.target.value); meter(); };
      mount.querySelector("#bHis").onchange = (e) => { B.set("history", +e.target.value); meter(); };
      mount.querySelector("#bCmp").onchange = (e) => { B.set("compact", e.target.checked); meter(); };
      mount.querySelector("#bCch").onchange = (e) => { B.set("cache", e.target.checked); meter(); };
      mount.querySelector("#bReset").onclick = () => { B.resetTotal(); meter(); if (A.toast) A.toast("统计已清零"); };
      g.addEventListener("arena:meter", meter);
      meter();
    },
  };

  function stripCtx(s) {
    return String(s || "").replace(/【局面[^】]*】[\s\S]*?(?:\n\n|$)/g, "").trim() || "（略）";
  }
  function fmt(n) { return n >= 10000 ? (n / 10000).toFixed(1) + "w" : (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n)); }
})(typeof window !== "undefined" ? window : globalThis);
