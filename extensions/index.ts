import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGitInfo } from "./git.js";
import { ProjectOverlayComponent } from "./ui/project-overlay.js";
import type { ActionItem, ListItem, ProjectMeta, ProjectOverlayResult } from "./ui/types.js";

interface ProjectItem {
	name: string;
	path: string;
}

interface ProjectsConfig {
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
	if (sessions.length === 0) {
		await switchToDir(ctx, targetDir, undefined, projectName);
		return true;
	}

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
				? [`📋 切换到当前项目的其他历史会话 (${sessions.length}个)...`]
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
		if (pick.startsWith("📋")) {
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
			? [`📋 选择历史会话 (共 ${sessions.length} 个)...`]
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
	if (pick.startsWith("📋")) {
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

async function handleRemoveSingleProject(
	ctx: ExtensionCommandContext,
	config: ProjectsConfig,
	project: ProjectMeta,
): Promise<boolean> {
	const ok = await ctx.ui.confirm(
		"确认移除项目",
		`确定要从项目列表中移除 "${project.name}" 吗？(仅移除登记，不删除本地文件)`,
	);
	if (!ok) return false;

	const idx = config.projects.findIndex(
		(p) => normalizeDir(p.path) === normalizeDir(project.path),
	);
	if (idx >= 0) {
		config.projects.splice(idx, 1);
		saveConfig(config);
		ctx.ui.notify(`已移除项目: ${project.name}`, "info");
		return true;
	}
	return false;
}

async function handleMigrateCurrentSession(
	ctx: ExtensionCommandContext,
	config: ProjectsConfig,
	targetQuery?: string,
): Promise<boolean> {
	const currentCwd = normalizeDir(ctx.cwd);
	const curFile = ctx.sessionManager.getSessionFile();
	if (!curFile || !fs.existsSync(curFile)) {
		ctx.ui.notify("当前没有可迁移的会话文件", "warning");
		return false;
	}

	const targets: { name: string; rawName: string; path: string }[] = [];

	const noProjNorm = normalizeDir(config.noProjectDir);
	if (currentCwd !== noProjNorm) {
		targets.push({ name: "⚡ [无项目对话]", rawName: "scratch", path: config.noProjectDir });
	}

	for (const p of config.projects) {
		if (normalizeDir(p.path) !== currentCwd) {
			targets.push({ name: `📁 ${p.name}`, rawName: p.name, path: p.path });
		}
	}

	if (targets.length === 0) {
		ctx.ui.notify("没有其他可迁移的目标项目", "info");
		return false;
	}

	let selected: { name: string; rawName: string; path: string } | undefined;

	if (targetQuery && targetQuery.trim()) {
		const tq = targetQuery.trim().toLowerCase();
		if (tq === "scratch" || tq === "scratchpad" || tq === "无项目" || tq === "none") {
			selected = targets.find((t) => normalizeDir(t.path) === noProjNorm);
		} else {
			selected = targets.find(
				(t) =>
					t.rawName.toLowerCase() === tq ||
					path.basename(t.path).toLowerCase() === tq ||
					t.rawName.toLowerCase().includes(tq),
			);
		}
		if (!selected) {
			ctx.ui.notify(`未找到匹配的项目 "${targetQuery}"，请在下列列表中选择`, "warning");
		}
	}

	if (!selected) {
		const choices = targets.map(
			(t, idx) => `${idx + 1}. ${t.name} (${displayPath(t.path)})`,
		);
		choices.push("↩️ 取消");

		const pick = await ctx.ui.select("选择要将当前会话迁移到的目标项目:", choices);
		if (!pick || pick.startsWith("↩️")) return false;

		const idx = Number.parseInt(pick.split(".")[0], 10) - 1;
		selected = targets[idx];
	}

	if (!selected) return false;

	const ok = await ctx.ui.confirm(
		"确认迁移会话",
		`确定要将当前整个对话记录迁移到 "${selected.name}" 并切换到该项目吗？`,
	);
	if (!ok) return false;

	const targetResolvedCwd = normalizeDir(selected.path);
	if (!fs.existsSync(targetResolvedCwd)) {
		fs.mkdirSync(targetResolvedCwd, { recursive: true });
	}

	const smTarget = SessionManager.create(targetResolvedCwd);
	const targetSessionDir = smTarget.getSessionDir();
	fs.mkdirSync(targetSessionDir, { recursive: true });

	const targetSessionFile = path.join(targetSessionDir, path.basename(curFile));

	const content = fs.readFileSync(curFile, "utf-8");
	const lines = content.split("\n");
	if (lines.length > 0 && lines[0].trim()) {
		try {
			const header = JSON.parse(lines[0]);
			header.cwd = targetResolvedCwd;
			lines[0] = JSON.stringify(header);
		} catch {
			// ignore
		}
	}
	fs.writeFileSync(targetSessionFile, lines.join("\n"), "utf-8");

	try {
		fs.unlinkSync(curFile);
	} catch {
		// Best-effort
	}

	await ctx.switchSession(targetSessionFile, {
		withSession: async (nextCtx) => {
			nextCtx.ui.notify(`当前会话已成功迁移至: ${selected.name}`, "info");
		},
	});

	return true;
}

async function prepareProjectItems(
	ctx: ExtensionCommandContext,
	config: ProjectsConfig,
): Promise<ListItem[]> {
	const currentNorm = normalizeDir(ctx.cwd);
	const noProjNorm = normalizeDir(config.noProjectDir);

	// 1. Scratchpad item
	const scratchSessions = await SessionManager.list(noProjNorm).catch(() => []);
	const scratchGit = getGitInfo(noProjNorm);
	const scratchMeta: ProjectMeta = {
		name: "无项目空间",
		path: config.noProjectDir,
		isCurrent: currentNorm === noProjNorm,
		isScratchpad: true,
		git: scratchGit,
		sessions: scratchSessions,
		sessionCount: scratchSessions.length,
		lastActive: scratchSessions[0]?.modified || null,
	};

	const items: ListItem[] = [
		{ kind: "project", project: scratchMeta },
	];

	// 2. Registered projects
	for (const p of config.projects) {
		const pNorm = normalizeDir(p.path);
		const pSessions = await SessionManager.list(pNorm).catch(() => []);
		const pGit = getGitInfo(pNorm);
		const pMeta: ProjectMeta = {
			name: p.name,
			path: p.path,
			isCurrent: currentNorm === pNorm,
			isScratchpad: false,
			git: pGit,
			sessions: pSessions,
			sessionCount: pSessions.length,
			lastActive: pSessions[0]?.modified || null,
		};
		items.push({ kind: "project", project: pMeta });
	}

	// 3. Action items
	const isCurrentInProjects = config.projects.some(
		(p) => normalizeDir(p.path) === currentNorm,
	);
	const isNoProject = currentNorm === noProjNorm;

	if (!isNoProject && !isCurrentInProjects) {
		items.push({
			kind: "action",
			action: {
				id: "add-current",
				title: "+ 登记当前工作区",
				desc: `将当前终端所在的工作区目录 (${displayPath(ctx.cwd)}) 添加到项目管理器。`,
			},
		});
	}

	const curSessionFile = ctx.sessionManager.getSessionFile();
	if (curSessionFile && fs.existsSync(curSessionFile)) {
		items.push({
			kind: "action",
			action: {
				id: "migrate",
				title: "→ 迁移当前会话...",
				desc: "将当前对话历史完整迁移到目标项目的工作区目录下，并切换到目标项目。",
			},
		});
	}

	items.push({
		kind: "action",
		action: {
			id: "add-custom",
			title: "+ 手动添加路径...",
			desc: "输入本地文件夹路径（支持 ~ 缩写），将其登记为项目。",
		},
	});

	items.push({
		kind: "action",
		action: {
			id: "discover",
			title: "* 扫描历史项目...",
			desc: "自动扫描所有历史会话中访问过的未登记工程目录，一键批量登记。",
		},
	});

	items.push({
		kind: "action",
		action: {
			id: "set-scratch",
			title: "~ 设置草稿目录...",
			desc: `修改独立草稿箱对应的本地文件夹路径（当前: ${displayPath(config.noProjectDir)}）。`,
		},
	});

	return items;
}

async function runProjectManager(
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	await ctx.waitForIdle();
	const config = loadConfig();

	const cleanArg = args.trim();
	if (cleanArg) {
		const parts = cleanArg.split(/\s+/);
		const subCmd = parts[0].toLowerCase();

		if (subCmd === "help" || subCmd === "-h" || subCmd === "--help" || subCmd === "帮助") {
			ctx.ui.notify(
				[
					"【pi-project-manager 命令指南】",
					"  /p               - 打开现代两栏式项目管理面板 (支持打字即时过滤)",
					"  /p <项目名>      - 快速切换到指定项目 (支持 Tab 补全，0 延迟直达)",
					"  /p scratch       - 快速切换到独立的“无项目”草稿空间",
					"  /p move [项目名] - 将当前会话连同历史迁移到目标项目并切换过去",
					"  /p help          - 显示本帮助信息",
				].join("\n"),
				"info",
			);
			return;
		}

		if (subCmd === "move" || subCmd === "migrate" || subCmd === "迁移") {
			const targetQuery = parts.slice(1).join(" ").trim();
			await handleMigrateCurrentSession(ctx, config, targetQuery);
			return;
		}

		if (
			subCmd === "scratch" ||
			subCmd === "scratchpad" ||
			subCmd === "none" ||
			subCmd === "无项目"
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
				p.name.toLowerCase() === cleanArg.toLowerCase() ||
				path.basename(p.path).toLowerCase() === cleanArg.toLowerCase(),
		);
		if (match) {
			const isCurrent = normalizeDir(ctx.cwd) === normalizeDir(match.path);
			await handleSelectProject(ctx, match.path, match.name, isCurrent);
			return;
		}

		ctx.ui.notify(`未找到名称为 "${cleanArg}" 的项目，按 Enter 打开管理菜单`, "warning");
	}

	// Interactive Loop
	while (true) {
		// If TUI mode is active, present modern two-pane overlay
		if (ctx.mode === "tui") {
			const items = await prepareProjectItems(ctx, config);

			const result = await ctx.ui.custom<ProjectOverlayResult>(
				(tui, theme, _keybindings, done) =>
					new ProjectOverlayComponent(
						theme,
						items,
						done,
						() => tui.requestRender(),
					),
				{
					overlay: true,
					overlayOptions: {
						anchor: "center",
						offsetY: 2,
					},
				},
			);

			if (!result) {
				// User cancelled / pressed Esc
				break;
			}

			if (result.action === "switch-latest") {
				const p = result.project;
				const latest = p.sessions[0];
				await switchToDir(
					ctx,
					p.path,
					latest ? latest.path : undefined,
					p.name,
				);
				break;
			}

			if (result.action === "switch-new") {
				const p = result.project;
				await switchToDir(ctx, p.path, undefined, p.name);
				break;
			}

			if (result.action === "pick-session") {
				const p = result.project;
				const switched = await pickAndSwitchSession(
					ctx,
					p.path,
					p.sessions,
					p.name,
				);
				if (switched) break;
				continue;
			}

			if (result.action === "migrate") {
				const p = result.project;
				const migrated = await handleMigrateCurrentSession(
					ctx,
					config,
					p.isScratchpad ? "scratch" : p.name,
				);
				if (migrated) break;
				continue;
			}

			if (result.action === "remove") {
				await handleRemoveSingleProject(ctx, config, result.project);
				continue;
			}

			if (result.action === "execute-action") {
				const actionId = result.actionId;
				if (actionId === "add-current") {
					await handleAddCurrent(ctx, config);
					continue;
				}
				if (actionId === "add-custom") {
					const switched = await handleAddCustom(ctx, config);
					if (switched) break;
					continue;
				}
				if (actionId === "discover") {
					const switched = await handleDiscoverHistory(ctx, config);
					if (switched) break;
					continue;
				}
				if (actionId === "set-scratch") {
					await handleSetNoProjectDir(ctx, config);
					continue;
				}
				if (actionId === "migrate") {
					const migrated = await handleMigrateCurrentSession(ctx, config);
					if (migrated) break;
					continue;
				}
			}
			continue;
		}

		// Fallback for non-TUI environments
		const currentNorm = normalizeDir(ctx.cwd);
		const noProjNorm = normalizeDir(config.noProjectDir);
		const isNoProject = currentNorm === noProjNorm;

		const menuOptions: string[] = [];
		menuOptions.push(
			`⚡ [无项目对话] (${displayPath(config.noProjectDir)})${isNoProject ? " ⬅️当前" : ""}`,
		);

		for (const p of config.projects) {
			const isCurr = normalizeDir(p.path) === currentNorm;
			menuOptions.push(
				`📁 ${p.name} (${displayPath(p.path)})${isCurr ? " ⬅️当前" : ""}`,
			);
		}

		menuOptions.push("──────────────────────────────────────");

		const curSessionFile = ctx.sessionManager.getSessionFile();
		if (curSessionFile && fs.existsSync(curSessionFile)) {
			menuOptions.push("📦 将当前会话迁移到其他项目...");
		}

		const isCurrentInProjects = config.projects.some(
			(p) => normalizeDir(p.path) === currentNorm,
		);
		if (!isNoProject && !isCurrentInProjects) {
			menuOptions.push(`➕ 将当前目录添加为项目 (${path.basename(ctx.cwd)})`);
		}

		menuOptions.push("📁 手动输入目录添加为项目...");
		menuOptions.push("✨ 从历史会话中发现并导入项目...");
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

		if (choice.startsWith("⚡ [无项目对话]")) {
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

		if (choice.startsWith("📦 将当前会话迁移到其他项目")) {
			const migrated = await handleMigrateCurrentSession(ctx, config);
			if (migrated) break;
			continue;
		}

		if (choice.startsWith("➕ 将当前目录添加为项目")) {
			await handleAddCurrent(ctx, config);
			continue;
		}

		if (choice.startsWith("📁 手动输入目录添加为项目")) {
			const switched = await handleAddCustom(ctx, config);
			if (switched) break;
			continue;
		}

		if (choice.startsWith("✨ 从历史会话中发现并导入项目")) {
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

function getProjectCompletions(prefix: string) {
	const cfg = loadConfig();
	const trimmed = prefix.trimStart();

	if (/^(move|migrate)\s+/i.test(trimmed)) {
		const match = trimmed.match(/^(move|migrate)\s*(.*)/i);
		const cmd = match ? match[1] : "move";
		const targets = [
			{ value: `${cmd} scratch`, label: `${cmd} scratch (无项目空间)` },
			...cfg.projects.map((p) => ({
				value: `${cmd} ${p.name}`,
				label: `${cmd} ${p.name} (${displayPath(p.path)})`,
			})),
		];
		const filtered = targets.filter((i) =>
			i.value.toLowerCase().startsWith(trimmed.toLowerCase()),
		);
		return filtered.length > 0 ? filtered : null;
	}

	const baseItems = [
		{ value: "scratch", label: "scratch (切换至无项目对话)" },
		{ value: "move", label: "move [项目名] (将当前会话迁移至其他项目)" },
		{ value: "help", label: "help (查看命令帮助)" },
		...cfg.projects.map((p) => ({
			value: p.name,
			label: `${p.name} (${displayPath(p.path)})`,
		})),
	];

	const filtered = baseItems.filter((i) =>
		i.value.toLowerCase().startsWith(trimmed.toLowerCase()),
	);
	return filtered.length > 0 ? filtered : null;
}

export default function projectManager(pi: ExtensionAPI) {
	pi.registerCommand("project", {
		description: "项目管理与切换：现代化两栏终端面板，即搜即切 (Codex/Raycast风格)",
		getArgumentCompletions: getProjectCompletions,
		handler: runProjectManager,
	});

	pi.registerCommand("p", {
		description: "项目管理快捷命令 (/project 的别名)",
		getArgumentCompletions: getProjectCompletions,
		handler: runProjectManager,
	});
}
