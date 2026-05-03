import { describe, expect, test } from "bun:test"
import { buildAppCommands } from "../src/appCommands.js"
import type { AuxiliaryItem, PullRequestItem } from "../src/domain.js"
import type { IssueView } from "../src/issueViews.js"
import type { PullRequestView } from "../src/pullRequestViews.js"

const noop = () => {}
const queueView = { _tag: "Queue", mode: "authored", repository: null } satisfies PullRequestView
const issueView = { _tag: "Queue", mode: "assigned", repository: null } satisfies IssueView
type BuildAppCommandsInput = Parameters<typeof buildAppCommands>[0]
type AppCommandActions = BuildAppCommandsInput["actions"]

const repositoryItem = (repository: string): AuxiliaryItem => ({
	id: `myRepos:${repository}`,
	surface: "myRepos",
	repository,
	number: null,
	title: repository.split("/")[1] ?? repository,
	subtitle: repository,
	body: "Repository description.",
	itemType: "repository",
	state: "public",
	author: null,
	url: `https://github.com/${repository}`,
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	meta: ["public"],
	action: null,
})

const defaultActions: AppCommandActions = {
	openCommandPalette: noop,
	refreshPullRequests: noop,
	refreshIssues: noop,
	refreshAuxiliarySurface: noop,
	openFilter: noop,
	clearFilter: noop,
	openThemeModal: noop,
	openRepositoryPicker: noop,
	loadMorePullRequests: noop,
	loadMoreIssues: noop,
	switchViewTo: noop,
	switchIssueViewTo: noop,
	showPullRequests: noop,
	showIssues: noop,
	showAuxiliarySurface: noop,
	viewRepositoryPullRequests: noop,
	viewRepositoryIssues: noop,
	viewRepositoryDiscussions: noop,
	viewRepositoryNotifications: noop,
	openDetails: noop,
	closeDetails: noop,
	openDiffView: noop,
	closeDiffView: noop,
	reloadDiff: noop,
	toggleDiffRenderView: noop,
	toggleDiffWrapMode: noop,
	toggleDiffWhitespaceMode: noop,
	openChangedFilesModal: noop,
	jumpDiffFile: noop,
	toggleDiffCommentMode: noop,
	openSelectedDiffComment: noop,
	toggleDiffCommentRange: noop,
	moveDiffCommentThread: noop,
	openDiffCommentModal: noop,
	openSubmitReviewModal: noop,
	togglePullRequestDraftStatus: noop,
	openLabelModal: noop,
	openMergeModal: noop,
	openCloseModal: noop,
	openIssueCommentModal: noop,
	reopenIssue: noop,
	openPullRequestInBrowser: noop,
	openIssueInBrowser: noop,
	openAuxiliaryItemInBrowser: noop,
	copyPullRequestMetadata: noop,
	copyIssueMetadata: noop,
	copyAuxiliaryItemMetadata: noop,
	manageAuxiliaryItem: noop,
	quit: noop,
}

const commandsFor = (overrides: Partial<BuildAppCommandsInput> = {}) => buildAppCommands({
	activeSurface: "myRepos",
	pullRequestStatus: "ready",
	issueStatus: "ready",
	auxiliaryStatus: "ready",
	filterQuery: "",
	filterMode: false,
	selectedRepository: null,
	activeAuxiliaryRepository: null,
	activeViews: [queueView],
	activeView: queueView,
	activeIssueViews: [issueView],
	activeIssueView: issueView,
	loadedPullRequestCount: 0,
	hasMorePullRequests: false,
	isLoadingMorePullRequests: false,
	loadedIssueCount: 0,
	hasMoreIssues: false,
	isLoadingMoreIssues: false,
	loadedAuxiliaryCount: 1,
	selectedPullRequest: null,
	selectedIssue: null,
	selectedAuxiliaryItem: repositoryItem("owner/repo"),
	detailFullView: false,
	diffFullView: false,
	diffReady: false,
	effectiveDiffRenderView: "unified",
	diffWrapMode: "none",
	diffWhitespaceMode: "ignore",
	readyDiffFileCount: 0,
	diffFileIndex: 0,
	diffCommentMode: false,
	selectedDiffCommentAnchorLabel: null,
	selectedDiffCommentThreadCount: 0,
	hasDiffCommentThreads: false,
	actions: defaultActions,
	...overrides,
})

