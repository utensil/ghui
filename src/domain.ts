import { Schema } from "effect"

export type LoadStatus = "loading" | "ready" | "error"

export type PullRequestState = "open" | "closed" | "merged"

export const appSurfaces = ["pullRequests", "issues", "notifications", "discussions", "myRepos", "stars", "sharedRepos", "watchedRepos"] as const
export type AppSurface = (typeof appSurfaces)[number]
export type AuxiliarySurface = Exclude<AppSurface, "pullRequests" | "issues">

export const auxiliarySurfaces = ["notifications", "discussions", "myRepos", "stars", "sharedRepos", "watchedRepos"] as const satisfies readonly AuxiliarySurface[]

export const surfaceLabels = {
	pullRequests: "pull requests",
	issues: "issues",
	notifications: "notifications",
	discussions: "discussions",
	myRepos: "my repositories",
	stars: "starred repositories",
	sharedRepos: "shared repositories",
	watchedRepos: "watched repositories",
} as const satisfies Record<AppSurface, string>

export const surfaceShortLabels = {
	pullRequests: "pull requests",
	issues: "issues",
	notifications: "notifications",
	discussions: "discussions",
	myRepos: "my repos",
	stars: "stars",
	sharedRepos: "shared with me",
	watchedRepos: "watched",
} as const satisfies Record<AppSurface, string>

const auxiliarySurfaceSet = new Set<AppSurface>(auxiliarySurfaces)

export const isAuxiliarySurface = (surface: AppSurface): surface is AuxiliarySurface =>
	auxiliarySurfaceSet.has(surface)

export const pullRequestQueueModes = ["authored", "review", "assigned", "mentioned"] as const
export type PullRequestUserQueueMode = (typeof pullRequestQueueModes)[number]
export type PullRequestQueueMode = "repository" | PullRequestUserQueueMode

export const issueQueueModes = ["authored", "assigned", "mentioned"] as const
export type IssueUserQueueMode = (typeof issueQueueModes)[number]
export type IssueQueueMode = "repository" | IssueUserQueueMode

export const pullRequestQueueLabels = {
	repository: "repository",
	authored: "authored",
	review: "review requested",
	assigned: "assigned",
	mentioned: "mentioned",
} as const satisfies Record<PullRequestQueueMode, string>

export const pullRequestQueueSearchQualifier = (mode: PullRequestQueueMode, repository: string | null) => {
	const qualifiers = {
		repository: repository ? `repo:${repository}` : "author:@me",
		authored: "author:@me",
		review: "review-requested:@me",
		assigned: "assignee:@me",
		mentioned: "mentions:@me",
	} as const satisfies Record<PullRequestQueueMode, string>
	return qualifiers[mode]
}

export const issueQueueLabels = {
	repository: "repository",
	authored: "authored",
	assigned: "assigned",
	mentioned: "mentioned",
} as const satisfies Record<IssueQueueMode, string>

export const issueQueueSearchQualifier = (mode: IssueQueueMode, author: string, repository: string | null) => {
	const qualifiers = {
		repository: repository ? `repo:${repository}` : `author:${author}`,
		authored: `author:${author}`,
		assigned: "assignee:@me",
		mentioned: "mentions:@me",
	} as const satisfies Record<IssueQueueMode, string>
	return qualifiers[mode]
}

export type CheckConclusion = "success" | "failure" | "neutral" | "skipped" | "cancelled" | "timed_out"

export type CheckRunStatus = "completed" | "in_progress" | "queued" | "pending"

export type CheckRollupStatus = "passing" | "pending" | "failing" | "none"

export type ReviewStatus = "draft" | "approved" | "changes" | "review" | "none"

export type Mergeable = "mergeable" | "conflicting" | "unknown"

export type IssueState = "open" | "closed"

export type AuxiliaryItemAction = "mark-notification-read" | "unstar-repository" | "unwatch-repository"

export interface AuxiliaryItem {
	readonly id: string
	readonly surface: AuxiliarySurface
	readonly repository: string | null
	readonly number: number | null
	readonly title: string
	readonly subtitle: string | null
	readonly body: string
	readonly itemType: string
	readonly state: string | null
	readonly author: string | null
	readonly url: string | null
	readonly updatedAt: Date | null
	readonly meta: readonly string[]
	readonly action: AuxiliaryItemAction | null
}

