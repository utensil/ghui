import { context } from "@ghui/keymap"

export interface OpenRepositoryModalCtx {
	readonly closeModal: () => void
	readonly openFromInput: () => void
}

const OpenRepo = context<OpenRepositoryModalCtx>()

export const openRepositoryModalKeymap = OpenRepo(
	{ id: "open-repo.close", title: "Cancel", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "open-repo.open", title: "Open repository", keys: ["return"], run: (s) => s.openFromInput() },
)
