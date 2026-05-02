import { Effect, Layer } from "effect"
import type { AuxiliaryItem, AuxiliarySurface, CheckItem, CreatePullRequestCommentInput, IssueComment, IssueItem, IssuePage, IssueQueueMode, Mergeable, PullRequestItem, PullRequestLabel, PullRequestMergeInfo, PullRequestPage, PullRequestQueueMode, PullRequestReviewComment, ReviewStatus } from "../domain.js"
import { GitHubService } from "./GitHubService.js"

export interface MockOptions {
	readonly prCount: number
	readonly repoCount?: number
	readonly username?: string
	readonly seed?: number
}

const REVIEW_CYCLE: readonly ReviewStatus[] = ["approved", "changes", "review", "none", "draft"]
const MERGEABLE_CYCLE: readonly Mergeable[] = ["mergeable", "conflicting", "unknown"]

const synthCheckSummary = (passed: number, total: number): Pick<PullRequestItem, "checkStatus" | "checkSummary" | "checks"> => {
	const checks: readonly CheckItem[] = Array.from({ length: total }, (_, index) => ({
		name: `check-${index}`,
		status: "completed",
		conclusion: index < passed ? "success" : "failure",
	}))
	if (total === 0) return { checkStatus: "none", checkSummary: null, checks: [] }
	if (passed === total) return { checkStatus: "passing", checkSummary: `${passed}/${total}`, checks }
	return { checkStatus: "failing", checkSummary: `${passed}/${total}`, checks }
}

const synthLabels = (index: number): readonly PullRequestLabel[] => {
	if (index % 5 === 0) return [{ name: "bug", color: "#d73a4a" }]
	if (index % 7 === 0) return [{ name: "enhancement", color: "#a2eeef" }, { name: "tests", color: "#0e8a16" }]
	return []
}

const buildPullRequest = (index: number, options: Required<MockOptions>): PullRequestItem => {
	const repoIndex = index % options.repoCount
	const repository = `mock-org/repo-${repoIndex}`
	const number = 1000 + index
	const total = 8 + (index % 5)
	const passed = total - (index % 3 === 0 ? 1 : 0)
	const review = REVIEW_CYCLE[index % REVIEW_CYCLE.length]!
	const createdAt = new Date(Date.now() - index * 86_400_000)

	return {
		repository,
		author: options.username,
		headRefOid: `deadbeef${index.toString(16).padStart(8, "0")}`,
		number,
		title: `Mock PR ${number}: example change ${index}`,
		body: `This is mock pull request #${number}.\n\nLine A.\nLine B.`,
		labels: synthLabels(index),
		additions: 10 + index,
		deletions: 5 + (index % 11),
		changedFiles: 1 + (index % 7),
		state: "open",
		reviewStatus: review,
		...synthCheckSummary(passed, total),
		autoMergeEnabled: index % 11 === 0,
		detailLoaded: true,
		createdAt,
		closedAt: null,
		url: `https://github.com/${repository}/pull/${number}`,
	}
}

const buildIssue = (index: number, options: Required<MockOptions>): IssueItem => {
	const repoIndex = index % options.repoCount
	const repository = `mock-org/repo-${repoIndex}`
	const number = 2000 + index
	const createdAt = new Date(Date.now() - index * 43_200_000)
	return {
		repository,
		author: index % 2 === 0 ? options.username : `contributor-${index % 5}`,
		number,
		title: `Mock issue ${number}: investigate workflow ${index}`,
		body: `This is mock issue #${number}.\n\n- observed behaviour\n- expected behaviour\n- reproduction notes`,
		labels: synthLabels(index),
		assignees: index % 3 === 0 ? [options.username] : [],
		comments: index % 4,
		state: "open",
		detailLoaded: true,
		createdAt,
		updatedAt: createdAt,
		closedAt: null,
		url: `https://github.com/${repository}/issues/${number}`,
		timeline: [],
	}
}

export const buildMockPullRequests = (options: MockOptions): readonly PullRequestItem[] => {
	const resolved: Required<MockOptions> = {
		prCount: options.prCount,
		repoCount: options.repoCount ?? 4,
		username: options.username ?? "mock-user",
		seed: options.seed ?? 0,
	}
	return Array.from({ length: resolved.prCount }, (_, index) => buildPullRequest(index, resolved))
}

export const buildMockIssues = (options: MockOptions): readonly IssueItem[] => {
	const resolved: Required<MockOptions> = {
		prCount: options.prCount,
		repoCount: options.repoCount ?? 4,
		username: options.username ?? "mock-user",
		seed: options.seed ?? 0,
	}
	return Array.from({ length: Math.max(12, Math.floor(resolved.prCount / 2)) }, (_, index) => buildIssue(index, resolved))
}

