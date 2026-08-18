/* ===== 五子棋 UI ===== */
(function () {
  "use strict";
  const { SIZE, EMPTY, BLACK, WHITE } = GOMOKU;
  const game = new Gomoku();
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const box = document.getElementById("boardbox");
  const M = 26, C = (canvas.width - 2 * M) / (SIZE - 1);

  let hintDot = null, mode = "ai", diff = "medium", humanSide = BLACK, llmPlay = false;
  const el = (id) => document.getElementById(id);

  const chat = new ChessArena.Chat(el("chatMount"), {
    systemPrompt: () => "你是五子棋 AI 棋伴，口语化、简短（≤50字）。能看懂棋盘坐标（a-o 列, 1-15 行）。会指出活三/冲四/双三等棋型，给出攻防建议。",
    context: () => game.contextText(),
  });

  function xyToPx(x, y) { return [M + x * C, M + y * C]; }
  function pxToXy(px, py) {
    const x = Math.round((px - M) / C), y = Math.round((py - M) / C);
    return [x, y];
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--board") || "#e3b96b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(M + i * C, M); ctx.lineTo(M + i * C, M + (SIZE - 1) * C); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(M, M + i * C); ctx.lineTo(M + (SIZE - 1) * C, M + i * C); ctx.stroke();
    }
    const stars = [[3,3],[11,3],[3,11],[11,11],[7,7]];
    ctx.fillStyle = "rgba(0,0,0,.6)";
    for (const [sx, sy] of stars) { ctx.beginPath(); ctx.arc(M + sx * C, M + sy * C, 3.5, 0, 7); ctx.fill(); }

    // 禁手点（黑棋回合时预览）
    if (game.turn === BLACK && mode === "pvp" || (mode === "ai" && humanSide === BLACK && game.turn === BLACK)) {
      ctx.fillStyle = "rgba(248,81,73,.35)";
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (game.board[y][x] === EMPTY && game.isForbidden(x, y)) {
          const [px, py] = xyToPx(x, y); ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fill();
        }
      }
    }

    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const v = game.board[y][x];
      if (v === EMPTY) continue;
      const [px, py] = xyToPx(x, y);
      ctx.beginPath(); ctx.arc(px, py, C * 0.42, 0, 7);
      ctx.fillStyle = v === BLACK ? "#1c1c1c" : "#f7f7f5";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.stroke();
    }
    if (game.last) {
      const [px, py] = xyToPx(game.last.x, game.last.y);
      ctx.strokeStyle = "#4f9dff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, C * 0.18, 0, 7); ctx.stroke();
    }
    if (game.winLine) {
      ctx.strokeStyle = "#3fb950"; ctx.lineWidth = 3;
      const a = xyToPx(game.winLine[0][0], game.winLine[0][1]);
      const b = xyToPx(game.winLine[game.winLine.length - 1][0], game.winLine[game.winLine.length - 1][1]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }

  function showHintDot(h) {
    removeHintDot();
    const [px, py] = xyToPx(h.x, h.y);
    hintDot = document.createElement("div");
    hintDot.className = "hint-dot";
    hintDot.style.left = px + "px"; hintDot.style.top = py + "px";
    box.appendChild(hintDot);
  }
  function removeHintDot() { if (hintDot) { hintDot.remove(); hintDot = null; } }

  function updateStatus() {
    if (game.winner) {
      const who = game.winner === BLACK ? "黑棋" : "白棋";
      el("status").innerHTML = `<b style="color:var(--win)">${who}胜！</b>`;
    } else {
      const t = game.turn === BLACK ? "黑方行棋" : "白方行棋";
      el("status").textContent = t + (mode === "ai" && game.turn !== humanSide ? "（AI思考中…）" : "");
    }
    updateEval();
    renderMoves();
  }

  function updateEval() {
    // 简易评估：双方最佳点之差
    const cands = game.candidates(2);
    let bBest = 0, wBest = 0;
    for (const [x, y] of cands) {
      bBest = Math.max(bBest, game.pointScore(x, y, BLACK));
      wBest = Math.max(wBest, game.pointScore(x, y, WHITE));
    }
    const adv = Math.max(-1, Math.min(1, (wBest - bBest) / 50000));
    const pct = 50 + adv * 50;
    el("evalMark").style.left = pct + "%";
    el("evalText").textContent = Math.abs(adv) < 0.02 ? "局势均衡" : (adv > 0 ? "白方占优" : "黑方占优");
  }

  function renderMoves() {
    const m = el("moves"); m.innerHTML = "";
    m.innerHTML = `<div class="n">#</div><div>黑</div><div>白</div>`;
    for (let i = 0; i < game.history.length; i += 2) {
      const b = game.history[i], w = game.history[i + 1];
      const c = (p) => p ? ChessArena.coord.toAlpha(p.x) + ChessArena.coord.num(p.y, SIZE) : "";
      m.innerHTML += `<div class="n">${i / 2 + 1}</div><div>${c(b)}</div><div>${c(w)}</div>`;
    }
  }

  function humanMove(x, y) {
    if (game.winner) return;
    if (mode === "ai" && game.turn !== humanSide) return;
    if (game.board[y][x] !== EMPTY) return;
    if (game.turn === BLACK && game.isForbidden(x, y)) {
      ChessArena.toast("禁手：" + game.isForbidden(x, y)); return;
    }
    game.place(x, y, game.turn);
    removeHintDot();
    draw(); updateStatus();
    if (game.winner) { chat.narrate(`恭喜，${game.winner === BLACK ? "黑" : "白"}棋连成五子获胜！`); return; }
    if (mode === "ai" && game.turn !== humanSide) setTimeout(aiTurn, 350);
  }

  async function aiTurn() {
    if (game.winner) return;
    const aiColor = humanSide === BLACK ? WHITE : BLACK;
    if (llmPlay && ChessArena.LLM.isConfigured()) {
      try {
        const ctxMsg = [{ role: "system", content: "你是五子棋高手。只返回一个落子，格式严格为 move:(x=列,y=行)，列行均为 0-14 整数。不要解释。" },
          { role: "user", content: game.contextText() + "\n棋盘(0=空,1=黑,2=白):\n" + boardStr() + "\n请给出你的落子。" }];
        const reply = await ChessArena.Operit.chat(ctxMsg, { temperature: 0.3 });
        const m = parseMove(reply);
        if (m && game.board[m.y][m.x] === EMPTY && (aiColor !== BLACK || !game.isForbidden(m.x, m.y))) {
          game.place(m.x, m.y, aiColor);
        } else { fallbackAi(aiColor); }
        chat.narrate("用一句话点评当前局面或你刚下的这步（≤40字，口语）。");
      } catch (e) { fallbackAi(aiColor); }
    } else {
      fallbackAi(aiColor);
    }
    draw(); updateStatus();
    if (game.winner) chat.narrate(`${game.winner === BLACK ? "黑" : "白"}棋获胜！`);
  }
  function fallbackAi(aiColor) {
    const m = game.aiMove(diff, aiColor);
    game.place(m.x, m.y, aiColor);
  }
  function boardStr() {
    return game.board.map((r) => r.join("")).join("\n");
  }
  function parseMove(s) {
    const mt = s.match(/x\s*=\s*(\d+)[^\d]*y\s*=\s*(\d+)/);
    if (mt) { const x = +mt[1], y = +mt[2]; if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) return { x, y }; }
    return null;
  }

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (canvas.width / r.width);
    const py = (e.clientY - r.top) * (canvas.height / r.height);
    const [x, y] = pxToXy(px, py);
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) humanMove(x, y);
  });

  el("newGame").onclick = () => { game.reset(); removeHintDot(); draw(); updateStatus(); chat.add("ai", "新局开始，黑棋先行。"); };
  el("hintBtn").onclick = () => {
    const color = game.turn;
    const h = game.hint(color);
    showHintDot(h);
    const t = `${color === BLACK ? "黑" : "白"}方建议落子 ${ChessArena.coord.toAlpha(h.x)}${ChessArena.coord.num(h.y, SIZE)}：${h.why}`;
    chat.add("ai", t);
    ChessArena.toast(t);
  };
  el("undoBtn").onclick = () => {
    if (game.history.length === 0) return;
    const n = mode === "ai" ? 2 : 1;
    for (let i = 0; i < n && game.history.length; i++) {
      const last = game.history.pop();
      game.board[last.y][last.x] = EMPTY;
    }
    game.winner = 0; game.winLine = null;
    game.turn = game.history.length % 2 === 0 ? BLACK : WHITE;
    removeHintDot(); draw(); updateStatus();
  };
  el("mode").onchange = (e) => mode = e.target.value;
  el("diff").onchange = (e) => diff = e.target.value;
  el("side").onchange = (e) => humanSide = +e.target.value;
  el("llmPlay").onchange = (e) => llmPlay = e.target.checked;

  document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    ["ctrl", "chat", "set"].forEach((k) => el("tab-" + k).classList.toggle("hidden", k !== t.dataset.tab));
  });
  ChessArena.renderSettings(el("setMount"));

  draw(); updateStatus();
})();
