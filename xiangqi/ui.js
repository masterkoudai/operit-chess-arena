/* ===== 中国象棋 UI（主题化 / HiDPI / 角色卡驱动 / 省 token） ===== */
(function () {
  "use strict";
  const A = window.ChessArena;
  const { W, H, RED, BLACK, pieceName } = XIANGQI;
  const game = new Xiangqi();

  const PAD = 30, C = 52;
  const SPANX = (W - 1) * C, SPANY = (H - 1) * C;
  const TW = SPANX + PAD * 2, TH = SPANY + PAD * 2;
  const canvas = document.getElementById("board");
  const ctx = A.setupCanvas(canvas, TW, TH);
  const el = (id) => document.getElementById(id);

  let mode = "ai", diff = "medium", humanSide = RED, llmPlay = false;
  let sel = null, targets = [], hintMv = null, thinking = false, flip = false;
  const log = [];

  const colorOf = (p) => (!p ? null : p === p.toUpperCase() ? RED : BLACK);
  const vx = (x) => (flip ? W - 1 - x : x);
  const vy = (y) => (flip ? H - 1 - y : y);
  const px = (x) => PAD + vx(x) * C;
  const py = (y) => PAD + vy(y) * C;
  const cd = (x, y) => "abcdefghi"[x] + (H - y);

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
    ctx.clearRect(0, 0, TW, TH);

    A.rr(ctx, 1, 1, TW - 2, TH - 2, p.pixel ? 0 : 10);
    ctx.fillStyle = p.board; ctx.fill();
    ctx.lineWidth = p.pixel ? 2 : 1.2; ctx.strokeStyle = p.line; ctx.stroke();

    ctx.strokeStyle = p.line; ctx.lineWidth = 1;
    /* 竖线：中间在河界处断开 */
    for (let x = 0; x < W; x++) {
      if (x === 0 || x === W - 1) {
        ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(H - 1)); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(4)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px(x), py(5)); ctx.lineTo(px(x), py(H - 1)); ctx.stroke();
      }
    }
    /* 横线 */
    for (let y = 0; y < H; y++) {
      ctx.beginPath(); ctx.moveTo(px(0), py(y)); ctx.lineTo(px(W - 1), py(y)); ctx.stroke();
    }
    /* 外框加粗 */
    ctx.lineWidth = 1.9;
    ctx.strokeRect(Math.min(px(0), px(W - 1)), Math.min(py(0), py(H - 1)), SPANX, SPANY);

    /* 九宫斜线 */
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(3), py(0)); ctx.lineTo(px(5), py(2));
    ctx.moveTo(px(5), py(0)); ctx.lineTo(px(3), py(2));
    ctx.moveTo(px(3), py(7)); ctx.lineTo(px(5), py(9));
    ctx.moveTo(px(5), py(7)); ctx.lineTo(px(3), py(9));
    ctx.stroke();

    /* 兵/炮位小角标 */
    ctx.strokeStyle = alpha(p.txt, 0.4);
    for (const [x, y] of [[1, 2], [7, 2], [1, 7], [7, 7], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]]) tick(x, y);

    /* 楚河汉界 */
    ctx.fillStyle = alpha(p.txt, 0.3);
    ctx.font = "17px " + (p.pixel ? "monospace" : '"KaiTi","STKaiti",serif');
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const midY = (py(4) + py(5)) / 2;
    ctx.fillText("楚 河", px(2), midY);
    ctx.fillText("漢 界", px(6), midY);

    /* 坐标：红方一~九在下，黑方 1~9 在上 */
    ctx.fillStyle = alpha(p.txt, 0.55);
    ctx.font = "11px ui-monospace, monospace";
    const CN = ["九", "八", "七", "六", "五", "四", "三", "二", "一"];
    for (let x = 0; x < W; x++) {
      ctx.fillText(String(x + 1), px(x), flip ? TH - PAD / 2 : PAD / 2);
      ctx.fillText(CN[x], px(x), flip ? PAD / 2 : TH - PAD / 2);
    }
    for (let y = 0; y < H; y++) {
      ctx.fillText(String(H - y), PAD / 2, py(y));
    }

    /* 上一手 */
    if (game.last) {
      mark(game.last.x, game.last.y, alpha(p.warn, 0.75), C * 0.44);
      mark(game.last.tx, game.last.ty, alpha(p.warn, 0.95), C * 0.47);
    }
    /* 选中 */
    if (sel) {
      ctx.strokeStyle = p.accent; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(px(sel[0]), py(sel[1]), C * 0.47, 0, 7); ctx.stroke();
    }
    /* 合法落点 */
    for (const m of targets) {
      const cx = px(m[2]), cy = py(m[3]);
      if (m[4]) { ctx.strokeStyle = alpha(p.danger, 0.85); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, C * 0.44, 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = alpha(p.accent, 0.6); ctx.beginPath(); ctx.arc(cx, cy, C * 0.13, 0, 7); ctx.fill(); }
    }
    /* 将军红光 */
    if (game.check && !game.winner) {
      const k = game.findKing(game.board, game.turn);
      if (k) {
        const cx = px(k[0]), cy = py(k[1]);
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, C * 0.7);
        g.addColorStop(0, alpha(p.danger, 0.55));
        g.addColorStop(1, alpha(p.danger, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, C * 0.7, 0, 7); ctx.fill();
      }
    }

    /* 棋子 */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const q = game.board[y][x];
      if (q) piece(x, y, q, p);
    }

    /* 提示箭头 */
    if (hintMv) arrow(px(hintMv.x), py(hintMv.y), px(hintMv.tx), py(hintMv.ty), p.accent);
  }

  function tick(x, y) {
    const cx = px(x), cy = py(y), d = 5, o = 4;
    ctx.lineWidth = 1;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      if (x === 0 && sx === -1) continue;
      if (x === W - 1 && sx === 1) continue;
      ctx.beginPath();
      ctx.moveTo(cx + sx * o, cy + sy * (o + d)); ctx.lineTo(cx + sx * o, cy + sy * o);
      ctx.lineTo(cx + sx * (o + d), cy + sy * o);
      ctx.stroke();
    }
  }
  function mark(x, y, color, r) {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(x), py(y), r, 0, 7); ctx.stroke();
  }

  function piece(x, y, q, p) {
    const cx = px(x), cy = py(y), r = C * 0.44, red = colorOf(q) === RED;
    const ink = red ? p.red : p.stoneB;
    /* 投影 */
    ctx.beginPath(); ctx.arc(cx + 0.8, cy + 2, r, 0, 7);
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fill();
    /* 棋子面 */
    if (p.pixel) {
      ctx.fillStyle = p.face; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
    } else {
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r);
      g.addColorStop(0, "#fffdf6"); g.addColorStop(0.55, p.face); g.addColorStop(1, "#d9cdb0");
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, 7);
      ctx.lineWidth = 1; ctx.strokeStyle = alpha(ink, 0.5); ctx.stroke();
    }
    /* 字 */
    ctx.fillStyle = ink;
    ctx.font = "bold " + Math.round(C * 0.46) + "px " + (p.pixel ? "monospace" : '"KaiTi","STKaiti","Songti SC",serif');
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(pieceName(q), cx, cy + 1);
  }

  function arrow(x1, y1, x2, y2, color) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, head = 13;
    ctx.strokeStyle = alpha(color, 0.85); ctx.fillStyle = alpha(color, 0.85);
    ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1 + ux * C * 0.45, y1 + uy * C * 0.45);
    ctx.lineTo(x2 - ux * head, y2 - uy * head);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2 - ux * 2, y2 - uy * 2);
    ctx.lineTo(x2 - ux * head - uy * 7, y2 - uy * head + ux * 7);
    ctx.lineTo(x2 - ux * head + uy * 7, y2 - uy * head - ux * 7);
    ctx.closePath(); ctx.fill();
    ctx.lineCap = "butt";
  }

  /* ================= 状态 ================= */
  function updateStatus() {
    if (game.winner) {
      const w = game.winner === RED ? "红方" : "黑方";
      el("status").innerHTML = '<b style="color:var(--win)">' + w + "胜！</b>"
        + (mode === "ai" ? "（" + (game.winner === humanSide ? "你赢了" : "TA 赢了") + "）" : "");
    } else {
      el("status").textContent = (game.turn === RED ? "红方行棋" : "黑方行棋")
        + (game.check ? " · 被将军" : "") + (thinking ? " · TA 在想…" : "");
    }
    updateEval(); renderMoves();
  }
  function updateEval() {
    const adv = Math.max(-1, Math.min(1, game.evaluate(game.board, RED) / 1200));
    el("evalMark").style.left = 50 - adv * 50 + "%";
    el("evalText").textContent = Math.abs(adv) < 0.04 ? "局势均衡"
      : (adv > 0 ? "红方占优 " : "黑方占优 ") + (Math.abs(adv) * 100).toFixed(0) + "%";
  }
  function renderMoves() {
    let h = '<div class="n">#</div><div>红</div><div>黑</div>';
    for (let i = 0; i < log.length; i += 2) {
      h += '<div class="n">' + (i / 2 + 1) + "</div><div>" + (log[i] || "") + "</div><div>" + (log[i + 1] || "") + "</div>";
    }
    const m = el("moves"); m.innerHTML = h; m.scrollTop = m.scrollHeight;
  }
  function notate(x, y, tx, ty) {
    const q = game.board[y][x], cap = game.board[ty][tx];
    return pieceName(q) + cd(x, y) + (cap ? "x" : "-") + cd(tx, ty);
  }

  /* ================= 交互 ================= */
  function refreshTargets() {
    targets = sel ? game.legalMoves(game.board, game.turn).filter((m) => m[0] === sel[0] && m[1] === sel[1]) : [];
  }

  function humanMove(x, y) {
    if (game.winner || thinking) return;
    if (mode === "ai" && game.turn !== humanSide) return;
    const q = game.board[y][x];
    if (!sel) {
      if (q && colorOf(q) === game.turn) { sel = [x, y]; refreshTargets(); draw(); }
      return;
    }
    if (sel[0] === x && sel[1] === y) { sel = null; targets = []; draw(); return; }
    const mv = targets.find((m) => m[2] === x && m[3] === y);
    if (mv) {
      const capName = game.board[y][x] ? pieceName(game.board[y][x]) : "";
      const san = notate(sel[0], sel[1], x, y);
      game.place(sel[0], sel[1], x, y);
      log.push(san);
      sel = null; targets = []; hintMv = null;
      draw(); updateStatus();
      after(capName, san, true);
      return;
    }
    if (q && colorOf(q) === game.turn) { sel = [x, y]; refreshTargets(); draw(); }
    else { sel = null; targets = []; draw(); }
  }

  function after(capName, san, byHuman) {
    if (game.winner) {
      chat.narrate("key", (game.winner === humanSide ? "你" : "TA") + "赢了这一局（" + san + " 绝杀），说一句。");
      return;
    }
    if (game.check) chat.narrate("key", san + " 之后" + (game.turn === humanSide ? "我" : "你") + "被将军了，说一句。");
    else if (capName === "车" || capName === "車" || capName === "炮" || capName === "砲") chat.narrate("key", "刚吃掉了对方的" + capName + "（" + san + "），说一句。");
    else if (byHuman) chat.narrate("routine", "对手刚走 " + san + "，简单点评一句。");
    if (byHuman && mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 260);
  }

  async function aiTurn() {
    if (game.winner) return;
    const aiColor = humanSide === RED ? BLACK : RED;
    thinking = true; updateStatus();
    let mv = null;

    if (llmPlay && A.hasAI()) {
      try {
        const rep = await A.Operit.chat([
          { role: "system", content: "你是中国象棋引擎。棋盘列 a-i（左→右）、行 1-10（红方底线为 1）。只输出 4 字符着法如 b3e3，不要解释。" },
          { role: "user", content: game.fen() },
        ], { temperature: 0.2, maxTokens: 12 });
        A.Budget.note([{ role: "user", content: game.fen() }], rep);
        mv = parseMv(rep, aiColor);
      } catch (e) { /* 回落 */ }
    }
    if (!mv) { const m = game.aiMove(diff, aiColor); if (m) mv = m; }

    let san = "", capName = "";
    if (mv) {
      capName = game.board[mv[3]][mv[2]] ? pieceName(game.board[mv[3]][mv[2]]) : "";
      san = notate(mv[0], mv[1], mv[2], mv[3]);
      if (game.place(mv[0], mv[1], mv[2], mv[3])) log.push(san);
    }
    thinking = false; sel = null; targets = []; hintMv = null;
    draw(); updateStatus();
    if (san) after(capName, san, false);
  }

  function parseMv(s, color) {
    const m = String(s || "").toLowerCase().match(/([a-i])\s*(\d{1,2})\D{0,3}([a-i])\s*(\d{1,2})/);
    if (!m) return null;
    const x = "abcdefghi".indexOf(m[1]), y = H - +m[2], tx = "abcdefghi".indexOf(m[3]), ty = H - +m[4];
    const ok = game.legalMoves(game.board, color).some((v) => v[0] === x && v[1] === y && v[2] === tx && v[3] === ty);
    return ok ? [x, y, tx, ty] : null;
  }

  function localTip() {
    if (game.check) return game.turn === humanSide ? "先解将：垫子、挪帅、或者吃掉将你的那个子。" : "我这边被将了，得先应招。";
    if (game.history.length < 8) return "开局先出车、跳马护中兵，别急着动仕相。";
    const adv = game.evaluate(game.board, humanSide);
    if (adv > 300) return "你子力占优，可以兑子简化，越简单越稳。";
    if (adv < -300) return "现在吃亏，别硬碰，找机会做双重威胁。";
    return "占先手时要制造两个威胁——对手只能挡一个。";
  }

  /* ================= 聊天 ================= */
  const chat = new A.Chat(el("chatMount"), {
    game: "中国象棋",
    rules: "局面用象棋 FEN 给出（K帅 A仕 B相 N马 R车 C炮 P兵，大写=红）。",
    context: (m) => (m === "full" ? game.full() : game.brief()),
    localTip: localTip,
  });

  /* ================= 事件 ================= */
  canvas.addEventListener("click", (e) => {
    const [lx, ly] = A.canvasXY(canvas, e);
    let gx = Math.round((lx - PAD) / C), gy = Math.round((ly - PAD) / C);
    if (flip) { gx = W - 1 - gx; gy = H - 1 - gy; }
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) humanMove(gx, gy);
  });

  el("newGame").onclick = () => {
    game.reset(); log.length = 0; sel = null; targets = []; hintMv = null; thinking = false;
    applySide(); draw(); updateStatus();
    chat.sys("新局开始，红方先行。");
    if (mode === "ai" && humanSide !== RED) setTimeout(aiTurn, 320);
  };
  el("hintBtn").onclick = () => {
    if (game.winner) return;
    const h = game.hint(game.turn);
    if (!h) return;
    hintMv = h; draw();
    const t = "建议：" + pieceName(game.board[h.y][h.x]) + " " + cd(h.x, h.y) + "→" + cd(h.tx, h.ty) + "（" + h.why + "）";
    chat.local(t);
    A.toast(t);
  };
  el("undoBtn").onclick = () => {
    if (!game.history.length || thinking) return;
    const n = mode === "ai" ? 2 : 1;
    for (let i = 0; i < n && game.history.length; i++) { game.undo(); log.pop(); }
    sel = null; targets = []; hintMv = null;
    draw(); updateStatus();
  };
  el("flipBtn").onclick = () => { flip = !flip; draw(); };
  el("mode").onchange = (e) => { mode = e.target.value; updateStatus(); };
  el("diff").onchange = (e) => { diff = e.target.value; };
  el("side").onchange = (e) => {
    humanSide = e.target.value === "b" ? BLACK : RED;
    applySide(); draw();
    if (mode === "ai" && !game.history.length && humanSide !== RED) setTimeout(aiTurn, 320);
  };
  el("llmPlay").onchange = (e) => { llmPlay = e.target.checked; if (llmPlay) A.toast("大模型执子：每步约 60 token"); };

  function applySide() { flip = mode === "ai" && humanSide === BLACK; }

  window.addEventListener("arena:theme", draw);

  A.bindTabs();
  A.mountPanels({
    persona: "personaMount", theme: "themeMount", budget: "budgetMount", settings: "setMount",
    onPersona: () => chat.greet(),
  });
  applySide(); draw(); updateStatus();
})();
