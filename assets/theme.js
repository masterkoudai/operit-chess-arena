/* ===== Operit 棋院 · 主题引擎 =====
 * 5 套低饱和护眼配色，均含紫调（默认「烟雨江南」）。
 * 调色板本体在 style.css 的 html[data-theme] 里，本文件只负责切换 / 持久化 / 读取。
 * 需在 <head> 中尽早引入，避免首屏闪色。
 */
(function (g) {
  "use strict";
  const A = (g.ChessArena = g.ChessArena || {});
  const LS = "operit_chess_theme";

  A.THEMES = [
    { id: "jiangnan", name: "烟雨江南", desc: "宣纸底 · 藕荷紫 · 竹青，默认", sw: ["#f2eee5", "#8a7aa8", "#6f8b93", "#e8d9b6"] },
    { id: "yelan",    name: "夜阑",     desc: "深色墨紫 · 月白，夜里护眼",   sw: ["#191721", "#a494c6", "#7d95a4", "#c4ab88"] },
    { id: "pixel",    name: "像素紫水晶", desc: "8bit 点阵 · 硬边框 · 低饱和紫", sw: ["#221f2b", "#9d8ec4", "#74a09a", "#c0a882"] },
    { id: "medieval", name: "中古手抄", desc: "羊皮纸 · 教堂彩窗紫 · 赭红",   sw: ["#e8dfc9", "#7c6a9c", "#9a6a5c", "#ded0ad"] },
    { id: "qingci",   name: "青瓷",     desc: "影青 · 淡紫，最柔和",         sw: ["#eceff0", "#8b7fa6", "#6f9a97", "#dfd8c2"] },
  ];
  const DEFAULT = "jiangnan";

  A.currentTheme = function () {
    let id = null;
    try { id = localStorage.getItem(LS); } catch (e) { /* 隐私模式 */ }
    return A.THEMES.some((t) => t.id === id) ? id : DEFAULT;
  };

  A.applyTheme = function (id, persist) {
    if (!A.THEMES.some((t) => t.id === id)) id = DEFAULT;
    document.documentElement.setAttribute("data-theme", id);
    if (persist !== false) { try { localStorage.setItem(LS, id); } catch (e) {} }
    try { g.dispatchEvent(new CustomEvent("arena:theme", { detail: id })); } catch (e) {}
    return id;
  };

  /* 读取 CSS 变量（棋盘绘制取色统一走这里，保证换肤即刻生效） */
  A.cssVar = function (name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback || "";
  };

  /* 棋盘调色板 */
  A.palette = function () {
    return {
      board: A.cssVar("--board", "#e8d9b6"),
      line: A.cssVar("--board-line", "rgba(74,64,50,.55)"),
      sqLight: A.cssVar("--sq-light", "#ece2cd"),
      sqDark: A.cssVar("--sq-dark", "#96a58d"),
      stoneB: A.cssVar("--stone-b", "#33302c"),
      stoneW: A.cssVar("--stone-w", "#f8f5ec"),
      face: A.cssVar("--piece-face", "#f6efdc"),
      red: A.cssVar("--piece-red", "#a75a52"),
      accent: A.cssVar("--accent", "#8a7aa8"),
      accent2: A.cssVar("--accent-2", "#6f8b93"),
      danger: A.cssVar("--danger", "#b0605c"),
      win: A.cssVar("--win", "#5d8b62"),
      warn: A.cssVar("--warn", "#b98a4b"),
      txt: A.cssVar("--txt", "#3b3a35"),
      muted: A.cssVar("--muted", "#8b8375"),
      panel: A.cssVar("--panel", "#faf7f0"),
      pixel: A.currentTheme() === "pixel",
    };
  };

  /* ---------- HiDPI 画布：逻辑坐标绘制，物理像素清晰 ----------
   * 显示尺寸用「width:100% + max-width:逻辑宽 + height:auto」，
   * 这样窄屏时棋盘按容器等比缩放到不溢出，命中检测仍准（canvasXY 走 getBoundingClientRect）。 */
  A.setupCanvas = function (canvas, lw, lh) {
    const dpr = Math.min(3, g.devicePixelRatio || 1);
    canvas.width = Math.round(lw * dpr);
    canvas.height = Math.round(lh * dpr);
    canvas.style.width = "100%";
    canvas.style.maxWidth = lw + "px";
    canvas.style.height = "auto";
    canvas.__lw = lw; canvas.__lh = lh;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };
  /* 事件坐标 → 逻辑坐标 */
  A.canvasXY = function (canvas, ev) {
    const r = canvas.getBoundingClientRect();
    const t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    return [(t.clientX - r.left) * (canvas.__lw || canvas.width) / r.width,
            (t.clientY - r.top) * (canvas.__lh || canvas.height) / r.height];
  };
  /* 圆角矩形（旧 WebView 无 roundRect） */
  A.rr = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  /* ---------- 主题选择器 ---------- */
  A.renderThemePicker = function (mount) {
    const cur = A.currentTheme();
    mount.innerHTML =
      '<div class="theme-grid">' +
      A.THEMES.map((t) =>
        '<div class="theme-card' + (t.id === cur ? " active" : "") + '" data-id="' + t.id + '">' +
          '<div class="nm">' + t.name + "</div>" +
          '<div class="ds">' + t.desc + "</div>" +
          '<div class="swatches">' + t.sw.map((c) => '<i style="background:' + c + '"></i>').join("") + "</div>" +
        "</div>"
      ).join("") + "</div>" +
      '<p class="note">全部为低饱和护眼配色，主色均为紫系（与你的 UI 一致）。切换即时生效，会记住选择。</p>';
    mount.querySelectorAll(".theme-card").forEach((c) => {
      c.addEventListener("click", () => {
        A.applyTheme(c.dataset.id);
        mount.querySelectorAll(".theme-card").forEach((x) => x.classList.toggle("active", x === c));
        if (A.toast) A.toast("已切换主题：" + (A.THEMES.find((t) => t.id === c.dataset.id) || {}).name);
      });
    });
  };

  /* 顶栏快捷换肤按钮 */
  A.bindThemeCycle = function (btn) {
    if (!btn) return;
    const label = () => {
      const t = A.THEMES.find((x) => x.id === A.currentTheme());
      btn.textContent = "☾ " + (t ? t.name : "主题");
    };
    btn.addEventListener("click", () => {
      const ids = A.THEMES.map((t) => t.id);
      const next = ids[(ids.indexOf(A.currentTheme()) + 1) % ids.length];
      A.applyTheme(next); label();
    });
    g.addEventListener("arena:theme", label);
    label();
  };

  // 首屏立即应用（不写回存储，避免覆盖）
  A.applyTheme(A.currentTheme(), false);
})(typeof window !== "undefined" ? window : globalThis);
