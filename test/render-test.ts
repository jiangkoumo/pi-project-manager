import { ProjectOverlayComponent } from "../extensions/ui/project-overlay.js";
import type { ListItem } from "../extensions/ui/types.js";

// Mock Theme
const mockTheme: any = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
};

const mockItems: ListItem[] = [
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
			name: "pi-project-manager",
			path: "/Users/demo/Code/pi-project-manager",
			isCurrent: true,
			isScratchpad: false,
			git: { isGit: true, branch: "main", dirty: true, summary: "main (1 modified)" },
			sessions: [
				{
					path: "/tmp/session1.jsonl",
					id: "s1",
					cwd: "/Users/demo/Code/pi-project-manager",
					modified: new Date(),
					messageCount: 5,
					firstMessage: "我想做一些更行，tui的ui设计方面的",
				} as any,
			],
			sessionCount: 1,
			lastActive: new Date(),
		},
	},
	{
		kind: "action",
		action: {
			id: "add-custom",
			title: "+ 手动添加路径...",
			desc: "输入本地文件夹路径，将其登记为便捷项目。",
		},
	},
];

const component = new ProjectOverlayComponent(mockTheme, mockItems, () => {});

console.log("=== Testing 80 columns width ===");
const lines80 = component.render(80);
for (const line of lines80) {
	console.log(line);
}

console.log("\n=== Testing 50 columns width (Narrow) ===");
const lines50 = component.render(50);
for (const line of lines50) {
	console.log(line);
}

console.log("\n=== Testing Search & Filter Interaction ===");
component.handleInput("p");
console.log("After typing 'p':");
const linesFilterP = component.render(80);
console.log(linesFilterP[0]);
console.log(linesFilterP[1]);
console.log(linesFilterP[3]);

component.handleInput("\x7f"); // Backspace
console.log("After backspace:");
const linesBack = component.render(80);
console.log(linesBack[1]);
console.log(linesBack[3]);

console.log("\nRender tests completed successfully!");
