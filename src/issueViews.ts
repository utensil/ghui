import { issueQueueLabels, issueQueueModes, type IssueQueueMode, type IssueUserQueueMode } from "./domain.js"

export type IssueView =
	| { readonly _tag: "Repository"; readonly repository: string }
	| { readonly _tag: "Queue"; readonly mode: IssueUserQueueMode; readonly repository: string | null }

export const initialIssueView = (repository: string | null): IssueView => repository
	? { _tag: "Repository", repository }
	: { _tag: "Queue", mode: "assigned", repository: null }

export const issueViewMode = (view: IssueView): IssueQueueMode => view._tag === "Repository" ? "repository" : view.mode

export const issueViewRepository = (view: IssueView) => view.repository

export const issueViewCacheKey = (view: IssueView) => view._tag === "Repository" ? `repository:${view.repository}` : view.mode

export const issueViewEquals = (left: IssueView, right: IssueView) =>
	left._tag === right._tag && issueViewMode(left) === issueViewMode(right) && left.repository === right.repository

export const activeIssueViews = (view: IssueView): readonly IssueView[] => {
	const repository = issueViewRepository(view)
	return [
		...(repository ? [{ _tag: "Repository" as const, repository }] : []),
		...issueQueueModes.map((mode) => ({ _tag: "Queue" as const, mode, repository })),
	]
}

export const nextIssueView = (view: IssueView, views: readonly IssueView[], delta: 1 | -1) => {
	const index = Math.max(0, views.findIndex((candidate) => issueViewEquals(candidate, view)))
	return views[(index + delta + views.length) % views.length]!
}

export const issueViewLabel = (view: IssueView) => view._tag === "Repository" ? view.repository : issueQueueLabels[view.mode]
