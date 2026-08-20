/* ===== 围棋 UI（主题化 / HiDPI / 角色卡驱动 / 省 token） =====
 * 修复：换 9/13/19 路后格距没有重算的问题（原来 C 只算一次）。
 */
(function () {
  "use strict";
  const A = window.ChessArena;
  const { BLACK, WHITE } = GO;

  let size = 19;
  let game = new Go(size);
  const canvas = document.getElementById("board");
  const el = (id) => document.getElementById(id);

  const LOGICAL = 524;          // 画布逻辑边长，各路数共用
  let PAD = 24, C = 26, ctx = null;

  let mode = "ai", humanSide = BLACK, llmPlay = false;
  let hintPt = null, thinking = false, snaps = [], drop = null;

  function geom() {
    PAD = size === 9 ? 34 : size === 13 ? 28 : 24;
    C = (LOGICAL - PAD * 2) / (size - 1);
    ctx = A.setupCanvas(canvas, LOGICAL, LOGICAL);
  }
  const px = (x) => PAD + x * C;
  const py = (y) => PAD + y * C;
  const LET = "ABCDEFGHJKLMNOPQRST";   // 围棋惯例跳过 I
  const cd = (m) => (m.pass ? "停手" : LET[m.x] + (size - m.y));

  function alpha(color, a) {
    const s = String(color || "").trim();
    let r = 0, g = 0, b = 0;
    if (s[0] === "#") {
      const h = s.slice(1);
      if (h.length === 3) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); }
      else { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
    } else { const m = s.match(/(\d+(?:\.\d+)?)/g); if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; } }
    return "rgba(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + "," + a + ")";
  }

  /* 落子缩放动画（克制护眼：0.5→1.0，160ms 缓出） */
  const DUR = 160;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  function dropScale() { return drop ? 0.5 + 0.5 * easeOut(Math.min(1, (performance.now() - drop.t0) / DUR)) : 1; }
  function dropActive() { return !!drop && (performance.now() - drop.t0) < DUR + 30; }
  function startDrop(x, y) { drop = { x, y, t0: performance.now() }; draw(); requestAnimationFrame(stepDrop); }
  function stepDrop() { if (dropActive()) { draw(); requestAnimationFrame(stepDrop); } else { drop = null; draw(); } }

  function stars(n) {
    if (n === 19) return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
    if (n === 13) return [[3,3],[3,9],[9,3],[9,9],[6,6]];
    if (n === 9) return [[2,2],[2,6],[6,2],[6,6],[4,4]];
    return [];
  }

  /* ================= 绘制 ================= */
  function draw() {
    const p = A.palette();
    const span = (size - 1) * C;
    ctx.clearRect(0, 0, LOGICAL, LOGICAL);

    A.rr(ctx, 1, 1, LOGICAL - 2, LOGICAL - 2, p.pixel ? 0 : 10);
    ctx.fillStyle = p.board; ctx.fill();
    ctx.lineWidth = p.pixel ? 2 : 1.2; ctx.strokeStyle = p.line; ctx.stroke();

    ctx.strokeStyle = p.line; ctx.lineWidth = 1;
    for (let i = 0; i < size; i++) {
      ctx.beginPath(); ctx.moveTo(px(0), py(i)); ctx.lineTo(px(size - 1), py(i)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(i), py(0)); ctx.lineTo(px(i), py(size - 1)); ctx.stroke();
    }
    ctx.lineWidth = 1.8;
    ctx.strokeRect(px(0), py(0), span, span);

    ctx.fillStyle = alpha(p.txt, 0.6);
    for (const [sx, sy] of stars(size)) { ctx.beginPath(); ctx.arc(px(sx), py(sy), 3.2, 0, 7); ctx.fill(); }

    /* 坐标 */
    ctx.fillStyle = alpha(p.txt, 0.55);
    ctx.font = (size === 19 ? "9.5px" : "11px") + " ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < size; i++) {
      ctx.fillText(LET[i], px(i), PAD / 2);
      ctx.fillText(LET[i], px(i), LOGICAL - PAD / 2);
      ctx.fillText(String(size - i), PAD / 2, py(i));
      ctx.fillText(String(size - i), LOGICAL - PAD / 2, py(i));
    }

    /* 打劫点 */
    if (game.ko) {
      ctx.strokeStyle = p.warn; ctx.lineWidth = 2;
      ctx.strokeRect(px(game.ko[0]) - C * 0.32, py(game.ko[1]) - C * 0.32, C * 0.64, C * 0.64);
    }
    /* 提示点 */
    if (hintPt) {
      ctx.strokeStyle = p.accent; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(px(hintPt.x), py(hintPt.y), C * 0.45, 0, 7); ctx.stroke();
      ctx.fillStyle = alpha(p.accent, 0.28);
      ctx.beginPath(); ctx.arc(px(hintPt.x), py(hintPt.y), C * 0.3, 0, 7); ctx.fill();
    }

    /* 棋子 */
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = game.board[y][x];
      if (!v) continue;
      stone(x, y, v, p, (drop && drop.x === x && drop.y === y) ? dropScale() : 1);
    }
    /* 上一手 */
    if (game.last && !game.last.pass) {
      ctx.strokeStyle = game.last.c === BLACK ? alpha(p.stoneW, 0.95) : alpha(p.stoneB, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px(game.last.x), py(game.last.y), C * 0.18, 0, 7); ctx.stroke();
    }
  }

  function stone(x, y, v, p, scale) {
    scale = scale || 1;
    const cx = px(x), cy = py(y), r = C * 0.46, isB = v === BLACK;
    ctx.save();
    if (scale !== 1) { ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy); }
    ctx.beginPath(); ctx.arc(cx + 0.7, cy + 1.5, r, 0, 7);
    ctx.fillStyle = "rgba(0,0,0,.24)"; ctx.fill();
    if (p.pixel) {
      ctx.fillStyle = isB ? p.stoneB : p.stoneW;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.lineWidth = 1.6; ctx.strokeStyle = alpha(p.txt, 0.55);
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
    } else {
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      if (isB) { g.addColorStop(0, "#6a6660"); g.addColorStop(0.45, p.stoneB); g.addColorStop(1, "#141310"); }
      else { g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, p.stoneW); g.addColorStop(1, "#cfc9ba"); }
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,.2)"; ctx.stroke();
    }
    ctx.restore();
  }

  /* ================= 状态 ================= */
  function snap() {
    snaps.push({
      board: game.board.map((r) => r.slice()), ko: game.ko, passes: game.passes,
      caps: { 1: game.caps[1], 2: game.caps[2] }, turn: game.turn, over: game.over,
      winner: game.winner, historyLen: game.history.length,
    });
  }
  function updateStatus() {
    if (game.over) {
      if (game.winner) {
        const w = game.winner === BLACK ? "黑" : "白";
        const r = game.scoreResult || game.score();
        el("status").innerHTML = '<b style="color:var(--win)">' + w + "胜</b>（黑 " + r.black.toFixed(1) + " : 白 " + r.white.toFixed(1) + "）";
      } else el("status").textContent = "对局结束";
    } else {
      el("status").textContent = (game.turn === BLACK ? "黑方行棋" : "白方行棋") + (thinking ? " · TA 在想…" : "");
    }
    el("capText").textContent = "提子 — 黑吃白 " + game.caps[1] + "　白吃黑 " + game.caps[2]
      + (game.ko ? "　· 打劫点已用方框标出" : "") + "　第 " + game.history.length + " 手";
    renderMoves();
  }
  function renderMoves() {
    const m = el("moves");
    if (!m) return;
    let h = '<div class="n">#</div><div>黑</div><div>白</div>';
    for (let i = 0; i < game.history.length; i += 2) {
      const b = game.history[i], w = game.history[i + 1];
      h += '<div class="n">' + (i / 2 + 1) + "</div><div>" + (b ? cd(b) : "") + "</div><div>" + (w ? cd(w) : "") + "</div>";
    }
    m.innerHTML = h; m.scrollTop = m.scrollHeight;
  }

  /* ================= 交互 ================= */
  function humanMove(x, y) {
    if (game.over || thinking || game.board[y][x] !== 0) return;
    if (mode === "ai" && game.turn !== humanSide) return;
    snap();
    if (!game.play(x, y, game.turn)) { snaps.pop(); A.toast("这里不能下（自杀或打劫）"); return; }
    hintPt = null; startDrop(x, y); updateStatus();
    if (game.over) { chat.narrate("key", "双方停手，对局结束已数子，说一句收尾。"); return; }
    if (game.last && game.history[game.history.length - 1].cap >= 3) {
      chat.narrate("key", "刚在 " + cd(game.last) + " 提掉了 " + game.history[game.history.length - 1].cap + " 子，说一句。");
    } else {
      chat.narrate("routine", "对手刚下 " + cd(game.last) + "，简单点评一句。");
    }
    if (mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 300);
  }

  async function aiTurn() {
    if (game.over) return;
    const aiColor = humanSide === BLACK ? WHITE : BLACK;
    thinking = true; updateStatus();
    snap();
    let done = false;

    if (llmPlay && A.hasAI()) {
      try {
        const rep = await A.Operit.chat([
          { role: "system", content: "你是围棋高手。棋盘 " + size + " 路，列 A-T（无 I）、行 " + size + " 在最上。只输出一个坐标如 Q16，或 pass。不要解释。" },
          { role: "user", content: game.full() },
        ], { temperature: 0.3, maxTokens: 8 });
        A.Budget.note([{ role: "user", content: game.full() }], rep);
        if (/pass|停手/i.test(rep)) { game.pass(aiColor); done = true; }
        else {
          const m = parseCoord(rep);
          if (m && game.play(m.x, m.y, aiColor)) done = true;
        }
      } catch (e) { /* 回落 */ }
    }
    if (!done) {
      const mv = game.aiMove("medium", aiColor);
      if (mv) game.play(mv[0], mv[1], aiColor); else game.pass(aiColor);
    }
    thinking = false; hintPt = null;
    if (game.last && !game.last.pass) startDrop(game.last.x, game.last.y);
    draw(); updateStatus();
    if (game.over) chat.narrate("key", "对局结束，已数子，说一句。");
  }
  function parseCoord(s) {
    const m = String(s || "").toUpperCase().match(/([A-HJ-T])\s*(\d{1,2})/);
    if (!m) return null;
    const x = LET.indexOf(m[1]), y = size - +m[2];
    return x >= 0 && x < size && y >= 0 && y < size ? { x, y } : null;
  }

  function localTip() {
    const n = game.history.length;
    if (n === 0) return "空盘先占角，星位或小目都行——角上最容易活。";
    if (n < 12) return "开局顺序大致是：占角 → 守边 → 再入中腹。";
    if (game.ko) return "现在有劫，先在别处找个大点当劫材。";
    return "别贴着对方硬走，先看看哪块棋气最少。";
  }

  /* ================= 聊天 ================= */
  const chat = new A.Chat(el("chatMount"), {
    game: "围棋",
    rules: "中国规则贴目 7.5，坐标列 A-T（跳过 I）、行号自下往上。",
    context: (m) => (m === "full" ? game.full() : game.brief()),
    localTip: localTip,
  });

  /* ================= 事件 ================= */
  canvas.addEventListener("click", (e) => {
    const [lx, ly] = A.canvasXY(canvas, e);
    const x = Math.round((lx - PAD) / C), y = Math.round((ly - PAD) / C);
    if (x >= 0 && x < size && y >= 0 && y < size) humanMove(x, y);
  });

  function newGame() {
    game = new Go(size); snaps = []; hintPt = null; thinking = false; drop = null;
    geom(); draw(); updateStatus();
  }

  el("newGame").onclick = () => {
    newGame();
    chat.sys("新局开始（" + size + " 路），黑先。");
    if (mode === "ai" && humanSide !== BLACK) setTimeout(aiTurn, 320);
  };
  el("hintBtn").onclick = () => {
    if (game.over) return;
    const h = game.hint(game.turn);
    if (!h) { A.toast("没有合适的点，可以停一手"); return; }
    hintPt = h; draw();
    const t = "建议落 " + LET[h.x] + (size - h.y) + "：" + h.why;
    chat.local(t); A.toast(t);
  };
  el("passBtn").onclick = () => {
    if (game.over) return;
    snap(); game.pass(game.turn); hintPt = null; draw(); updateStatus();
    if (game.over) { chat.narrate("key", "双方停手，对局结束，说一句。"); return; }
    if (mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 300);
  };
  el("resignBtn").onclick = () => {
    if (game.over) return;
    game.resign(mode === "ai" ? humanSide : game.turn);
    draw(); updateStatus();
    chat.narrate("key", "我认输了，说一句。");
  };
  el("undoBtn").onclick = () => {
    const s = snaps.pop(); if (!s || thinking) return;
    game.board = s.board; game.ko = s.ko; game.passes = s.passes; game.caps = s.caps;
    game.turn = s.turn; game.over = s.over; game.winner = s.winner;
    game.history.length = s.historyLen;
    game.last = game.history.length ? game.history[game.history.length - 1] : null;
    hintPt = null; draw(); updateStatus();
  };
  el("size").onchange = (e) => { size = +e.target.value; newGame(); };
  el("mode").onchange = (e) => { mode = e.target.value; updateStatus(); };
  el("side").onchange = (e) => {
    humanSide = +e.target.value;
    if (mode === "ai" && !game.history.length && humanSide !== BLACK) setTimeout(aiTurn, 320);
  };
  el("llmPlay").onchange = (e) => { llmPlay = e.target.checked; if (llmPlay) A.toast("大模型执子：围棋要发整盘，比较费 token"); };

  window.addEventListener("arena:theme", draw);

  A.bindTabs();
  A.mountPanels({
    persona: "personaMount", theme: "themeMount", budget: "budgetMount", settings: "setMount",
    onPersona: () => chat.greet(),
  });
  window.addEventListener("arena:play", function () { const t = document.querySelector('.tabs .tab[data-tab="ctrl"]'); if (t) t.click(); });
  geom(); draw(); updateStatus();
})();
