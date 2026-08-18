/* ===== 国际象棋 UI（重绘版）=====
 * 变化点：
 *  · HiDPI 画布，手机上不再糊
 *  · 外框 + a–h / 1–8 坐标刻度
 *  · 实心字形 + 描边 + 投影：白子终于看得清；字体缺失自动退化为「圆盘字母」
 *  · 选中高亮 / 合法落点圆点 / 可吃子圆环 / 上一手轨迹 / 将军红光
 *  · 执黑自动翻转棋盘
 *  · 配色全部取自主题变量，换肤即时生效
 */
(function () {
  "use strict";
  const A = window.ChessArena;
  const { N, WHITE, BLACK } = CHESS;
  const game = new Chess();

  const PAD = 26, CELL = 54, BOARD = CELL * N, TOTAL = BOARD + PAD * 2;
  const FILES = "abcdefgh";
  const SYM = { K: "\u265A", Q: "\u265B", R: "\u265C", B: "\u265D", N: "\u265E", P: "\u265F" };
  const LETTER = { K: "K", Q: "Q", R: "R", B: "B", N: "N", P: "P" };
  const PIECE_FONT = '"Segoe UI Symbol","Apple Symbols","Noto Sans Symbols 2","DejaVu Sans","Arial Unicode MS",serif';

  const canvas = document.getElementById("board");
  const ctx = A.setupCanvas(canvas, TOTAL, TOTAL);
  const el = (id) => document.getElementById(id);
  const colorOf = (p) => (!p ? null : p === p.toUpperCase() ? WHITE : BLACK);

  let mode = "ai", diff = "medium", humanSide = WHITE, llmPlay = false;
  let sel = null, targets = [], hintMv = null, thinking = false;
  let pieceStyle = glyphAvailable() ? "glyph" : "disc";
  const log = [];        // 自己维护的可读着法，悔棋时 pop
  let flip = false;

  /* ---------- 棋子字形可用性检测（缺字库就用圆盘字母） ---------- */
  function glyphAvailable() {
    try {
      const c = document.createElement("canvas").getContext("2d");
      c.font = "48px " + PIECE_FONT;
      const a = c.measureText("\u265E").width;
      const b = c.measureText("\uE0FF").width; // 私用区，必然缺字 → 豆腐块宽度
      return a > 0 && Math.abs(a - b) > 0.5;
    } catch (e) { return true; }
  }

  /* ---------- 颜色工具：CSS 变量取到的可能是 #rgb/#rrggbb/rgb() ---------- */
  function alpha(color, a) {
    const s = String(color || "").trim();
    let r = 0, g = 0, b = 0;
    if (s[0] === "#") {
      const h = s.slice(1);
      if (h.length === 3) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); }
      else { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
    } else {
      const m = s.match(/(\d+(?:\.\d+)?)/g);
      if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; }
    }
    return "rgba(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + "," + a + ")";
  }

  /* ---------- 坐标换算（含翻转） ---------- */
  const vx = (x) => (flip ? N - 1 - x : x);
  const vy = (y) => (flip ? N - 1 - y : y);
  const sxL = (x) => PAD + vx(x) * CELL;              // 格子左上角
  const syT = (y) => PAD + vy(y) * CELL;
  const cxC = (x) => sxL(x) + CELL / 2;               // 格子中心
  const cyC = (y) => syT(y) + CELL / 2;
  function pick(lx, ly) {
    const gx = Math.floor((lx - PAD) / CELL), gy = Math.floor((ly - PAD) / CELL);
    if (gx < 0 || gx >= N || gy < 0 || gy >= N) return null;
    return [flip ? N - 1 - gx : gx, flip ? N - 1 - gy : gy];
  }
  const sq = (x, y) => FILES[x] + (N - y);

  /* ================= 绘制 ================= */
  function draw() {
    const p = A.palette();
    const px = p.pixel;
    ctx.clearRect(0, 0, TOTAL, TOTAL);

    /* 外框（宣纸/木框） */
    A.rr(ctx, 1, 1, TOTAL - 2, TOTAL - 2, px ? 0 : 10);
    ctx.fillStyle = p.board;
    ctx.fill();
    ctx.lineWidth = px ? 2 : 1.2;
    ctx.strokeStyle = p.line;
    ctx.stroke();

    /* 棋盘格 */
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? p.sqLight : p.sqDark;
        ctx.fillRect(sxL(x), syT(y), CELL, CELL);
      }
    }
    /* 棋盘内圈细线 */
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(p.txt, 0.35);
    ctx.strokeRect(PAD - 0.5, PAD - 0.5, BOARD + 1, BOARD + 1);

    /* 上一手：起点淡、终点稍浓 */
    const last = game.last;
    if (last) {
      ctx.fillStyle = alpha(p.warn, 0.2);
      ctx.fillRect(sxL(last.fx), syT(last.fy), CELL, CELL);
      ctx.fillStyle = alpha(p.warn, 0.34);
      ctx.fillRect(sxL(last.tx), syT(last.ty), CELL, CELL);
    }

    /* 选中格 */
    if (sel) {
      ctx.fillStyle = alpha(p.accent, 0.26);
      ctx.fillRect(sxL(sel[0]), syT(sel[1]), CELL, CELL);
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.accent;
      ctx.strokeRect(sxL(sel[0]) + 1, syT(sel[1]) + 1, CELL - 2, CELL - 2);
    }

    /* 将军：王格红光 */
    if (game.check && !game.winner) {
      const k = game.findKing(game.board, game.turn);
      if (k) {
        const cx = cxC(k[0]), cy = cyC(k[1]);
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, CELL * 0.62);
        g.addColorStop(0, alpha(p.danger, 0.62));
        g.addColorStop(1, alpha(p.danger, 0));
        ctx.fillStyle = g;
        ctx.fillRect(sxL(k[0]) - 4, syT(k[1]) - 4, CELL + 8, CELL + 8);
      }
    }

    /* 坐标刻度 */
    ctx.fillStyle = alpha(p.txt, 0.62);
    ctx.font = "600 12px " + (px ? "monospace" : "ui-monospace, monospace");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let x = 0; x < N; x++) {
      const t = FILES[x];
      ctx.fillText(t, cxC(x), PAD / 2);
      ctx.fillText(t, cxC(x), TOTAL - PAD / 2);
    }
    for (let y = 0; y < N; y++) {
      const t = String(N - y);
      ctx.fillText(t, PAD / 2, cyC(y));
      ctx.fillText(t, TOTAL - PAD / 2, cyC(y));
    }

    /* 合法落点 */
    for (const m of targets) {
      const cx = cxC(m.tx), cy = cyC(m.ty);
      const cap = !!game.board[m.ty][m.tx] || m.flag === "ep";
      ctx.lineWidth = 3;
      if (cap) {
        ctx.strokeStyle = alpha(p.danger, 0.8);
        ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2); ctx.stroke();
      } else if (m.flag === "castleK" || m.flag === "castleQ") {
        ctx.strokeStyle = alpha(p.accent2, 0.9);
        ctx.strokeRect(cx - CELL * 0.3, cy - CELL * 0.3, CELL * 0.6, CELL * 0.6);
      } else {
        ctx.fillStyle = alpha(p.accent, 0.62);
        ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.15, 0, Math.PI * 2); ctx.fill();
      }
    }

    /* 棋子 */
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const q = game.board[y][x];
        if (q) drawPiece(q, cxC(x), cyC(y), p);
      }
    }

    /* 提示箭头 */
    if (hintMv) arrow(cxC(hintMv.fx), cyC(hintMv.fy), cxC(hintMv.tx), cyC(hintMv.ty), p.accent);
  }

  function drawPiece(q, cx, cy, p) {
    const isW = colorOf(q) === WHITE, t = q.toUpperCase();
    const face = isW ? p.stoneW : p.stoneB;
    const edge = isW ? "rgba(38,32,26,.78)" : "rgba(248,245,236,.55)";

    if (pieceStyle === "disc" || p.pixel) {
      const r = CELL * 0.38;
      ctx.beginPath(); ctx.arc(cx, cy + 1.5, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = face; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = isW ? "rgba(38,32,26,.55)" : "rgba(248,245,236,.4)"; ctx.stroke();
      ctx.fillStyle = isW ? "#2c2620" : "#f6f2e8";
      ctx.font = "700 " + Math.round(CELL * 0.42) + "px " + (p.pixel ? "monospace" : "ui-monospace, monospace");
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(LETTER[t], cx, cy + 1);
      return;
    }

    ctx.font = Math.round(CELL * 0.76) + "px " + PIECE_FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const s = SYM[t], y0 = cy + CELL * 0.02;
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillText(s, cx + 1.4, y0 + 2.4);
    ctx.fillStyle = face;
    ctx.fillText(s, cx, y0);
    ctx.lineWidth = Math.max(1, CELL * 0.03);
    ctx.strokeStyle = edge;
    ctx.strokeText(s, cx, y0);
  }

  function arrow(x1, y1, x2, y2, color) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, head = 13;
    ctx.save();
    ctx.strokeStyle = alpha(color, 0.85);
    ctx.fillStyle = alpha(color, 0.85);
    ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1 + ux * 12, y1 + uy * 12);
    ctx.lineTo(x2 - ux * head, y2 - uy * head);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2 - ux * 2, y2 - uy * 2);
    ctx.lineTo(x2 - ux * head - uy * 7, y2 - uy * head + ux * 7);
    ctx.lineTo(x2 - ux * head + uy * 7, y2 - uy * head - ux * 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ================= 状态 / 着法表 ================= */
  function updateStatus() {
    const s = el("status");
    if (game.winner === "draw") s.innerHTML = "<b>和棋</b>（无路可走且未被将军）";
    else if (game.winner) s.innerHTML = '<b style="color:var(--win)">' + (game.winner === WHITE ? "白" : "黑") + "方胜！</b>";
    else s.textContent = (game.turn === WHITE ? "白方行棋" : "黑方行棋")
      + (game.check ? " · 被将军" : "")
      + (thinking ? " · TA 在想…" : "");
    updateEval();
    renderMoves();
  }
  function updateEval() {
    const adv = Math.max(-1, Math.min(1, game.evaluate(game.board, WHITE) / 3000));
    el("evalMark").style.left = 50 - adv * 50 + "%";
    el("evalText").textContent = Math.abs(adv) < 0.04 ? "局势均衡"
      : (adv > 0 ? "白方占优 " : "黑方占优 ") + (Math.abs(adv) * 100).toFixed(0) + "%";
  }
  function renderMoves() {
    const m = el("moves");
    let h = '<div class="n">#</div><div>白</div><div>黑</div>';
    for (let i = 0; i < log.length; i += 2) {
      h += '<div class="n">' + (i / 2 + 1) + "</div><div>" + (log[i] || "") + "</div><div>" + (log[i + 1] || "") + "</div>";
    }
    m.innerHTML = h;
    m.scrollTop = m.scrollHeight;
  }

  /* 走子记谱（在真正落子之前算，因为要读原棋盘） */
  function notate(fx, fy, tx, ty) {
    const p = game.board[fy][fx], cap = game.board[ty][tx];
    const t = p ? p.toUpperCase() : "";
    if (t === "K" && Math.abs(tx - fx) === 2) return tx > fx ? "O-O" : "O-O-O";
    return (t === "P" ? "" : t) + sq(fx, fy) + (cap ? "x" : "-") + sq(tx, ty);
  }

  /* ================= 交互 ================= */
  function refreshTargets() {
    targets = [];
    if (!sel) return;
    targets = game.legalMoves(game.board, game.turn).filter((m) => m.fx === sel[0] && m.fy === sel[1]);
  }

  function humanMove(x, y) {
    if (game.winner || thinking) return;
    if (mode === "ai" && game.turn !== humanSide) return;
    const p = game.board[y][x];

    if (!sel) {
      if (p && colorOf(p) === game.turn) { sel = [x, y]; refreshTargets(); draw(); }
      return;
    }
    if (sel[0] === x && sel[1] === y) { sel = null; targets = []; draw(); return; }

    const mv = targets.find((m) => m.tx === x && m.ty === y);
    if (mv) {
      doMove(sel[0], sel[1], x, y, mv);
      return;
    }
    if (p && colorOf(p) === game.turn) { sel = [x, y]; refreshTargets(); draw(); }
    else { sel = null; targets = []; draw(); }
  }

  function doMove(fx, fy, tx, ty, mv) {
    let promo = null;
    if (mv && mv.flag === "promo") {
      promo = el("promo") ? el("promo").value : "Q";
    }
    const capName = pieceCn(game.board[ty][tx]);
    const san = notate(fx, fy, tx, ty);
    if (!game.move(fx, fy, tx, ty, promo)) return;
    log.push(san + (mv && mv.flag === "promo" ? "=" + promo : ""));
    sel = null; targets = []; hintMv = null;
    draw(); updateStatus();
    afterMove(capName, san, true);
  }

  function pieceCn(q) {
    if (!q) return "";
    return { K: "王", Q: "后", R: "车", B: "象", N: "马", P: "兵" }[q.toUpperCase()] || "";
  }

  function afterMove(capName, san, byHuman) {
    if (game.winner) {
      const who = game.winner === "draw" ? "" : game.winner === humanSide ? "你" : "TA";
      chat.narrate("key", game.winner === "draw" ? "刚才和棋了，说一句收尾的话。"
        : who + "赢了这一局，用一句话说说感受。");
      return;
    }
    if (game.check) {
      chat.narrate("key", "刚走了 " + san + "，现在" + (game.turn === humanSide ? "我" : "你") + "被将军了，说一句。");
    } else if (capName === "后" || capName === "车") {
      chat.narrate("key", "刚吃掉了对方的" + capName + "（" + san + "），说一句。");
    } else if (byHuman) {
      chat.narrate("routine", "对手刚走 " + san + "，简单点评一句。");
    }
    if (byHuman && mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 260);
  }

  /* ---------- AI 行棋（默认本地引擎，0 token） ---------- */
  async function aiTurn() {
    if (game.winner) return;
    const aiColor = humanSide === WHITE ? BLACK : WHITE;
    thinking = true; updateStatus();
    let mv = null, san = "", capName = "";

    if (llmPlay && A.hasAI()) {
      try {
        // 只发 FEN、只要 4 字符回复：一次约 60 token
        const rep = await A.Operit.chat([
          { role: "system", content: "你是国际象棋引擎。根据 FEN 给出该方最佳着法，只输出 4 字符坐标着法（如 e2e4，升变写 e7e8q），不要任何解释。" },
          { role: "user", content: game.fen() },
        ], { temperature: 0.2, maxTokens: 12 });
        A.Budget.note([{ role: "user", content: game.fen() }], rep);
        mv = parseUci(rep, aiColor);
      } catch (e) { /* 回落本地 */ }
    }
    if (!mv) {
      const m = game.aiMove(diff, aiColor);
      if (m) mv = { fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, promo: null };
    }
    if (mv) {
      capName = pieceCn(game.board[mv.ty][mv.tx]);
      san = notate(mv.fx, mv.fy, mv.tx, mv.ty);
      if (game.move(mv.fx, mv.fy, mv.tx, mv.ty, mv.promo)) log.push(san);
    }
    thinking = false;
    sel = null; targets = []; hintMv = null;
    draw(); updateStatus();
    if (san) afterMove(capName, san, false);
  }

  function parseUci(s, color) {
    const m = String(s || "").toLowerCase().match(/([a-h])([1-8])([a-h])([1-8])([qrbn])?/);
    if (!m) return null;
    const fx = FILES.indexOf(m[1]), fy = N - +m[2], tx = FILES.indexOf(m[3]), ty = N - +m[4];
    const ok = game.legalMoves(game.board, color).some((v) => v.fx === fx && v.fy === fy && v.tx === tx && v.ty === ty);
    return ok ? { fx, fy, tx, ty, promo: m[5] ? m[5].toUpperCase() : null } : null;
  }

  /* ---------- 本地一句话（不花 token） ---------- */
  function localTip() {
    if (game.check) return game.turn === humanSide ? "你被将军了，先解将：挡、跑、或者吃掉将军的子。" : "我这边被将了，得先顾自己。";
    if (game.hist.length < 6) return "开局先占中心、把马象走出来，别急着动后。";
    const adv = game.evaluate(game.board, humanSide);
    if (adv > 250) return "你子力占优，可以考虑兑子简化局面，越简单越好赢。";
    if (adv < -250) return "现在子力吃亏，别硬拼，找机会制造复杂局面。";
    return "落子前默数一遍：这步之后我怕什么？";
  }

  /* ================= 聊天：完全由角色卡驱动 ================= */
  const chat = new A.Chat(el("chatMount"), {
    game: "国际象棋",
    rules: "局面用标准 FEN 给出：大写=白，小写=黑，坐标 a-h 列、1-8 行。",
    context: (m) => (m === "full" ? game.full() : game.brief()),
    localTip: localTip,
  });

  /* ================= 事件 ================= */
  canvas.addEventListener("click", (e) => {
    const [lx, ly] = A.canvasXY(canvas, e);
    const s = pick(lx, ly);
    if (s) humanMove(s[0], s[1]);
  });

  el("newGame").onclick = () => {
    game.reset(); log.length = 0; sel = null; targets = []; hintMv = null; thinking = false;
    applySide();
    draw(); updateStatus();
    chat.sys("新局开始，白方先行。");
    if (mode === "ai" && humanSide !== WHITE) setTimeout(aiTurn, 320);
  };
  el("hintBtn").onclick = () => {
    if (game.winner) return;
    const h = game.hint(game.turn);
    if (!h) return;
    hintMv = h; draw();
    const t = "建议：" + sq(h.fx, h.fy) + "→" + sq(h.tx, h.ty);
    chat.local(t + "（本地引擎算的，不花 token）");
    A.toast(t);
  };
  el("undoBtn").onclick = () => {
    if (!game.hist.length || thinking) return;
    const n = mode === "ai" ? 2 : 1;
    for (let i = 0; i < n && game.hist.length; i++) { game.undo(); log.pop(); }
    sel = null; targets = []; hintMv = null;
    draw(); updateStatus();
  };
  el("flipBtn").onclick = () => { flip = !flip; draw(); };

  el("mode").onchange = (e) => { mode = e.target.value; updateStatus(); };
  el("diff").onchange = (e) => { diff = e.target.value; };
  el("side").onchange = (e) => {
    humanSide = e.target.value === "b" ? BLACK : WHITE;
    applySide();
    draw();
    if (mode === "ai" && !game.hist.length && humanSide !== WHITE) setTimeout(aiTurn, 320);
  };
  el("llmPlay").onchange = (e) => {
    llmPlay = e.target.checked;
    if (llmPlay) A.toast("大模型执子：每步约 60 token");
  };
  el("styleSel").onchange = (e) => { pieceStyle = e.target.value; draw(); };

  function applySide() { flip = mode === "ai" && humanSide === BLACK; }

  window.addEventListener("arena:theme", draw);

  /* 面板 */
  A.bindTabs();
  A.mountPanels({
    persona: "personaMount",
    theme: "themeMount",
    budget: "budgetMount",
    settings: "setMount",
    onPersona: () => chat.greet(),
  });
  el("styleSel").value = pieceStyle;
  applySide();
  draw();
  updateStatus();
})();
