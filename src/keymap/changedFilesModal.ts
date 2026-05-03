import { context } from "@ghui/keymap"

export interface ChangedFilesModalCtx {
	readonly hasResults: boolean
	readonly closeModal: () => void
	readonly selectFile: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const ChangedFiles = context<ChangedFilesModalCtx>()

export const changedFilesModalKeymap = ChangedFiles(
	{ id: "changed-files.close", title: "Close", keys: ["escape"], run: (s) => s.closeModal() },
	{
		id: "changed-files.select",
		title: "Jump to file",
		keys: ["return"],
		enabled: (s) => (s.hasResults ? true : "No matching files."),
		run: (s) => s.selectFile(),
	},
	{ id: "changed-files.up", title: "Up", keys: ["k", "up", "ctrl+p", "ctrl+k"], run: (s) => s.moveSelection(-1) },
	{ id: "changed-files.down", title: "Down", keys: ["j", "down", "ctrl+n", "ctrl+j"], run: (s) => s.moveSelection(1) },
)