describe("app commands", () => {
	test("exposes all top-level GitHub surfaces", () => {
		const ids = commandsFor().map((command) => command.id)
		expect(ids).toContain("surface.issues")
		expect(ids).toContain("surface.pull-requests")
		expect(ids).toContain("surface.notifications")
		expect(ids).toContain("surface.discussions")
		expect(ids).toContain("surface.myRepos")
		expect(ids).toContain("surface.stars")
		expect(ids).toContain("surface.sharedRepos")
		expect(ids).toContain("surface.watchedRepos")
	})

	test("exposes repository-scoped lane jumps for the selected repository", () => {
		const byId = new Map(commandsFor().map((command) => [command.id, command]))

		expect(byId.get("repository.view-pull-requests")?.disabledReason).toBeNull()
		expect(byId.get("repository.view-issues")?.disabledReason).toBeNull()
		expect(byId.get("repository.view-discussions")?.disabledReason).toBeNull()
		expect(byId.get("repository.view-notifications")?.disabledReason).toBeNull()
	})

	test("repository lane commands run with the selected repository", () => {
		const routed: string[] = []
		const byId = new Map(commandsFor({
			actions: {
				...defaultActions,
				viewRepositoryPullRequests: (repository) => routed.push(`prs:${repository}`),
				viewRepositoryIssues: (repository) => routed.push(`issues:${repository}`),
				viewRepositoryDiscussions: (repository) => routed.push(`discussions:${repository}`),
				viewRepositoryNotifications: (repository) => routed.push(`notifications:${repository}`),
			},
		}).map((command) => [command.id, command]))

		byId.get("repository.view-pull-requests")?.run()
		byId.get("repository.view-issues")?.run()
		byId.get("repository.view-discussions")?.run()
		byId.get("repository.view-notifications")?.run()

		expect(routed).toEqual([
			"prs:owner/repo",
			"issues:owner/repo",
			"discussions:owner/repo",
			"notifications:owner/repo",
		])
	})

	test("repo-filtered notifications can return to all notifications from the palette", () => {
		const command = commandsFor({
			activeSurface: "notifications",
			activeAuxiliaryRepository: "owner/repo",
			selectedAuxiliaryItem: repositoryItem("owner/repo"),
		}).find((entry) => entry.id === "surface.notifications")

		expect(command?.title).toBe("Show all notifications")
		expect(command?.disabledReason).toBeNull()
	})
})

// ====== Upstream review UX tests ======

const activeView = { _tag: "Queue", mode: "review", repository: null } as const
const selectedPullRequest: PullRequestItem = {
	repository: "owner/repo",
	author: "kit",
	headRefOid: "abc123",
	number: 42,
	title: "Review UX",
	body: "",
	labels: [],
	additions: 1,
	deletions: 1,
	changedFiles: 2,
	state: "open",
	reviewStatus: "review",
	checkStatus: "passing",
	checkSummary: "1/1",
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/42",
}

const buildCommands = (overrides: Partial<Parameters<typeof buildAppCommands>[0]> = {}) =>
	buildAppCommands({
		activeSurface: "pullRequests",
		pullRequestStatus: "ready",
		issueStatus: "ready",
		auxiliaryStatus: "ready",
		filterQuery: "",
		filterMode: false,
		selectedRepository: null,
		activeAuxiliaryRepository: null,
		activeViews: [activeView],
		activeView,
		activeIssueViews: [],
		activeIssueView: null,
		loadedPullRequestCount: 1,
		hasMorePullRequests: false,
		isLoadingMorePullRequests: false,
		loadedIssueCount: 0,
		hasMoreIssues: false,
		isLoadingMoreIssues: false,
		loadedAuxiliaryCount: 0,
		selectedPullRequest,
		selectedIssue: null,
		selectedAuxiliaryItem: null,
		detailFullView: false,
		diffFullView: true,
		diffReady: true,
		effectiveDiffRenderView: "split",
		diffWrapMode: "none",
		diffWhitespaceMode: "ignore",
		readyDiffFileCount: 2,
		diffFileIndex: 0,
		diffRangeActive: false,
		selectedDiffCommentAnchorLabel: "→ +1",
		selectedDiffCommentThreadCount: 0,
		hasDiffCommentThreads: false,
		actions: {
			openCommandPalette: noop,
			refreshPullRequests: noop,
			openFilter: noop,
			clearFilter: noop,
			openThemeModal: noop,
			openRepositoryPicker: noop,
			loadMorePullRequests: noop,
			switchViewTo: noop,
			openDetails: noop,
			closeDetails: noop,
			openDiffView: noop,
			closeDiffView: noop,
			reloadDiff: noop,
			toggleDiffRenderView: noop,
			toggleDiffWrapMode: noop,
			toggleDiffWhitespaceMode: noop,
			openChangedFilesModal: noop,
			jumpDiffFile: noop,
			openSelectedDiffComment: noop,
			toggleDiffCommentRange: noop,
			moveDiffCommentThread: noop,
			openDiffCommentModal: noop,
			openSubmitReviewModal: noop,
			togglePullRequestDraftStatus: noop,
			openLabelModal: noop,
			openMergeModal: noop,
			openCloseModal: noop,
			openPullRequestInBrowser: noop,
			copyPullRequestMetadata: noop,
			quit: noop,
		},
		...overrides,
	})

const commandById = (id: string, overrides?: Partial<Parameters<typeof buildAppCommands>[0]>) => {
	const command = buildCommands(overrides).find((entry) => entry.id === id)
	if (!command) throw new Error(`Missing command ${id}`)
	return command
}

describe("review UX commands", () => {
	test("changed-files navigator is available from a ready diff", () => {
		const command = commandById("diff.changed-files")

		expect(command.shortcut).toBe("f")
		expect(command.disabledReason).toBeFalsy()
	})

	test("changed-files navigator is disabled when no files are loaded", () => {
		expect(commandById("diff.changed-files", { readyDiffFileCount: 0 }).disabledReason).toBe("No changed files loaded.")
	})

	test("submit-review command is available from an open pull request", () => {
		const command = commandById("pull.submit-review", { diffFullView: false, diffReady: false })

		expect(command.shortcut).toBe("shift-r")
		expect(command.disabledReason).toBeFalsy()
	})

	test("submit-review command requires an open pull request", () => {
		expect(
			commandById("pull.submit-review", {
				selectedPullRequest: { ...selectedPullRequest, state: "closed" },
			}).disabledReason,
		).toBe("Pull request is not open.")
	})
})
