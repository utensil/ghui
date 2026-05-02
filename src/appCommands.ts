import type { AppCommand } from "./commands.js"
import { defineCommand } from "./commands.js"
import { surfaceLabels, surfaceShortLabels, type AppSurface, type AuxiliaryItem, type AuxiliarySurface, type IssueItem, type LoadStatus, type PullRequestItem } from "./domain.js"
import type { DiffView, DiffWrapMode } from "./ui/diff.js"
import { issueViewEquals, issueViewLabel, issueViewMode, type IssueView } from "./issueViews.js"
import { type PullRequestView, viewEquals, viewLabel, viewMode } from "./pullRequestViews.js"

interface AppCommandActions {
	readonly openCommandPalette: () => void
	readonly refreshPullRequests: (message?: string) => void
	readonly refreshIssues: (message?: string) => void
	readonly refreshAuxiliarySurface: (message?: string) => void
	readonly openFilter: () => void
	readonly clearFilter: () => void
	readonly openThemeModal: () => void
	readonly openRepositoryPicker: () => void
	readonly loadMorePullRequests: () => void
	readonly loadMoreIssues: () => void
	readonly switchViewTo: (view: PullRequestView) => void
	readonly switchIssueViewTo: (view: IssueView) => void
	readonly showPullRequests: () => void
	readonly showIssues: () => void
	readonly showAuxiliarySurface: (surface: AuxiliarySurface) => void
	readonly openDetails: () => void
	readonly closeDetails: () => void
	readonly openDiffView: () => void
	readonly closeDiffView: () => void
	readonly reloadDiff: () => void
	readonly toggleDiffRenderView: () => void
	readonly toggleDiffWrapMode: () => void
	readonly jumpDiffFile: (delta: 1 | -1) => void
	readonly toggleDiffCommentMode: () => void
	readonly openDiffCommentModal: () => void
	readonly togglePullRequestDraftStatus: () => void
	readonly openLabelModal: () => void
	readonly openMergeModal: () => void
	readonly openCloseModal: () => void
	readonly openIssueCommentModal: () => void
	readonly reopenIssue: () => void
	readonly openPullRequestInBrowser: () => void
	readonly openIssueInBrowser: () => void
	readonly openAuxiliaryItemInBrowser: () => void
	readonly copyPullRequestMetadata: () => void
	readonly copyIssueMetadata: () => void
	readonly copyAuxiliaryItemMetadata: () => void
	readonly manageAuxiliaryItem: () => void
	readonly quit: () => void
}

interface BuildAppCommandsInput {
	readonly activeSurface: AppSurface
	readonly pullRequestStatus: LoadStatus
	readonly issueStatus: LoadStatus
	readonly auxiliaryStatus: LoadStatus
	readonly filterQuery: string
	readonly filterMode: boolean
	readonly selectedRepository: string | null
	readonly activeViews: readonly PullRequestView[]
	readonly activeView: PullRequestView
	readonly activeIssueViews: readonly IssueView[]
	readonly activeIssueView: IssueView
	readonly loadedPullRequestCount: number
	readonly hasMorePullRequests: boolean
	readonly isLoadingMorePullRequests: boolean
	readonly loadedIssueCount: number
	readonly hasMoreIssues: boolean
	readonly isLoadingMoreIssues: boolean
	readonly loadedAuxiliaryCount: number
	readonly selectedPullRequest: PullRequestItem | null
	readonly selectedIssue: IssueItem | null
	readonly selectedAuxiliaryItem: AuxiliaryItem | null
	readonly detailFullView: boolean
	readonly diffFullView: boolean
	readonly diffReady: boolean
	readonly effectiveDiffRenderView: DiffView
	readonly diffWrapMode: DiffWrapMode
	readonly readyDiffFileCount: number
	readonly diffFileIndex: number
	readonly diffCommentMode: boolean
	readonly selectedDiffCommentAnchorLabel: string | null
	readonly actions: AppCommandActions
}

