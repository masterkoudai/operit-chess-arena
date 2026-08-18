/* ===== Operit 棋院 · ToolPkg 宿主桥 =====
 * 作用：
 *  1) 当被 Operit 作为 ToolPkg 加载时，注册工具入口 chess_arena_open / chess_arena_ask；
 *  2) 当棋类 Web 应用在 Operit 内置浏览器中运行时，把「棋盘状态 → Operit AI」打通：
 *     应用通过 window.ChessArena.Operit.chat(...) 调用本桥，本桥优先使用 Operit 宿主 API，
 *     否则回落到应用自身的 OpenAI 兼容 HTTP 调用。
 * 兼容说明：宿主 API 字段按 Operit 文档的 toolCall / complete 探测，缺失时静默回落，保证不报错。
 */
(function (global) {
  "use strict";
  const host = global.host || global.operitHost || null;

  function detectHost() {
    if (host && typeof host.toolCall === "function") return "toolCall";
    if (host && typeof host.complete === "function") return "complete";
    if (global.ChessArena && global.ChessArena.Operit && global.ChessArena.Operit.available()) return "bridge";
    return null;
  }

  // 暴露给 Operit 宿主的注册入口（若宿主支持）
  const API = {
    meta: { id: "operit.chess.arena", name: "Operit 棋院", version: "1.0.0" },
    open() {
      const url = (typeof location !== "undefined" && location.href) || "index.html";
      if (host && typeof host.openBrowser === "function") return host.openBrowser(url);
      if (typeof global.open === "function") { global.open(url, "_blank"); return true; }
      return url;
    },
    // 把局面 + 问题交给 Operit AI
    async ask(question, board) {
      const messages = [
        { role: "system", content: "你是棋类 AI 教练，能看到当前棋盘并口语化简短回答。" },
        { role: "user", content: (board ? "【局面】\n" + board + "\n\n" : "") + question },
      ];
      if (host && typeof host.toolCall === "function") {
        const r = await host.toolCall("llm_chat", { messages });
        if (r && r.content) return r.content;
      }
      if (host && typeof host.complete === "function") {
        const r = await host.complete(messages);
        if (r) return typeof r === "string" ? r : (r.content || "");
      }
      // 回落：应用自身 LLM 桥
      if (global.ChessArena && global.ChessArena.Operit) return global.ChessArena.Operit.chat(messages, {});
      throw new Error("Operit 宿主 AI 不可用，且未配置应用内 AI");
    },
  };

  // 挂载到全局，供 Operit 宿主或应用读取
  global.OperitChessArena = API;
  if (global.ChessArena) global.ChessArena.operitHost = API;

  if (typeof complete === "function") {
    complete({ success: true, data: { mode: detectHost() || "web-only", meta: API.meta } });
  }
  if (typeof exports !== "undefined") exports.OperitChessArena = API;
})(typeof window !== "undefined" ? window : globalThis);
