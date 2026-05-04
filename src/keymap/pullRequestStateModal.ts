import { context } from "@ghui/keymap"

export interface PullRequestStateModalCtx {
	readonly closeModal: () => void
	readonly confirmStateChange: () => void
	readonly moveSelection: (delta: 1 | -1) => void
}

const PullRequestState = context<PullRequestStateModalCtx>()

export const pullRequestStateModalKeymap = PullRequestState(
	{ id: "pull-state.cancel", title: "Cancel state change", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "pull-state.up", title: "Move up", keys: ["up", "k"], run: (s) => s.moveSelection(-1) },
	{ id: "pull-state.down", title: "Move down", keys: ["down", "j"], run: (s) => s.moveSelection(1) },
	{ id: "pull-state.confirm", title: "Apply state change", keys: ["return"], run: (s) => s.confirmStateChange() },
)
