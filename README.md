# pi-project-manager

> 类似 OpenAI Codex CLI / Raycast 体验的 Pi 终端专属现代项目管理器。  
> 采用两栏式现代化 TUI 面板（开箱即搜即切），在单个 Pi 进程内一键热切换项目，会话与上下文严格隔离跟随，内置独立的 Scratchpad 无项目草稿空间与会话无损迁移能力。

<p align="center">
  <img src="https://raw.githubusercontent.com/jiangkoumo/pi-project-manager/main/assets/preview.png" alt="pi-project-manager preview" width="850" />
</p>

---

## 💡 为什么需要 pi-project-manager？

在使用 Pi 进行多任务开发时，经常遇到以下烦恼：
1. **频繁重启终端**：切换一个仓库就必须 `exit` 退出 Pi，然后再 `cd /path/to/other` 重新启动 `pi`。
2. **上下文污染**：查阅通用资料、写临时脚本或随手闲聊时，如果不切换目录，历史会话就会散落在业务仓库里。
3. **“先聊后想归档”**：在临时或无项目空间跟 AI 探讨出了一个成熟的架构设计方案，却发现没办法把这段宝贵的上下文直接带到具体项目仓库中继续干活。
4. **历史仓库寻找麻烦**：想回到过去开过的某个项目，需要满磁盘找路径。

`pi-project-manager` 彻底解决了上述问题，将现代 TUI 交互体验与 Codex 风格的项目工作流完美带入 Pi 终端！

---

## ✨ 核心特色功能

| 功能 | 说明 |
| :--- | :--- |
| 🖥️ **现代化两栏极简终端面板** | 圆角边框、去拟物 Emoji、极简单色几何符号；左侧项目列表，右侧实时联动详情与最近对话摘录。 |
| 🔍 **即开即搜（Search-First）** | 呼出面板无需任何前缀，直接打字即可秒级模糊过滤项目名称与路径，命中项自动聚焦。 |
| 🌿 **实时 Git 状态嗅探** | 零阻塞异步感知 Git 分支名与脏状态（如 `⎇ main (clean)` 或 `⎇ feat (2 modified)`）。 |
| ⚡️ **极速无层级直达** | 光标选中按 `Enter` 瞬间进入上次对话，击键次数减少 50% 以上；命令行直接输入 `/p <name>` 更是 0 延迟毫秒直达。 |
| 🔄 **终端内免退出热切换** | 基于 Pi 原生 `ctx.switchSession()` 实现进程内工作目录（`cwd`）与上下文热切换，无须退出终端。 |
| 📦 **会话严格隔离跟随项目** | 进入项目自动匹配专属 Session 存储，支持继续上次对话、开启全新独立会话或浏览特定历史记录。 |
| 📝 **专属 Scratchpad 草稿空间** | 默认独立草稿目录（`~/.pi/scratchpad`），临时查资料、写 Demo、随手闲聊不污染任何业务 Git 仓库。 |
| 🚚 **会话无损平滑迁移** | 支持一键将当前整个对话上下文迁移至指定目标项目（`/p move <目标项目>`），无缝衔接业务开发。 |
| 🧭 **历史会话智能项目发现** | 自动深度扫描过去 Pi 会话记录中的工程目录，支持一键将历史仓库批量收录为已登记项目。 |
| 🧹 **空会话自动清理** | 快速浏览或切换项目未发言时，自动探测并安全回收空会话文件，不留任何磁盘垃圾。 |
| ⌨️ **智能 Tab 参数自动补全** | 支持项目名称补全、子命令补全、目标迁移项目补全，命令行交互行云流水。 |

---

## 🖥️ 现代两栏 TUI 面板

在终端中输入 `/p` 或 `/project`，即刻呼出居中浮动两栏面板：

