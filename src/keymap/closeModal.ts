import { context } from "@ghui/keymap"

export interface CloseModalCtx {
	readonly closeModal: () => void
	readonly confirmClose: () => void
}

const Close = context<CloseModalCtx>()

export const closeModalKeymap = Close(
	{ id: "close-modal.cancel", title: "Cancel", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "close-modal.confirm", title: "Close pull request", keys: ["return"], run: (s) => s.confirmClose() },
)
