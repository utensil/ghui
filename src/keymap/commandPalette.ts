import { context } from "@ghui/keymap"

export interface CommandPaletteCtx {
	readonly closeModal: () => void
	readonly runSelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const Palette = context<CommandPaletteCtx>()

export const commandPaletteKeymap = Palette(
	{ id: "palette.close", title: "Close palette", keys: ["escape", "ctrl+c"], run: (s) => s.closeModal() },
	{ id: "palette.run", title: "Run command", keys: ["return"], run: (s) => s.runSelected() },
	{ id: "palette.up", title: "Up", keys: ["up", "ctrl+p", "ctrl+k"], run: (s) => s.moveSelection(-1) },
	{ id: "palette.down", title: "Down", keys: ["down", "ctrl+n", "ctrl+j"], run: (s) => s.moveSelection(1) },
)
