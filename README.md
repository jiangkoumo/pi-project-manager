# pi-project-manager

> 类似 OpenAI Codex CLI 体验的 Pi 终端专属项目管理器。  
> 在单个 Pi 进程内一键热切换项目，会话与上下文严格隔离跟随，内置独立的 Scratchpad 无项目草稿空间与会话无损迁移能力。

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

`pi-project-manager` 彻底解决了上述问题，将 Codex 风格的项目工作流完美带入 Pi 终端！

---

## ✨ 核心特色功能

| 功能 | 说明 |
| :--- | :--- |
| ⚡️ **终端内免退出热切换** | 基于 Pi 原生 `ctx.switchSession()` 实现进程内工作目录（`cwd`）与上下文热切换，无须退出终端。 |
| 📁 **会话严格隔离跟随项目** | 进入项目自动匹配专属 Session 存储，支持「继续上次对话」、「开启全新对话」或「浏览特定历史会话」。 |
| 💬 **专属 Scratchpad 草稿空间** | 默认独立草稿目录（`~/.pi/scratchpad`），临时查资料、写 Demo、随手闲聊不污染任何业务 Git 仓库。 |
| 🚚 **会话无损平滑迁移** | 支持一键将当前整个对话上下文迁移至指定目标项目（`/p move <目标项目>`），无缝衔接业务开发。 |
| 🔍 **历史会话智能项目发现** | 自动深度扫描过去 Pi 会话记录中的工程目录，支持一键将历史仓库批量收录为已登记项目。 |
| 🧹 **空会话自动清理** | 快速浏览或切换项目未发言时，自动探测并安全回收空会话文件，不留任何磁盘垃圾。 |
| 🎯 **智能 Tab 参数自动补全** | 支持项目名称补全、子命令补全、目标迁移项目补全，命令行交互行云流水。 |

---

## ⌨️ 触发命令与快捷操作

| 命令 | 说明 | 补全支持 |
| :--- | :--- | :---: |
| `/p` 或 `/project` | 唤出交互式项目管理主菜单 | - |
| `/p <项目名>` | 极速切换至指定项目（如 `/p pi-tool-discipline`） | ✅ Tab 补全项目名 |
| `/p scratch` | 极速切换至独立的“无项目”草稿空间 | ✅ Tab 补全 |
| `/p move [目标项目]` | 将当前会话及其完整历史迁移到目标项目并切换过去 | ✅ Tab 补全项目名 |
| `/p help` | 在终端中显示命令快捷帮助信息 | ✅ Tab 补全 |

---

## 🖥️ 交互菜单指南

在终端中输入 `/p`，即弹出全键盘交互菜单（支持 `↑` / `↓` 移动，`Enter` 确认，`Esc` 取消）：

```text
? [项目管理] 当前位置: ~/Documents/ChatGPT/pi-project-manager
  💬 [无项目对话] (~/.pi/scratchpad)
  📁 pi-tool-discipline (~/Documents/ChatGPT/pi-tool-discipline)
  📁 pi-project-manager (~/Documents/ChatGPT/pi-project-manager) ⬅️当前
  📁 ToolFence (~/Documents/ChatGPT/ToolFence)
  📁 pi-agent-desktop (~/Documents/ChatGPT/pi-agent-desktop)
  📁 AgentTape (~/Documents/ChatGPT/AgentTape)
──────────────────────────────────────
  🚚 将当前会话迁移到其他项目...
  ➕ 将当前目录添加为项目 (pi-project-manager)
  📥 手动输入目录添加为项目...
  🔍 从历史会话中发现并导入项目...
  ⚙️ 设置默认“无项目”工作目录...
  🗑️ 移除已登记的项目...
  ❌ 退出菜单
```

### 1. 会话选择（二级菜单）
选中任一项目或无项目模式后，可灵活选择接下来的会话流转：
- `▶️ 继续上次对话 (10分钟前: "帮我实现...")`：无缝恢复该项目上一次退出的会话。
- `✨ 在该项目中开启全新对话`：在新会话中开始该工程的任务。
- `📚 选择历史会话 (共 N 个)...`：浏览挑选过去的特定对话切入。

### 2. 会话迁移（/p move 或 菜单选择）
- 当你在 `[无项目对话]` 或其他项目中构思好了方案，直接执行 `/p move my-target-project`，插件会自动将当前整个会话文件安全移动到目标项目的会话目录，并自动将工作区（`cwd`）切入该项目，所有上下文无缝保留！

---

## 📦 安装方式

### 方式 1：通过 Pi 包管理器安装（推荐）
在终端中运行：
```bash
pi install npm:pi-project-manager
```
或在已发布至 npm 后简写为：
```bash
pi install pi-project-manager
```

### 方式 2：通过 Git 仓库直接安装
```bash
pi install git:github.com/jiangkoumo/pi-project-manager
```

### 方式 3：作为本地 Package 安装
```bash
pi install /path/to/pi-project-manager
```

### 方式 4：单脚本直接生效
将 `extensions/index.ts` 复制到全局扩展目录即可：
```bash
cp extensions/index.ts ~/.pi/agent/extensions/project-manager.ts
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
      "name": "pi-tool-discipline",
      "path": "/Users/jiangkoumo/Documents/ChatGPT/pi-tool-discipline"
    },
    {
      "name": "pi-project-manager",
      "path": "/Users/jiangkoumo/Documents/ChatGPT/pi-project-manager"
    }
  ]
}
```

---

## 🌐 English Overview

`pi-project-manager` brings an OpenAI Codex CLI style workspace and project manager experience into [Pi coding agent](https://github.com/earendil-works/pi-mono).

- **In-terminal hot-switching**: Switch workspace directory (`cwd`) and conversation context on the fly without restarting or exiting `pi`.
- **Project-scoped session isolation**: Conversations and context history are cleanly segregated under each project's directory.
- **Dedicated Scratchpad**: A private scratchpad folder (default `~/.pi/scratchpad`) for quick experiments, lookups, and chats without dirtying git working trees.
- **Seamless session migration (`/p move <target>`)**: Started brainstorming in scratchpad and realized you need it in a real project? Migrate the ongoing session and context history into your target project instantly!
- **Auto history discovery**: Automatically scan previous Pi session directories and bookmark your repositories in one click.
- **Auto prune empty sessions**: Automatically cleans up transient empty session files created when browsing projects.

---

## 📄 开源协议

[MIT License](LICENSE) © 2026 jiangkoumo
