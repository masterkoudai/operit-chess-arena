/* ===== 国际象棋 UI ===== */
(function () {
  "use strict";
  const { N, WHITE, BLACK } = CHESS;
  const game = new Chess();
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const box = document.getElementById("boardbox");
  const M = 30, C = (canvas.width - 2 * M) / (N - 1);
  const SYM = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const FILE = "abcdefgh";

  let hintDot = null, mode = "ai", diff = "medium", humanSide = WHITE, llmPlay = false, sel = null;
  const el = (id) => document.getElementById(id);
  const colorOf = (p) => !p ? null : (p === p.toUpperCase() ? WHITE : BLACK);

  const chat = new ChessArena.Chat(el("chatMount"), {
    systemPrompt: () => "你是国际象棋 AI 棋伴，口语化简短（≤50字）。能读懂棋盘(8x8, a-h列, 1-8行，白在底)。会指出将军、fork、牵制等，给建议。",
    context: () => game.contextText(),
  });

  const px = (x) => M + x * C, py = (y) => M + y * C;
  const toXY = (cx, cy) => [Math.round((cx - M) / C), Math.round((cy - M) / C)];

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#ebecd0" : "#739552";
      ctx.fillRect(px(x) - C / 2, py(y) - C / 2, C, C);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const p = game.board[y][x]; if (!p) continue;
      ctx.font = "38px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = colorOf(p) === WHITE ? "#f7f7f5" : "#1c1c1c";
      ctx.fillText(SYM[p], px(x), py(y));
      if (colorOf(p) === BLACK) { ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.strokeText(SYM[p], px(x), py(y)); }
    }
    if (sel) { ctx.strokeStyle = "#4f9dff"; ctx.lineWidth = 3; ctx.strokeRect(px(sel[0]) - C / 2, py(sel[1]) - C / 2, C, C); }
    if (game.last) { ctx.fillStyle = "rgba(79,157,255,.35)"; ctx.fillRect(px(game.last.tx) - C / 2, py(game.last.ty) - C / 2, C, C); }
    if (game.check) { const kp = game.findKing(game.board, game.turn); if (kp) { ctx.strokeStyle = "#f85149"; ctx.lineWidth = 3; ctx.strokeRect(px(kp[0]) - C / 2, py(kp[1]) - C / 2, C, C); } }
  }

  function showHintDot(h) { removeHintDot(); hintDot = document.createElement("div"); hintDot.className = "hint-dot"; hintDot.style.left = px(h.tx) + "px"; hintDot.style.top = py(h.ty) + "px"; box.appendChild(hintDot); }
  function removeHintDot() { if (hintDot) { hintDot.remove(); hintDot = null; } }

  function sq(x, y) { return FILE[x] + (N - y); }
  function updateStatus() {
    if (game.winner === "draw") el("status").innerHTML = `<b>和棋</b>`;
    else if (game.winner) el("status").innerHTML = `<b style="color:var(--win)">${game.winner === WHITE ? "白" : "黑"}方胜！</b>`;
    else el("status").textContent = (game.turn === WHITE ? "白方行棋" : "黑方行棋") + (game.check ? " · ⚠️被将军" : "") + (mode === "ai" && game.turn !== humanSide ? "（AI思考中…）" : "");
    updateEval(); renderMoves();
  }
  function updateEval() { const adv = Math.max(-1, Math.min(1, game.evaluate(game.board, WHITE) / 5000)); el("evalMark").style.left = (50 - adv * 50) + "%"; el("evalText").textContent = Math.abs(adv) < 0.03 ? "局势均衡" : (adv > 0 ? "白方占优" : "黑方占优"); }
  function renderMoves() {
    const m = el("moves"); m.innerHTML = `<div class="n">#</div><div>白</div><div>黑</div>`;
    for (let i = 0; i < game.hist.length; i += 2) {
      const a = game.hist[i], b = game.hist[i + 1];
      const c = (mv) => pieceName(mv) + sq(mv.fx, mv.fy) + sq(mv.tx, mv.ty);
      m.innerHTML += `<div class="n">${i / 2 + 1}</div><div>${a ? c(a) : ""}</div><div>${b ? c(b) : ""}</div>`;
    }
  }
  function pieceName(mv) { const p = game.board[0]; return ""; } // 着法列表省略棋子名，用坐标

  function humanMove(x, y) {
    if (game.winner) return;
    if (mode === "ai" && game.turn !== humanSide) return;
    const p = game.board[y][x];
    if (!sel) { if (p && colorOf(p) === game.turn) { sel = [x, y]; draw(); } return; }
    if (sel[0] === x && sel[1] === y) { sel = null; draw(); return; }
    if (game.move(sel[0], sel[1], x, y)) {
      sel = null; removeHintDot(); draw(); updateStatus();
      if (game.winner) { chat.narrate(`恭喜，${game.winner === WHITE ? "白" : "黑"}方获胜！`); return; }
      if (mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 300);
    } else if (p && colorOf(p) === game.turn) { sel = [x, y]; draw(); } else { sel = null; draw(); }
  }

  async function aiTurn() {
    if (game.winner) return;
    const aiColor = humanSide === WHITE ? BLACK : WHITE;
    if (llmPlay && ChessArena.LLM.isConfigured()) {
      try {
        const rep = await ChessArena.Operit.chat([
          { role: "system", content: "你是国际象棋高手。只返回一个着法，格式 move:(fromX=列,fromY=行,toX=列,toY=行)，列0-7(a-h), 行0-7(0顶黑,7底白)。不要解释。" },
          { role: "user", content: game.contextText() + "\n请给出你的着法。" },
        ], { temperature: 0.3 });
        const m = parseMove(rep);
        if (!(m && game.move(m[0], m[1], m[2], m[3]))) { const mv = game.aiMove(diff, aiColor); if (mv) game.move(mv.fx, mv.fy, mv.tx, mv.ty); }
        chat.narrate("用一句话点评当前局面或你刚下的这步（≤40字，口语）。");
      } catch (e) { const mv = game.aiMove(diff, aiColor); if (mv) game.move(mv.fx, mv.fy, mv.tx, mv.ty); }
    } else { const mv = game.aiMove(diff, aiColor); if (mv) game.move(mv.fx, mv.fy, mv.tx, mv.ty); }
    draw(); updateStatus();
    if (game.winner) chat.narrate(`${game.winner === WHITE ? "白" : "黑"}方获胜！`);
  }
  function parseMove(s) { const mt = s.match(/fromX\s*=\s*(\d+).*?fromY\s*=\s*(\d+).*?toX\s*=\s*(\d+).*?toY\s*=\s*(\d+)/s); if (mt) { const a = mt.slice(1, 5).map(Number); if (a.every((v, i) => (i < 2 || i >= 2) && v >= 0 && v < 8)) return a; } return null; }

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const [x, y] = toXY((e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height));
    if (x >= 0 && x < N && y >= 0 && y < N) humanMove(x, y);
  });

  el("newGame").onclick = () => { game.reset(); sel = null; removeHintDot(); draw(); updateStatus(); chat.add("ai", "新局开始，白方先行。"); };
  el("hintBtn").onclick = () => { const h = game.hint(game.turn); if (!h) return; showHintDot(h); const t = `建议：${sq(h.fx, h.fy)}→${sq(h.tx, h.ty)}（${h.why}）`; chat.add("ai", t); ChessArena.toast(t); };
  el("undoBtn").onclick = () => { if (!game.hist.length) return; const n = mode === "ai" ? 2 : 1; for (let i = 0; i < n && game.hist.length; i++) game.undo(); sel = null; removeHintDot(); draw(); updateStatus(); };
  el("mode").onchange = (e) => mode = e.target.value;
  el("diff").onchange = (e) => diff = e.target.value;
  el("side").onchange = (e) => humanSide = e.target.value;
  el("llmPlay").onchange = (e) => llmPlay = e.target.checked;
  document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active")); t.classList.add("active");
    ["ctrl", "chat", "set"].forEach((k) => el("tab-" + k).classList.toggle("hidden", k !== t.dataset.tab));
  });
  ChessArena.renderSettings(el("setMount"));
  draw(); updateStatus();
})();
