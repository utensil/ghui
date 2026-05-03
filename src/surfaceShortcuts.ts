import { auxiliarySurfaces, type AppSurface } from "./domain.js"

export const surfaceShortcutLabels = {
	issues: "i",
	pullRequests: "p",
	notifications: "n",
	discussions: "D",
	myRepos: "U",
	stars: "f",
	sharedRepos: "H",
	watchedRepos: "w",
} as const satisfies Record<AppSurface, string>

export const surfaceShortcutKeys = {
	issues: "i",
	pullRequests: "p",
	notifications: "n",
	discussions: "shift+d",
	myRepos: "shift+u",
	stars: "f",
	sharedRepos: "shift+h",
	watchedRepos: "w",
} as const satisfies Record<AppSurface, string>

const surfaceShortcutHintOrder = ["issues", "pullRequests", ...auxiliarySurfaces] as const satisfies readonly AppSurface[]

export const surfaceShortcutHint = surfaceShortcutHintOrder.map((surface) => surfaceShortcutLabels[surface]).join("/")
