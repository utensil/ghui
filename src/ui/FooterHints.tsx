import { Data } from "effect"
import type { AppSurface } from "../domain.js"
import { colors } from "./colors.js"
import { HintRow, type HintItem } from "./primitives.js"

export type RetryProgress = Data.TaggedEnum<{
	Idle: {}
	Retrying: { readonly attempt: number; readonly max: number }
}>

export const RetryProgress = Data.taggedEnum<RetryProgress>()
export const initialRetryProgress: RetryProgress = RetryProgress.Idle()

interface HintsContext {
	readonly surface?: AppSurface
	readonly filterEditing: boolean
	readonly showFilterClear: boolean
	readonly detailFullView: boolean
	readonly diffFullView: boolean
	readonly diffCommentMode: boolean
	readonly hasSelection: boolean
	readonly canCloseSelection: boolean
	readonly canReopenSelection?: boolean
	readonly canCommentSelection?: boolean
	readonly canManageSelection?: boolean
	readonly hasError: boolean
	readonly isLoading: boolean
	readonly loadingIndicator: string
	readonly retryProgress: RetryProgress
}

const filterEditingHints: readonly HintItem[] = [
	{ key: "search", label: "typing" },
	{ key: "↑↓", label: "move" },
	{ key: "enter", label: "apply" },
	{ key: "esc", label: "cancel" },
	{ key: "ctrl-u", label: "clear" },
	{ key: "ctrl-w", label: "word" },
]

const diffCommentModeHints: readonly HintItem[] = [
	{ key: "↑↓", label: "line" },
	{ key: "pgup/pgdn", label: "jump" },
	{ key: "←→", label: "side" },
	{ key: "enter", label: "open" },
	{ key: "a", label: "comment" },
	{ key: "c", label: "done" },
	{ key: "[]", label: "files" },
	{ key: "esc", label: "back" },
]

const diffViewHints: readonly HintItem[] = [
	{ key: "esc", label: "back" },
	{ key: "v", label: "view" },
	{ key: "w", label: "wrap" },
	{ key: "c", label: "comment" },
	{ key: "[]", label: "files" },
	{ key: "r", label: "reload" },
	{ key: "o", label: "open" },
	{ key: "q", label: "quit" },
]

const isPullRequestSurface = (surface: AppSurface | undefined) => surface === "pullRequests"
const isQueueSurface = (surface: AppSurface | undefined) => isPullRequestSurface(surface) || surface === "issues"

const detailFullViewHints = (ctx: HintsContext): readonly HintItem[] => [
	{ key: "esc", label: "back" },
	{ key: "↑↓", label: "scroll" },
	{ key: "r", label: ctx.hasError ? "retry" : "refresh" },
	{ key: "t", label: "theme" },
	{ key: "tab", label: "queue", when: isQueueSurface(ctx.surface) },
	{ key: "i/p/n", label: "surface" },
	{ key: "c", label: "comment", when: ctx.canCommentSelection ?? false },
	{ key: "s", label: "state", when: isPullRequestSurface(ctx.surface) && ctx.hasSelection },
	{ key: "d", label: "diff", when: isPullRequestSurface(ctx.surface) && ctx.hasSelection },
	{ key: "l", label: "labels", when: isQueueSurface(ctx.surface) && ctx.hasSelection },
	{ key: "m", label: "merge", when: isPullRequestSurface(ctx.surface) && ctx.hasSelection },
	{ key: "x", label: isQueueSurface(ctx.surface) ? "close" : "manage", when: ctx.hasSelection && (ctx.canCloseSelection || (ctx.canManageSelection ?? false)) },
	{ key: "u", label: "reopen", when: ctx.hasSelection && (ctx.canReopenSelection ?? false) },
	{ key: "o", label: "open" },
	{ key: "y", label: "copy" },
	{ key: "q", label: "quit" },
]

const defaultHints = (ctx: HintsContext): readonly HintItem[] => {
	const retrying = ctx.retryProgress._tag === "Retrying"
	return [
		{ key: "/", label: "filter" },
		{ key: "t", label: "theme" },
		{ key: "esc", label: "clear", when: ctx.showFilterClear },
		{ key: "retry", label: retrying ? `${(ctx.retryProgress as { attempt: number; max: number }).attempt}/${(ctx.retryProgress as { attempt: number; max: number }).max}` : "", when: retrying, keyFg: colors.status.pending },
		{ key: ctx.loadingIndicator, label: "loading", when: !retrying && ctx.isLoading, keyFg: colors.status.pending },
		{ key: "r", label: "retry", when: ctx.hasError },
		{ key: "tab", label: "queue", when: isQueueSurface(ctx.surface) },
		{ key: "i/p/n", label: "surface" },
		{ key: "c", label: "comment", when: ctx.canCommentSelection ?? false },
		{ key: "d", label: "diff", when: isPullRequestSurface(ctx.surface) && ctx.hasSelection },
		{ key: "l", label: "labels", when: isQueueSurface(ctx.surface) && ctx.hasSelection },
		{ key: "m", label: "merge", when: isPullRequestSurface(ctx.surface) && ctx.hasSelection },
		{ key: "x", label: isQueueSurface(ctx.surface) ? "close" : "manage", when: ctx.hasSelection && (ctx.canCloseSelection || (ctx.canManageSelection ?? false)) },
		{ key: "u", label: "reopen", when: ctx.hasSelection && (ctx.canReopenSelection ?? false) },
		{ key: "o", label: "open", when: ctx.hasSelection },
		{ key: "y", label: "copy", when: ctx.hasSelection },
		{ key: "ctrl-p", label: "commands" },
	]
}

const footerHints = (ctx: HintsContext): readonly HintItem[] => {
	if (ctx.filterEditing) return filterEditingHints
	if (ctx.diffFullView) return ctx.diffCommentMode ? diffCommentModeHints : diffViewHints
	if (ctx.detailFullView) return detailFullViewHints(ctx)
	return defaultHints(ctx)
}

export const FooterHints = (props: HintsContext) => <HintRow items={footerHints(props)} />
