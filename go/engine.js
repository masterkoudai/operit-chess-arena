/* ===== 围棋引擎（提子 / 打劫 / 禁着点 / 数子 / 停手 / 轻量AI） ===== */
(function (global) {
  "use strict";
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  function opp(c) { return c === BLACK ? WHITE : BLACK; }

  class Go {
    constructor(size = 19) { this.size = size; this.reset(); }
    reset() {
      this.board = Array.from({ length: this.size }, () => new Array(this.size).fill(EMPTY));
      this.turn = BLACK; this.ko = null; this.passes = 0; this.history = [];
      this.caps = { 1: 0, 2: 0 }; this.winner = 0; this.over = false; this.last = null;
    }
    inB(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
    nb(x, y) { const r = []; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (this.inB(x + dx, y + dy)) r.push([x + dx, y + dy]); return r; }

    group(x, y) {
      const c = this.board[y][x]; if (c === EMPTY) return null;
      const stones = [], libs = new Set(); const seen = new Set(); const st = [[x, y]];
      while (st.length) {
        const [cx, cy] = st.pop(); const key = cy * this.size + cx;
        if (seen.has(key)) continue; seen.add(key); stones.push([cx, cy]);
        for (const [nx, ny] of this.nb(cx, cy)) {
          const v = this.board[ny][nx];
          if (v === EMPTY) libs.add(ny * this.size + nx);
          else if (v === c) st.push([nx, ny]);
        }
      }
      return { stones, libs };
    }

    play(x, y, color) {
      if (this.over || !this.inB(x, y) || this.board[y][x] !== EMPTY) return false;
      if (this.ko && this.ko[0] === x && this.ko[1] === y) return false;
      const oc = opp(color);
      // 试落
      this.board[y][x] = color;
      let captured = 0; const capturedPts = [];
      for (const [nx, ny] of this.nb(x, y)) {
        if (this.board[ny][nx] === oc) {
          const g = this.group(nx, ny);
          if (g && g.libs.size === 0) { for (const [sx, sy] of g.stones) { this.board[sy][sx] = EMPTY; captured++; capturedPts.push([sx, sy]); } }
        }
      }
      const myG = this.group(x, y);
      if (captured === 0 && myG.libs.size === 0) { this.board[y][x] = EMPTY; return false; } // 自杀
      // 打劫
      if (captured === 1 && myG.stones.length === 1) this.ko = capturedPts[0]; else this.ko = null;
      this.caps[color] += captured; this.passes = 0;
      this.history.push({ x, y, c: color, cap: captured });
      this.last = { x, y, c: color }; this.turn = oc; return true;
    }
    pass(color) {
      if (this.over) return; this.ko = null; this.passes++; this.history.push({ pass: true, c: color });
      this.turn = opp(color);
      if (this.passes >= 2) this.over = true, this.score();
    }
    resign(color) { this.over = true; this.winner = opp(color); }

    score() {
      // 中国规则数子：活子 + 单色围空
      const terr = { 1: 0, 2: 0 }; const seen = new Set();
      for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] !== EMPTY || seen.has(y * this.size + x)) continue;
        const region = []; const border = new Set(); const st = [[x, y]];
        while (st.length) {
          const [cx, cy] = st.pop(); const key = cy * this.size + cx;
          if (seen.has(key)) continue; seen.add(key); region.push([cx, cy]);
          for (const [nx, ny] of this.nb(cx, cy)) {
            const v = this.board[ny][nx];
            if (v === EMPTY) st.push([nx, ny]); else border.add(v);
          }
        }
        if (border.size === 1) terr[[...border][0]] += region.length;
      }
      let b = 0, w = 0;
      for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) { if (this.board[y][x] === BLACK) b++; else if (this.board[y][x] === WHITE) w++; }
      b += terr[1]; w += terr[2] + 7.5; // 贴目
      this.scoreResult = { black: b, white: w, terrB: terr[1], terrW: terr[2] };
      this.winner = b > w ? BLACK : WHITE;
      return this.scoreResult;
    }

    legalMoves(color) {
      const out = [];
      for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] === EMPTY && !(this.ko && this.ko[0] === x && this.ko[1] === y)) {
          const tmp = this.board[y][x]; this.board[y][x] = color;
          let ok = true, cap = 0;
          for (const [nx, ny] of this.nb(x, y)) if (this.board[ny][nx] === opp(color)) { const g = this.group(nx, ny); if (g.libs.size === 0) cap++; }
          const g = this.group(x, y);
          if (cap === 0 && g.libs.size === 0) ok = false;
          this.board[y][x] = tmp;
          if (ok) out.push([x, y, cap]);
        }
      }
      return out;
    }
    aiMove(difficulty = "medium", me = WHITE) {
      const moves = this.legalMoves(me);
      if (!moves.length) return null;
      if (difficulty === "easy" && Math.random() < 0.5) return moves[(Math.random() * moves.length) | 0].slice(0, 2);
      let best = null, bestV = -1e9;
      for (const [x, y, cap] of moves) {
        this.board[y][x] = me;
        const g = this.group(x, y); const myLib = g.libs.size;
        // 避免自填眼（自活<=1 且不提子）
        let v = cap * 12 + myLib * 2 - (myLib <= 1 && cap === 0 ? 8 : 0);
        // 靠近已有子优先
        v += this.nb(x, y).filter(([nx, ny]) => this.board[ny][nx] !== EMPTY).length;
        this.board[y][x] = EMPTY;
        if (v > bestV) { bestV = v; best = [x, y]; }
      }
      return best;
    }
    hint(color) {
      const m = this.aiMove("hard", color);
      if (!m) return null;
      return { x: m[0], y: m[1], why: "按形势/气数评估的较优落点（基础启发式）。开启大模型执子可获得更强讲解。" };
    }
    contextText() {
      let s = `围棋 ${this.size}路，轮到${this.turn === BLACK ? "黑" : "白"}。提子：黑${this.caps[1]} 白${this.caps[2]}。${this.over ? "对局结束" : ""}\n`;
      for (let y = 0; y < this.size; y++) s += this.board[y].map((v) => ".●○"[v]).join("") + "\n";
      return s;
    }
  }
  global.Go = Go; global.GO = { EMPTY, BLACK, WHITE };
})(typeof window !== "undefined" ? window : globalThis);
