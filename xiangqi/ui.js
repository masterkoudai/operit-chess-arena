/* ===== 中国象棋 UI ===== */
(function () {
  "use strict";
  const { W, H, RED, BLACK, pieceName } = XIANGQI;
  const game = new Xiangqi();
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const box = document.getElementById("boardbox");
  const M = 30, CX = (canvas.width - 2 * M) / (W - 1), CY = (canvas.height - 2 * M) / (H - 1);

  let hintDot = null, mode = "ai", diff = "medium", humanSide = RED, llmPlay = false, sel = null;
  const el = (id) => document.getElementById(id);

  const chat = new ChessArena.Chat(el("chatMount"), {
    systemPrompt: () => "你是中国象棋 AI 棋伴，口语化简短（≤50字）。能读懂棋盘(9列a-i, 10行1-10，红在底)。会指出将军、抽将、兑子等，给攻防建议。",
    context: () => game.contextText(),
  });

  const px = (x) => M + x * CX, py = (y) => M + y * CY;
  function toXY(cx, cy) {
    const x = Math.round((cx - M) / CX), y = Math.round((cy - M) / CY);
    return [x, y];
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#efd9a8"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x++) { ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(H - 1)); ctx.stroke(); }
    for (let y = 0; y < H; y++) {
      const xa = (y === 0 || y === H - 1) ? 0 : 1, xb = (y === 0 || y === H - 1) ? W - 1 : W - 2;
      ctx.beginPath(); ctx.moveTo(px(xa), py(y)); ctx.lineTo(px(xb), py(y)); ctx.stroke();
    }
    // 宫格斜线
    ctx.beginPath();
    ctx.moveTo(px(3), py(0)); ctx.lineTo(px(5), py(2));
    ctx.moveTo(px(5), py(0)); ctx.lineTo(px(3), py(2));
    ctx.moveTo(px(3), py(7)); ctx.lineTo(px(5), py(9));
    ctx.moveTo(px(5), py(7)); ctx.lineTo(px(3), py(9));
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.font = "18px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("楚 河", px(2), py(4.5)); ctx.fillText("漢 界", px(6), py(4.5));

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = game.board[y][x]; if (!p) continue;
      drawPiece(x, y, p);
    }
    if (sel) { ctx.strokeStyle = "#4f9dff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(sel[0]), py(sel[1]), CX * 0.45, 0, 7); ctx.stroke(); }
    if (game.last) { ctx.strokeStyle = "rgba(79,157,255,.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px(game.last.tx), py(game.last.ty), CX * 0.2, 0, 7); ctx.stroke(); }
    if (game.check) { const kp = game.findKing(game.board, game.turn); if (kp) { ctx.strokeStyle = "#f85149"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(kp[0]), py(kp[1]), CX * 0.5, 0, 7); ctx.stroke(); } }
  }
  function drawPiece(x, y, p) {
    const r = CX * 0.42;
    ctx.beginPath(); ctx.arc(px(x), py(y), r, 0, 7);
    ctx.fillStyle = "#f7f1df"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = isRed(p) ? "#b3261e" : "#1c1c1c"; ctx.stroke();
    ctx.fillStyle = isRed(p) ? "#b3261e" : "#1c1c1c";
    ctx.font = "bold 22px 'KaiTi','STKaiti',serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(pieceName(p), px(x), py(y));
  }

  function showHintDot(h) {
    removeHintDot();
    hintDot = document.createElement("div"); hintDot.className = "hint-dot";
    hintDot.style.left = px(h.tx) + "px"; hintDot.style.top = py(h.ty) + "px";
    box.appendChild(hintDot);
  }
  function removeHintDot() { if (hintDot) { hintDot.remove(); hintDot = null; } }

  function updateStatus() {
    if (game.winner) { const w = game.winner === RED ? "红方" : "黑方"; el("status").innerHTML = `<b style="color:var(--win)">${w}胜！</b>`; }
    else { el("status").textContent = (game.turn === RED ? "红方行棋" : "黑方行棋") + (game.check ? " · ⚠️被将军" : "") + (mode === "ai" && sideOf(game.turn) !== humanSide ? "（AI思考中…）" : ""); }
    updateEval(); renderMoves();
  }
  function sideOf(c) { return c; }
  function updateEval() {
    const adv = Math.max(-1, Math.min(1, game.evaluate(game.board, RED) / 4000));
    const pct = 50 - adv * 50; // 红优偏左
    el("evalMark").style.left = pct + "%";
    el("evalText").textContent = Math.abs(adv) < 0.03 ? "局势均衡" : (adv > 0 ? "红方占优" : "黑方占优");
  }
  function renderMoves() {
    const m = el("moves"); m.innerHTML = `<div class="n">#</div><div>红</div><div>黑</div>`;
    for (let i = 0; i < game.history.length; i += 2) {
      const a = game.history[i], b = game.history[i + 1];
      const c = (mv) => pieceName(mv.p) + `(${mv.x + 1},${mv.y + 1})→(${mv.tx + 1},${mv.ty + 1})`;
      m.innerHTML += `<div class="n">${i / 2 + 1}</div><div>${a ? c(a) : ""}</div><div>${b ? c(b) : ""}</div>`;
    }
  }

  function humanMove(x, y) {
    if (game.winner) return;
    if (mode === "ai" && game.turn !== humanSide) return;
    const p = game.board[y][x];
    if (!sel) { if (p && sideOf(colorOf2(p)) === game.turn) sel = [x, y]; draw(); return; }
    if (sel[0] === x && sel[1] === y) { sel = null; draw(); return; }
    if (game.place(sel[0], sel[1], x, y)) {
      sel = null; removeHintDot(); draw(); updateStatus();
      if (game.winner) { chat.narrate(`恭喜，${game.winner === RED ? "红" : "黑"}方获胜！`); return; }
      if (mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 300);
    } else { if (p && sideOf(colorOf2(p)) === game.turn) sel = [x, y]; else sel = null; draw(); }
  }
  function colorOf2(p) { return p === p.toUpperCase() ? RED : BLACK; }

  async function aiTurn() {
    if (game.winner) return;
    const aiColor = humanSide === RED ? BLACK : RED;
    if (llmPlay && ChessArena.LLM.isConfigured()) {
      try {
        const rep = await ChessArena.Operit.chat([
          { role: "system", content: "你是中国象棋高手。只返回一个着法，格式 move:(fromX=列,fromY=行,toX=列,toY=行)，列0-8、行0-9整数。不要解释。" },
          { role: "user", content: game.contextText() + "\n请给出你的着法。" },
        ], { temperature: 0.3 });
        const m = parseMove(rep);
        if (m && game.place(m[0], m[1], m[2], m[3])) { }
        else { const mv = game.aiMove(diff, aiColor); if (mv) game.place(mv[0], mv[1], mv[2], mv[3]); }
        chat.narrate("用一句话点评当前局面或你刚下的这步（≤40字，口语）。");
      } catch (e) { const mv = game.aiMove(diff, aiColor); if (mv) game.place(mv[0], mv[1], mv[2], mv[3]); }
    } else { const mv = game.aiMove(diff, aiColor); if (mv) game.place(mv[0], mv[1], mv[2], mv[3]); }
    draw(); updateStatus();
    if (game.winner) chat.narrate(`${game.winner === RED ? "红" : "黑"}方获胜！`);
  }
  function parseMove(s) {
    const mt = s.match(/fromX\s*=\s*(\d+).*?fromY\s*=\s*(\d+).*?toX\s*=\s*(\d+).*?toY\s*=\s*(\d+)/s);
    if (mt) { const a = mt.slice(1, 5).map(Number); if (a.every((v) => v >= 0 && v < 9 || v < 10)) return a.slice(0, 4); }
    return null;
  }

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (canvas.width / r.width);
    const cy = (e.clientY - r.top) * (canvas.height / r.height);
    const [x, y] = toXY(cx, cy);
    if (x >= 0 && x < W && y >= 0 && y < H) humanMove(x, y);
  });

  el("newGame").onclick = () => { game.reset(); sel = null; removeHintDot(); draw(); updateStatus(); chat.add("ai", "新局开始，红方先行。"); };
  el("hintBtn").onclick = () => {
    const h = game.hint(game.turn);
    if (!h) return;
    showHintDot(h);
    const t = `建议：${pieceName(game.board[h.y][h.x])} (${h.x + 1},${h.y + 1})→(${h.tx + 1},${h.ty + 1})：${h.why}`;
    chat.add("ai", t); ChessArena.toast(t);
  };
  el("undoBtn").onclick = () => {
    if (!game.history.length) return;
    const n = mode === "ai" ? 2 : 1;
    for (let i = 0; i < n && game.history.length; i++) game.undo();
    sel = null; removeHintDot(); draw(); updateStatus();
  };
  el("mode").onchange = (e) => mode = e.target.value;
  el("diff").onchange = (e) => diff = e.target.value;
  el("side").onchange = (e) => humanSide = e.target.value;
  el("llmPlay").onchange = (e) => llmPlay = e.target.checked;

  document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    ["ctrl", "chat", "set"].forEach((k) => el("tab-" + k).classList.toggle("hidden", k !== t.dataset.tab));
  });
  ChessArena.renderSettings(el("setMount"));

  draw(); updateStatus();
})();
