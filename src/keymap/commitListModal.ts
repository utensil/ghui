import { context } from "@ghui/keymap"

export interface CommitListModalCtx {
	readonly stepUp: () => void
	readonly stepDown: () => void
	readonly openCommitDiff: () => void
	readonly openInBrowser: () => void
	readonly close: () => void
}

const CommitList = context<CommitListModalCtx>()

export const commitListModalKeymap = CommitList(
	{ id: "commit-list.up", title: "Up", keys: ["up", "k"], run: (s) => s.stepUp() },
	{ id: "commit-list.down", title: "Down", keys: ["down", "j"], run: (s) => s.stepDown() },
	{ id: "commit-list.diff", title: "View diff", keys: ["d", "return"], run: (s) => s.openCommitDiff() },
	{ id: "commit-list.open-browser", title: "Open in browser", keys: ["o"], run: (s) => s.openInBrowser() },
	{ id: "commit-list.close", title: "Close", keys: ["escape"], run: (s) => s.close() },
)
