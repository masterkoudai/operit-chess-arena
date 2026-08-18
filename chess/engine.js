/* ===== 国际象棋引擎（完整规则 / 易位 / 吃过路 / 升变 / 将死 / α-β） ===== */
(function (global) {
  "use strict";
  const N = 8, WHITE = "w", BLACK = "b";
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  const PST = {
    P: [0,0,0,0,0,0,0,0, 5,10,10,-20,-20,10,10,5, 5,-5,-10,0,0,-10,-5,5, 0,0,0,20,20,0,0,0, 5,5,10,25,25,10,5,5, 10,10,20,30,30,20,10,10, 50,50,50,50,50,50,50,50, 0,0,0,0,0,0,0,0],
    N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,5,5,0,-20,-40, -30,5,10,15,15,10,5,-30, -30,0,15,20,20,15,0,-30, -30,5,15,20,20,15,5,-30, -30,0,10,15,15,10,0,-30, -40,-20,0,0,0,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,5,0,0,0,0,5,-10, -10,10,10,10,10,10,10,-10, -10,0,10,10,10,10,0,-10, -10,5,5,10,10,5,5,-10, -10,0,5,10,10,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    R: [0,0,0,5,5,0,0,0, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 5,10,10,10,10,10,10,5, 0,0,0,0,0,0,0,0],
    Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,5,0,0,0,0,-10, -10,5,5,5,5,5,0,-10, 0,0,5,5,5,5,0,-5, -5,0,5,5,5,5,0,-5, -10,0,5,5,5,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    K: [20,30,10,0,0,10,30,20, 20,20,0,0,0,0,20,20, -10,-20,-20,-20,-20,-20,-20,-10, -20,-30,-30,-40,-40,-30,-30,-20, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30],
  };
  function colorOf(p) { return !p ? null : (p === p.toUpperCase() ? WHITE : BLACK); }
  function opp(c) { return c === WHITE ? BLACK : WHITE; }
  function inB(x, y) { return x >= 0 && x < N && y >= 0 && y < N; }
  const isUpper = (p) => p && p === p.toUpperCase();

  class Chess {
    constructor() { this.reset(); }
    reset() {
      const b = Array.from({ length: N }, () => new Array(N).fill(null));
      const back = "RNBQKBNR";
      for (let x = 0; x < 8; x++) { b[0][x] = back[x].toLowerCase(); b[7][x] = back[x]; }
      for (let x = 0; x < 8; x++) { b[1][x] = "p"; b[6][x] = "P"; }
      this.board = b; this.turn = WHITE; this.castle = { wk: true, wq: true, bk: true, bq: true };
      this.ep = null; this.hist = []; this.winner = 0; this.last = null; this.check = false;
    }
    clone() { const g = new Chess(); g.board = this.board.map((r) => r.slice()); g.turn = this.turn; g.castle = { ...this.castle }; g.ep = this.ep; g.hist = this.hist.slice(); g.winner = this.winner; g.last = this.last; g.check = this.check; return g; }

    findKing(b, c) { const k = c === WHITE ? "K" : "k"; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (b[y][x] === k) return [x, y]; return null; }
    attacked(b, x, y, by) {
      // 马
      for (const [dx, dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) {
        const nx = x + dx, ny = y + dy; if (inB(nx, ny) && colorOf(b[ny][nx]) === by && b[ny][nx].toUpperCase() === "N") return true;
      }
      // 王
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = x + dx, ny = y + dy; if (inB(nx, ny) && colorOf(b[ny][nx]) === by && b[ny][nx].toUpperCase() === "K") return true;
      }
      // 直线/斜线（车/象/后/兵）
      const lines = [[1,0,"R"],[-1,0,"R"],[0,1,"R"],[0,-1,"R"],[1,1,"B"],[1,-1,"B"],[-1,1,"B"],[-1,-1,"B"]];
      for (const [dx, dy, kind] of lines) {
        let nx = x + dx, ny = y + dy;
        while (inB(nx, ny)) {
          const p = b[ny][nx]; if (p) { if (colorOf(p) === by) { const t = p.toUpperCase(); if (t === "Q" || t === kind || (kind === "R" && t === "R") || (kind === "B" && t === "B")) return true; if (t === "P" && Math.abs(ny - y) === 1 && Math.sign(ny - y) === (by === WHITE ? -1 : 1)) return true; } break; }
          nx += dx; ny += dy;
        }
      }
      return false;
    }
    inCheck(b, c) { const k = this.findKing(b, c); return k ? this.attacked(b, k[0], k[1], opp(c)) : true; }

    genPiece(b, x, y) {
      const p = b[y][x]; if (!p) return []; const c = colorOf(p), t = p.toUpperCase(); const out = [];
      const push = (nx, ny, flag) => { if (!inB(nx, ny)) return; const q = b[ny][nx]; if (colorOf(q) !== c) out.push({ x: nx, y: ny, flag }); };
      if (t === "P") {
        const fwd = c === WHITE ? -1 : 1, start = c === WHITE ? 6 : 1, promoRank = c === WHITE ? 0 : 7;
        const ny = y + fwd;
        if (inB(x, ny) && !b[ny][x]) { push(x, ny, ny === promoRank ? "promo" : null); if (y === start && !b[y + 2 * fwd][x]) out.push({ x, y: y + 2 * fwd, flag: "double" }); }
        for (const dx of [-1, 1]) { const nx = x + dx; if (inB(nx, ny)) { const q = b[ny][nx]; if (colorOf(q) === opp(c)) push(nx, ny, ny === promoRank ? "promo" : "capture"); else if (this.ep && this.ep[0] === nx && this.ep[1] === ny) out.push({ x: nx, y: ny, flag: "ep" }); } }
      } else if (t === "N") {
        for (const [dx, dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) push(x + dx, y + dy);
      } else if (t === "K") {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) push(x + dx, y + dy);
        // 易位
        if (c === WHITE && x === 4 && y === 7) {
          if (this.castle.wk && !b[7][5] && !b[7][6] && b[7][7] === "R" && !this.attacked(b, 4, 7, BLACK) && !this.attacked(b, 5, 7, BLACK) && !this.attacked(b, 6, 7, BLACK)) out.push({ x: 6, y: 7, flag: "castleK" });
          if (this.castle.wq && !b[7][3] && !b[7][2] && !b[7][1] && b[7][0] === "R" && !this.attacked(b, 4, 7, BLACK) && !this.attacked(b, 3, 7, BLACK) && !this.attacked(b, 2, 7, BLACK)) out.push({ x: 2, y: 7, flag: "castleQ" });
        }
        if (c === BLACK && x === 4 && y === 0) {
          if (this.castle.bk && !b[0][5] && !b[0][6] && b[0][7] === "r" && !this.attacked(b, 4, 0, WHITE) && !this.attacked(b, 5, 0, WHITE) && !this.attacked(b, 6, 0, WHITE)) out.push({ x: 6, y: 0, flag: "castleK" });
          if (this.castle.bq && !b[0][3] && !b[0][2] && !b[0][1] && b[0][0] === "r" && !this.attacked(b, 4, 0, WHITE) && !this.attacked(b, 3, 0, WHITE) && !this.attacked(b, 2, 0, WHITE)) out.push({ x: 2, y: 0, flag: "castleQ" });
        }
      } else {
        const slide = (dx, dy) => { let nx = x + dx, ny = y + dy; while (inB(nx, ny)) { const q = b[ny][nx]; if (!q) out.push({ x: nx, y: ny }); else { if (colorOf(q) !== c) out.push({ x: nx, y: ny }); break; } nx += dx; ny += dy; } };
        if (t === "R" || t === "Q") for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) slide(dx, dy);
        if (t === "B" || t === "Q") for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) slide(dx, dy);
      }
      return out;
    }
    genAll(b, c) { const out = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (colorOf(b[y][x]) === c) for (const m of this.genPiece(b, x, y)) out.push({ fx: x, fy: y, tx: m.x, ty: m.y, flag: m.flag }); return out; }
    legalMoves(b, c) {
      const out = [];
      for (const m of this.genAll(b, c)) {
        const undo = this.apply(b, m);
        if (!this.inCheck(b, c)) out.push(m);
        this.revert(b, undo);
      }
      return out;
    }
    apply(b, m) {
      const p = b[m.fy][m.fx]; const cap = b[m.ty][m.tx];
      const undo = { m, cap, ep: this.ep, castle: { ...this.castle } };
      b[m.ty][m.tx] = p; b[m.fy][m.fx] = null;
      const c = colorOf(p);
      if (m.flag === "ep") b[m.fy][m.tx] = null;
      if (m.flag === "promo") {
        const pr = (m._promo || "Q").replace(/[^QRBNqrbn]/g, "") || "Q";
        b[m.ty][m.tx] = c === WHITE ? pr.toUpperCase() : pr.toLowerCase();
      }
      if (m.flag === "castleK") { b[m.fy][5] = b[m.fy][7]; b[m.fy][7] = null; }
      if (m.flag === "castleQ") { b[m.fy][3] = b[m.fy][0]; b[m.fy][0] = null; }
      this.ep = m.flag === "double" ? [m.tx, (m.fy + m.ty) / 2] : null;
      if (p.toUpperCase() === "K") { if (c === WHITE) { this.castle.wk = this.castle.wq = false; } else { this.castle.bk = this.castle.bq = false; } }
      if (m.fx === 0 && m.fy === 7) this.castle.wq = false; if (m.fx === 7 && m.fy === 7) this.castle.wk = false;
      if (m.fx === 0 && m.fy === 0) this.castle.bq = false; if (m.fx === 7 && m.fy === 0) this.castle.bk = false;
      return undo;
    }
    revert(b, u) {
      const m = u.m, p = b[m.ty][m.tx];
      // 升变要还原成兵，否则搜索树会把兵留成后（原 bug）
      b[m.fy][m.fx] = m.flag === "promo" ? (colorOf(p) === WHITE ? "P" : "p") : p;
      b[m.ty][m.tx] = u.cap;
      if (m.flag === "ep") b[m.fy][m.tx] = colorOf(p) === WHITE ? "p" : "P";
      if (m.flag === "castleK") { b[m.fy][7] = b[m.fy][5]; b[m.fy][5] = null; }
      if (m.flag === "castleQ") { b[m.fy][0] = b[m.fy][3]; b[m.fy][3] = null; }
      this.ep = u.ep; this.castle = u.castle;
    }
    move(fx, fy, tx, ty, promo) {
      if (colorOf(this.board[fy][fx]) !== this.turn) return false;
      const legal = this.legalMoves(this.board, this.turn).find((m) => m.fx === fx && m.fy === fy && m.tx === tx && m.ty === ty);
      if (!legal) return false;
      if (legal.flag === "promo") legal._promo = promo || (this.turn === WHITE ? "Q" : "q");
      const undo = this.apply(this.board, legal);
      this.hist.push(undo); this.last = legal; this.turn = opp(this.turn);
      this.check = this.inCheck(this.board, this.turn);
      if (this.legalMoves(this.board, this.turn).length === 0) this.winner = this.check ? opp(this.turn) : "draw";
      return true;
    }
    undo() { const u = this.hist.pop(); if (!u) return; this.revert(this.board, u); this.turn = opp(this.turn); this.winner = 0; this.last = this.hist.length ? this.hist[this.hist.length - 1] : null; this.check = this.inCheck(this.board, this.turn); }

    evaluate(b, c) {
      let s = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const p = b[y][x]; if (!p) continue;
        const t = p.toUpperCase(); let v = VAL[t];
        const idx = t === "P" ? (isUpper(p) ? (7 - y) * 8 + x : y * 8 + x) : (isUpper(p) ? y * 8 + x : (7 - y) * 8 + x);
        v += (PST[t] && PST[t][idx]) || 0;
        s += colorOf(p) === c ? v : -v;
      }
      return s;
    }
    search(b, c, depth, alpha, beta) {
      if (depth === 0) return this.evaluate(b, c);
      const moves = this.legalMoves(b, c);
      if (!moves.length) return this.inCheck(b, c) ? -100000 : 0;
      let best = -1e9;
      for (const m of moves) {
        const undo = this.apply(b, m); const val = -this.search(b, opp(c), depth - 1, -beta, -alpha);
        this.revert(b, undo);
        if (val > best) best = val; if (best > alpha) alpha = best; if (alpha >= beta) break;
      }
      return best;
    }
    aiMove(difficulty = "medium", me = BLACK) {
      const depth = difficulty === "easy" ? 1 : difficulty === "hard" ? 3 : 2;
      const moves = this.legalMoves(this.board, me); if (!moves.length) return null;
      if (difficulty === "easy" && Math.random() < 0.3) return moves[(Math.random() * moves.length) | 0];
      moves.sort((a, z) => (VAL[(this.board[z.ty][z.tx] || "P").toUpperCase()] || 0) - (VAL[(this.board[a.ty][a.tx] || "P").toUpperCase()] || 0));
      let best = null, bestV = -1e9, alpha = -1e9;
      for (const m of moves) { const undo = this.apply(this.board, m); const val = -this.search(this.board, opp(me), depth - 1, -1e9, -alpha); this.revert(this.board, undo); if (val > bestV) { bestV = val; best = m; } if (bestV > alpha) alpha = bestV; }
      return best;
    }
    hint(color) { const m = this.aiMove("hard", color); if (!m) return null; return { fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, why: "局面评估最优着法" }; }
    /* ---- 紧凑局面：标准 FEN（约 70 字符，替代整盘 dump，且模型理解更准） ---- */
    fen() {
      let s = "";
      for (let y = 0; y < N; y++) {
        let empty = 0, row = "";
        for (let x = 0; x < N; x++) {
          const p = this.board[y][x];
          if (!p) { empty++; continue; }
          if (empty) { row += empty; empty = 0; }
          row += p;
        }
        if (empty) row += empty;
        s += row + (y < N - 1 ? "/" : "");
      }
      let c = (this.castle.wk ? "K" : "") + (this.castle.wq ? "Q" : "") + (this.castle.bk ? "k" : "") + (this.castle.bq ? "q" : "");
      const ep = this.ep ? "abcdefgh"[this.ep[0]] + (N - this.ep[1]) : "-";
      return s + " " + (this.turn === WHITE ? "w" : "b") + " " + (c || "-") + " " + ep;
    }
    brief() {
      const sq = (x, y) => "abcdefgh"[x] + (N - y);
      const recent = this.hist.slice(-3).map((u) => u.m ? sq(u.m.fx, u.m.fy) + sq(u.m.tx, u.m.ty) : "").filter(Boolean).join(" ");
      return `国际象棋 FEN:${this.fen()} 轮:${this.turn === WHITE ? "白" : "黑"}`
        + `${this.check ? " 被将军!" : ""} 第${this.hist.length}手${recent ? " 近手:" + recent : ""}`;
    }
    full() { return this.brief(); }
    contextText() { return this.brief(); }
  }
  global.Chess = Chess; global.CHESS = { N, WHITE, BLACK };
})(typeof window !== "undefined" ? window : globalThis);