const buildAuxiliaryItem = (surface: AuxiliarySurface, index: number, options: Required<MockOptions>): AuxiliaryItem => {
	const repository = `mock-org/repo-${index % options.repoCount}`
	const updatedAt = new Date(Date.now() - index * 3_600_000)
	const repoUrl = `https://github.com/${repository}`
	const titleBySurface = {
		notifications: `Mock notification ${index + 1}`,
		discussions: `Mock discussion ${index + 1}`,
		stars: repository,
		sharedRepos: repository,
		watchedRepos: repository,
	} satisfies Record<AuxiliarySurface, string>
	const actionBySurface = {
		notifications: "mark-notification-read",
		discussions: null,
		stars: "unstar-repository",
		sharedRepos: null,
		watchedRepos: "unwatch-repository",
	} satisfies Record<AuxiliarySurface, AuxiliaryItem["action"]>
	return {
		id: `${surface}:${index}`,
		surface,
		repository,
		number: surface === "discussions" ? 3000 + index : null,
		title: titleBySurface[surface],
		subtitle: surface === "discussions" ? `General in ${repository}` : repository,
		body: `Mock ${surface} item for ${repository}.`,
		itemType: surface === "discussions" ? "discussion" : surface === "notifications" ? "Issue" : "repository",
		state: surface === "notifications" ? "unread" : surface === "discussions" ? "open" : "public",
		author: surface === "discussions" ? options.username : null,
		url: surface === "discussions" ? `${repoUrl}/discussions/${3000 + index}` : repoUrl,
		updatedAt,
		meta: surface === "notifications" ? ["mention", "unread"] : surface === "discussions" ? ["General", "2 comments"] : ["public", `${10 + index} stars`],
		action: actionBySurface[surface],
	}
}

const buildMockAuxiliaryItems = (surface: AuxiliarySurface, options: MockOptions): readonly AuxiliaryItem[] => {
	const resolved: Required<MockOptions> = {
		prCount: options.prCount,
		repoCount: options.repoCount ?? 4,
		username: options.username ?? "mock-user",
		seed: options.seed ?? 0,
	}
	return Array.from({ length: Math.max(5, Math.floor(resolved.prCount / 3)) }, (_, index) => buildAuxiliaryItem(surface, index, resolved))
}

const filterByView = (mode: PullRequestQueueMode, repository: string | null, source: readonly PullRequestItem[]) => {
	if (mode === "repository") return repository ? source.filter((item) => item.repository === repository) : []
	return source
}

const filterIssuesByView = (mode: IssueQueueMode, repository: string | null, source: readonly IssueItem[], username: string) => {
	if (mode === "repository") return repository ? source.filter((item) => item.repository === repository) : []
	if (mode === "authored") return source.filter((item) => item.author === username)
	if (mode === "assigned") return source.filter((item) => item.assignees.includes(username))
	return source
}

const pageItems = (source: readonly PullRequestItem[], cursor: string | null, pageSize: number): PullRequestPage => {
	const start = cursor ? Number.parseInt(cursor, 10) : 0
	const safeStart = Number.isFinite(start) && start >= 0 ? start : 0
	const safePageSize = Math.max(1, Math.min(100, pageSize))
	const end = Math.min(source.length, safeStart + safePageSize)
	return {
		items: source.slice(safeStart, end),
		endCursor: end > safeStart ? String(end) : null,
		hasNextPage: end < source.length,
	}
}

const pageIssueItems = (source: readonly IssueItem[], cursor: string | null, pageSize: number): IssuePage => {
	const start = cursor ? Number.parseInt(cursor, 10) : 0
	const safeStart = Number.isFinite(start) && start >= 0 ? start : 0
	const safePageSize = Math.max(1, Math.min(100, pageSize))
	const end = Math.min(source.length, safeStart + safePageSize)
	return {
		items: source.slice(safeStart, end),
		endCursor: end > safeStart ? String(end) : null,
		hasNextPage: end < source.length,
	}
}

