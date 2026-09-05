import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	CURSOR_MARKER,
	type Focusable,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { ActionItem, ListItem, ProjectMeta, ProjectOverlayResult } from "./types.js";

function padRight(str: string, targetWidth: number): string {
	const truncated = truncateToWidth(str, targetWidth);
	const currentWidth = visibleWidth(truncated);
	if (currentWidth < targetWidth) {
		return truncated + " ".repeat(targetWidth - currentWidth);
	}
	return truncated;
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

function snippet(text: string, maxLen = 32): string {
	if (!text) return "(新会话)";
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= maxLen) return clean;
	return clean.slice(0, maxLen) + "…";
}

export class ProjectOverlayComponent implements Focusable {
	/** Focusable interface for IME cursor positioning */
	focused = true;

	private theme: Theme;
	private done: (result: ProjectOverlayResult) => void;
	private allItems: ListItem[] = [];
	private filteredItems: ListItem[] = [];
	private selectedIndex = 0;
	private scrollOffset = 0;
	private query = "";
	private onRequestRender?: () => void;

	invalidate(): void {
		// Clears cache when theme or layout changes
	}

	constructor(
		theme: Theme,
		items: ListItem[],
		done: (result: ProjectOverlayResult) => void,
		onRequestRender?: () => void,
	) {
		this.theme = theme;
		this.allItems = items;
		this.done = done;
		this.onRequestRender = onRequestRender;
		this.updateFilter();
	}

	private updateFilter(): void {
		const q = this.query.trim().toLowerCase();
		if (!q) {
			this.filteredItems = [...this.allItems];
		} else {
			const nameMatches: ListItem[] = [];
			const otherMatches: ListItem[] = [];

			for (const item of this.allItems) {
				if (item.kind === "project") {
					const nameMatch = item.project.name.toLowerCase().includes(q);
					const pathMatch = item.project.path.toLowerCase().includes(q);
					if (nameMatch) {
						nameMatches.push(item);
					} else if (pathMatch) {
						otherMatches.push(item);
					}
				} else {
					const titleMatch = item.action.title.toLowerCase().includes(q);
					const descMatch = item.action.desc.toLowerCase().includes(q);
					if (titleMatch) {
						nameMatches.push(item);
					} else if (descMatch) {
						otherMatches.push(item);
					}
				}
			}

			this.filteredItems = [...nameMatches, ...otherMatches];
		}

		this.selectedIndex = 0;
		this.ensureVisible();
	}

