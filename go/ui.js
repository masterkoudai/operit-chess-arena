/* ===== 围棋 UI ===== */
(function () {
  "use strict";
  const { BLACK, WHITE } = GO;
  let game = new Go(19);
  let size = 19;
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const box = document.getElementById("boardbox");
  const M = 24, C = (canvas.width - 2 * M) / (size - 1);

  let hintDot = null, mode = "ai", humanSide = BLACK, llmPlay = false, snaps = [];
  const el = (id) => document.getElementById(id);

  const chat = new ChessArena.Chat(el("chatMount"), {
    systemPrompt: () => "你是围棋 AI 棋伴，口语化简短（≤50字）。能读懂棋盘(●=黑 ○=白 .空)。懂基本定式、大场、急所、死活。",
    context: () => game.contextText(),
  });

  const px = (x) => M + x * C, py = (y) => M + y * C;
  const toXY = (cx, cy) => [Math.round((cx - M) / C), Math.round((cy - M) / C)];

  function starPoints(n) {
    if (n === 19) return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
    if (n === 13) return [[3,3],[3,9],[9,3],[9,9]];
    if (n === 9) return [[2,2],[2,6],[6,2],[6,6],[4,4]];
    return [];
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e3b96b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1;
    for (let i = 0; i < size; i++) { ctx.beginPath(); ctx.moveTo(px(0), py(i)); ctx.lineTo(px(size - 1), py(i)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(px(i), py(0)); ctx.lineTo(px(i), py(size - 1)); ctx.stroke(); }
    ctx.fillStyle = "rgba(0,0,0,.6)";
    for (const [sx, sy] of starPoints(size)) { ctx.beginPath(); ctx.arc(px(sx), py(sy), 3.5, 0, 7); ctx.fill(); }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = game.board[y][x]; if (v === 0) continue;
      ctx.beginPath(); ctx.arc(px(x), py(y), C * 0.45, 0, 7);
      ctx.fillStyle = v === BLACK ? "#1c1c1c" : "#f7f7f5"; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1; ctx.stroke();
    }
    if (game.last && !game.last.pass) { ctx.strokeStyle = "#4f9dff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px(game.last.x), py(game.last.y), C * 0.2, 0, 7); ctx.stroke(); }
    if (game.ko) { ctx.strokeStyle = "#f0883e"; ctx.lineWidth = 2; ctx.strokeRect(px(game.ko[0]) - C * 0.4, py(game.ko[1]) - C * 0.4, C * 0.8, C * 0.8); }
  }
  function showHintDot(h) { removeHintDot(); hintDot = document.createElement("div"); hintDot.className = "hint-dot"; hintDot.style.left = px(h.x) + "px"; hintDot.style.top = py(h.y) + "px"; box.appendChild(hintDot); }
  function removeHintDot() { if (hintDot) { hintDot.remove(); hintDot = null; } }

  function snap() { snaps.push({ board: game.board.map((r) => r.slice()), ko: game.ko, passes: game.passes, caps: { ...game.caps }, turn: game.turn, over: game.over, historyLen: game.history.length }); }
  function updateStatus() {
    if (game.over) {
      if (game.winner) { const w = game.winner === BLACK ? "黑" : "白"; const r = game.scoreResult || game.score(); el("status").innerHTML = `<b style="color:var(--win)">${w}胜</b> (黑${r.black.toFixed(1)} : 白${r.white.toFixed(1)})`; }
      else el("status").textContent = "对局结束";
    } else el("status").textContent = (game.turn === BLACK ? "黑方行棋" : "白方行棋") + (mode === "ai" && game.turn !== humanSide ? "（AI思考中…）" : "");
    el("capText").textContent = `提子 — 黑吃白：${game.caps[1]}　白吃黑：${game.caps[2]}` + (game.ko ? "　⚠️打劫点已标记" : "");
  }

  function humanMove(x, y) {
    if (game.over || game.board[y][x] !== 0) return;
    if (mode === "ai" && game.turn !== humanSide) return;
    snap();
    if (!game.play(x, y, game.turn)) { snaps.pop(); ChessArena.toast("非法着法（自杀/打劫）"); return; }
    removeHintDot(); draw(); updateStatus();
    if (game.over) { chat.narrate("对局结束，已数子。"); return; }
    if (mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 300);
  }
  async function aiTurn() {
    if (game.over) return;
    const aiColor = humanSide === BLACK ? WHITE : BLACK;
    snap();
    if (llmPlay && ChessArena.LLM.isConfigured()) {
      try {
        const rep = await ChessArena.Operit.chat([
          { role: "system", content: "你是围棋高手。只返回一个落子，格式 move:(x=列,y=行)，列行0-" + (size - 1) + "整数；若要停手回 move:pass。" },
          { role: "user", content: game.contextText() + "\n请给出你的落子或停手。" },
        ], { temperature: 0.3 });
        if (/pass/i.test(rep)) game.pass(aiColor);
        else { const m = parseMove(rep); if (m && game.play(m[0], m[1], aiColor)) {} else { const mv = game.aiMove("medium", aiColor); if (mv) game.play(mv[0], mv[1], aiColor); else game.pass(aiColor); } }
        chat.narrate("用一句话点评当前局面或你刚下的这步（≤40字，口语）。");
      } catch (e) { const mv = game.aiMove("medium", aiColor); if (mv) game.play(mv[0], mv[1], aiColor); else game.pass(aiColor); }
    } else { const mv = game.aiMove("medium", aiColor); if (mv) game.play(mv[0], mv[1], aiColor); else game.pass(aiColor); }
    draw(); updateStatus();
    if (game.over) chat.narrate("对局结束，已数子。");
  }
  function parseMove(s) { const mt = s.match(/x\s*=\s*(\d+)[^\d]*y\s*=\s*(\d+)/); if (mt) { const x = +mt[1], y = +mt[2]; if (x >= 0 && x < size && y >= 0 && y < size) return { x, y }; } return null; }

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const [x, y] = toXY((e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height));
    if (x >= 0 && x < size && y >= 0 && y < size) humanMove(x, y);
  });

  el("newGame").onclick = () => { game = new Go(size); snaps = []; removeHintDot(); draw(); updateStatus(); chat.add("ai", `新局开始（${size}路），黑先。`); };
  el("hintBtn").onclick = () => { const h = game.hint(game.turn); if (!h) { ChessArena.toast("无可下点，可停手"); return; } showHintDot(h); const t = `建议落子 (${h.x},${h.y})：${h.why}`; chat.add("ai", t); ChessArena.toast(t); };
  el("passBtn").onclick = () => { if (game.over) return; snap(); game.pass(game.turn); removeHintDot(); draw(); updateStatus(); if (mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 300); };
  el("resignBtn").onclick = () => { game.resign(game.turn); draw(); updateStatus(); };
  el("undoBtn").onclick = () => { const s = snaps.pop(); if (!s) return; game.board = s.board; game.ko = s.ko; game.passes = s.passes; game.caps = s.caps; game.turn = s.turn; game.over = s.over; game.history.length = s.historyLen; game.last = game.history.length ? game.history[game.history.length - 1] : null; removeHintDot(); draw(); updateStatus(); };
  el("size").onchange = (e) => { size = +e.target.value; game = new Go(size); snaps = []; removeHintDot(); draw(); updateStatus(); };
  el("mode").onchange = (e) => mode = e.target.value;
  el("side").onchange = (e) => humanSide = +e.target.value;
  el("llmPlay").onchange = (e) => llmPlay = e.target.checked;
  document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active")); t.classList.add("active");
    ["ctrl", "chat", "set"].forEach((k) => el("tab-" + k).classList.toggle("hidden", k !== t.dataset.tab));
  });
  ChessArena.renderSettings(el("setMount"));
  draw(); updateStatus();
})();