export const MockGitHubService = {
	layer: (options: MockOptions) => {
		const items = buildMockPullRequests(options)
		const issues = buildMockIssues(options)
		const auxiliaryItems = {
			notifications: buildMockAuxiliaryItems("notifications", options),
			discussions: buildMockAuxiliaryItems("discussions", options),
			stars: buildMockAuxiliaryItems("stars", options),
			sharedRepos: buildMockAuxiliaryItems("sharedRepos", options),
			watchedRepos: buildMockAuxiliaryItems("watchedRepos", options),
		} satisfies Record<AuxiliarySurface, readonly AuxiliaryItem[]>
		const username = options.username ?? "mock-user"
		const summaryItems = items.map((item) => ({
			...item,
			body: "",
			labels: [],
			additions: 0,
			deletions: 0,
			changedFiles: 0,
			detailLoaded: false,
		} satisfies PullRequestItem))
		const findPullRequest = (repository: string, number: number) => items.find((item) => item.repository === repository && item.number === number) ?? items[0]!
		const findIssue = (repository: string, number: number) => issues.find((item) => item.repository === repository && item.number === number) ?? issues[0]!

		return Layer.succeed(
			GitHubService,
			GitHubService.of({
				listOpenPullRequests: (mode: PullRequestQueueMode, repository: string | null) => Effect.succeed(filterByView(mode, repository, summaryItems)),
				listOpenPullRequestPage: (input) => Effect.succeed(pageItems(filterByView(input.mode, input.repository, summaryItems), input.cursor, input.pageSize)),
				listOpenPullRequestDetails: (mode: PullRequestQueueMode, repository: string | null) => Effect.succeed(filterByView(mode, repository, items)),
				listOpenIssuePage: (input) => Effect.succeed(pageIssueItems(filterIssuesByView(input.mode, input.repository, issues, username), input.cursor, input.pageSize)),
				getIssueDetails: (repository, number) => Effect.succeed(findIssue(repository, number)),
				listIssueComments: (_repo, number) => Effect.succeed(Array.from({ length: number % 3 }, (_, index) => ({
					id: `issue-comment:${number}:${index}`,
					author: index % 2 === 0 ? username : "reviewer",
					body: `Mock issue comment ${index + 1} on #${number}`,
					createdAt: new Date(),
					updatedAt: new Date(),
					url: null,
				} satisfies IssueComment))),
				createIssueComment: (_repo, _number, body) => Effect.succeed({
					id: `mock-issue-comment:${Date.now()}`,
					author: username,
					body,
					createdAt: new Date(),
					updatedAt: new Date(),
					url: null,
				} satisfies IssueComment),
				closeIssue: () => Effect.void,
				reopenIssue: () => Effect.void,
				getPullRequestDetails: (repository, number) => Effect.succeed(findPullRequest(repository, number)),
				getAuthenticatedUser: () => Effect.succeed(username),
				listNotifications: () => Effect.succeed(auxiliaryItems.notifications),
				markNotificationRead: () => Effect.void,
				listRepositoryDiscussions: (repository) => Effect.succeed(repository ? auxiliaryItems.discussions.filter((item) => item.repository === repository) : auxiliaryItems.discussions),
				listStarredRepositories: () => Effect.succeed(auxiliaryItems.stars),
				unstarRepository: () => Effect.void,
				listSharedRepositories: () => Effect.succeed(auxiliaryItems.sharedRepos),
				listWatchedRepositories: () => Effect.succeed(auxiliaryItems.watchedRepos),
				unwatchRepository: () => Effect.void,
				getPullRequestDiff: (_repo, _number) => Effect.succeed(""),
				listPullRequestComments: (_repo, _number) => Effect.succeed([] as readonly PullRequestReviewComment[]),
				getPullRequestMergeInfo: (repository, number) => Effect.succeed({
					repository,
					number,
					title: `Mock PR ${number}`,
					state: "open",
					isDraft: false,
					mergeable: MERGEABLE_CYCLE[number % MERGEABLE_CYCLE.length]!,
					reviewStatus: "approved",
					checkStatus: "passing",
					checkSummary: "10/10",
					autoMergeEnabled: false,
				} satisfies PullRequestMergeInfo),
				mergePullRequest: () => Effect.void,
				closePullRequest: () => Effect.void,
				createPullRequestComment: (input: CreatePullRequestCommentInput) => Effect.succeed({
					id: `mock:${Date.now()}`,
					path: input.path,
					line: input.line,
					side: input.side,
					author: username,
					body: input.body,
					createdAt: new Date(),
					url: null,
				} satisfies PullRequestReviewComment),
				toggleDraftStatus: () => Effect.void,
				listRepoLabels: () => Effect.succeed([]),
				addPullRequestLabel: () => Effect.void,
				removePullRequestLabel: () => Effect.void,
				addIssueLabel: () => Effect.void,
				removeIssueLabel: () => Effect.void,
			}),
		)
	},
}
