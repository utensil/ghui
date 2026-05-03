import { context } from "@ghui/keymap"

/**
 * Single-method-per-binding interface. Each `move*` / `delete*` is a discrete
 * editor command; the App constructs the context so each method applies the
 * appropriate `editorState → editorState` transform via the existing
 * `editComment` helper.
 */
export interface CommentModalCtx {
	readonly closeModal: () => void
	readonly submit: () => void
	readonly insertNewline: () => void
	readonly moveLeft: () => void
	readonly moveRight: () => void
	readonly moveUp: () => void
	readonly moveDown: () => void
	readonly moveLineStart: () => void
	readonly moveLineEnd: () => void
	readonly moveWordBackward: () => void
	readonly moveWordForward: () => void
	readonly backspace: () => void
	readonly deleteForward: () => void
	readonly deleteWordBackward: () => void
	readonly deleteWordForward: () => void
	readonly deleteToLineStart: () => void
	readonly deleteToLineEnd: () => void
}

const Comment = context<CommentModalCtx>()

export const commentModalKeymap = Comment(
	{ id: "comment.escape", title: "Cancel", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "comment.submit", title: "Submit", keys: ["ctrl+s", "return"], run: (s) => s.submit() },
	{ id: "comment.newline", title: "Insert newline", keys: ["shift+return"], run: (s) => s.insertNewline() },

	// Cursor movement
	{ id: "comment.move-left", title: "Cursor left", keys: ["left", "ctrl+b"], run: (s) => s.moveLeft() },
	{ id: "comment.move-right", title: "Cursor right", keys: ["right", "ctrl+f"], run: (s) => s.moveRight() },
	{ id: "comment.move-up", title: "Cursor up", keys: ["up"], run: (s) => s.moveUp() },
	{ id: "comment.move-down", title: "Cursor down", keys: ["down"], run: (s) => s.moveDown() },
	{ id: "comment.line-start", title: "Line start", keys: ["home", "ctrl+a"], run: (s) => s.moveLineStart() },
	{ id: "comment.line-end", title: "Line end", keys: ["end", "ctrl+e"], run: (s) => s.moveLineEnd() },
	{
		id: "comment.word-back",
		title: "Word backward",
		keys: ["meta+b", "meta+left"],
		run: (s) => s.moveWordBackward(),
	},
	{
		id: "comment.word-forward",
		title: "Word forward",
		keys: ["meta+f", "meta+right"],
		run: (s) => s.moveWordForward(),
	},

	// Deletion
	{ id: "comment.backspace", title: "Backspace", keys: ["backspace"], run: (s) => s.backspace() },
	{ id: "comment.delete", title: "Delete", keys: ["delete", "ctrl+d"], run: (s) => s.deleteForward() },
	{
		id: "comment.delete-word-back",
		title: "Delete word backward",
		keys: ["ctrl+w", "meta+backspace"],
		run: (s) => s.deleteWordBackward(),
	},
	{
		id: "comment.delete-word-forward",
		title: "Delete word forward",
		keys: ["meta+delete"],
		run: (s) => s.deleteWordForward(),
	},
	{ id: "comment.delete-to-line-start", title: "Delete to line start", keys: ["ctrl+u"], run: (s) => s.deleteToLineStart() },
	{ id: "comment.delete-to-line-end", title: "Delete to line end", keys: ["ctrl+k"], run: (s) => s.deleteToLineEnd() },
)