	private ensureVisible(maxRows = 13): void {
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollOffset + maxRows) {
			this.scrollOffset = this.selectedIndex - maxRows + 1;
		}
	}

	handleInput(data: string): void {
		// Escape / Ctrl+C
		if (matchesKey(data, "escape") || matchesKey(data, Key.ctrl("c"))) {
			if (this.query.length > 0) {
				this.query = "";
				this.updateFilter();
				this.onRequestRender?.();
				return;
			}
			this.done(undefined);
			return;
		}

		// Navigation
		if (matchesKey(data, "up")) {
			if (this.filteredItems.length > 0) {
				this.selectedIndex = (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
				this.ensureVisible();
				this.onRequestRender?.();
			}
			return;
		}

		if (matchesKey(data, "down")) {
			if (this.filteredItems.length > 0) {
				this.selectedIndex = (this.selectedIndex + 1) % this.filteredItems.length;
				this.ensureVisible();
				this.onRequestRender?.();
			}
			return;
		}

		const current = this.filteredItems[this.selectedIndex];

		// Return (Enter)
		if (matchesKey(data, "return")) {
			if (!current) {
				this.done(undefined);
				return;
			}
			if (current.kind === "project") {
				this.done({ action: "switch-latest", project: current.project });
			} else {
				this.done({ action: "execute-action", actionId: current.action.id });
			}
			return;
		}

		// Ctrl+N: Open new session in selected project
		if (matchesKey(data, Key.ctrl("n"))) {
			if (current && current.kind === "project") {
				this.done({ action: "switch-new", project: current.project });
			}
			return;
		}

		// Tab: Open session picker for selected project
		if (matchesKey(data, "tab")) {
			if (current && current.kind === "project") {
				this.done({ action: "pick-session", project: current.project });
			}
			return;
		}

		// Shortcut commands when search query is empty
		if (this.query === "") {
			if (data === "n" || data === "N") {
				if (current && current.kind === "project") {
					this.done({ action: "switch-new", project: current.project });
					return;
				}
			}
			if (data === "m" || data === "M") {
				if (current && current.kind === "project") {
					this.done({ action: "migrate", project: current.project });
					return;
				}
			}
			if (data === "d" || data === "D" || matchesKey(data, "delete")) {
				if (current && current.kind === "project" && !current.project.isScratchpad) {
					this.done({ action: "remove", project: current.project });
					return;
				}
			}
		}

		// Backspace
		if (matchesKey(data, "backspace")) {
			if (this.query.length > 0) {
				this.query = this.query.slice(0, -1);
				this.updateFilter();
				this.onRequestRender?.();
			}
			return;
		}

		// Printable character input for instant search
		if (data.length >= 1 && (data.charCodeAt(0) >= 32 || data.length > 1)) {
			// Avoid control keys
			if (!data.startsWith("\x1b")) {
				this.query += data;
				this.updateFilter();
				this.onRequestRender?.();
				return;
			}
		}
	}

	render(width: number): string[] {
		const totalW = Math.max(48, Math.min(width, 88));
		const th = this.theme;
		const lines: string[] = [];

		const isTwoCol = totalW >= 58;
		const innerW = totalW - 2;

		const leftW = isTwoCol ? Math.max(26, Math.min(35, Math.floor(innerW * 0.4))) : innerW;
		const rightW = isTwoCol ? innerW - leftW - 1 : 0;
		const contentRows = 14;

		// 1. Header Border: ╭─ [title] ── [count] ─╮
		const titleText = " ◆ PROJECTS ";
		const countText = ` [${this.filteredItems.length > 0 ? this.selectedIndex + 1 : 0}/${this.filteredItems.length}] `;
		const topDashes = Math.max(0, totalW - 4 - visibleWidth(titleText) - visibleWidth(countText));
		lines.push(
			th.fg("border", "╭─") +
				th.fg("accent", titleText) +
				th.fg("border", "─".repeat(topDashes)) +
				th.fg("dim", countText) +
				th.fg("border", "─╮"),
		);

		// 2. Search Input Row (Minimalist prompt ❯)
		const searchPrompt = "  ❯ ";
		const cursorSymbol = this.focused ? "\x1b[7m \x1b[27m" : " ";
		const searchContent =
			th.fg("accent", searchPrompt) +
			th.fg("text", this.query) +
			CURSOR_MARKER +
			cursorSymbol;
		lines.push(
			th.fg("border", "│") +
				padRight(searchContent, innerW) +
				th.fg("border", "│"),
		);

		// 3. Divider Row
		if (isTwoCol) {
			lines.push(
				th.fg("border", "├") +
					th.fg("border", "─".repeat(leftW)) +
					th.fg("border", "┬") +
					th.fg("border", "─".repeat(rightW)) +
					th.fg("border", "┤"),
			);
		} else {
			lines.push(
				th.fg("border", "├") +
					th.fg("border", "─".repeat(innerW)) +
					th.fg("border", "┤"),
			);
		}

		// 4. Content Area (Left List + Right Details)
		const currentItem = this.filteredItems[this.selectedIndex];
		const rightDetailsLines = isTwoCol
			? this.renderRightDetails(currentItem, rightW)
			: [];

		for (let row = 0; row < contentRows; row++) {
			const itemIndex = this.scrollOffset + row;
			let leftCell = " ".repeat(leftW);

			if (itemIndex < this.filteredItems.length) {
				const item = this.filteredItems[itemIndex];
				const isSelected = itemIndex === this.selectedIndex;
				leftCell = this.renderLeftItem(item, leftW, isSelected);
			} else if (this.filteredItems.length === 0 && row === 0) {
				leftCell = padRight(th.fg("dim", "  (无匹配项目)"), leftW);
			}

			if (isTwoCol) {
				const rightCell = rightDetailsLines[row] || " ".repeat(rightW);
				lines.push(
					th.fg("border", "│") +
						leftCell +
						th.fg("border", "│") +
						rightCell +
						th.fg("border", "│"),
				);
			} else {
				lines.push(
					th.fg("border", "│") +
						leftCell +
						th.fg("border", "│"),
				);
			}
		}

		// 5. Bottom Divider
		if (isTwoCol) {
			lines.push(
				th.fg("border", "├") +
					th.fg("border", "─".repeat(leftW)) +
					th.fg("border", "┴") +
					th.fg("border", "─".repeat(rightW)) +
					th.fg("border", "┤"),
			);
		} else {
			lines.push(
				th.fg("border", "├") +
					th.fg("border", "─".repeat(innerW)) +
					th.fg("border", "┤"),
			);
		}

		// 6. Footer Hints (Clean Monospace Keybinds)
		let footerHints: string;
		if (isTwoCol) {
			footerHints =
				this.query.length === 0
					? " ↵ open   ^n new   tab history   m move   d delete   esc quit "
					: " ↵ select   ^n new   tab history   esc clear/quit ";
		} else {
			footerHints =
				this.query.length === 0
					? " ↵ open   ^n new   tab history   esc quit "
					: " ↵ select   esc clear/quit ";
		}
		lines.push(
			th.fg("border", "│") +
				padRight(th.fg("dim", footerHints), innerW) +
				th.fg("border", "│"),
		);

		// 7. Bottom Border
		lines.push(
			th.fg("border", "╰") +
				th.fg("border", "─".repeat(innerW)) +
				th.fg("border", "╯"),
		);

		return lines.map((l) => truncateToWidth(l, totalW));
	}

	private renderLeftItem(item: ListItem, width: number, isSelected: boolean): string {
		const th = this.theme;

		if (item.kind === "project") {
			const p = item.project;
			const isCurrent = p.isCurrent;
			const bullet = isCurrent ? th.fg("success", "● ") : th.fg("dim", "○ ");
			const prefix = isSelected ? th.fg("accent", "▸ ") : "  ";
			const rawName = p.isScratchpad ? "~ [scratchpad]" : p.name;
			const nameStyled = isCurrent
				? th.fg("accent", rawName)
				: isSelected
					? th.fg("text", rawName)
					: th.fg("dim", rawName);

			const combined = prefix + bullet + nameStyled;
			const padded = padRight(combined, width);
			return isSelected ? th.bg("selectedBg", padded) : padded;
		}

		// Action Item
		const a = item.action;
		const prefix = isSelected ? th.fg("accent", "▸ ") : "  ";
		const titleStyled = isSelected ? th.fg("text", a.title) : th.fg("dim", a.title);
		const combined = prefix + titleStyled;
		const padded = padRight(combined, width);
		return isSelected ? th.bg("selectedBg", padded) : padded;
	}

	private renderRightDetails(item: ListItem | undefined, width: number): string[] {
		const th = this.theme;
		const lines: string[] = [];

		if (!item) {
			lines.push(padRight(th.fg("dim", " 没有选中的项目"), width));
			return lines;
		}

		if (item.kind === "project") {
			const p = item.project;
			// Row 0: Title & Status Badge
			const titleText = p.isScratchpad ? "✦ [scratchpad]" : `› ${p.name}`;
			const badge = p.isCurrent ? ` ${th.bg("selectedBg", th.fg("success", " ACTIVE "))}` : "";
			lines.push(padRight(` ${th.fg("accent", titleText)}${badge}`, width));

			// Row 1: Divider
			lines.push(padRight(` ${th.fg("borderMuted", "─".repeat(Math.max(0, width - 2)))}`, width));

			// Row 2: Path
			const pathStr = p.path.replace(/\\/g, "/");
			lines.push(padRight(`   ${th.fg("muted", "dir:")}      ${th.fg("text", truncateToWidth(pathStr, width - 13))}`, width));

			// Row 3: Git Status
			let gitDisplay = th.fg("dim", "no git repo");
			if (p.git.isGit && p.git.summary) {
				gitDisplay = p.git.dirty
					? th.fg("warning", `⎇  ${p.git.summary}`)
					: th.fg("success", `⎇  ${p.git.summary}`);
			}
			lines.push(padRight(`   ${th.fg("muted", "git:")}      ${gitDisplay}`, width));

			// Row 4: Sessions Count
			const activeText = p.lastActive ? ` (${relativeTime(p.lastActive)})` : "";
			lines.push(padRight(`   ${th.fg("muted", "sessions:")} ${p.sessionCount} chats${th.fg("dim", activeText)}`, width));

			// Row 5: Divider
			lines.push(padRight(` ${th.fg("borderMuted", "─".repeat(Math.max(0, width - 2)))}`, width));

			// Row 6: History Header
			lines.push(padRight(`   ${th.fg("dim", "recent:")}`, width));

			// Rows 7~10: Recent Sessions
			if (p.sessions.length === 0) {
				lines.push(padRight(th.fg("dim", "     (暂无历史记录，按 Enter 开启新对话)"), width));
			} else {
				const recent = p.sessions.slice(0, 3);
				for (let i = 0; i < recent.length; i++) {
					const s = recent[i];
					const timeStr = relativeTime(s.modified);
					const snip = snippet(s.firstMessage, Math.max(12, width - 20));
					lines.push(
						padRight(
							`     ${th.fg("dim", "·")} ${th.fg("muted", timeStr)}: "${th.fg("text", snip)}"`,
							width,
						),
					);
				}
			}

			// Empty spacing row & Bottom action hint
			lines.push("");
			lines.push(
				padRight(
					`   ${th.fg("dim", "[↵] continue    [^n] new session")}`,
					width,
				),
			);
		} else {
			const a = item.action;
			lines.push(padRight(` › ${th.fg("accent", a.title)}`, width));
			lines.push(padRight(` ${th.fg("borderMuted", "─".repeat(Math.max(0, width - 2)))}`, width));
			lines.push(padRight(`   ${th.fg("muted", "description:")}`, width));
			lines.push(padRight(`     ${th.fg("text", a.desc)}`, width));
			lines.push("");
			lines.push(padRight(`   ${th.fg("dim", "[↵] execute action")}`, width));
		}

		return lines;
	}
}
