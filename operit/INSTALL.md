# 在 Operit 中安装「棋院」

两种方式，**方式一最稳、推荐**。

## 方式一：在 Operit 内置浏览器打开（完整体验）

1. 本仓库开启 **GitHub Pages** 后，会得到首页地址，例如：
   `https://your-name.github.io/operit-chess-arena/`
2. 在 Operit 的**内置浏览器**里打开该地址。
3. 应用会自动检测到 Operit 宿主并接入其 AI：聊天面板里问 AI，它能看到当前棋盘并实时解说；开启「大模型执子」后 AI 会亲自下。

> 不依赖任何额外打包，所有功能（4 种棋 / 教学模式 / AI 对手 / 聊天）都能用。

## 方式二：作为 ToolPkg 导入（注册工具入口）

适合想把它上架到 Operit 统一市场、从工具列表启动的场景。

1. 进入 Operit → 市场/工具箱 → 导入本地包或上传 zip。
2. 选择本仓库 `operit/` 目录（含 `manifest.json` 与 `main.js`）。
3. 导入后会出现工具 `chess_arena_open`（打开棋院）与 `chess_arena_ask`（让 AI 解说当前局面）。
4. 应用内置 `OperitChessArena` 宿主桥，会把棋盘状态交给 Operit 的 AI。

## 让 AI 真正「看棋盘说话」

- 棋类页右侧「聊天」面板：随时发消息，AI 基于当前局面回答。
- 在「设置」填写 OpenAI 兼容的 **Base URL / API Key / Model**（在 Operit 内可复用其已配置模型）。
- 勾选「大模型执子」：LLM 亲自落子并实时解说；未勾选时由内置启发式 AI 对弈，聊天在无网时降级为本地教练提示。

## 目录结构

```
operit-chess-arena/
├── index.html            大厅
├── assets/               共享样式 + 通用逻辑（聊天/LLM桥/教练）
├── gomoku/               五子棋（完整版：禁手/提示/复盘）
├── xiangqi/              中国象棋（完整版：将军将死/α-β）
├── chess/                国际象棋（基础版：易位/吃过路/升变/将死）
├── go/                   围棋（基础版：提子/打劫/数子）
└── operit/               ToolPkg 适配（manifest + 宿主桥）
```
