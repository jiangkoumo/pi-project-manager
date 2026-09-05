import { visibleWidth } from "@earendil-works/pi-tui";
import { ProjectOverlayComponent } from "../extensions/ui/project-overlay.js";

const mockTheme: any = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
};

const mockItems: any = [
	{
		kind: "project",
		project: {
			name: "无项目空间",
			path: "/Users/demo/.pi/scratchpad",
			isCurrent: false,
			isScratchpad: true,
			git: { isGit: false },
			sessions: [],
			sessionCount: 0,
			lastActive: null,
		},
	},
	{
		kind: "project",
		project: {
			name: "测试中文超长项目名称一二三四五六七八九十",
			path: "/Users/demo/Code/test",
			isCurrent: true,
			isScratchpad: false,
			git: { isGit: true, branch: "feature/test-branch-name", dirty: true, summary: "feature/test-branch-name (12 modified)" },
			sessions: [
				{
					path: "/tmp/s1.jsonl",
					id: "s1",
					cwd: "/Users/demo/Code/test",
					modified: new Date(),
					messageCount: 5,
					firstMessage: "这是第一条消息，测试一下中文截断和显示效果怎么样？",
				},
			],
			sessionCount: 1,
			lastActive: new Date(),
		},
	},
	{
		kind: "action",
		action: {
			id: "add-custom",
			title: "手动添加目录...",
			desc: "输入本地文件夹路径，将其登记为便捷项目。",
		},
	},
];

let mismatches = 0;
// Test empty items, filtered no results, various widths
for (const items of [[], mockItems]) {
	for (const width of [40, 48, 50, 55, 58, 60, 67, 70, 75, 80, 88, 100]) {
		const comp = new ProjectOverlayComponent(mockTheme, items, () => {});
		const lines = comp.render(width);
		const targetW = Math.max(48, Math.min(width, 88));
		for (let i = 0; i < lines.length; i++) {
			const vw = visibleWidth(lines[i]);
			if (vw !== targetW) {
				console.log(`Mismatch at width ${width} (expected ${targetW}), line ${i}: actual vw=${vw}`);
				console.log(JSON.stringify(lines[i]));
				mismatches++;
			}
		}

		// Also test when query matches nothing
		comp.handleInput("xyznonexistent");
		const linesFiltered = comp.render(width);
		for (let i = 0; i < linesFiltered.length; i++) {
			const vw = visibleWidth(linesFiltered[i]);
			if (vw !== targetW) {
				console.log(`Mismatch filtered at width ${width} (expected ${targetW}), line ${i}: actual vw=${vw}`);
				console.log(JSON.stringify(linesFiltered[i]));
				mismatches++;
			}
		}
	}
}

if (mismatches === 0) {
	console.log("All width boundary tests and filter tests passed with 100% exact visibleWidth alignment!");
} else {
	console.error(`Encountered ${mismatches} width mismatches.`);
	process.exit(1);
}
