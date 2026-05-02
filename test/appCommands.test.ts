import { describe, expect, test } from "bun:test"
import { buildAppCommands } from "../src/appCommands.ts"
import type { AuxiliaryItem } from "../src/domain.ts"
import type { IssueView } from "../src/issueViews.ts"
import type { PullRequestView } from "../src/pullRequestViews.ts"

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
	jumpDiffFile: noop,
	toggleDiffCommentMode: noop,
	openDiffCommentModal: noop,
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
	readyDiffFileCount: 0,
	diffFileIndex: 0,
	diffCommentMode: false,
	selectedDiffCommentAnchorLabel: null,
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