// DiffCommentSide is the only literal type still consumed at runtime — GitHubService
// uses it as a Schema inside PullRequestCommentSchema.
export const DiffCommentSide = Schema.Literals(["LEFT", "RIGHT"])
export type DiffCommentSide = Schema.Schema.Type<typeof DiffCommentSide>

export type PullRequestMergeAction = "squash" | "auto" | "admin" | "disable-auto"

export const pullRequestReviewEvents = ["COMMENT", "APPROVE", "REQUEST_CHANGES"] as const
export type PullRequestReviewEvent = (typeof pullRequestReviewEvents)[number]

export interface CheckItem {
	readonly name: string
	readonly status: CheckRunStatus
	readonly conclusion: CheckConclusion | null
}

export interface PullRequestLabel {
	readonly name: string
	readonly color: string | null
}

export interface CreatePullRequestCommentInput {
	readonly repository: string
	readonly number: number
	readonly commitId: string
	readonly path: string
	readonly line: number
	readonly side: DiffCommentSide
	readonly startLine?: number
	readonly startSide?: DiffCommentSide
	readonly body: string
}

export interface SubmitPullRequestReviewInput {
	readonly repository: string
	readonly number: number
	readonly event: PullRequestReviewEvent
	readonly body: string
}

export interface PullRequestReviewComment {
	readonly id: string
	readonly path: string
	readonly line: number
	readonly side: DiffCommentSide
	readonly author: string
	readonly body: string
	readonly createdAt: Date | null
	readonly url: string | null
}

export type PullRequestConversationItem =
	| {
			readonly _tag: "comment"
			readonly id: string
			readonly author: string
			readonly body: string
			readonly createdAt: Date | null
			readonly url: string | null
	  }
	| ({ readonly _tag: "review-comment" } & PullRequestReviewComment)

export interface PullRequestItem {
	readonly repository: string
	readonly author: string
	readonly headRefOid: string
	readonly number: number
	readonly title: string
	readonly body: string
	readonly labels: readonly PullRequestLabel[]
	readonly additions: number
	readonly deletions: number
	readonly changedFiles: number
	readonly state: PullRequestState
	readonly reviewStatus: ReviewStatus
	readonly checkStatus: CheckRollupStatus
	readonly checkSummary: string | null
	readonly checks: readonly CheckItem[]
	readonly autoMergeEnabled: boolean
	readonly detailLoaded: boolean
	readonly createdAt: Date
	readonly closedAt: Date | null
	readonly url: string
}

export interface IssueComment {
	readonly id: string
	readonly author: string
	readonly body: string
	readonly createdAt: Date | null
	readonly updatedAt: Date | null
	readonly url: string | null
}

export interface IssueItem {
	readonly repository: string
	readonly author: string
	readonly number: number
	readonly title: string
	readonly body: string
	readonly labels: readonly PullRequestLabel[]
	readonly assignees: readonly string[]
	readonly comments: number
	readonly state: IssueState
	readonly detailLoaded: boolean
	readonly createdAt: Date
	readonly updatedAt: Date
	readonly closedAt: Date | null
	readonly url: string
	readonly timeline: readonly IssueComment[]
}

export interface PullRequestPage {
	readonly items: readonly PullRequestItem[]
	readonly endCursor: string | null
	readonly hasNextPage: boolean
}

export interface IssuePage {
	readonly items: readonly IssueItem[]
	readonly endCursor: string | null
	readonly hasNextPage: boolean
}

export interface ListPullRequestPageInput {
	readonly mode: PullRequestQueueMode
	readonly repository: string | null
	readonly cursor: string | null
	readonly pageSize: number
}

export interface ListIssuePageInput {
	readonly mode: IssueQueueMode
	readonly repository: string | null
	readonly cursor: string | null
	readonly pageSize: number
}

export interface PullRequestMergeInfo {
	readonly repository: string
	readonly number: number
	readonly title: string
	readonly state: PullRequestState
	readonly isDraft: boolean
	readonly mergeable: Mergeable
	readonly reviewStatus: ReviewStatus
	readonly checkStatus: CheckRollupStatus
	readonly checkSummary: string | null
	readonly autoMergeEnabled: boolean
}
