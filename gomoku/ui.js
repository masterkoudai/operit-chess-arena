/* ===== 五子棋 UI（主题化 / HiDPI / 角色卡驱动 / 省 token） ===== */
(function () {
  "use strict";
  const A = window.ChessArena;
  const { SIZE, EMPTY, BLACK, WHITE } = GOMOKU;
  const game = new Gomoku();

  const PAD = 24, C = 34, SPAN = (SIZE - 1) * C, TOTAL = SPAN + PAD * 2;
  const canvas = document.getElementById("board");
  const ctx = A.setupCanvas(canvas, TOTAL, TOTAL);
  const el = (id) => document.getElementById(id);

  let mode = "ai", diff = "medium", humanSide = BLACK, llmPlay = false;
  let hintPt = null, thinking = false, showForbid = true;

  const px = (x) => PAD + x * C, py = (y) => PAD + y * C;
  const cd = (p) => "abcdefghijklmno"[p.x] + (SIZE - p.y);

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

  /* ================= 绘制 ================= */
  function draw() {
    const p = A.palette();
    ctx.clearRect(0, 0, TOTAL, TOTAL);

    A.rr(ctx, 1, 1, TOTAL - 2, TOTAL - 2, p.pixel ? 0 : 10);
    ctx.fillStyle = p.board; ctx.fill();
    ctx.lineWidth = p.pixel ? 2 : 1.2; ctx.strokeStyle = p.line; ctx.stroke();

    /* 网格 */
    ctx.strokeStyle = p.line; ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(px(i), py(0)); ctx.lineTo(px(i), py(SIZE - 1)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(0), py(i)); ctx.lineTo(px(SIZE - 1), py(i)); ctx.stroke();
    }
    /* 外框加粗 */
    ctx.lineWidth = 1.8;
    ctx.strokeRect(px(0), py(0), SPAN, SPAN);

    /* 星位 */
    ctx.fillStyle = alpha(p.txt, 0.6);
    for (const [sx, sy] of [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]]) {
      ctx.beginPath(); ctx.arc(px(sx), py(sy), 3.2, 0, 7); ctx.fill();
    }

    /* 坐标 */
    ctx.fillStyle = alpha(p.txt, 0.55);
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < SIZE; i++) {
      const L = "abcdefghijklmno"[i];
      ctx.fillText(L, px(i), PAD / 2 + 1);
      ctx.fillText(L, px(i), TOTAL - PAD / 2 - 1);
      ctx.fillText(String(SIZE - i), PAD / 2, py(i));
      ctx.fillText(String(SIZE - i), TOTAL - PAD / 2, py(i));
    }

    /* 禁手预览（只在黑棋该走时） */
    if (showForbid && game.turn === BLACK && !game.winner && (mode === "pvp" || humanSide === BLACK)) {
      ctx.fillStyle = alpha(p.danger, 0.42);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (game.board[y][x] === EMPTY && game.isForbidden(x, y)) {
          ctx.beginPath(); ctx.arc(px(x), py(y), 4.5, 0, 7); ctx.fill();
        }
      }
    }

    /* 棋子 */
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const v = game.board[y][x];
      if (v !== EMPTY) stone(px(x), py(y), v === BLACK, p);
    }

    /* 上一手 */
    if (game.last) {
      ctx.strokeStyle = game.last.c === BLACK ? alpha(p.stoneW, 0.95) : alpha(p.stoneB, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px(game.last.x), py(game.last.y), C * 0.17, 0, 7); ctx.stroke();
    }

    /* 提示点 */
    if (hintPt) {
      ctx.strokeStyle = p.accent; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(px(hintPt.x), py(hintPt.y), C * 0.44, 0, 7); ctx.stroke();
      ctx.fillStyle = alpha(p.accent, 0.3);
      ctx.beginPath(); ctx.arc(px(hintPt.x), py(hintPt.y), C * 0.3, 0, 7); ctx.fill();
    }

    /* 连五连线 */
    if (game.winLine && game.winLine.length) {
      const a = game.winLine[0], b = game.winLine[game.winLine.length - 1];
      ctx.strokeStyle = p.win; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(px(a[0]), py(a[1])); ctx.lineTo(px(b[0]), py(b[1])); ctx.stroke();
      ctx.lineCap = "butt";
    }
  }

  function stone(cx, cy, isBlack, p) {
    const r = C * 0.45;
    ctx.beginPath(); ctx.arc(cx + 0.8, cy + 1.6, r, 0, 7);
    ctx.fillStyle = "rgba(0,0,0,.24)"; ctx.fill();
    if (p.pixel) {
      ctx.fillStyle = isBlack ? p.stoneB : p.stoneW;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = alpha(p.txt, 0.6);
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
      return;
    }
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    if (isBlack) { g.addColorStop(0, "#6a6660"); g.addColorStop(0.45, p.stoneB); g.addColorStop(1, "#141310"); }
    else { g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, p.stoneW); g.addColorStop(1, "#cfc9ba"); }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.stroke();
  }

  /* ================= 状态 ================= */
  function updateStatus() {
    if (game.winner) {
      const mine = game.winner === humanSide && mode === "ai";
      el("status").innerHTML = '<b style="color:var(--win)">' + (game.winner === BLACK ? "黑棋" : "白棋") + "五连获胜！</b>"
        + (mode === "ai" ? "（" + (mine ? "你赢了" : "TA 赢了") + "）" : "");
    } else {
      el("status").textContent = (game.turn === BLACK ? "黑方行棋" : "白方行棋") + (thinking ? " · TA 在想…" : "");
    }
    updateEval(); renderMoves();
  }
  function updateEval() {
    let bBest = 0, wBest = 0;
    for (const [x, y] of game.candidates(2)) {
      bBest = Math.max(bBest, game.pointScore(x, y, BLACK));
      wBest = Math.max(wBest, game.pointScore(x, y, WHITE));
    }
    const adv = Math.max(-1, Math.min(1, (wBest - bBest) / 50000));
    el("evalMark").style.left = 50 + adv * 50 + "%";
    el("evalText").textContent = Math.abs(adv) < 0.02 ? "局势均衡" : adv > 0 ? "白方占优" : "黑方占优";
  }
  function renderMoves() {
    let h = '<div class="n">#</div><div>黑</div><div>白</div>';
    for (let i = 0; i < game.history.length; i += 2) {
      const b = game.history[i], w = game.history[i + 1];
      h += '<div class="n">' + (i / 2 + 1) + "</div><div>" + (b ? cd(b) : "") + "</div><div>" + (w ? cd(w) : "") + "</div>";
    }
    const m = el("moves"); m.innerHTML = h; m.scrollTop = m.scrollHeight;
  }

  /* ================= 交互 ================= */
  function humanMove(x, y) {
    if (game.winner || thinking) return;
    if (mode === "ai" && game.turn !== humanSide) return;
    if (game.board[y][x] !== EMPTY) return;
    if (game.turn === BLACK) {
      const f = game.isForbidden(x, y);
      if (f) { A.toast("黑棋禁手：" + f); return; }
    }
    const th = game.threatFor(game.turn === BLACK ? WHITE : BLACK);
    game.place(x, y, game.turn);
    hintPt = null;
    draw(); updateStatus();

    if (game.winner) { chat.narrate("key", "刚在 " + cd(game.last) + " 连成五子结束了这局，说一句。"); return; }
    if (th) chat.narrate("key", "注意：对手在 " + "abcdefghijklmno"[th.x] + (SIZE - th.y) + " 有成五威胁，提醒一句。");
    else chat.narrate("routine", "对手刚落 " + cd(game.last) + "，简单点评一句。");
    if (mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 300);
  }

  async function aiTurn() {
    if (game.winner) return;
    const aiColor = humanSide === BLACK ? WHITE : BLACK;
    thinking = true; updateStatus();
    let done = false;

    if (llmPlay && A.hasAI()) {
      try {
        const rep = await A.Operit.chat([
          { role: "system", content: "你是五子棋高手。只输出一个坐标，格式如 h8（列 a-o，行 1-15，行 15 在最上）。不要解释。" },
          { role: "user", content: game.full() },
        ], { temperature: 0.25, maxTokens: 10 });
        A.Budget.note([{ role: "user", content: game.full() }], rep);
        const m = parseCoord(rep);
        if (m && game.board[m.y][m.x] === EMPTY && (aiColor !== BLACK || !game.isForbidden(m.x, m.y))) {
          game.place(m.x, m.y, aiColor); done = true;
        }
      } catch (e) { /* 回落 */ }
    }
    if (!done) { const m = game.aiMove(diff, aiColor); if (m) game.place(m.x, m.y, aiColor); }

    thinking = false; hintPt = null;
    draw(); updateStatus();
    if (game.winner) chat.narrate("key", "你输了这一局（TA 连五在 " + cd(game.last) + "），说一句安慰或得意的话。");
    else chat.narrate("routine", "你刚落在 " + cd(game.last) + "，说一句。");
  }
  function parseCoord(s) {
    const m = String(s || "").toLowerCase().match(/([a-o])\s*(\d{1,2})/);
    if (!m) return null;
    const x = "abcdefghijklmno".indexOf(m[1]), y = SIZE - +m[2];
    return x >= 0 && y >= 0 && y < SIZE ? { x, y } : null;
  }

  function localTip() {
    const opp = game.turn === BLACK ? WHITE : BLACK;
    const th = game.threatFor(opp);
    if (th) return "小心，对手在 " + "abcdefghijklmno"[th.x] + (SIZE - th.y) + " 就要连五了，先堵。";
    if (game.history.length < 3) return "开局占中心，天元附近最灵活。";
    return "先看对手最想下哪一点，把那里守住，往往比自己往前冲更值。";
  }

  /* ================= 聊天 ================= */
  const chat = new A.Chat(el("chatMount"), {
    game: "五子棋",
    rules: "15 路棋盘，坐标 a-o 列、1-15 行（15 在最上），黑先且有禁手。",
    context: (m) => (m === "full" ? game.full() : game.brief()),
    localTip: localTip,
  });

  /* ================= 事件 ================= */
  canvas.addEventListener("click", (e) => {
    const [lx, ly] = A.canvasXY(canvas, e);
    const x = Math.round((lx - PAD) / C), y = Math.round((ly - PAD) / C);
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) humanMove(x, y);
  });

  el("newGame").onclick = () => {
    game.reset(); hintPt = null; thinking = false;
    draw(); updateStatus();
    chat.sys("新局开始，黑棋先行。");
    if (mode === "ai" && humanSide !== BLACK) setTimeout(aiTurn, 320);
  };
  el("hintBtn").onclick = () => {
    if (game.winner) return;
    const h = game.hint(game.turn);
    if (!h) return;
    hintPt = h; draw();
    const t = "建议落 " + "abcdefghijklmno"[h.x] + (SIZE - h.y) + "：" + h.why;
    chat.local(t);
    A.toast(t);
  };
  el("undoBtn").onclick = () => {
    if (!game.history.length || thinking) return;
    const n = mode === "ai" ? 2 : 1;
    for (let i = 0; i < n && game.history.length; i++) {
      const last = game.history.pop();
      game.board[last.y][last.x] = EMPTY;
    }
    game.winner = 0; game.winLine = null;
    game.turn = game.history.length % 2 === 0 ? BLACK : WHITE;
    game.last = game.history.length ? game.history[game.history.length - 1] : null;
    hintPt = null; draw(); updateStatus();
  };
  el("mode").onchange = (e) => { mode = e.target.value; draw(); updateStatus(); };
  el("diff").onchange = (e) => { diff = e.target.value; };
  el("side").onchange = (e) => {
    humanSide = +e.target.value; draw();
    if (mode === "ai" && !game.history.length && humanSide !== BLACK) setTimeout(aiTurn, 320);
  };
  el("llmPlay").onchange = (e) => { llmPlay = e.target.checked; if (llmPlay) A.toast("大模型执子：每步要发整盘，较费 token"); };
  el("forbid").onchange = (e) => { showForbid = e.target.checked; draw(); };

  window.addEventListener("arena:theme", draw);

  A.bindTabs();
  A.mountPanels({
    persona: "personaMount", theme: "themeMount", budget: "budgetMount", settings: "setMount",
    onPersona: () => chat.greet(),
  });
  draw(); updateStatus();
})();
