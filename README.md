# Operit 棋院 · Chess Arena for Operit

在 **Operit** 内与你的 AI 实时对弈的棋类插件：五子棋 · 中国象棋 · 国际象棋 · 围棋。
拥有独立页面、教学模式、AI 对手，以及**能「看棋盘说话」的实时聊天解说**。

> 适配 Operit：应用内置 Operit 宿主桥，在 Operit 内置浏览器打开即接入其 AI；
> 也可作为 ToolPkg 导入（见 `operit/`）。AI 对手与聊天走 OpenAI 兼容接口，Operit 内可复用已配置模型。

## 功能

| 棋种 | 状态 | 亮点 |
|------|------|------|
| 五子棋 | 完整版 | 15×15、禁手（长连/双四/双活三，实时红标）、分级提示、威胁预警、复盘 |
| 中国象棋 | 完整版 | 9×10、将军/将死/困毙、α-β AI、着法提示 |
| 国际象棋 | 基础可玩版 | 8×8、易位 / 吃过路 / 升变 / 将死 / 逼和 |
| 围棋 | 基础可玩版 | 19/13/9 路、提子 / 打劫 / 数子（中国规则+贴目7.5）/ 停手 |

**通用能力**
- 人机 / 双人对战；难度分级（简单/中等/困难）。
- 教学模式：提示（高亮建议落点 + 原因）、威胁预警、悔棋、着法列表、局面评估条、规则讲解。
- 右侧聊天面板：随时发消息，AI 基于当前局面解说；开启「大模型执子」AI 亲自下并解说。
- 无网降级：未配置 AI 时由内置启发式 AI 对弈，聊天给本地教练提示。

## 快速试玩

1. 直接用浏览器打开 `index.html`（或部署到任意静态托管 / 开启 GitHub Pages）。
2. 进入某棋种 → 选择「人机对战」→ 落子。
3. 点「提示」看建议；右侧「聊天」问 AI；「设置」填 AI 接口后可开「大模型执子」。

## 在 Operit 中使用

见 [`operit/INSTALL.md`](operit/INSTALL.md)：
- **方式一（推荐）**：在 Operit 内置浏览器打开本仓库首页，自动接入 Operit AI。
- **方式二**：把 `operit/` 作为 ToolPkg 导入，注册工具入口。

## 让 AI「看棋盘说话」

聊天/「大模型执子」调用 OpenAI 兼容 `/chat/completions`。在 Operit 内复用其已配置模型；
在 Operit 外于「设置」填写 `Base URL / API Key / Model`。未配置时自动降级为本地启发式。

## 目录

```
operit-chess-arena/
├── index.html            大厅
├── assets/               共享样式 + 通用逻辑（聊天/LLM桥/教练/设置）
├── gomoku/               五子棋（engine.js + ui.js + index.html）
├── xiangqi/              中国象棋
├── chess/                国际象棋
├── go/                   围棋
└── operit/               ToolPkg 适配（manifest.json + main.js + INSTALL）
```

## 参考与致谢

- Operit 插件规范：`operit.app/#/guide/plugin`、仓库 `AAswordman/Operit`（ToolPkg / Skill / MCP）。
- 「LLM 当对手」范式参考社区五子棋项目（`BigBossWHD/gobang` 的 `llm.js` 结构化落子）。
- 教学模式参考主流棋类 App（提示 / 威胁 / 复盘 / 禁手红标）。

## License

MIT © your-name
