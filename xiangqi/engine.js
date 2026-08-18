/* ===== 中国象棋引擎（完整规则 / 将军将死 / α-β AI） ===== */
(function (global) {
  "use strict";
  const W = 9, H = 10; // 列0-8，行0-9（0顶=黑，9底=红）
  const RED = "r", BLACK = "b";

  function isRed(p) { return p && p === p.toUpperCase(); }
  function colorOf(p) { return !p ? null : (isRed(p) ? RED : BLACK); }
  function opp(c) { return c === RED ? BLACK : RED; }
  function inB(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }

  const VAL = { K: 10000, R: 600, C: 300, H: 270, P: 30, E: 120, A: 120 };

  class Xiangqi {
    constructor() { this.reset(); }
    reset() {
      const b = Array.from({ length: H }, () => new Array(W).fill(null));
      const back = "RHEAKAEHR";
      for (let x = 0; x < 9; x++) { b[0][x] = back[x].toLowerCase(); b[9][x] = back[x]; }
      b[2][1] = "c"; b[2][7] = "c"; b[7][1] = "C"; b[7][7] = "C";
      for (let x = 0; x < 9; x += 2) { b[3][x] = "p"; b[6][x] = "P"; }
      this.board = b; this.turn = RED; this.history = []; this.winner = 0;
      this.last = null; this.check = false;
    }

    clone() {
      const g = new Xiangqi(); g.board = this.board.map((r) => r.slice());
      g.turn = this.turn; g.history = this.history.slice(); g.winner = this.winner; g.last = this.last; g.check = this.check;
      return g;
    }

    findKing(b, c) {
      const k = c === RED ? "K" : "k";
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (b[y][x] === k) return [x, y];
      return null;
    }
    generalsFace(b) {
      const rk = this.findKing(b, RED), bk = this.findKing(b, BLACK);
      if (!rk || !bk || rk[0] !== bk[0]) return false;
      for (let y = rk[1] - 1; y > bk[1]; y--) if (b[y][rk[0]]) return false;
      return true;
    }
    inCheck(b, c) {
      const kp = this.findKing(b, c); if (!kp) return true;
      const oc = opp(c);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (colorOf(b[y][x]) === oc) {
          for (const m of this.genPiece(b, x, y)) if (m[0] === kp[0] && m[1] === kp[1]) return true;
        }
      }
      if (this.generalsFace(b)) return true;
      return false;
    }

    genPiece(b, x, y) {
      const p = b[y][x]; if (!p) return [];
      const c = colorOf(p); const t = p.toUpperCase(); const out = [];
      const push = (nx, ny) => { if (inB(nx, ny)) { const q = b[ny][nx]; if (colorOf(q) !== c) out.push([nx, ny]); } };
      const slide = (dx, dy) => {
        let nx = x + dx, ny = y + dy;
        while (inB(nx, ny)) { const q = b[ny][nx]; if (!q) out.push([nx, ny]); else { if (colorOf(q) !== c) out.push([nx, ny]); break; } nx += dx; ny += dy; }
      };
      if (t === "K") {
        const lo = c === RED ? 7 : 0, hi = c === RED ? 9 : 2;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (inB(nx, ny) && nx >= 3 && nx <= 5 && ny >= lo && ny <= hi) push(nx, ny); }
      } else if (t === "A") {
        const lo = c === RED ? 7 : 0, hi = c === RED ? 9 : 2;
        for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) { const nx = x + dx, ny = y + dy; if (nx >= 3 && nx <= 5 && ny >= lo && ny <= hi) push(nx, ny); }
      } else if (t === "E") {
        const river = c === RED ? y >= 5 : y <= 4; if (!river) return out;
        for (const [dx, dy] of [[2,2],[2,-2],[-2,2],[-2,-2]]) {
          const nx = x + dx, ny = y + dy;
          if (!inB(nx, ny)) continue;
          if (c === RED && ny < 5) continue; if (c === BLACK && ny > 4) continue;
          const mx = x + dx / 2, my = y + dy / 2;
          if (!b[my][mx]) push(nx, ny);
        }
      } else if (t === "H") {
        const cand = [[1,2,0,1],[-1,2,0,1],[1,-2,0,-1],[-1,-2,0,-1],[2,1,1,0],[2,-1,1,0],[-2,1,-1,0],[-2,-1,-1,0]];
        for (const [dx, dy, lx, ly] of cand) {
          const legx = x + lx, legy = y + ly;
          if (!inB(legx, legy) || b[legy][legx]) continue;
          push(x + dx, y + dy);
        }
      } else if (t === "R") {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) slide(dx, dy);
      } else if (t === "C") {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          let nx = x + dx, ny = y + dy, jumped = false;
          while (inB(nx, ny)) {
            if (!jumped) { if (!b[ny][nx]) out.push([nx, ny]); else jumped = true; }
            else { if (b[ny][nx]) { if (colorOf(b[ny][nx]) !== c) out.push([nx, ny]); break; } }
            nx += dx; ny += dy;
          }
        }
      } else if (t === "P") {
        const fwd = c === RED ? -1 : 1; // 红向上(行减小)
        push(x, y + fwd);
        const crossed = c === RED ? y <= 4 : y >= 5;
        if (crossed) { push(x + 1, y); push(x - 1, y); }
      }
      return out;
    }

    genAll(b, c) {
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (colorOf(b[y][x]) === c) for (const m of this.genPiece(b, x, y)) out.push([x, y, m[0], m[1]]);
      }
      return out;
    }
    legalMoves(b, c) {
      const out = [];
      for (const [x, y, tx, ty] of this.genAll(b, c)) {
        const cap = b[ty][tx];
        b[ty][tx] = b[y][x]; b[y][x] = null;
        if (!this.inCheck(b, c)) out.push([x, y, tx, ty, cap]);
        b[y][x] = b[ty][tx]; b[ty][tx] = cap;
      }
      return out;
    }

    place(x, y, tx, ty) {
      const b = this.board; const p = b[y][x];
      if (colorOf(p) !== this.turn) return false;
      const legal = this.legalMoves(b, this.turn).some((m) => m[0] === x && m[1] === y && m[2] === tx && m[3] === ty);
      if (!legal) return false;
      const cap = b[ty][tx];
      b[ty][tx] = p; b[y][x] = null;
      this.history.push({ x, y, tx, ty, cap, p });
      this.last = { x, y, tx, ty, p };
      this.turn = opp(this.turn);
      this.check = this.inCheck(this.board, this.turn);
      if (this.legalMoves(this.board, this.turn).length === 0) this.winner = opp(this.turn);
      return true;
    }
    undo() {
      const m = this.history.pop(); if (!m) return;
      this.board[m.y][m.x] = m.p; this.board[m.ty][m.tx] = m.cap;
      this.turn = opp(this.turn); this.winner = 0;
      this.last = this.history.length ? this.history[this.history.length - 1] : null;
      this.check = this.inCheck(this.board, this.turn);
    }

    /* ---- 评估 + α-β ---- */
    evaluate(b, c) {
      let s = 0;
      const center = [0, 1, 2, 3, 4, 3, 2, 1, 0];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = b[y][x]; if (!p) continue;
        const v = VAL[p.toUpperCase()] || 0;
        let bonus = center[x] * 2;
        if (p.toUpperCase() === "P") { const adv = colorOf(p) === RED ? (9 - y) : y; bonus += adv * (adv > 4 ? 8 : 1); }
        const sign = colorOf(p) === c ? 1 : -1;
        s += sign * (v + bonus);
      }
      return s;
    }
    search(b, c, depth, alpha, beta) {
      if (depth === 0) return this.evaluate(b, c);
      const moves = this.legalMoves(b, c);
      if (moves.length === 0) return c === RED ? -100000 : 100000;
      moves.sort((a, z) => (VAL[(b[z[3]][z[2]] || "P").toUpperCase()] || 0) - (VAL[(b[a[3]][a[2]] || "P").toUpperCase()] || 0));
      let best = -1e9;
      for (const [x, y, tx, ty, cap] of moves) {
        const p = b[y][x]; b[ty][tx] = p; b[y][x] = null;
        const val = -this.search(b, opp(c), depth - 1, -beta, -alpha);
        b[y][x] = b[ty][tx]; b[ty][tx] = cap;
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }
    aiMove(difficulty = "medium", me = BLACK) {
      const depth = difficulty === "easy" ? 1 : difficulty === "hard" ? 4 : 3;
      const moves = this.legalMoves(this.board, me);
      if (!moves.length) return null;
      if (difficulty === "easy" && Math.random() < 0.4) return moves[(Math.random() * moves.length) | 0];
      let best = null, bestV = -1e9, alpha = -1e9, beta = 1e9;
      moves.sort((a, z) => (VAL[(this.board[z[3]][z[2]] || "P").toUpperCase()] || 0) - (VAL[(this.board[a[3]][a[2]] || "P").toUpperCase()] || 0));
      for (const [x, y, tx, ty, cap] of moves) {
        const p = this.board[y][x]; this.board[ty][tx] = p; this.board[y][x] = null;
        const val = -this.search(this.board, opp(me), depth - 1, -beta, -alpha);
        this.board[y][x] = this.board[ty][tx]; this.board[ty][tx] = cap;
        if (val > bestV) { bestV = val; best = [x, y, tx, ty]; }
        if (bestV > alpha) alpha = bestV;
      }
      return best;
    }
    hint(color) {
      const m = this.aiMove("hard", color);
      if (!m) return null;
      const cap = this.board[m[3]][m[2]];
      const reason = cap ? `吃掉对方${pieceName(cap)}，赚子。` : (this.wouldCheck(m, color) ? "形成将军，逼迫对方应对。" : "局面评估最优的着法。");
      return { x: m[0], y: m[1], tx: m[2], ty: m[3], why: reason };
    }
    wouldCheck(m, color) {
      const b = this.board, p = b[m[1]][m[0]];
      b[m[3]][m[2]] = p; b[m[1]][m[0]] = null;
      const r = this.inCheck(b, opp(color));
      b[m[1]][m[0]] = b[m[3]][m[2]]; b[m[3]][m[2]] = null;
      return r;
    }
    /* ---- 紧凑局面：象棋 FEN（大模型原生认识，比汉字整盘省一半以上 token） ----
     * 内部 H(马)/E(相) 输出为通用 FEN 的 N/B，黑方小写，y=0 为黑方底线。 */
    fen() {
      const map = { H: "N", h: "n", E: "B", e: "b" };
      let s = "";
      for (let y = 0; y < H; y++) {
        let empty = 0, row = "";
        for (let x = 0; x < W; x++) {
          const p = this.board[y][x];
          if (!p) { empty++; continue; }
          if (empty) { row += empty; empty = 0; }
          row += map[p] || p;
        }
        if (empty) row += empty;
        s += row + (y < H - 1 ? "/" : "");
      }
      return s + " " + (this.turn === RED ? "w" : "b");
    }
    brief() {
      const mv = (m) => m ? `${pieceName(m.p)}(${m.x + 1},${m.y + 1})→(${m.tx + 1},${m.ty + 1})` : "";
      const recent = this.history.slice(-3).map(mv).join(" ");
      return `中国象棋 FEN:${this.fen()} (K帅A仕B相N马R车C炮P兵,大写红,坐标列1-9行1-10自上而下)`
        + ` 轮:${this.turn === RED ? "红" : "黑"}${this.check ? " 被将军!" : ""}`
        + ` 第${this.history.length}手${recent ? " 近手:" + recent : ""}`;
    }
    full() { return this.brief(); }
    contextText() { return this.brief(); }
  }
  function pieceName(p) {
    const m = { K: "帅", k: "将", A: "仕", a: "士", E: "相", e: "象", H: "马", h: "馬", R: "车", r: "車", C: "炮", c: "砲", P: "兵", p: "卒" };
    return m[p] || p;
  }

  global.Xiangqi = Xiangqi;
  global.XIANGQI = { W, H, RED, BLACK, pieceName };
})(typeof window !== "undefined" ? window : globalThis);
