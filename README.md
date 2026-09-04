# pi-project-manager

> 类似 OpenAI Codex CLI 体验的 Pi 终端专属项目管理器。
> 在单个 Pi 会话内一键快速切换项目，对话内容严格隔离跟随项目，支持独立的“无项目对话”（Scratchpad）模式。

---

## ✨ 核心特性

- **终端内免退出切换**：利用 Pi 原生 `ctx.switchSession()` 在当前终端进程中热切换工作目录（`cwd`）与上下文，再也不需要频繁 `exit` → `cd` → `pi`。
- **对话内容跟着项目走**：进入项目自动匹配该项目专属的 Session 存储，支持「继续上次对话」、「开启全新对话」或「浏览全部历史会话」。
- **专属「无项目对话」模式**：默认配置独立的 Scratchpad 目录（如 `~/.pi/scratchpad`），临时查资料、写 Demo、闲聊不污染任何业务 Git 仓库。
- **持久化项目注册表**：通过 `~/.pi/agent/projects.json` 持久化保存项目列表，不再依赖临时缓存。
- **一键历史项目发现**：自动扫描既往 Pi 会话所涉及的工程目录，支持一键将历史仓库批量勾选登记为项目。
- **自动清理空会话**：在不同项目间反复切换未发言时，自动回收空会话文件，不制造磁盘垃圾。
- **极速命令行直达**：支持 `/p <项目名>` 或 `/p scratch` 直达，支持 Tab 键自动补全。

---

## 📦 安装方式

### 方式 1：作为本地 Package 安装到全局（推荐）
在终端中运行：
```bash
pi install /Users/jiangkoumo/Documents/ChatGPT/pi-project-manager
```
或直接通过项目相对路径安装：
```bash
pi install ./pi-project-manager
```

### 方式 2：作为全局纯脚本生效
直接将 `extensions/index.ts` 复制到全局扩展目录：
```bash
cp extensions/index.ts ~/.pi/agent/extensions/project-manager.ts
```

---

## 🚀 使用指南

### 1. 呼出管理菜单
在 Pi 终端内输入：
```text
/project
```
或极简别名：
```text
/p
```

终端将弹出交互选择菜单：
```text
? [项目管理] 当前位置: ~/Documents/ChatGPT/pi-project-manager
  💬 [无项目对话] (~/.pi/scratchpad)
  📁 pi-tool-discipline (~/Documents/ChatGPT/pi-tool-discipline)
  📁 pi-project-manager (~/Documents/ChatGPT/pi-project-manager) ⬅️当前
──────────────────────────────────────
  ➕ 将当前目录添加为项目 (pi-project-manager)
  📂 手动输入目录添加为项目...
  🔍 从历史会话中发现并导入项目...
  ⚙️ 设置默认“无项目”工作目录...
  🗑️ 移除已登记的项目...
  ❌ 退出菜单
```

### 2. 会话选择（二级菜单）
选中任意已登记项目或无项目模式后：
- `▶️ 继续上次对话 (10分钟前: "帮我实现...")`：继续上一个会话。
- `🆕 在该项目中开启全新对话`：在当前工程开新会话。
- `📜 选择历史会话 (共 N 个)...`：浏览挑选过去的特定对话进入。

### 3. 快速跳跃与参数补全
- `/p scratch`：直接秒切到“无项目”空间。
- `/p <项目名>`：直接切到指定项目（支持输入 `/p ` 后按 Tab 键自动补全项目名）。

---

## ⚙️ 配置文件

项目配置保存在：
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

## 📄 开源协议

MIT License © 2026 jiangkoumo
