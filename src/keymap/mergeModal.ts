import { context } from "@ghui/keymap"

export interface MergeModalCtx {
	readonly availableActionCount: number
	readonly closeModal: () => void
	readonly confirmMerge: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const Merge = context<MergeModalCtx>()

export const mergeModalKeymap = Merge(
	{ id: "merge-modal.cancel", title: "Cancel", keys: ["escape"], run: (s) => s.closeModal() },
	{
		id: "merge-modal.confirm",
		title: "Merge pull request",
		keys: ["return"],
		enabled: (s) => (s.availableActionCount > 0 ? true : "No merge actions available."),
		run: (s) => s.confirmMerge(),
	},
	{ id: "merge-modal.up", title: "Up", keys: ["k", "up"], run: (s) => s.moveSelection(-1) },
	{ id: "merge-modal.down", title: "Down", keys: ["j", "down"], run: (s) => s.moveSelection(1) },
)
