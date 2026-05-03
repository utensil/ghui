import type { PullRequestItem, PullRequestMergeAction, PullRequestMergeInfo, PullRequestState } from "./domain.js"

export interface MergeActionDefinition {
	readonly action: PullRequestMergeAction
	readonly title: string
	readonly description: string
	readonly cliArgs: readonly string[]
	readonly pastTense: string
	readonly danger?: boolean
	readonly refreshOnSuccess?: boolean
	readonly optimisticState?: PullRequestState
	readonly optimisticAutoMergeEnabled?: boolean
	readonly isAvailable: (info: PullRequestMergeInfo) => boolean
}

const isCleanlyMergeable = (info: PullRequestMergeInfo) =>
	info.state === "open" &&
	!info.isDraft &&
	info.mergeable === "mergeable" &&
	info.reviewStatus !== "changes" &&
	info.reviewStatus !== "review" &&
	info.checkStatus !== "pending" &&
	info.checkStatus !== "failing"

const mergeActionDefinitions = {
	squash: {
		action: "squash",
		title: "Squash merge now",
		description: "Merge this pull request and delete the branch.",
		cliArgs: ["--squash", "--delete-branch"],
		pastTense: "Merged",
		refreshOnSuccess: true,
		optimisticState: "merged",
		isAvailable: isCleanlyMergeable,
	},
	auto: {
		action: "auto",
		title: "Enable auto-merge",
		description: "Squash merge automatically after GitHub requirements pass.",
		cliArgs: ["--squash", "--auto", "--delete-branch"],
		pastTense: "Enabled auto-merge",
		optimisticAutoMergeEnabled: true,
		isAvailable: (info) => info.state === "open" && !info.autoMergeEnabled && !info.isDraft && info.mergeable !== "conflicting",
	},
	"disable-auto": {
		action: "disable-auto",
		title: "Disable auto-merge",
		description: "Cancel the pending GitHub auto-merge request.",
		cliArgs: ["--disable-auto"],
		pastTense: "Disabled auto-merge",
		optimisticAutoMergeEnabled: false,
		isAvailable: (info) => info.state === "open" && info.autoMergeEnabled,
	},
	admin: {
		action: "admin",
		title: "Admin override merge",
		description: "Bypass unmet merge requirements with --admin.",
		cliArgs: ["--squash", "--admin", "--delete-branch"],
		pastTense: "Admin merged",
		danger: true,
		refreshOnSuccess: true,
		optimisticState: "merged",
		isAvailable: (info) => info.state === "open" && !info.isDraft && info.mergeable !== "conflicting",
	},
} as const satisfies Record<PullRequestMergeAction, MergeActionDefinition>

export const mergeActions: readonly MergeActionDefinition[] = Object.values(mergeActionDefinitions)

export const availableMergeActions = (info: PullRequestMergeInfo | null): readonly MergeActionDefinition[] => {
	if (!info) return []
	return mergeActions.filter((action) => action.isAvailable(info))
}

export const getMergeActionDefinition = (action: PullRequestMergeAction): MergeActionDefinition => mergeActionDefinitions[action]

export const mergeInfoFromPullRequest = (pullRequest: PullRequestItem): PullRequestMergeInfo => ({
	repository: pullRequest.repository,
	number: pullRequest.number,
	title: pullRequest.title,
	state: pullRequest.state,
	isDraft: pullRequest.reviewStatus === "draft",
	mergeable: "unknown",
	reviewStatus: pullRequest.reviewStatus,
	checkStatus: pullRequest.checkStatus,
	checkSummary: pullRequest.checkSummary,
	autoMergeEnabled: pullRequest.autoMergeEnabled,
})
