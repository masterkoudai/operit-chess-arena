/* ===== 五子棋引擎（规则 / 禁手 / 评分AI / 提示 / 威胁） ===== */
(function (global) {
  "use strict";
  const SIZE = 15;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const EMPTY = 0, BLACK = 1, WHITE = 2;

  function inB(x, y) { return x >= 0 && y >= 0 && x < SIZE && y < SIZE; }

  class Gomoku {
    constructor() { this.reset(); }
    reset() {
      this.board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(EMPTY));
      this.turn = BLACK;
      this.history = [];
      this.winner = 0;
      this.winLine = null;
      this.last = null;
    }
    place(x, y, color) {
      if (!inB(x, y) || this.board[y][x] !== EMPTY) return false;
      this.board[y][x] = color;
      this.history.push({ x, y, c: color });
      this.last = { x, y, c: color };
      if (this.checkWin(x, y, color)) { this.winner = color; }
      this.turn = color === BLACK ? WHITE : BLACK;
      return true;
    }
    checkWin(x, y, color) {
      for (const [dx, dy] of DIRS) {
        let cnt = 1;
        const line = [[x, y]];
        for (const s of [1, -1]) {
          let nx = x + dx * s, ny = y + dy * s;
          while (inB(nx, ny) && this.board[ny][nx] === color) {
            cnt++; line.push([nx, ny]); nx += dx * s; ny += dy * s;
          }
        }
        if (cnt >= 5) { this.winLine = line; return true; }
      }
      return false;
    }

    /* ---- 禁手（仅黑棋，长连/双四/双活三；近似标准 renju） ---- */
    isForbidden(x, y) {
      if (this.board[y][x] !== EMPTY) return null;
      if (this.turn !== BLACK) return null;
      this.board[y][x] = BLACK;
      let reason = null;
      // 长连
      if (this._maxRun(x, y, BLACK) >= 6) reason = "长连禁手（六子及以上）";
      if (!reason) {
        const fours = this._fourThreats(x, y, BLACK);
        if (fours >= 2) reason = "双四禁手";
      }
      if (!reason) {
        const threes = this._openThreeThreats(x, y, BLACK);
        if (threes >= 2) reason = "双活三禁手";
      }
      // 成五不算禁手
      if (this.checkWin(x, y, BLACK)) reason = null;
      this.board[y][x] = EMPTY;
      return reason;
    }
    _maxRun(x, y, c) {
      let m = 1;
      for (const [dx, dy] of DIRS) {
        let cnt = 1;
        for (const s of [1, -1]) {
          let nx = x + dx * s, ny = y + dy * s;
          while (inB(nx, ny) && this.board[ny][nx] === c) { cnt++; nx += dx * s; ny += dy * s; }
        }
        m = Math.max(m, cnt);
      }
      return m;
    }
    // 数「能形成五连的空点」数量（即四的威胁数）
    _fourThreats(x, y, c) {
      let n = 0;
      for (const [dx, dy] of DIRS) {
        for (let k = -4; k <= 4; k++) {
          const px = x + dx * k, py = y + dy * k;
          if (!inB(px, py) || this.board[py][px] !== EMPTY) continue;
          this.board[py][px] = c;
          const win = this._maxRun(px, py, c) >= 5;
          this.board[py][px] = EMPTY;
          if (win) { n++; break; } // 该方向记一次
        }
      }
      return n;
    }
    // 数「能形成活四的空点」数量（即活三的威胁数）
    _openThreeThreats(x, y, c) {
      let n = 0;
      for (const [dx, dy] of DIRS) {
        for (let k = -4; k <= 4; k++) {
          const px = x + dx * k, py = y + dy * k;
          if (!inB(px, py) || this.board[py][px] !== EMPTY) continue;
          this.board[py][px] = c;
          const openFour = this._isOpenFour(px, py, c);
          this.board[py][px] = EMPTY;
          if (openFour) { n++; break; }
        }
      }
      return n;
    }
    _isOpenFour(x, y, c) {
      for (const [dx, dy] of DIRS) {
        let cnt = 1, open = 0;
        for (const s of [1, -1]) {
          let nx = x + dx * s, ny = y + dy * s, seen = 0;
          while (inB(nx, ny) && this.board[ny][nx] === c) { cnt++; nx += dx * s; ny += dy * s; }
          if (inB(nx, ny) && this.board[ny][nx] === EMPTY) open++;
        }
        if (cnt === 4 && open === 2) return true;
      }
      return false;
    }

    /* ---- 评分 AI ---- */
    // 落子 (x,y) 后某色在该点的综合评分
    pointScore(x, y, color) {
      let total = 0;
      for (const [dx, dy] of DIRS) {
        let cnt = 1, open = 0;
        for (const s of [1, -1]) {
          let nx = x + dx * s, ny = y + dy * s;
          while (inB(nx, ny) && this.board[ny][nx] === color) { cnt++; nx += dx * s; ny += dy * s; }
          if (inB(nx, ny) && this.board[ny][nx] === EMPTY) open++;
        }
        total += this._pat(cnt, open);
      }
      return total;
    }
    _pat(cnt, open) {
      if (cnt >= 5) return 1000000;
      if (cnt === 4) return open === 2 ? 100000 : open === 1 ? 12000 : 0;
      if (cnt === 3) return open === 2 ? 5000 : open === 1 ? 600 : 0;
      if (cnt === 2) return open === 2 ? 400 : open === 1 ? 60 : 0;
      if (cnt === 1) return open >= 1 ? 20 : 0;
      return 0;
    }
    candidates(radius = 2) {
      const set = new Set();
      for (const mv of this.history) {
        const x = mv.x, y = mv.y;
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (inB(nx, ny) && this.board[ny][nx] === EMPTY) set.add(ny * SIZE + nx);
          }
      }
      if (set.size === 0) set.add(7 * SIZE + 7);
      return [...set].map((v) => [v % SIZE, (v / SIZE) | 0]);
    }
    aiMove(difficulty = "medium", me = WHITE) {
      const opp = me === BLACK ? WHITE : BLACK;
      const cands = this.candidates(2);
      let scored = cands.map(([x, y]) => {
        const atk = this.pointScore(x, y, me);
        const def = this.pointScore(x, y, opp);
        return { x, y, v: atk + def * 0.92 };
      });
      scored.sort((a, b) => b.v - a.v);
      if (difficulty === "easy") {
        const top = scored.slice(0, Math.min(6, scored.length));
        return top[(Math.random() * top.length) | 0];
      }
      if (difficulty === "hard" || difficulty === "master") {
        // 2-ply：模拟我落子后对手最好回应
        const top = scored.slice(0, Math.min(10, scored.length));
        let best = top[0], bestV = -1;
        for (const m of top) {
          this.board[m.y][m.x] = me;
          let oppBest = 0;
          for (const [x, y] of this.candidates(2)) {
            const o = this.pointScore(x, y, opp);
            if (o > oppBest) oppBest = o;
          }
          this.board[m.y][m.x] = EMPTY;
          const v = m.v - oppBest * 0.9;
          if (v > bestV) { bestV = v; best = m; }
        }
        return best;
      }
      return scored[0];
    }
    // 提示：返回最佳点 + 简短理由
    hint(color) {
      const m = this.aiMove("hard", color);
      const atk = this.pointScore(m.x, m.y, color);
      let why = atk >= 100000 ? "这里能直接连成五子，制胜手！"
        : atk >= 12000 ? "形成冲四，逼对手必须应对。"
        : atk >= 5000 ? "做出活三，下一步可冲四，进攻好点。"
        : atk >= 400 ? "活二起步，扩展潜力大。"
        : "综合攻防较优的点，先占要点。";
      return { x: m.x, y: m.y, why };
    }
    // 威胁预警：对手下一步能否制胜
    threatFor(opp) {
      for (const [x, y] of this.candidates(2)) {
        this.board[y][x] = opp;
        const win = this._maxRun(x, y, opp) >= 5;
        this.board[y][x] = EMPTY;
        if (win) return { x, y };
      }
      return null;
    }
    /* ---- 紧凑局面（省 token）：手数 + 轮次 + 最近 6 手 + 威胁摘要 ----
     * 不发整盘 225 格，只发着法序列——同等信息量下 token 约为 dump 的 1/4。 */
    brief() {
      const cd = (p) => String.fromCharCode(97 + p.x) + (SIZE - p.y);
      const recent = this.history.slice(-6).map((p) => (p.c === BLACK ? "黑" : "白") + cd(p)).join(" ");
      const opp = this.turn === BLACK ? WHITE : BLACK;
      let mine = 0, his = 0;
      for (const [x, y] of this.candidates(1)) {
        if (this.pointScore(x, y, this.turn) >= 5000) mine++;
        if (this.pointScore(x, y, opp) >= 5000) his++;
      }
      const th = (mine || his) ? ` 强点:我${mine}/对${his}` : "";
      return `五子棋15路 第${this.history.length}手 轮:${this.turn === BLACK ? "黑" : "白"} 近手:${recent || "空盘"}${th}`;
    }
    /* 完整盘面：只在「大模型执子」时使用 */
    full() {
      const rows = this.board.map((r) => r.map((v) => ".XO"[v]).join("")).join("/");
      return this.brief() + "\n盘面(X黑 O白 .空, 上→下共15行, 行内左→右):\n" + rows;
    }
    contextText() { return this.brief(); }
  }

  global.Gomoku = Gomoku;
  global.GOMOKU = { SIZE, EMPTY, BLACK, WHITE };
})(typeof window !== "undefined" ? window : globalThis);
