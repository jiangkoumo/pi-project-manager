import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ProjectItem {
	name: string;
	path: string;
}

export interface ProjectsConfig {
	noProjectDir: string;
	projects: ProjectItem[];
}

const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "projects.json");

function expandHome(filepath: string): string {
	if (!filepath) return filepath;
	const home = os.homedir();
	if (filepath === "~") return home;
	if (filepath.startsWith("~/") || filepath.startsWith("~\\")) {
		return path.join(home, filepath.slice(2));
	}
	return filepath;
}

function displayPath(filepath: string): string {
	if (!filepath) return "";
	const home = os.homedir();
	const resolved = path.resolve(expandHome(filepath));
	if (resolved === home) return "~";
	if (resolved.startsWith(home + path.sep)) {
		return `~${path.sep}${path.relative(home, resolved)}`;
	}
	return resolved;
}

function normalizeDir(filepath: string): string {
	return path.resolve(expandHome(filepath.trim()));
}

function loadConfig(): ProjectsConfig {
	const defaultConfig: ProjectsConfig = {
		noProjectDir: path.join(os.homedir(), ".pi", "scratchpad"),
		projects: [],
	};

	try {
		if (fs.existsSync(CONFIG_PATH)) {
			const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
			return {
				noProjectDir: data.noProjectDir || defaultConfig.noProjectDir,
				projects: Array.isArray(data.projects) ? data.projects : [],
			};
		}
	} catch {
		// Ignore corrupted JSON and return default
	}

	saveConfig(defaultConfig);
	return defaultConfig;
}

function saveConfig(config: ProjectsConfig): void {
	try {
		fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
	} catch (err) {
		console.error("[project-manager] 配置文件保存失败:", err);
	}
}