```text
╭─ ◆ PROJECTS ──────────────────────────────────────────────── [1/4] ─╮
│  ❯ my-app                                                            │
├──────────────────────────────┬───────────────────────────────────────┤
│▸ ○ ~ [scratchpad]            │ › frontend-workspace   ACTIVE         │
│  ● frontend-workspace        │ ───────────────────────────────────── │
│    pi-project-manager        │   dir:      ~/Code/frontend-app       │
│    backend-service           │   git:      ⎇  main (2 modified)       │
│  + 登记当前工作区            │   sessions: 8 chats (12m ago)         │
│  + 手动添加路径...           │ ───────────────────────────────────── │
│  * 扫描历史项目...           │   recent:                             │
│                              │     · 刚刚: "重构用户中心表单校验..." │
│                              │     · 昨天: "修复登录态 Token 过期…"  │
│                              │                                       │
│                              │   [↵] continue    [^n] new session    │
├──────────────────────────────┴───────────────────────────────────────┤
│  ↵ open   ^n new   tab history   m move   d delete   esc quit        │
╰──────────────────────────────────────────────────────────────────────╯
```

### 快捷键一览
* **直接打字**：秒级模糊过滤项目名称和路径。
* **`↵ Enter`**：立即进入选中的项目（继续上次对话；或执行选中操作）。
* **`^N` / `n`**：在该项目开启全新独立会话。
* **`Tab`**：展开并挑选该项目的所有历史对话记录。
* **`m`**：将当前会话迁移到选中的目标项目。
* **`d` / `Delete`**：从项目管理器中移除已登记项目（仅取消登记，不删除本地文件）。
* **`Esc`**：清空搜索框或退出面板。

---

## ⌨️ 命令行快捷直达

如果你喜欢在命令行直接敲参数，所有操作依然 0 延迟直达：

| 命令 | 说明 | 补全支持 |
| :--- | :--- | :---: |
| `/p` 或 `/project` | 唤出两栏式交互管理面板 | - |
| `/p <项目名>` | 极速切换至指定项目（如 `/p pi-project-manager`） | ✅ Tab 补全项目名 |
| `/p scratch` | 极速切换至独立的“无项目”草稿空间 | ✅ Tab 补全 |
| `/p move [目标项目]` | 将当前会话及其完整历史迁移到目标项目并切换过去 | ✅ Tab 补全项目名 |
| `/p help` | 在终端中显示命令快捷帮助信息 | ✅ Tab 补全 |

---

## 📦 安装方式

### 方式 1：通过 Pi 包管理器安装（推荐）
在终端中运行：
```bash
pi install npm:pi-project-manager
```
或简写为：
```bash
pi install pi-project-manager
```

### 方式 2：通过 Git 仓库直接安装
```bash
pi install git:github.com/jiangkoumo/pi-project-manager
```

### 方式 3：作为本地开发 Package 安装（实时热更）
```bash
pi install /path/to/pi-project-manager
```

---

## ⚙️ 配置文件

项目配置持久化保存于：
```text
~/.pi/agent/projects.json
```

结构示例：
```json
{
  "noProjectDir": "~/.pi/scratchpad",
  "projects": [
    {
      "name": "pi-project-manager",
      "path": "/Users/jiangkoumo/Documents/ChatGPT/pi-project-manager"
    }
  ]
}
```

---

## 🌐 English Overview

`pi-project-manager` brings a Raycast/Telescope-style modern workspace manager into [Pi coding agent](https://github.com/earendil-works/pi-mono).

- **Modern Two-Pane TUI**: Floating centered overlay with instant fuzzy filter, live Git branch/dirty status, and recent dialog snippet previews.
- **In-terminal Hot-switching**: Switch workspace directory (`cwd`) and conversation context on the fly without restarting or exiting `pi`.
- **Project-scoped Session Isolation**: Conversations and context history are cleanly segregated under each project's directory.
- **Dedicated Scratchpad**: A private scratchpad folder (default `~/.pi/scratchpad`) for quick experiments, lookups, and chats without dirtying git working trees.
- **Seamless Session Migration (`/p move <target>`)**: Started brainstorming in scratchpad and realized you need it in a real project? Migrate the ongoing session and context history into your target project instantly!
- **Zero-Latency CLI Shortcuts**: `/p <name>`, `/p scratch`, `/p move` execute instantly without spinning up any UI overhead.

---

## 📄 开源协议

[MIT License](LICENSE) © 2026 jiangkoumo