export const buildAppCommands = ({
	activeSurface,
	pullRequestStatus,
	issueStatus,
	auxiliaryStatus,
	filterQuery,
	filterMode,
	selectedRepository,
	activeViews,
	activeView,
	activeIssueViews,
	activeIssueView,
	loadedPullRequestCount,
	hasMorePullRequests,
	isLoadingMorePullRequests,
	loadedIssueCount,
	hasMoreIssues,
	isLoadingMoreIssues,
	loadedAuxiliaryCount,
	selectedPullRequest,
	selectedIssue,
	selectedAuxiliaryItem,
	detailFullView,
	diffFullView,
	diffReady,
	effectiveDiffRenderView,
	diffWrapMode,
	readyDiffFileCount,
	diffFileIndex,
	diffCommentMode,
	selectedDiffCommentAnchorLabel,
	actions,
}: BuildAppCommandsInput): readonly AppCommand[] => {
	const selectedPullRequestLabel = selectedPullRequest ? `#${selectedPullRequest.number} ${selectedPullRequest.repository}` : "No pull request selected"
	const noPullRequestReason = selectedPullRequest ? null : "Select a pull request first."
	const noOpenPullRequestReason = selectedPullRequest?.state === "open" ? null : selectedPullRequest ? "Pull request is not open." : noPullRequestReason
	const selectedIssueLabel = selectedIssue ? `#${selectedIssue.number} ${selectedIssue.repository}` : "No issue selected"
	const noIssueReason = selectedIssue ? null : "Select an issue first."
	const noOpenIssueReason = selectedIssue?.state === "open" ? null : selectedIssue ? "Issue is not open." : noIssueReason
	const noClosedIssueReason = selectedIssue?.state === "closed" ? null : selectedIssue ? "Issue is not closed." : noIssueReason
	const selectedAuxiliaryLabel = selectedAuxiliaryItem ? `${selectedAuxiliaryItem.title}${selectedAuxiliaryItem.repository ? ` (${selectedAuxiliaryItem.repository})` : ""}` : "No item selected"
	const noAuxiliaryReason = selectedAuxiliaryItem ? null : "Select an item first."
	const noManageAuxiliaryReason = selectedAuxiliaryItem?.action ? null : selectedAuxiliaryItem ? "Selected item has no inline management action." : noAuxiliaryReason
	const diffReadyReason = selectedPullRequest
		? diffReady ? null : "Load the diff before running this command."
		: noPullRequestReason
	const diffOpenReadyReason = diffFullView ? diffReadyReason : "Open a diff first."
	const loadMoreDisabledReason = isLoadingMorePullRequests
		? "Already loading more pull requests."
		: hasMorePullRequests ? null : "No more pull requests loaded by this view."
	const loadMoreIssuesDisabledReason = isLoadingMoreIssues
		? "Already loading more issues."
		: hasMoreIssues ? null : "No more issues loaded by this view."
	const activeSurfaceLabel = surfaceLabels[activeSurface]

	const forSelected = (
		command: Omit<AppCommand, "subtitle" | "disabledReason"> & { readonly requireOpen?: boolean },
	): AppCommand => {
		const { requireOpen, ...rest } = command
		return defineCommand({
			...rest,
			subtitle: selectedPullRequestLabel,
			disabledReason: activeSurface === "pullRequests" ? requireOpen ? noOpenPullRequestReason : noPullRequestReason : "Switch to pull requests first.",
		})
	}

	const forSelectedIssue = (
		command: Omit<AppCommand, "subtitle" | "disabledReason"> & { readonly requireOpen?: boolean; readonly requireClosed?: boolean },
	): AppCommand => {
		const { requireOpen, requireClosed, ...rest } = command
		return defineCommand({
			...rest,
			subtitle: selectedIssueLabel,
			disabledReason: activeSurface === "issues" ? requireOpen ? noOpenIssueReason : requireClosed ? noClosedIssueReason : noIssueReason : "Switch to issues first.",
		})
	}
	const activeSelectedLabel = activeSurface === "issues"
		? selectedIssueLabel
		: activeSurface === "pullRequests"
			? selectedPullRequestLabel
			: selectedAuxiliaryLabel
	const activeSelectionDisabledReason = activeSurface === "issues"
		? noIssueReason
		: activeSurface === "pullRequests"
			? noPullRequestReason
			: noAuxiliaryReason
	const auxiliarySurfaces = ["notifications", "discussions", "stars", "sharedRepos", "watchedRepos"] as const satisfies readonly AuxiliarySurface[]
	const auxiliaryShortcut = (surface: AuxiliarySurface) => {
		const shortcuts = {
			notifications: "n",
			discussions: "D",
			stars: undefined,
			sharedRepos: undefined,
			watchedRepos: "w",
		} satisfies Record<AuxiliarySurface, string | undefined>
		return shortcuts[surface]
	}

	return [
		defineCommand({
			id: "command.open",
			title: "Open command palette",
			scope: "Global",
			subtitle: "Search every available route through ghui",
			shortcut: "ctrl-p/cmd-k",
			keywords: ["palette", "commands", "deck"],
			run: actions.openCommandPalette,
		}),
		defineCommand({
			id: "pull.refresh",
			title: pullRequestStatus === "error" ? "Retry loading pull requests" : "Refresh pull requests",
			scope: "Global",
			subtitle: "Fetch the latest queue from GitHub",
			shortcut: "r",
			keywords: ["reload", "sync"],
			run: () => actions.refreshPullRequests("Refreshed"),
		}),
		defineCommand({
			id: "issue.refresh",
			title: issueStatus === "error" ? "Retry loading issues" : "Refresh issues",
			scope: "Global",
			subtitle: "Fetch the latest issue queue from GitHub",
			shortcut: "r",
			keywords: ["reload", "sync"],
			run: () => actions.refreshIssues("Refreshed issues"),
		}),
		defineCommand({
			id: "aux.refresh",
			title: auxiliaryStatus === "error" ? `Retry loading ${activeSurfaceLabel}` : `Refresh ${activeSurfaceLabel}`,
			scope: "Global",
			subtitle: `${loadedAuxiliaryCount} loaded`,
			shortcut: "r",
			disabledReason: activeSurface === "pullRequests" || activeSurface === "issues" ? "Switch to a GitHub surface first." : null,
			keywords: ["reload", "sync"],
			run: () => actions.refreshAuxiliarySurface(`Refreshed ${activeSurfaceLabel}`),
		}),
		defineCommand({
			id: "filter.open",
			title: `Filter ${activeSurfaceLabel}`,
			scope: "Global",
			subtitle: "Search the visible queue",
			shortcut: "/",
			keywords: ["search"],
			run: actions.openFilter,
		}),
		defineCommand({
			id: "filter.clear",
			title: `Clear ${activeSurfaceLabel} filter`,
			scope: "Global",
			subtitle: `Show every item in ${activeSurfaceLabel}`,
			shortcut: "esc",
			disabledReason: filterQuery.length > 0 || filterMode ? null : "No filter is active.",
			run: actions.clearFilter,
		}),
		defineCommand({
			id: "theme.open",
			title: "Choose theme",
			scope: "Global",
			subtitle: "Preview and persist a terminal color theme",
			shortcut: "t",
			keywords: ["colors", "appearance"],
			run: actions.openThemeModal,
		}),
		defineCommand({
			id: "surface.pull-requests",
			title: "Show pull requests",
			scope: "View",
			subtitle: activeSurface === "pullRequests" ? "Already showing pull requests" : "Switch to pull request queues",
			shortcut: "p",
			keywords: ["prs", "pulls"],
			disabledReason: activeSurface === "pullRequests" ? "Already showing pull requests." : null,
			run: actions.showPullRequests,
		}),
		defineCommand({
			id: "surface.issues",
			title: "Show issues",
			scope: "View",
			subtitle: activeSurface === "issues" ? "Already showing issues" : "Switch to issue queues",
			shortcut: "i",
			keywords: ["bugs", "tickets"],
			disabledReason: activeSurface === "issues" ? "Already showing issues." : null,
			run: actions.showIssues,
		}),
		...auxiliarySurfaces.map((surface) => {
			const shortcut = auxiliaryShortcut(surface)
			return defineCommand({
				id: `surface.${surface}`,
				title: `Show ${surfaceShortLabels[surface]}`,
				scope: "View" as const,
				subtitle: activeSurface === surface ? `Already showing ${surfaceLabels[surface]}` : `Switch to ${surfaceLabels[surface]}`,
				...(shortcut ? { shortcut } : {}),
				keywords: [surface, surfaceLabels[surface], surfaceShortLabels[surface], "github"],
				disabledReason: activeSurface === surface ? `Already showing ${surfaceLabels[surface]}.` : null,
				run: () => actions.showAuxiliarySurface(surface),
			})
		}),
		defineCommand({
			id: "repository.open",
			title: "Open repository...",
			scope: "View",
			subtitle: selectedRepository ? `Current repository: ${selectedRepository}` : "Enter owner/name or a GitHub URL",
			disabledReason: activeSurface === "notifications" || activeSurface === "stars" || activeSurface === "sharedRepos" || activeSurface === "watchedRepos"
				? "Repository picker is available for pull requests, issues, and discussions."
				: null,
			keywords: ["repo", "repository", "owner", "github"],
			run: actions.openRepositoryPicker,
		}),
		...activeViews.map((view) => defineCommand({
			id: view._tag === "Repository" ? "view.repository" : `view.${view.mode}`,
			title: `Show ${viewLabel(view)} view`,
			scope: "View" as const,
			subtitle: viewEquals(view, activeView) ? "Already showing this view" : "Switch pull request view",
			keywords: [viewMode(view), viewLabel(view), "queue", "view"],
			disabledReason: activeSurface === "pullRequests" && viewEquals(view, activeView) ? "Already showing this view." : null,
			run: () => {
				actions.showPullRequests()
				actions.switchViewTo(view)
			},
		})),
		...activeIssueViews.map((view) => defineCommand({
			id: view._tag === "Repository" ? "issue.view.repository" : `issue.view.${view.mode}`,
			title: `Show ${issueViewLabel(view)} issues`,
			scope: "View" as const,
			subtitle: issueViewEquals(view, activeIssueView) ? "Already showing this issue view" : "Switch issue view",
			keywords: [issueViewMode(view), issueViewLabel(view), "issues", "queue", "view"],
			disabledReason: activeSurface === "issues" && issueViewEquals(view, activeIssueView) ? "Already showing this issue view." : null,
			run: () => {
				actions.showIssues()
				actions.switchIssueViewTo(view)
			},
		})),
		defineCommand({
			id: "pull.load-more",
			title: "Load more pull requests",
			scope: "Navigation",
			subtitle: `${loadedPullRequestCount} loaded`,
			disabledReason: loadMoreDisabledReason,
			keywords: ["next page", "pagination", "more"],
			run: actions.loadMorePullRequests,
		}),
		defineCommand({
			id: "issue.load-more",
			title: "Load more issues",
			scope: "Navigation",
			subtitle: `${loadedIssueCount} loaded`,
			disabledReason: loadMoreIssuesDisabledReason,
			keywords: ["next page", "pagination", "more"],
			run: actions.loadMoreIssues,
		}),
		defineCommand({
			id: "detail.open",
			title: `Open ${activeSurface === "pullRequests" ? "pull request" : activeSurface === "issues" ? "issue" : "item"} details`,
			scope: activeSurface === "issues" ? "Issue" : activeSurface === "pullRequests" ? "Pull request" : "GitHub",
			subtitle: activeSelectedLabel,
			shortcut: "enter",
			disabledReason: activeSelectionDisabledReason,
			run: actions.openDetails,
		}),
		defineCommand({
			id: "detail.close",
			title: "Close details view",
			scope: "View",
			subtitle: "Return to the queue",
			shortcut: "esc",
			disabledReason: detailFullView ? null : "Details view is not open.",
			run: actions.closeDetails,
		}),
		forSelected({
			id: "diff.open",
			title: "Open stacked diff",
			scope: "Diff",
			shortcut: "d",
			keywords: ["files", "patch"],
			run: actions.openDiffView,
		}),
		defineCommand({
			id: "diff.close",
			title: "Close diff view",
			scope: "Diff",
			subtitle: "Return to the queue or detail view",
			shortcut: "esc",
			disabledReason: diffFullView ? null : "Diff view is not open.",
			run: actions.closeDiffView,
		}),
		defineCommand({
			id: "diff.reload",
			title: "Reload diff",
			scope: "Diff",
			subtitle: selectedPullRequestLabel,
			shortcut: "r",
			disabledReason: diffFullView && selectedPullRequest ? null : "Open a pull request diff first.",
			keywords: ["refresh", "comments"],
			run: actions.reloadDiff,
		}),
		defineCommand({
			id: "diff.toggle-view",
			title: "Toggle diff split/unified view",
			scope: "Diff",
			subtitle: effectiveDiffRenderView === "split" ? "Switch to unified view" : "Switch to split view",
			shortcut: "v",
			disabledReason: diffFullView ? null : "Open a diff first.",
			run: actions.toggleDiffRenderView,
		}),
		defineCommand({
			id: "diff.toggle-wrap",
			title: "Toggle diff word wrap",
			scope: "Diff",
			subtitle: diffWrapMode === "none" ? "Wrap long diff lines" : "Keep diff lines unwrapped",
			shortcut: "w",
			disabledReason: diffFullView ? null : "Open a diff first.",
			run: actions.toggleDiffWrapMode,
		}),
		defineCommand({
			id: "diff.next-file",
			title: "Next diff file",
			scope: "Diff",
			subtitle: readyDiffFileCount > 0 ? `${diffFileIndex + 1}/${readyDiffFileCount}` : "No diff files loaded",
			shortcut: "]",
			disabledReason: diffFullView && readyDiffFileCount > 0 ? null : diffOpenReadyReason,
			run: () => actions.jumpDiffFile(1),
		}),
		defineCommand({
			id: "diff.previous-file",
			title: "Previous diff file",
			scope: "Diff",
			subtitle: readyDiffFileCount > 0 ? `${diffFileIndex + 1}/${readyDiffFileCount}` : "No diff files loaded",
			shortcut: "[",
			disabledReason: diffFullView && readyDiffFileCount > 0 ? null : diffOpenReadyReason,
			run: () => actions.jumpDiffFile(-1),
		}),
		defineCommand({
			id: "diff.comment-mode",
			title: diffCommentMode ? "Exit diff comment mode" : "Enter diff comment mode",
			scope: "Diff",
			subtitle: diffCommentMode ? "Return to diff scrolling" : "Choose a line to comment on",
			shortcut: "c",
			disabledReason: diffFullView && diffReady ? null : diffOpenReadyReason,
			keywords: ["review", "comment", "line"],
			run: actions.toggleDiffCommentMode,
		}),
		defineCommand({
			id: "diff.add-comment",
			title: "Add comment on selected diff line",
			scope: "Diff",
			subtitle: selectedDiffCommentAnchorLabel ?? "No diff line selected",
			shortcut: "a",
			disabledReason: diffCommentMode && selectedDiffCommentAnchorLabel ? null : "Enter diff comment mode and select a line first.",
			keywords: ["review", "reply"],
			run: actions.openDiffCommentModal,
		}),
		forSelected({
			id: "pull.toggle-draft",
			title: selectedPullRequest?.reviewStatus === "draft" ? "Mark ready for review" : "Mark as draft",
			scope: "Pull request",
			shortcut: "s",
			keywords: ["state", "ready"],
			run: actions.togglePullRequestDraftStatus,
		}),
		forSelected({
			id: "pull.labels",
			title: "Manage labels",
			scope: "Pull request",
			shortcut: "l",
			run: actions.openLabelModal,
		}),
		forSelected({
			id: "pull.merge",
			title: "Merge pull request",
			scope: "Pull request",
			shortcut: "m",
			keywords: ["auto merge", "squash"],
			run: actions.openMergeModal,
		}),
		forSelected({
			id: "pull.close",
			title: "Close pull request",
			scope: "Pull request",
			shortcut: "x",
			requireOpen: true,
			run: actions.openCloseModal,
		}),
		forSelected({
			id: "pull.open-browser",
			title: "Open pull request in browser",
			scope: "Pull request",
			shortcut: "o",
			keywords: ["github", "web"],
			run: actions.openPullRequestInBrowser,
		}),
		forSelected({
			id: "pull.copy-metadata",
			title: "Copy pull request metadata",
			scope: "Pull request",
			shortcut: "y",
			keywords: ["clipboard", "url", "title"],
			run: actions.copyPullRequestMetadata,
		}),
		forSelectedIssue({
			id: "issue.comment",
			title: "Comment on issue",
			scope: "Issue",
			shortcut: "c",
			requireOpen: true,
			keywords: ["reply", "respond"],
			run: actions.openIssueCommentModal,
		}),
		forSelectedIssue({
			id: "issue.labels",
			title: "Manage issue labels",
			scope: "Issue",
			shortcut: "l",
			run: actions.openLabelModal,
		}),
		forSelectedIssue({
			id: "issue.close",
			title: "Close issue",
			scope: "Issue",
			shortcut: "x",
			requireOpen: true,
			run: actions.openCloseModal,
		}),
		forSelectedIssue({
			id: "issue.reopen",
			title: "Reopen issue",
			scope: "Issue",
			shortcut: "u",
			requireClosed: true,
			run: actions.reopenIssue,
		}),
		forSelectedIssue({
			id: "issue.open-browser",
			title: "Open issue in browser",
			scope: "Issue",
			shortcut: "o",
			keywords: ["github", "web"],
			run: actions.openIssueInBrowser,
		}),
		forSelectedIssue({
			id: "issue.copy-metadata",
			title: "Copy issue metadata",
			scope: "Issue",
			shortcut: "y",
			keywords: ["clipboard", "url", "title"],
			run: actions.copyIssueMetadata,
		}),
		defineCommand({
			id: "aux.open-browser",
			title: "Open selected item in browser",
			scope: "GitHub",
			subtitle: selectedAuxiliaryLabel,
			shortcut: "o",
			disabledReason: activeSurface === "pullRequests" || activeSurface === "issues" ? "Switch to a GitHub surface first." : noAuxiliaryReason,
			keywords: ["github", "web", "repository"],
			run: actions.openAuxiliaryItemInBrowser,
		}),
		defineCommand({
			id: "aux.copy-metadata",
			title: "Copy selected item metadata",
			scope: "GitHub",
			subtitle: selectedAuxiliaryLabel,
			shortcut: "y",
			disabledReason: activeSurface === "pullRequests" || activeSurface === "issues" ? "Switch to a GitHub surface first." : noAuxiliaryReason,
			keywords: ["clipboard", "url", "title"],
			run: actions.copyAuxiliaryItemMetadata,
		}),
		defineCommand({
			id: "aux.manage",
			title: selectedAuxiliaryItem?.action === "mark-notification-read"
				? "Mark notification read"
				: selectedAuxiliaryItem?.action === "unstar-repository"
					? "Unstar repository"
					: selectedAuxiliaryItem?.action === "unwatch-repository"
						? "Unwatch repository"
						: "Manage selected item",
			scope: "GitHub",
			subtitle: selectedAuxiliaryLabel,
			shortcut: "x",
			disabledReason: activeSurface === "pullRequests" || activeSurface === "issues" ? "Switch to a GitHub surface first." : noManageAuxiliaryReason,
			keywords: ["remove", "read", "unstar", "unwatch"],
			run: actions.manageAuxiliaryItem,
		}),
		defineCommand({
			id: "app.quit",
			title: "Quit ghui",
			scope: "System",
			subtitle: "Leave the terminal UI",
			shortcut: "q",
			keywords: ["exit"],
			run: actions.quit,
		}),
	]
}
