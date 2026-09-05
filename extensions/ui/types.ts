import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import type { GitInfo } from "../git.js";

export interface ProjectMeta {
	name: string;
	path: string;
	isCurrent: boolean;
	isScratchpad: boolean;
	git: GitInfo;
	sessions: SessionInfo[];
	sessionCount: number;
	lastActive: Date | null;
}

export interface ActionItem {
	id: "add-current" | "add-custom" | "discover" | "set-scratch" | "migrate";
	title: string;
	desc: string;
}

export type ListItem =
	| { kind: "project"; project: ProjectMeta }
	| { kind: "action"; action: ActionItem };

export type ProjectOverlayResult =
	| { action: "switch-latest"; project: ProjectMeta }
	| { action: "switch-new"; project: ProjectMeta }
	| { action: "pick-session"; project: ProjectMeta }
	| { action: "migrate"; project: ProjectMeta }
	| { action: "remove"; project: ProjectMeta }
	| { action: "execute-action"; actionId: ActionItem["id"] }
	| undefined;