function relativeTime(date: Date): string {
	const ms = Date.now() - date.getTime();
	if (Number.isNaN(ms) || ms < 0) return "刚刚";
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return "刚刚";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}分钟前`;
	const hour = Math.floor(min / 60);
	if (hour < 24) return `${hour}小时前`;
	const day = Math.floor(hour / 24);
	if (day < 30) return `${day}天前`;
	return `${Math.floor(day / 30)}个月前`;
}

function snippet(text: string, maxLen = 30): string {
	if (!text) return "(新会话)";
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= maxLen) return clean;
	return clean.slice(0, maxLen) + "…";
}

function cleanupEmptySessionIfAny(ctx: ExtensionCommandContext): void {
	try {
		const sf = ctx.sessionManager.getSessionFile();
		if (!sf || !fs.existsSync(sf)) return;
		const entries = ctx.sessionManager.getEntries();
		const hasUserMessage = entries.some((e: any) => {
			if (e.type !== "message" || e.message?.role !== "user") return false;
			const content = e.message.content;
			if (typeof content === "string") {
				const t = content.trim();
				return (
					t.length > 0 && !t.startsWith("/project") && !t.startsWith("/p")
				);
			}
			if (Array.isArray(content)) {
				return content.some((p: any) => {
					const t = (p?.text || "").trim();
					return (
						t.length > 0 && !t.startsWith("/project") && !t.startsWith("/p")
					);
				});
			}
			return false;
		});

		if (!hasUserMessage) {
			fs.unlinkSync(sf);
		}
	} catch {
		// Best-effort cleanup
	}
}

async function switchToDir(
	ctx: ExtensionCommandContext,
	targetDir: string,
	sessionPath?: string,
	displayName?: string,
): Promise<void> {
	await ctx.waitForIdle();
	const resolvedDir = normalizeDir(targetDir);
	if (!fs.existsSync(resolvedDir)) {
		fs.mkdirSync(resolvedDir, { recursive: true });
	}

	cleanupEmptySessionIfAny(ctx);

	let targetSessionFile = sessionPath;
	if (!targetSessionFile) {
		const sm = SessionManager.create(resolvedDir);
		targetSessionFile = sm.getSessionFile()!;
		const header = sm.getHeader();
		if (header && !fs.existsSync(targetSessionFile)) {
			fs.mkdirSync(path.dirname(targetSessionFile), { recursive: true });
			fs.writeFileSync(targetSessionFile, JSON.stringify(header) + "\n");
		}
	}

	await ctx.switchSession(targetSessionFile, {
		withSession: async (nextCtx) => {
			const name = displayName || displayPath(resolvedDir);
			nextCtx.ui.notify(`已进入项目: ${name}`, "info");
		},
	});
}

async function pickAndSwitchSession(
	ctx: ExtensionCommandContext,
	targetDir: string,
	sessions: SessionInfo[],
	projectName: string,
): Promise<boolean> {
	const choices = sessions.map((s, idx) => {
		const namePart = s.name ? `[${s.name}] ` : "";
		return `${idx + 1}. ${namePart}${relativeTime(s.modified)} (${s.messageCount}条消息): "${snippet(s.firstMessage)}"`;
	});
	choices.push("↩️ 返回上级");

	const pick = await ctx.ui.select(`[${projectName}] 历史会话列表`, choices);
	if (!pick || pick.startsWith("↩️")) return false;

	const idx = Number.parseInt(pick.split(".")[0], 10) - 1;
	const target = sessions[idx];
	if (target) {
		await switchToDir(ctx, targetDir, target.path, projectName);
		return true;
	}
	return false;
}

async function handleSelectProject(
	ctx: ExtensionCommandContext,
	targetDir: string,
	projectName: string,
	isCurrent: boolean,
): Promise<boolean> {
	const resolved = normalizeDir(targetDir);
	if (!fs.existsSync(resolved)) {
		fs.mkdirSync(resolved, { recursive: true });
	}

	const sessions = await SessionManager.list(resolved);

	if (isCurrent) {
		const choices = [
			"🆕 在当前项目开启全新对话",
			...(sessions.length > 1
				? [`📜 切换到当前项目的其他历史会话 (${sessions.length}个)...`]
				: []),
			"↩️ 返回上级菜单",
		];
		const pick = await ctx.ui.select(
			`[${projectName}] 当前已在此项目中`,
			choices,
		);
		if (!pick || pick.startsWith("↩️")) return false;
		if (pick.startsWith("🆕")) {
			await switchToDir(ctx, targetDir, undefined, projectName);
			return true;
		}
		if (pick.startsWith("📜")) {
			return await pickAndSwitchSession(ctx, targetDir, sessions, projectName);
		}
		return false;
	}

	if (sessions.length === 0) {
		await switchToDir(ctx, targetDir, undefined, projectName);
		return true;
	}

	const latest = sessions[0];
	const choices = [
		`▶️ 继续上次对话 (${relativeTime(latest.modified)}: "${snippet(latest.firstMessage)}")`,
		"🆕 在该项目中开启全新对话",
		...(sessions.length > 1
			? [`📜 选择历史会话 (共 ${sessions.length} 个)...`]
			: []),
		"↩️ 返回上级菜单",
	];

	const pick = await ctx.ui.select(`[${projectName}] 选择会话`, choices);
	if (!pick || pick.startsWith("↩️")) return false;

	if (pick.startsWith("▶️")) {
		await switchToDir(ctx, targetDir, latest.path, projectName);
		return true;
	}
	if (pick.startsWith("🆕")) {
		await switchToDir(ctx, targetDir, undefined, projectName);
		return true;
	}
	if (pick.startsWith("📜")) {
		return await pickAndSwitchSession(ctx, targetDir, sessions, projectName);
	}
	return false;
}

async function handleAddCurrent(
	ctx: ExtensionCommandContext,
	config: ProjectsConfig,
): Promise<boolean> {
	const currentDir = normalizeDir(ctx.cwd);
	const defaultName = path.basename(currentDir) || "project";
	const name = await ctx.ui.input("输入项目显示名称:", defaultName);
	if (!name || !name.trim()) return false;

	config.projects.push({ name: name.trim(), path: currentDir });
	saveConfig(config);
	ctx.ui.notify(`已登记项目: ${name.trim()}`, "info");
	return false;
}

async function handleAddCustom(
	ctx: ExtensionCommandContext,
	config: ProjectsConfig,
): Promise<boolean> {
	const input = await ctx.ui.input("输入项目目录路径 (支持 ~):", "");
	if (!input || !input.trim()) return false;

	const resolved = normalizeDir(input);
	if (!fs.existsSync(resolved)) {
		const create = await ctx.ui.confirm(
			"目录不存在",
			`目录 ${displayPath(resolved)} 不存在，是否自动创建？`,
		);
		if (!create) return false;
		fs.mkdirSync(resolved, { recursive: true });
	}

	const defaultName = path.basename(resolved) || "project";
	const name = await ctx.ui.input("输入项目显示名称:", defaultName);
	if (!name || !name.trim()) return false;

	config.projects.push({ name: name.trim(), path: resolved });
	saveConfig(config);
	ctx.ui.notify(`已添加新项目: ${name.trim()}`, "info");

	const doSwitch = await ctx.ui.confirm(
		"立即切换",
		`是否立即切换到项目 "${name.trim()}"？`,
	);
	if (doSwitch) {
		return await handleSelectProject(ctx, resolved, name.trim(), false);
	}
	return false;
}

async function handleDiscoverHistory(
	ctx: ExtensionCommandContext,
	config: ProjectsConfig,
): Promise<boolean> {
	const allSessions = await SessionManager.listAll();
	const knownPaths = new Set([
		normalizeDir(config.noProjectDir),
		...config.projects.map((p) => normalizeDir(p.path)),
	]);

	const dirMap = new Map<string, { count: number; lastModified: Date }>();

	for (const s of allSessions) {
		if (!s.cwd) continue;
		const norm = normalizeDir(s.cwd);
		if (knownPaths.has(norm)) continue;
		if (!fs.existsSync(norm)) continue;

		const existing = dirMap.get(norm);
		if (!existing) {
			dirMap.set(norm, { count: 1, lastModified: s.modified });
		} else {
			existing.count += 1;
			if (s.modified > existing.lastModified) {
				existing.lastModified = s.modified;
			}
		}
	}

	const candidates: { path: string; count: number; lastModified: Date }[] = [];
	for (const [dir, data] of dirMap.entries()) {
		candidates.push({
			path: dir,
			count: data.count,
			lastModified: data.lastModified,
		});
	}

	candidates.sort(
		(a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
	);

	if (candidates.length === 0) {
		ctx.ui.notify("未在历史会话中发现新的未登记项目", "info");
		return false;
	}

	const choices = candidates.map((c, idx) => {
		return `${idx + 1}. ${path.basename(c.path)} (${displayPath(c.path)}) [${c.count}个会话, ${relativeTime(c.lastModified)}]`;
	});
	choices.push("↩️ 返回上级");

	const pick = await ctx.ui.select("选择要登记为项目的历史目录:", choices);
	if (!pick || pick.startsWith("↩️")) return false;

	const idx = Number.parseInt(pick.split(".")[0], 10) - 1;
	const target = candidates[idx];
	if (!target) return false;

	const defaultName = path.basename(target.path);
	const name = await ctx.ui.input("项目显示名称:", defaultName);
	if (!name || !name.trim()) return false;

	config.projects.push({ name: name.trim(), path: target.path });
	saveConfig(config);
	ctx.ui.notify(`项目 "${name.trim()}" 已添加`, "info");

	const doSwitch = await ctx.ui.confirm(
		"立即切换",
		`是否立即切换到项目 "${name.trim()}"？`,
	);
	if (doSwitch) {
		return await handleSelectProject(ctx, target.path, name.trim(), false);
	}
	return false;
}

async function handleSetNoProjectDir(
	ctx: ExtensionCommandContext,
	config: ProjectsConfig,
): Promise<boolean> {
	const input = await ctx.ui.input(
		"设置默认“无项目”工作目录 (支持 ~):",
		displayPath(config.noProjectDir),
	);
	if (!input || !input.trim()) return false;

	const resolved = normalizeDir(input);
	if (!fs.existsSync(resolved)) {
		const create = await ctx.ui.confirm(
			"目录不存在",
			`目录 ${displayPath(resolved)} 不存在，是否自动创建？`,
		);
		if (create) {
			fs.mkdirSync(resolved, { recursive: true });
		}
	}

	config.noProjectDir = resolved;
	saveConfig(config);
	ctx.ui.notify(`已设置无项目默认目录为: ${displayPath(resolved)}`, "info");
	return false;
}

async function handleRemoveProject(
	ctx: ExtensionCommandContext,
	config: ProjectsConfig,
): Promise<boolean> {
	if (config.projects.length === 0) {
		ctx.ui.notify("当前没有登记的项目", "info");
		return false;
	}

	const choices = config.projects.map((p, idx) => {
		return `${idx + 1}. ${p.name} (${displayPath(p.path)})`;
	});
	choices.push("↩️ 取消");

	const pick = await ctx.ui.select(
		"选择要移除的项目 (仅移除登记，不删文件):",
		choices,
	);
	if (!pick || pick.startsWith("↩️")) return false;

	const idx = Number.parseInt(pick.split(".")[0], 10) - 1;
	const target = config.projects[idx];
	if (!target) return false;

	const ok = await ctx.ui.confirm(
		"确认移除",
		`确定要从项目列表中移除 "${target.name}" 吗？`,
	);
	if (!ok) return false;

	config.projects.splice(idx, 1);
	saveConfig(config);
	ctx.ui.notify(`已移除项目: ${target.name}`, "info");
	return false;
}

async function runProjectManager(
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	await ctx.waitForIdle();
	const config = loadConfig();

	const cleanArg = args.trim();
	if (cleanArg) {
		const q = cleanArg.toLowerCase();
		if (
			q === "scratch" ||
			q === "scratchpad" ||
			q === "none" ||
			q === "无项目"
		) {
			const isCurrent =
				normalizeDir(ctx.cwd) === normalizeDir(config.noProjectDir);
			await handleSelectProject(
				ctx,
				config.noProjectDir,
				"无项目对话",
				isCurrent,
			);
			return;
		}

		const match = config.projects.find(
			(p) =>
				p.name.toLowerCase() === q ||
				path.basename(p.path).toLowerCase() === q,
		);
		if (match) {
			const isCurrent = normalizeDir(ctx.cwd) === normalizeDir(match.path);
			await handleSelectProject(ctx, match.path, match.name, isCurrent);
			return;
		}
	}

	// Interactive Menu Loop
	while (true) {
		const currentNorm = normalizeDir(ctx.cwd);
		const noProjNorm = normalizeDir(config.noProjectDir);
		const isNoProject = currentNorm === noProjNorm;

		const menuOptions: string[] = [];

		// 1. 无项目对话入口
		menuOptions.push(
			`💬 [无项目对话] (${displayPath(config.noProjectDir)})${isNoProject ? " ⬅️当前" : ""}`
		);

		// 2. 已登记项目列表
		for (const p of config.projects) {
			const isCurr = normalizeDir(p.path) === currentNorm;
			menuOptions.push(
				`📁 ${p.name} (${displayPath(p.path)})${isCurr ? " ⬅️当前" : ""}`
			);
		}

		// 3. 管理操作
		menuOptions.push("──────────────────────────────────────");

		const isCurrentInProjects = config.projects.some(
			(p) => normalizeDir(p.path) === currentNorm,
		);
		if (!isNoProject && !isCurrentInProjects) {
			menuOptions.push(`➕ 将当前目录添加为项目 (${path.basename(ctx.cwd)})`);
		}

		menuOptions.push("📂 手动输入目录添加为项目...");
		menuOptions.push("🔍 从历史会话中发现并导入项目...");
		menuOptions.push("⚙️ 设置默认“无项目”工作目录...");
		if (config.projects.length > 0) {
			menuOptions.push("🗑️ 移除已登记的项目...");
		}
		menuOptions.push("❌ 退出菜单");

		const choice = await ctx.ui.select(
			`[项目管理] 当前位置: ${displayPath(ctx.cwd)}`,
			menuOptions,
		);

		if (!choice || choice.startsWith("❌") || choice.startsWith("─")) {
			break;
		}

		if (choice.startsWith("💬 [无项目对话]")) {
			const switched = await handleSelectProject(
				ctx,
				config.noProjectDir,
				"无项目对话",
				isNoProject,
			);
			if (switched) break;
			continue;
		}

		if (choice.startsWith("📁")) {
			const found = config.projects.find((p) => {
				return choice.includes(`📁 ${p.name} (${displayPath(p.path)})`);
			});
			if (found) {
				const isCurr = normalizeDir(found.path) === currentNorm;
				const switched = await handleSelectProject(
					ctx,
					found.path,
					found.name,
					isCurr,
				);
				if (switched) break;
			}
			continue;
		}

		if (choice.startsWith("➕ 将当前目录添加为项目")) {
			await handleAddCurrent(ctx, config);
			continue;
		}

		if (choice.startsWith("📂 手动输入目录添加为项目")) {
			const switched = await handleAddCustom(ctx, config);
			if (switched) break;
			continue;
		}

		if (choice.startsWith("🔍 从历史会话中发现并导入项目")) {
			const switched = await handleDiscoverHistory(ctx, config);
			if (switched) break;
			continue;
		}

		if (choice.startsWith("⚙️ 设置默认“无项目”工作目录")) {
			await handleSetNoProjectDir(ctx, config);
			continue;
		}

		if (choice.startsWith("🗑️ 移除已登记的项目")) {
			await handleRemoveProject(ctx, config);
			continue;
		}
	}
}

export default function projectManager(pi: ExtensionAPI) {
	pi.registerCommand("project", {
		description: "项目管理与切换：快速在项目与无项目对话间切换 (Codex风格)",
		getArgumentCompletions: (prefix: string) => {
			const cfg = loadConfig();
			const items = [
				{ value: "scratch", label: "scratch (无项目对话)" },
				...cfg.projects.map((p) => ({
					value: p.name,
					label: `${p.name} (${displayPath(p.path)})`,
				})),
			];
			const filtered = items.filter((i) =>
				i.value.toLowerCase().startsWith(prefix.toLowerCase()),
			);
			return filtered.length > 0 ? filtered : null;
		},
		handler: runProjectManager,
	});

	pi.registerCommand("p", {
		description: "项目管理快捷命令 (/project 的别名)",
		getArgumentCompletions: (prefix: string) => {
			const cfg = loadConfig();
			const items = [
				{ value: "scratch", label: "scratch (无项目对话)" },
				...cfg.projects.map((p) => ({
					value: p.name,
					label: `${p.name} (${displayPath(p.path)})`,
				})),
			];
			const filtered = items.filter((i) =>
				i.value.toLowerCase().startsWith(prefix.toLowerCase()),
			);
			return filtered.length > 0 ? filtered : null;
		},
		handler: runProjectManager,
	});
}
