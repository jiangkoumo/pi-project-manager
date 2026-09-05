import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface GitInfo {
	isGit: boolean;
	branch?: string;
	dirty?: boolean;
	summary?: string;
}

const cache = new Map<string, { info: GitInfo; timestamp: number }>();
const CACHE_TTL = 4000;

export function getGitInfo(dir: string): GitInfo {
	const cached = cache.get(dir);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.info;
	}

	try {
		if (!fs.existsSync(dir)) {
			const info: GitInfo = { isGit: false };
			cache.set(dir, { info, timestamp: Date.now() });
			return info;
		}

		const gitEntry = path.join(dir, ".git");
		if (!fs.existsSync(gitEntry)) {
			const info: GitInfo = { isGit: false };
			cache.set(dir, { info, timestamp: Date.now() });
			return info;
		}

		const out = execSync("git status --porcelain -b", {
			cwd: dir,
			encoding: "utf-8",
			timeout: 800,
			stdio: ["ignore", "pipe", "ignore"],
		});

		const lines = out.trim().split("\n");
		let branch = "HEAD";
		if (lines[0] && lines[0].startsWith("## ")) {
			const bPart = lines[0].slice(3).trim();
			branch = bPart.split("...")[0].trim();
		}

		const changeLines = lines.slice(1).filter((l) => l.trim().length > 0);
		const dirty = changeLines.length > 0;
		const summary = dirty ? `${branch} (${changeLines.length} modified)` : `${branch} (clean)`;

		const info: GitInfo = {
			isGit: true,
			branch,
			dirty,
			summary,
		};
		cache.set(dir, { info, timestamp: Date.now() });
		return info;
	} catch {
		const info: GitInfo = { isGit: false };
		cache.set(dir, { info, timestamp: Date.now() });
		return info;
	}
}
