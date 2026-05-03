import { context } from "@ghui/keymap"

export interface LabelModalCtx {
	readonly closeModal: () => void
	readonly toggleSelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const Label = context<LabelModalCtx>()

export const labelModalKeymap = Label(
	{ id: "label-modal.close", title: "Close", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "label-modal.toggle", title: "Toggle label", keys: ["return"], run: (s) => s.toggleSelected() },
	{ id: "label-modal.up", title: "Up", keys: ["k", "up", "ctrl+p", "ctrl+k"], run: (s) => s.moveSelection(-1) },
	{ id: "label-modal.down", title: "Down", keys: ["j", "down", "ctrl+n", "ctrl+j"], run: (s) => s.moveSelection(1) },
)
