import { Context, Effect, Layer, Schema } from "effect"
import { config } from "../config.js"
import {
	DiffCommentSide,
	issueQueueSearchQualifier,
	pullRequestQueueSearchQualifier,
	type AuxiliaryItem,
	type CheckItem,
	type CreatePullRequestCommentInput,
	type IssueComment,
	type IssueItem,
	type IssuePage,
	type IssueQueueMode,
	type IssueState,
	type ListIssuePageInput,
	type ListPullRequestPageInput,
	type Mergeable,
	type PullRequestConversationItem,
	type PullRequestItem,
	type PullRequestMergeAction,
	type PullRequestMergeInfo,
	type PullRequestPage,
	type PullRequestQueueMode,
	type PullRequestReviewComment,
	type ReviewStatus,
	type CommitItem,
	type SubmitPullRequestReviewInput,
} from "../domain.js"
import { getMergeActionDefinition } from "../mergeActions.js"
import { CommandError, CommandRunner, type JsonParseError } from "./CommandRunner.js"

const NullableString = Schema.NullOr(Schema.String)
const OptionalNullableString = Schema.optionalKey(NullableString)
const OptionalNullableNumber = Schema.optionalKey(Schema.NullOr(Schema.Number))

const RawCheckContextSchema = Schema.Union([
	Schema.Struct({
		__typename: Schema.tag("CheckRun"),
		name: OptionalNullableString,
		status: OptionalNullableString,
		conclusion: OptionalNullableString,
	}),
	Schema.Struct({
		__typename: Schema.tag("StatusContext"),
		context: OptionalNullableString,
		state: OptionalNullableString,
	}),
]).pipe(Schema.toTaggedUnion("__typename"))

const RawAuthorSchema = Schema.Struct({ login: Schema.String })
const RawRepositorySchema = Schema.Struct({ nameWithOwner: Schema.String })
const RawLabelSchema = Schema.Struct({
	name: Schema.String,
	color: OptionalNullableString,
})

const RawStatusCheckRollupSchema = Schema.Struct({
	contexts: Schema.Struct({ nodes: Schema.Array(RawCheckContextSchema) }),
})

const RawPullRequestSummaryFields = {
	number: Schema.Number,
	title: Schema.String,
	isDraft: Schema.Boolean,
	reviewDecision: NullableString,
	autoMergeRequest: Schema.NullOr(Schema.Unknown),
	state: Schema.String,
	merged: Schema.Boolean,
	createdAt: Schema.String,
	closedAt: OptionalNullableString,
	url: Schema.String,
	author: RawAuthorSchema,
	headRefOid: Schema.String,
	repository: RawRepositorySchema,
} as const

const RawPullRequestSummaryNodeSchema = Schema.Struct({
	...RawPullRequestSummaryFields,
	statusCheckRollup: Schema.optionalKey(Schema.NullOr(RawStatusCheckRollupSchema)),
})

const RawPullRequestNodeSchema = Schema.Struct({
	...RawPullRequestSummaryFields,
	body: Schema.String,
	labels: Schema.Struct({ nodes: Schema.Array(RawLabelSchema) }),
	additions: Schema.Number,
	deletions: Schema.Number,
	changedFiles: Schema.Number,
	statusCheckRollup: Schema.optionalKey(Schema.NullOr(RawStatusCheckRollupSchema)),
})

const RawAssigneeSchema = Schema.Struct({ login: Schema.String })

const RawIssueNodeSchema = Schema.Struct({
	number: Schema.Number,
	title: Schema.String,
	body: Schema.NullOr(Schema.String),
	state: Schema.String,
	createdAt: Schema.String,
	updatedAt: Schema.String,
	closedAt: OptionalNullableString,
	url: Schema.String,
	author: RawAuthorSchema,
	repository: RawRepositorySchema,
	labels: Schema.Struct({ nodes: Schema.Array(RawLabelSchema) }),
	assignees: Schema.Struct({ nodes: Schema.Array(RawAssigneeSchema) }),
	comments: Schema.Struct({ totalCount: Schema.Number }),
})

const PullRequestDetailResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(
			Schema.Struct({
				pullRequest: Schema.NullOr(RawPullRequestNodeSchema),
			}),
		),
	}),
})

const IssueDetailResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(Schema.Struct({
			issue: Schema.NullOr(RawIssueNodeSchema),
		})),
	}),
})

const PageInfoSchema = Schema.Struct({
	hasNextPage: Schema.Boolean,
	endCursor: NullableString,
})

const SearchResponseSchema = <Item extends Schema.Top>(item: Item) =>
	Schema.Struct({
		data: Schema.Struct({
			search: Schema.Struct({
				nodes: Schema.Array(Schema.NullOr(item)),
				pageInfo: PageInfoSchema,
			}),
		}),
	})

const RepositoryPullRequestsResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(
			Schema.Struct({
				pullRequests: Schema.Struct({
					nodes: Schema.Array(Schema.NullOr(RawPullRequestSummaryNodeSchema)),
					pageInfo: PageInfoSchema,
				}),
			}),
		),
	}),
})

const RepositoryIssuesResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(Schema.Struct({
			issues: Schema.Struct({
				nodes: Schema.Array(Schema.NullOr(RawIssueNodeSchema)),
				pageInfo: PageInfoSchema,
			}),
		})),
	}),
})

const ViewerSchema = Schema.Struct({ login: Schema.String })

const MergeInfoResponseSchema = Schema.Struct({
	number: Schema.Number,
	title: Schema.String,
	state: Schema.String,
	isDraft: Schema.Boolean,
	mergeable: Schema.String,
	reviewDecision: NullableString,
	autoMergeRequest: Schema.NullOr(Schema.Unknown),
	statusCheckRollup: Schema.Array(RawCheckContextSchema),
})

const PullRequestCommentSchema = Schema.Struct({
	id: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
	node_id: OptionalNullableString,
	body: OptionalNullableString,
	html_url: OptionalNullableString,
	url: OptionalNullableString,
	created_at: OptionalNullableString,
	user: Schema.optionalKey(
		Schema.NullOr(
			Schema.Struct({
				login: OptionalNullableString,
			}),
		),
	),
	path: OptionalNullableString,
	line: OptionalNullableNumber,
	original_line: OptionalNullableNumber,
	side: Schema.optionalKey(Schema.NullOr(DiffCommentSide)),
})

const PullRequestFileSchema = Schema.Struct({
	filename: Schema.String,
	previous_filename: OptionalNullableString,
	status: OptionalNullableString,
	patch: OptionalNullableString,
})

const CommentsResponseSchema = Schema.Union([Schema.Array(PullRequestCommentSchema), Schema.Array(Schema.Array(PullRequestCommentSchema))])

const PullRequestFilesResponseSchema = Schema.Union([Schema.Array(PullRequestFileSchema), Schema.Array(Schema.Array(PullRequestFileSchema))])

const RepoLabelsResponseSchema = Schema.Array(
	Schema.Struct({
		name: Schema.String,
		color: Schema.String,
	}),
)

const IssueCommentSchema = Schema.Struct({
	id: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
	node_id: OptionalNullableString,
	body: OptionalNullableString,
	html_url: OptionalNullableString,
	url: OptionalNullableString,
	created_at: OptionalNullableString,
	updated_at: OptionalNullableString,
	user: Schema.optionalKey(Schema.NullOr(Schema.Struct({
		login: OptionalNullableString,
	}))),
})

const IssueCommentsResponseSchema = Schema.Union([
	Schema.Array(IssueCommentSchema),
	Schema.Array(Schema.Array(IssueCommentSchema)),
])

const PullRequestCommitSchema = Schema.Struct({
	sha: Schema.String,
	commit: Schema.Struct({
		message: Schema.String,
		author: Schema.NullOr(Schema.Struct({
			name: OptionalNullableString,
			date: OptionalNullableString,
		})),
	}),
	html_url: OptionalNullableString,
	author: Schema.optionalKey(Schema.NullOr(Schema.Struct({ login: OptionalNullableString }))),
})

const PullRequestCommitsResponseSchema = Schema.Union([
	Schema.Array(PullRequestCommitSchema),
	Schema.Array(Schema.Array(PullRequestCommitSchema)),
])

const RestRepositorySchema = Schema.Struct({
	full_name: Schema.String,
	description: OptionalNullableString,
	html_url: OptionalNullableString,
	private: Schema.optionalKey(Schema.Boolean),
	fork: Schema.optionalKey(Schema.Boolean),
	archived: Schema.optionalKey(Schema.Boolean),
	language: OptionalNullableString,
	stargazers_count: OptionalNullableNumber,
	forks_count: OptionalNullableNumber,
	open_issues_count: OptionalNullableNumber,
	updated_at: OptionalNullableString,
	pushed_at: OptionalNullableString,
	has_discussions: Schema.optionalKey(Schema.Boolean),
})

const RepositoryPageResponseSchema = Schema.Array(RestRepositorySchema)

const NotificationResponseSchema = Schema.Struct({
	id: Schema.String,
	unread: Schema.Boolean,
	reason: Schema.String,
	updated_at: Schema.String,
	subject: Schema.Struct({
		title: Schema.String,
		type: Schema.String,
		url: OptionalNullableString,
		latest_comment_url: OptionalNullableString,
	}),
	repository: Schema.Struct({
		full_name: Schema.String,
		html_url: OptionalNullableString,
	}),
})

const NotificationListResponseSchema = Schema.Union([
	Schema.Array(NotificationResponseSchema),
	Schema.Array(Schema.Array(NotificationResponseSchema)),
])

const RawDiscussionNodeSchema = Schema.Struct({
	id: Schema.String,
	number: Schema.Number,
	title: Schema.String,
	body: Schema.NullOr(Schema.String),
	url: Schema.String,
	createdAt: Schema.String,
	updatedAt: Schema.String,
	answerChosenAt: OptionalNullableString,
	upvoteCount: Schema.optionalKey(Schema.Number),
	author: Schema.NullOr(RawAuthorSchema),
	category: Schema.Struct({ name: Schema.String }),
	comments: Schema.Struct({ totalCount: Schema.Number }),
})

const RepositoryDiscussionsResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(Schema.Struct({
			discussions: Schema.Struct({
				nodes: Schema.Array(Schema.NullOr(RawDiscussionNodeSchema)),
			}),
		})),
	}),
})

type RawPullRequestSummaryNode = Schema.Schema.Type<typeof RawPullRequestSummaryNodeSchema>
type RawPullRequestNode = Schema.Schema.Type<typeof RawPullRequestNodeSchema>
type RawIssueNode = Schema.Schema.Type<typeof RawIssueNodeSchema>
type RawCheckContext = Schema.Schema.Type<typeof RawCheckContextSchema>
type RawPullRequestComment = Schema.Schema.Type<typeof PullRequestCommentSchema>
type RawPullRequestFile = Schema.Schema.Type<typeof PullRequestFileSchema>
type RawIssueComment = Schema.Schema.Type<typeof IssueCommentSchema>
type RestRepository = Schema.Schema.Type<typeof RestRepositorySchema>
type RawNotification = Schema.Schema.Type<typeof NotificationResponseSchema>
type RawDiscussionNode = Schema.Schema.Type<typeof RawDiscussionNodeSchema>

type SearchResponse<Item> = {
	readonly data: {
		readonly search: {
			readonly nodes: readonly (Item | null)[]
			readonly pageInfo: {
				readonly hasNextPage: boolean
				readonly endCursor: string | null
			}
		}
	}
}

type PullRequestConnection<Item> = {
	readonly nodes: readonly (Item | null)[]
	readonly pageInfo: {
		readonly hasNextPage: boolean
		readonly endCursor: string | null
	}
}

const STATUS_CHECK_FRAGMENT = `
        statusCheckRollup {
          contexts(first: 100) {
            nodes {
              __typename
              ... on CheckRun { name status conclusion }
              ... on StatusContext { context state }
            }
          }
        }`

const SUMMARY_FIELDS_FRAGMENT = `
        number
        title
        isDraft
        reviewDecision
        autoMergeRequest { enabledAt }
        state
        merged
        createdAt
        closedAt
        url
        author { login }
        headRefOid
        repository { nameWithOwner }${STATUS_CHECK_FRAGMENT}`

const DETAIL_FIELDS_FRAGMENT = `
        number
        title
        body
        isDraft
        reviewDecision
        autoMergeRequest { enabledAt }
        additions
        deletions
        changedFiles
        state
        merged
        createdAt
        closedAt
        url
        author { login }
        headRefOid
        repository { nameWithOwner }
        labels(first: 20) { nodes { name color } }${STATUS_CHECK_FRAGMENT}`

const ISSUE_FIELDS_FRAGMENT = `
        number
        title
        body
        state
        createdAt
        updatedAt
        closedAt
        url
        author { login }
        repository { nameWithOwner }
        labels(first: 20) { nodes { name color } }
        assignees(first: 10) { nodes { login } }
        comments { totalCount }`

const pullRequestSearchQuery = `
query PullRequests($searchQuery: String!, $first: Int!, $after: String) {
  search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
    nodes {
      ... on PullRequest {${DETAIL_FIELDS_FRAGMENT}
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

const issueSearchQuery = `
query Issues($searchQuery: String!, $first: Int!, $after: String) {
  search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
    nodes {
      ... on Issue {${ISSUE_FIELDS_FRAGMENT}
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

const pullRequestDetailQuery = `
query PullRequest($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {${DETAIL_FIELDS_FRAGMENT}
    }
  }
}
`

const issueDetailQuery = `
query Issue($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {${ISSUE_FIELDS_FRAGMENT}
    }
  }
}
`

const pullRequestSummarySearchQuery = `
query PullRequests($searchQuery: String!, $first: Int!, $after: String) {
  search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
    nodes {
      ... on PullRequest {${SUMMARY_FIELDS_FRAGMENT}
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

const repositoryIssuesQuery = `
query RepositoryIssues($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: $first, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {${ISSUE_FIELDS_FRAGMENT}
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
`

const repositoryPullRequestsQuery = `
query RepositoryPullRequests($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: $first, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {${SUMMARY_FIELDS_FRAGMENT}
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
`

const repositoryDiscussionsQuery = `
query RepositoryDiscussions($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussions(first: 50, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        id
        number
        title
        body
        url
        createdAt
        updatedAt
        answerChosenAt
        upvoteCount
        author { login }
        category { name }
        comments { totalCount }
      }
    }
  }
}
`

const normalizeDate = (value: string | null | undefined) => {
	if (!value || value.startsWith("0001-01-01")) return null
	return new Date(value)
}

const getPullRequestState = (item: { readonly state: string; readonly merged: boolean }): PullRequestItem["state"] =>
	item.merged ? "merged" : item.state.toLowerCase() === "open" ? "open" : "closed"

const REVIEW_STATUS_BY_DECISION: Record<string, ReviewStatus> = {
	APPROVED: "approved",
	CHANGES_REQUESTED: "changes",
	REVIEW_REQUIRED: "review",
}

const getReviewStatus = (item: { readonly isDraft: boolean; readonly reviewDecision: string | null }): ReviewStatus => {
	if (item.isDraft) return "draft"
	if (item.reviewDecision) return REVIEW_STATUS_BY_DECISION[item.reviewDecision] ?? "none"
	return "none"
}

const CHECK_STATUS_BY_RAW: Record<string, CheckItem["status"]> = {
	COMPLETED: "completed",
	IN_PROGRESS: "in_progress",
	QUEUED: "queued",
}

const CHECK_CONCLUSION_BY_RAW: Record<string, NonNullable<CheckItem["conclusion"]>> = {
	SUCCESS: "success",
	FAILURE: "failure",
	ERROR: "failure",
	NEUTRAL: "neutral",
	SKIPPED: "skipped",
	CANCELLED: "cancelled",
	TIMED_OUT: "timed_out",
}

const normalizeCheckStatus = (raw: string | null | undefined): CheckItem["status"] => (raw ? (CHECK_STATUS_BY_RAW[raw] ?? "pending") : "pending")

const normalizeCheckConclusion = (raw: string | null | undefined): CheckItem["conclusion"] => (raw ? (CHECK_CONCLUSION_BY_RAW[raw] ?? null) : null)

const getContextStatus = (context: RawCheckContext): CheckItem["status"] =>
	RawCheckContextSchema.match(context, {
		CheckRun: (run) => normalizeCheckStatus(run.status),
		StatusContext: (status) => (status.state === "PENDING" ? "in_progress" : "completed"),
	})

const STATUS_CONTEXT_CONCLUSION: Record<string, NonNullable<CheckItem["conclusion"]>> = {
	SUCCESS: "success",
	FAILURE: "failure",
	ERROR: "failure",
}

const getContextConclusion = (context: RawCheckContext): CheckItem["conclusion"] =>
	RawCheckContextSchema.match(context, {
		CheckRun: (run) => normalizeCheckConclusion(run.conclusion),
		StatusContext: (status) => (status.state ? STATUS_CONTEXT_CONCLUSION[status.state] : null) ?? null,
	})

const getCheckInfoFromContexts = (contexts: readonly RawCheckContext[]): Pick<PullRequestItem, "checkStatus" | "checkSummary" | "checks"> => {
	if (contexts.length === 0) {
		return { checkStatus: "none", checkSummary: null, checks: [] }
	}

	let completed = 0
	let successful = 0
	let pending = false
	let failing = false
	const checks: CheckItem[] = []

	for (const check of contexts) {
		const name = check.__typename === "CheckRun" ? (check.name ?? "check") : (check.context ?? "check")
		const status = getContextStatus(check)
		const conclusion = getContextConclusion(check)

		checks.push({ name, status, conclusion })

		if (status === "completed") {
			completed += 1
		} else {
			pending = true
		}

		if (conclusion === "success" || conclusion === "neutral" || conclusion === "skipped") {
			successful += 1
		} else if (conclusion) {
			failing = true
		}
	}

	if (pending) {
		return { checkStatus: "pending", checkSummary: `checks ${completed}/${contexts.length}`, checks }
	}

	if (failing) {
		return { checkStatus: "failing", checkSummary: `checks ${successful}/${contexts.length}`, checks }
	}

	return { checkStatus: "passing", checkSummary: `checks ${successful}/${contexts.length}`, checks }
}

const parsePullRequestSummary = (item: RawPullRequestSummaryNode): PullRequestItem => {
	const checkInfo = getCheckInfoFromContexts(item.statusCheckRollup?.contexts.nodes ?? [])
	return {
		repository: item.repository.nameWithOwner,
		author: item.author.login,
		headRefOid: item.headRefOid,
		number: item.number,
		title: item.title,
		body: "",
		labels: [],
		additions: 0,
		deletions: 0,
		changedFiles: 0,
		state: getPullRequestState(item),
		reviewStatus: getReviewStatus(item),
		checkStatus: checkInfo.checkStatus,
		checkSummary: checkInfo.checkSummary,
		checks: checkInfo.checks,
		autoMergeEnabled: item.autoMergeRequest !== null,
		detailLoaded: false,
		createdAt: new Date(item.createdAt),
		closedAt: normalizeDate(item.closedAt),
		url: item.url,
	}
}

const parsePullRequest = (item: RawPullRequestNode): PullRequestItem => {
	const checkInfo = getCheckInfoFromContexts(item.statusCheckRollup?.contexts.nodes ?? [])
	return {
		...parsePullRequestSummary(item),
		body: item.body,
		labels: item.labels.nodes.map((label) => ({
			name: label.name,
			color: label.color ? `#${label.color}` : null,
		})),
		additions: item.additions,
		deletions: item.deletions,
		changedFiles: item.changedFiles,
		checkStatus: checkInfo.checkStatus,
		checkSummary: checkInfo.checkSummary,
		checks: checkInfo.checks,
		detailLoaded: true,
	}
}

const getIssueState = (item: { readonly state: string }): IssueState =>
	item.state.toLowerCase() === "open" ? "open" : "closed"

const parseIssue = (item: RawIssueNode): IssueItem => ({
	repository: item.repository.nameWithOwner,
	author: item.author.login,
	number: item.number,
	title: item.title,
	body: item.body ?? "",
	labels: item.labels.nodes.map((label) => ({
		name: label.name,
		color: label.color ? `#${label.color}` : null,
	})),
	assignees: item.assignees.nodes.map((assignee) => assignee.login),
	comments: item.comments.totalCount,
	state: getIssueState(item),
	detailLoaded: true,
	createdAt: new Date(item.createdAt),
	updatedAt: new Date(item.updatedAt),
	closedAt: normalizeDate(item.closedAt),
	url: item.url,
	timeline: [],
})

const searchQuery = (mode: PullRequestQueueMode, repository: string | null) => {
	const sort = mode === "repository" ? "sort:updated-desc" : "sort:created-desc"
	return `${pullRequestQueueSearchQualifier(mode, repository)} is:pr is:open ${sort}`
}

const issueSearch = (mode: IssueQueueMode, author: string, repository: string | null) => {
	return `${issueQueueSearchQualifier(mode, author, repository)} is:issue is:open sort:updated-desc`
}

const pullRequestPage = <Item>(connection: PullRequestConnection<Item>, parse: (node: Item) => PullRequestItem): PullRequestPage => ({
	items: connection.nodes.flatMap((node) => (node ? [parse(node)] : [])),
	endCursor: connection.pageInfo.endCursor,
	hasNextPage: connection.pageInfo.hasNextPage && connection.pageInfo.endCursor !== null,
})

const issuePage = <Item>(connection: PullRequestConnection<Item>, parse: (node: Item) => IssueItem): IssuePage => ({
	items: connection.nodes.flatMap((node) => node ? [parse(node)] : []),
	endCursor: connection.pageInfo.endCursor,
	hasNextPage: connection.pageInfo.hasNextPage && connection.pageInfo.endCursor !== null,
})

const repositoryParts = (repository: string) => {
	const [owner, name] = repository.split("/")
	return owner && name ? { owner, name } : null
}

const rawCommentFields = (comment: RawPullRequestComment, fallbackId: string) => ({
	id: String(comment.id ?? comment.node_id ?? fallbackId),
	author: comment.user?.login ?? "unknown",
	body: comment.body ?? "",
	createdAt: comment.created_at ? new Date(comment.created_at) : null,
	url: comment.html_url ?? comment.url ?? null,
})

const parsePullRequestComment = (comment: RawPullRequestComment): PullRequestReviewComment | null => {
	const line = comment.line ?? comment.original_line
	if (!comment.path || !line || (comment.side !== "LEFT" && comment.side !== "RIGHT")) return null
	return {
		...rawCommentFields(comment, `${comment.path}:${comment.side}:${line}:${comment.created_at ?? ""}:${comment.body ?? ""}`),
		path: comment.path,
		line,
		side: comment.side,
	}
}

const parsePullRequestComments = (response: Schema.Schema.Type<typeof CommentsResponseSchema>): readonly PullRequestReviewComment[] => {
	return flattenSlurpedPages(response).flatMap((comment) => {
		const parsed = parsePullRequestComment(comment)
		return parsed ? [parsed] : []
	})
}

const parseIssueComment = (comment: RawIssueComment): IssueComment => ({
	id: String(comment.id ?? comment.node_id ?? `${comment.created_at ?? ""}:${comment.body ?? ""}`),
	author: comment.user?.login ?? "unknown",
	body: comment.body ?? "",
	createdAt: comment.created_at ? new Date(comment.created_at) : null,
	updatedAt: comment.updated_at ? new Date(comment.updated_at) : null,
	url: comment.html_url ?? comment.url ?? null,
})

const parseConversationComment = (comment: RawPullRequestComment): PullRequestConversationItem => ({
	_tag: "comment",
	...rawCommentFields(comment, `${comment.created_at ?? ""}:${comment.body ?? ""}`),
})

const reviewCommentConversationItem = (comment: PullRequestReviewComment): PullRequestConversationItem => ({
	_tag: "review-comment",
	...comment,
})

const conversationItemTime = (item: PullRequestConversationItem) => item.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER

const sortConversationItems = (items: readonly PullRequestConversationItem[]) =>
	[...items].sort((left, right) => conversationItemTime(left) - conversationItemTime(right) || left.id.localeCompare(right.id))

const parseIssueComments = (response: Schema.Schema.Type<typeof IssueCommentsResponseSchema>): readonly IssueComment[] =>
	flattenSlurpedPages(response).map(parseIssueComment)

const parseConversationItems = (response: Schema.Schema.Type<typeof CommentsResponseSchema>): readonly PullRequestConversationItem[] =>
	flattenSlurpedPages(response).map(parseConversationComment)

const flattenSlurpedPages = <Item>(response: readonly Item[] | readonly (readonly Item[])[]): readonly Item[] =>
	Array.isArray(response[0]) ? (response as readonly (readonly Item[])[]).flat() : (response as readonly Item[])

const htmlUrlFromApiUrl = (repository: string, apiUrl: string | null | undefined, fallback: string | null) => {
	if (!apiUrl) return fallback
	const pullRequest = apiUrl.match(/\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)(?:$|[/?#])/)
	if (pullRequest?.[1]) return `https://github.com/${repository}/pull/${pullRequest[1]}`
	const issue = apiUrl.match(/\/repos\/[^/]+\/[^/]+\/issues\/(\d+)(?:$|[/?#])/)
	if (issue?.[1]) return `https://github.com/${repository}/issues/${issue[1]}`
	const commit = apiUrl.match(/\/repos\/[^/]+\/[^/]+\/commits\/([^/?#]+)/)
	if (commit?.[1]) return `https://github.com/${repository}/commit/${commit[1]}`
	const release = apiUrl.match(/\/repos\/[^/]+\/[^/]+\/releases\/(?:tags\/)?([^/?#]+)/)
	if (release?.[1]) return `https://github.com/${repository}/releases`
	return fallback
}

const compactMeta = (items: readonly (string | null | undefined | false)[]) =>
	items.flatMap((item) => item ? [item] : [])

const repoDescription = (repository: RestRepository) => {
	const description = repository.description?.trim()
	return description && description.length > 0 ? description : "No description."
}

const repositoryVisibility = (repository: RestRepository) => compactMeta([
	repository.private ? "private" : "public",
	repository.fork ? "fork" : null,
	repository.archived ? "archived" : null,
	repository.language,
	repository.has_discussions ? "discussions" : null,
	typeof repository.stargazers_count === "number" ? `${repository.stargazers_count} stars` : null,
	typeof repository.forks_count === "number" ? `${repository.forks_count} forks` : null,
	typeof repository.open_issues_count === "number" ? `${repository.open_issues_count} open issues` : null,
])

const parseRepositoryItem = (surface: "myRepos" | "stars" | "sharedRepos" | "watchedRepos", repository: RestRepository): AuxiliaryItem => {
	const updatedAt = normalizeDate(repository.pushed_at) ?? normalizeDate(repository.updated_at)
	const action = surface === "stars" ? "unstar-repository" : surface === "watchedRepos" ? "unwatch-repository" : null
	const repositoryName = repository.full_name.split("/")[1] ?? repository.full_name
	return {
		id: `${surface}:${repository.full_name}`,
		surface,
		repository: repository.full_name,
		number: null,
		title: repositoryName,
		subtitle: repository.full_name,
		body: repoDescription(repository),
		itemType: surface === "myRepos" ? "repository" : surface === "stars" ? "starred repo" : surface === "watchedRepos" ? "watched repo" : "shared repo",
		state: repository.private ? "private" : "public",
		author: null,
		url: repository.html_url ?? `https://github.com/${repository.full_name}`,
		updatedAt,
		meta: repositoryVisibility(repository),
		action,
	}
}

const parseNotificationItem = (notification: RawNotification): AuxiliaryItem => {
	const repository = notification.repository.full_name
	const url = htmlUrlFromApiUrl(repository, notification.subject.latest_comment_url ?? notification.subject.url, notification.repository.html_url ?? `https://github.com/${repository}`)
	return {
		id: `notification:${notification.id}`,
		surface: "notifications",
		repository,
		number: null,
		title: notification.subject.title,
		subtitle: `${notification.subject.type} in ${repository}`,
		body: compactMeta([
			`${notification.subject.type} notification`,
			`reason: ${notification.reason}`,
			notification.unread ? "unread" : "read",
		]).join("\n"),
		itemType: notification.subject.type,
		state: notification.unread ? "unread" : "read",
		author: null,
		url,
		updatedAt: new Date(notification.updated_at),
		meta: compactMeta([notification.reason, notification.unread ? "unread" : "read"]),
		action: notification.unread ? "mark-notification-read" : null,
	}
}

const parseDiscussionItem = (repository: string, discussion: RawDiscussionNode): AuxiliaryItem => ({
	id: `discussion:${repository}:${discussion.number}`,
	surface: "discussions",
	repository,
	number: discussion.number,
	title: discussion.title,
	subtitle: `${discussion.category.name} in ${repository}`,
	body: discussion.body ?? "",
	itemType: "discussion",
	state: discussion.answerChosenAt ? "answered" : "open",
	author: discussion.author?.login ?? null,
	url: discussion.url,
	updatedAt: new Date(discussion.updatedAt),
	meta: compactMeta([
		discussion.category.name,
		discussion.answerChosenAt ? "answered" : "open",
		`${discussion.comments.totalCount} comments`,
		typeof discussion.upvoteCount === "number" ? `${discussion.upvoteCount} upvotes` : null,
		discussion.author ? `by ${discussion.author.login}` : null,
	]),
	action: null,
})

const parsePullRequestFiles = (response: Schema.Schema.Type<typeof PullRequestFilesResponseSchema>): readonly RawPullRequestFile[] =>
	flattenSlurpedPages(response)

const parsePullRequestCommits = (response: Schema.Schema.Type<typeof PullRequestCommitsResponseSchema>): readonly CommitItem[] =>
	flattenSlurpedPages(response).map((raw) => {
		const messageParts = raw.commit.message.split("\n")
		return {
			oid: raw.sha,
			messageHeadline: messageParts[0] ?? "",
			messageBody: messageParts.slice(2).join("\n"),
			author: raw.author?.login ?? raw.commit.author?.name ?? "unknown",
			committedDate: raw.commit.author?.date ? new Date(raw.commit.author.date) : new Date(),
			url: raw.html_url ?? `https://github.com/commit/${raw.sha}`,
		}
	})

const diffPath = (path: string) => (/\s|"/.test(path) ? JSON.stringify(path) : path)

const prefixedDiffPath = (prefix: "a" | "b", path: string) => diffPath(`${prefix}/${path}`)

const fileHeaderPatch = (file: RawPullRequestFile) => {
	const oldPath = file.previous_filename ?? file.filename
	const newPath = file.filename
	const oldRef = file.status === "added" ? "/dev/null" : prefixedDiffPath("a", oldPath)
	const newRef = file.status === "removed" ? "/dev/null" : prefixedDiffPath("b", newPath)
	const lines = [
		`diff --git ${prefixedDiffPath("a", oldPath)} ${prefixedDiffPath("b", newPath)}`,
		...(file.status === "renamed" && file.previous_filename ? [`rename from ${oldPath}`, `rename to ${newPath}`] : []),
		`--- ${oldRef}`,
		`+++ ${newRef}`,
	]
	if (file.patch) lines.push(file.patch.trimEnd())
	return lines.join("\n")
}

export const pullRequestFilesToPatch = (files: readonly RawPullRequestFile[]) => files.map(fileHeaderPatch).join("\n")

const fallbackCreatedComment = (input: CreatePullRequestCommentInput): PullRequestReviewComment => ({
	id: `created:${input.repository}:${input.number}:${input.path}:${input.side}:${input.line}:${Date.now()}`,
	path: input.path,
	line: input.line,
	side: input.side,
	author: "you",
	body: input.body,
	createdAt: new Date(),
	url: null,
})

export type GitHubError = CommandError | JsonParseError | Schema.SchemaError

const MERGEABLE_BY_RAW: Record<string, Mergeable> = {
	MERGEABLE: "mergeable",
	CONFLICTING: "conflicting",
}

const normalizeMergeable = (value: string): Mergeable => MERGEABLE_BY_RAW[value] ?? "unknown"

const REVIEW_EVENT_CLI_FLAG = {
	COMMENT: "--comment",
	APPROVE: "--approve",
	REQUEST_CHANGES: "--request-changes",
} as const satisfies Record<SubmitPullRequestReviewInput["event"], string>

export class GitHubService extends Context.Service<
	GitHubService,
	{
		readonly listOpenPullRequests: (mode: PullRequestQueueMode, repository: string | null) => Effect.Effect<readonly PullRequestItem[], GitHubError>
		readonly listOpenPullRequestPage: (input: ListPullRequestPageInput) => Effect.Effect<PullRequestPage, GitHubError>
		readonly listOpenPullRequestDetails: (mode: PullRequestQueueMode, repository: string | null) => Effect.Effect<readonly PullRequestItem[], GitHubError>
		readonly listOpenIssuePage: (input: ListIssuePageInput) => Effect.Effect<IssuePage, GitHubError>
		readonly getIssueDetails: (repository: string, number: number) => Effect.Effect<IssueItem, GitHubError>
		readonly listIssueComments: (repository: string, number: number) => Effect.Effect<readonly IssueComment[], GitHubError>
		readonly createIssueComment: (repository: string, number: number, body: string) => Effect.Effect<IssueComment, GitHubError>
		readonly closeIssue: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly reopenIssue: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly getPullRequestDetails: (repository: string, number: number) => Effect.Effect<PullRequestItem, GitHubError>
		readonly getAuthenticatedUser: () => Effect.Effect<string, GitHubError>
		readonly listNotifications: () => Effect.Effect<readonly AuxiliaryItem[], GitHubError>
		readonly markNotificationRead: (notificationId: string) => Effect.Effect<void, CommandError>
		readonly listRepositoryDiscussions: (repository: string | null) => Effect.Effect<readonly AuxiliaryItem[], GitHubError>
		readonly listMyRepositories: () => Effect.Effect<readonly AuxiliaryItem[], GitHubError>
		readonly listStarredRepositories: () => Effect.Effect<readonly AuxiliaryItem[], GitHubError>
		readonly unstarRepository: (repository: string) => Effect.Effect<void, CommandError>
		readonly listSharedRepositories: () => Effect.Effect<readonly AuxiliaryItem[], GitHubError>
		readonly listWatchedRepositories: () => Effect.Effect<readonly AuxiliaryItem[], GitHubError>
		readonly unwatchRepository: (repository: string) => Effect.Effect<void, CommandError>
		readonly listPullRequestCommits: (repository: string, number: number) => Effect.Effect<readonly CommitItem[], GitHubError>
		readonly getCommitDiff: (repository: string, sha: string) => Effect.Effect<string, GitHubError>
		readonly getPullRequestDiff: (repository: string, number: number) => Effect.Effect<string, GitHubError>
		readonly listPullRequestComments: (repository: string, number: number) => Effect.Effect<readonly PullRequestReviewComment[], GitHubError>
		readonly listPullRequestConversation: (repository: string, number: number) => Effect.Effect<readonly PullRequestConversationItem[], GitHubError>
		readonly getPullRequestMergeInfo: (repository: string, number: number) => Effect.Effect<PullRequestMergeInfo, GitHubError>
		readonly mergePullRequest: (repository: string, number: number, action: PullRequestMergeAction) => Effect.Effect<void, CommandError>
		readonly closePullRequest: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly createPullRequestComment: (input: CreatePullRequestCommentInput) => Effect.Effect<PullRequestReviewComment, GitHubError>
		readonly submitPullRequestReview: (input: SubmitPullRequestReviewInput) => Effect.Effect<void, CommandError>
		readonly toggleDraftStatus: (repository: string, number: number, isDraft: boolean) => Effect.Effect<void, CommandError>
		readonly listRepoLabels: (repository: string) => Effect.Effect<readonly { readonly name: string; readonly color: string | null }[], GitHubError>
		readonly addPullRequestLabel: (repository: string, number: number, label: string) => Effect.Effect<void, CommandError>
		readonly removePullRequestLabel: (repository: string, number: number, label: string) => Effect.Effect<void, CommandError>
		readonly addIssueLabel: (repository: string, number: number, label: string) => Effect.Effect<void, CommandError>
		readonly removeIssueLabel: (repository: string, number: number, label: string) => Effect.Effect<void, CommandError>
	}
>()("ghui/GitHubService") {
	static readonly layerNoDeps = Layer.effect(
		GitHubService,
		Effect.gen(function* () {
			const command = yield* CommandRunner

			const ghJson = <S extends Schema.Top>(label: string, schema: S, args: readonly string[]) =>
				command.runSchema(schema, "gh", args).pipe(Effect.withSpan(`GitHubService.${label}`))

			const ghVoid = (label: string, args: readonly string[]) => command.run("gh", args).pipe(Effect.withSpan(`GitHubService.${label}`), Effect.asVoid)

			const searchPage = <Item extends Schema.Top>(label: string, query: string, schema: Item, parse: (node: Item["Type"]) => PullRequestItem) => {
				const responseSchema = SearchResponseSchema(schema)
				return Effect.fn(`GitHubService.${label}`)(function* (input: ListPullRequestPageInput) {
					const response: SearchResponse<Item["Type"]> = yield* command.runSchema(responseSchema, "gh", [
						"api",
						"graphql",
						"-f",
						`query=${query}`,
						"-F",
						`searchQuery=${searchQuery(input.mode, input.repository)}`,
						"-F",
						`first=${input.pageSize}`,
						...(input.cursor ? ["-F", `after=${input.cursor}`] : []),
					])
					return pullRequestPage(response.data.search, parse)
				})
			}

			const issueSearchPage = <Item extends Schema.Top>(label: string, query: string, schema: Item, parse: (node: Item["Type"]) => IssueItem) => {
				const responseSchema = SearchResponseSchema(schema)
				return Effect.fn(`GitHubService.${label}`)(function*(input: ListIssuePageInput) {
					const response: SearchResponse<Item["Type"]> = yield* command.runSchema(responseSchema, "gh", [
						"api", "graphql",
						"-f", `query=${query}`,
						"-F", `searchQuery=${issueSearch(input.mode, "@me", input.repository)}`,
						"-F", `first=${input.pageSize}`,
						...(input.cursor ? ["-F", `after=${input.cursor}`] : []),
					])
					return issuePage(response.data.search, parse)
				})
			}

			const listOpenPullRequestSearchPage = searchPage("listOpenPullRequestSearchPage", pullRequestSummarySearchQuery, RawPullRequestSummaryNodeSchema, parsePullRequestSummary)
			const listOpenPullRequestDetailsPage = searchPage("listOpenPullRequestDetailsPage", pullRequestSearchQuery, RawPullRequestNodeSchema, parsePullRequest)
			const listOpenIssueSearchPage = issueSearchPage("listOpenIssueSearchPage", issueSearchQuery, RawIssueNodeSchema, parseIssue)

			const listRepositoryPullRequestPage = Effect.fn("GitHubService.listRepositoryPullRequestPage")(function* (input: ListPullRequestPageInput) {
				if (!input.repository) return { items: [], endCursor: null, hasNextPage: false } satisfies PullRequestPage
				const repo = repositoryParts(input.repository)
				if (!repo) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Invalid repository: ${input.repository}`, cause: input.repository })
				}

				const response = yield* command.runSchema(RepositoryPullRequestsResponseSchema, "gh", [
					"api",
					"graphql",
					"-f",
					`query=${repositoryPullRequestsQuery}`,
					"-F",
					`owner=${repo.owner}`,
					"-F",
					`name=${repo.name}`,
					"-F",
					`first=${input.pageSize}`,
					...(input.cursor ? ["-F", `after=${input.cursor}`] : []),
				])
				const connection = response.data.repository?.pullRequests
				if (!connection) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Repository not found: ${input.repository}`, cause: input.repository })
				}
				return pullRequestPage(connection, parsePullRequestSummary)
			})


			const listRepositoryIssuePage = Effect.fn("GitHubService.listRepositoryIssuePage")(function* (input: ListIssuePageInput) {
				if (!input.repository) return { items: [], endCursor: null, hasNextPage: false } satisfies IssuePage
				const repo = repositoryParts(input.repository)
				if (!repo) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Invalid repository: ${input.repository}`, cause: input.repository })
				}

				const response = yield* command.runSchema(RepositoryIssuesResponseSchema, "gh", [
					"api", "graphql",
					"-f", `query=${repositoryIssuesQuery}`,
					"-F", `owner=${repo.owner}`,
					"-F", `name=${repo.name}`,
					"-F", `first=${input.pageSize}`,
					...(input.cursor ? ["-F", `after=${input.cursor}`] : []),
				])
				const connection = response.data.repository?.issues
				if (!connection) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Repository not found: ${input.repository}`, cause: input.repository })
				}
				return issuePage(connection, parseIssue)
			})

			const listOpenPullRequestPage = Effect.fn("GitHubService.listOpenPullRequestPage")(function* (input: ListPullRequestPageInput) {
				const pageSize = Math.max(1, Math.min(100, input.pageSize))
				const pageInput = { ...input, pageSize }
				if (pageInput.mode === "repository" && pageInput.repository) return yield* listRepositoryPullRequestPage(pageInput)
				return yield* listOpenPullRequestSearchPage(pageInput)
			})

			const listOpenIssuePage = Effect.fn("GitHubService.listOpenIssuePage")(function* (input: ListIssuePageInput) {
				const pageSize = Math.max(1, Math.min(100, input.pageSize))
				const pageInput = { ...input, pageSize }
				if (pageInput.mode === "repository" && pageInput.repository) return yield* listRepositoryIssuePage(pageInput)
				return yield* listOpenIssueSearchPage(pageInput)
			})

			const paginatePages = Effect.fn("GitHubService.paginatePages")(function* (
				mode: PullRequestQueueMode,
				repository: string | null,
				loadPage: (input: ListPullRequestPageInput) => Effect.Effect<PullRequestPage, GitHubError>,
			) {
				const pullRequests: PullRequestItem[] = []
				let cursor: string | null = null

				while (pullRequests.length < config.prFetchLimit) {
					const page: PullRequestPage = yield* loadPage({ mode, repository, cursor, pageSize: Math.min(100, config.prFetchLimit - pullRequests.length) })
					pullRequests.push(...page.items)
					if (!page.hasNextPage || !page.endCursor) break
					cursor = page.endCursor
				}

				return pullRequests
			})

			const listOpenPullRequests = Effect.fn("GitHubService.listOpenPullRequests")(function* (mode: PullRequestQueueMode, repository: string | null) {
				return yield* paginatePages(mode, repository, listOpenPullRequestPage)
			})
			const listOpenPullRequestDetails = Effect.fn("GitHubService.listOpenPullRequestDetails")(function* (mode: PullRequestQueueMode, repository: string | null) {
				return yield* paginatePages(mode, repository, listOpenPullRequestDetailsPage)
			})


			const getIssueDetails = Effect.fn("GitHubService.getIssueDetails")(function* (repository: string, number: number) {
				const repo = repositoryParts(repository)
				if (!repo) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Invalid repository: ${repository}`, cause: repository })
				}

				const response = yield* command.runSchema(IssueDetailResponseSchema, "gh", [
					"api", "graphql",
					"-f", `query=${issueDetailQuery}`,
					"-F", `owner=${repo.owner}`,
					"-F", `name=${repo.name}`,
					"-F", `number=${number}`,
				])
				const issue = response.data.repository?.issue
				if (!issue) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Issue not found: ${repository}#${number}`, cause: `${repository}#${number}` })
				}
				return parseIssue(issue)
			})

			const getPullRequestDetails = Effect.fn("GitHubService.getPullRequestDetails")(function* (repository: string, number: number) {
				const repo = repositoryParts(repository)
				if (!repo) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Invalid repository: ${repository}`, cause: repository })
				}

				const response = yield* command.runSchema(PullRequestDetailResponseSchema, "gh", [
					"api",
					"graphql",
					"-f",
					`query=${pullRequestDetailQuery}`,
					"-F",
					`owner=${repo.owner}`,
					"-F",
					`name=${repo.name}`,
					"-F",
					`number=${number}`,
				])
				const pullRequest = response.data.repository?.pullRequest
				if (!pullRequest) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Pull request not found: ${repository}#${number}`, cause: `${repository}#${number}` })
				}
				return parsePullRequest(pullRequest)
			})

			const getAuthenticatedUser = () => ghJson("getAuthenticatedUser", ViewerSchema, ["api", "user"]).pipe(Effect.map((viewer) => viewer.login))

			const listNotifications = () =>
				ghJson("listNotifications", NotificationListResponseSchema, [
					"api", "--method", "GET", "--paginate", "--slurp", "notifications",
					"-f", "per_page=100",
				]).pipe(Effect.map((response) => flattenSlurpedPages(response).map(parseNotificationItem)))

			const markNotificationRead = (notificationId: string) => {
				const threadId = notificationId.replace(/^notification:/, "")
				return ghVoid("markNotificationRead", ["api", "--method", "PATCH", `notifications/threads/${threadId}`])
			}

			const listRepositoryDiscussions = Effect.fn("GitHubService.listRepositoryDiscussions")(function*(repository: string | null) {
				if (!repository) return [] as readonly AuxiliaryItem[]
				const repo = repositoryParts(repository)
				if (!repo) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Invalid repository: ${repository}`, cause: repository })
				}
				const response = yield* command.runSchema(RepositoryDiscussionsResponseSchema, "gh", [
					"api", "graphql",
					"-f", `query=${repositoryDiscussionsQuery}`,
					"-F", `owner=${repo.owner}`,
					"-F", `name=${repo.name}`,
				])
				return response.data.repository?.discussions.nodes.flatMap((node) => node ? [parseDiscussionItem(repository, node)] : []) ?? []
			})

			const listRepositoryItems = (label: string, surface: "myRepos" | "stars" | "sharedRepos" | "watchedRepos", endpoint: string, queryArgs: readonly string[]) =>
				Effect.gen(function*() {
					const repositories: RestRepository[] = []
					let page = 1
					while (repositories.length < config.prFetchLimit) {
						const pageSize = Math.min(100, config.prFetchLimit - repositories.length)
						const response = yield* ghJson(label, RepositoryPageResponseSchema, [
							"api", "--method", "GET", endpoint,
							"-f", `per_page=${pageSize}`,
							"-f", `page=${page}`,
							...queryArgs,
						])
						repositories.push(...response)
						if (response.length < pageSize) break
						page += 1
					}
					return repositories.map((repository) => parseRepositoryItem(surface, repository))
				})

			const listMyRepositories = () =>
				listRepositoryItems("listMyRepositories", "myRepos", "user/repos", [
					"-f", "affiliation=owner",
					"-f", "sort=updated",
				])

			const listStarredRepositories = () =>
				listRepositoryItems("listStarredRepositories", "stars", "user/starred", [
					"-f", "sort=updated",
				])

			const unstarRepository = (repository: string) =>
				ghVoid("unstarRepository", ["api", "--method", "DELETE", `user/starred/${repository}`])

			const listSharedRepositories = () =>
				listRepositoryItems("listSharedRepositories", "sharedRepos", "user/repos", [
					"-f", "affiliation=collaborator",
					"-f", "sort=updated",
				])

			const listWatchedRepositories = () =>
				listRepositoryItems("listWatchedRepositories", "watchedRepos", "user/subscriptions", [])

			const unwatchRepository = (repository: string) =>
				ghVoid("unwatchRepository", ["api", "--method", "DELETE", `repos/${repository}/subscription`])

			const listPullRequestCommits = (repository: string, number: number) =>
				ghJson("listPullRequestCommits", PullRequestCommitsResponseSchema, [
					"api", "--method", "GET", "--paginate", "--slurp", `repos/${repository}/pulls/${number}/commits`,
					"-f", "per_page=100",
				]).pipe(Effect.map(parsePullRequestCommits))

			const getCommitDiff = (repository: string, sha: string) =>
				ghJson("getCommitDiff", PullRequestFilesResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/commits/${sha}/files`]).pipe(
					Effect.map((response) => pullRequestFilesToPatch(parsePullRequestFiles(response))),
				)

			const getPullRequestDiff = (repository: string, number: number) =>
				ghJson("getPullRequestDiff", PullRequestFilesResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/pulls/${number}/files`]).pipe(
					Effect.map((response) => pullRequestFilesToPatch(parsePullRequestFiles(response))),
				)

			const listPullRequestComments = (repository: string, number: number) =>
				ghJson("listPullRequestComments", CommentsResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/pulls/${number}/comments`]).pipe(
					Effect.map(parsePullRequestComments),
				)

			const listIssueComments = (repository: string, number: number) =>
				ghJson("listIssueComments", IssueCommentsResponseSchema, [
					"api", "--paginate", "--slurp", `repos/${repository}/issues/${number}/comments`,
				]).pipe(Effect.map(parseIssueComments))

			const listPullRequestConversation = Effect.fn("GitHubService.listPullRequestConversation")(function* (repository: string, number: number) {
				const [issueComments, reviewComments] = yield* Effect.all(
					[
						ghJson("listPullRequestIssueComments", CommentsResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/issues/${number}/comments`]).pipe(
							Effect.map(parseConversationItems),
						),
						listPullRequestComments(repository, number).pipe(Effect.map((comments) => comments.map(reviewCommentConversationItem))),
					],
					{ concurrency: "unbounded" },
				)

				return sortConversationItems([...issueComments, ...reviewComments])
			})

			const getPullRequestMergeInfo = Effect.fn("GitHubService.getPullRequestMergeInfo")(function* (repository: string, number: number) {
				const info = yield* command.runSchema(MergeInfoResponseSchema, "gh", [
					"pr",
					"view",
					String(number),
					"--repo",
					repository,
					"--json",
					"number,title,state,isDraft,mergeable,reviewDecision,autoMergeRequest,statusCheckRollup",
				])
				const checkInfo = getCheckInfoFromContexts(info.statusCheckRollup)

				return {
					repository,
					number: info.number,
					title: info.title,
					state: info.state.toLowerCase() === "open" ? "open" : "closed",
					isDraft: info.isDraft,
					mergeable: normalizeMergeable(info.mergeable),
					reviewStatus: getReviewStatus(info),
					checkStatus: checkInfo.checkStatus,
					checkSummary: checkInfo.checkSummary,
					autoMergeEnabled: info.autoMergeRequest !== null,
				} satisfies PullRequestMergeInfo
			})

			const mergePullRequest = (repository: string, number: number, action: PullRequestMergeAction) =>
				ghVoid("mergePullRequest", ["pr", "merge", String(number), "--repo", repository, ...getMergeActionDefinition(action).cliArgs])

			const closePullRequest = (repository: string, number: number) => ghVoid("closePullRequest", ["pr", "close", String(number), "--repo", repository])

			const createPullRequestComment = Effect.fn("GitHubService.createPullRequestComment")(function* (input: CreatePullRequestCommentInput) {
				const response = yield* command.runSchema(PullRequestCommentSchema, "gh", [
					"api",
					"--method",
					"POST",
					`repos/${input.repository}/pulls/${input.number}/comments`,
					"-f",
					`body=${input.body}`,
					"-f",
					`commit_id=${input.commitId}`,
					"-f",
					`path=${input.path}`,
					"-F",
					`line=${input.line}`,
					"-f",
					`side=${input.side}`,
					...(input.startLine === undefined ? [] : ["-F", `start_line=${input.startLine}`, "-f", `start_side=${input.startSide ?? input.side}`]),
				])
				return parsePullRequestComment(response) ?? fallbackCreatedComment(input)
			})

			const createIssueComment = (repository: string, number: number, body: string) =>
				ghJson("createIssueComment", IssueCommentSchema, [
					"api", "--method", "POST", `repos/${repository}/issues/${number}/comments`,
					"-f", `body=${body}`,
				]).pipe(Effect.map(parseIssueComment))

			const submitPullRequestReview = (input: SubmitPullRequestReviewInput) =>
				ghVoid("submitPullRequestReview", ["pr", "review", String(input.number), "--repo", input.repository, REVIEW_EVENT_CLI_FLAG[input.event], "--body", input.body])

			const toggleDraftStatus = (repository: string, number: number, isDraft: boolean) =>
				ghVoid("toggleDraftStatus", ["pr", "ready", String(number), "--repo", repository, ...(isDraft ? [] : ["--undo"])])

			const closeIssue = (repository: string, number: number) =>
				ghVoid("closeIssue", ["api", "--method", "PATCH", `repos/${repository}/issues/${number}`, "-f", "state=closed"])

			const reopenIssue = (repository: string, number: number) =>
				ghVoid("reopenIssue", ["api", "--method", "PATCH", `repos/${repository}/issues/${number}`, "-f", "state=open"])

			const listRepoLabels = (repository: string) =>
				ghJson("listRepoLabels", RepoLabelsResponseSchema, ["label", "list", "--repo", repository, "--json", "name,color", "--limit", "100"]).pipe(
					Effect.map((labels) => labels.map((label) => ({ name: label.name, color: `#${label.color}` }))),
				)

			const addPullRequestLabel = (repository: string, number: number, label: string) =>
				ghVoid("addPullRequestLabel", ["pr", "edit", String(number), "--repo", repository, "--add-label", label])

			const removePullRequestLabel = (repository: string, number: number, label: string) =>
				ghVoid("removePullRequestLabel", ["pr", "edit", String(number), "--repo", repository, "--remove-label", label])

			const addIssueLabel = (repository: string, number: number, label: string) =>
				ghVoid("addIssueLabel", ["issue", "edit", String(number), "--repo", repository, "--add-label", label])

			const removeIssueLabel = (repository: string, number: number, label: string) =>
				ghVoid("removeIssueLabel", ["issue", "edit", String(number), "--repo", repository, "--remove-label", label])

			return GitHubService.of({
				listOpenPullRequests,
				listOpenPullRequestPage,
				listOpenPullRequestDetails,
				listOpenIssuePage,
				getIssueDetails,
				listIssueComments,
				createIssueComment,
				closeIssue,
				reopenIssue,
				getPullRequestDetails,
				getAuthenticatedUser,
				listNotifications,
				markNotificationRead,
				listRepositoryDiscussions,
				listMyRepositories,
				listStarredRepositories,
				unstarRepository,
				listSharedRepositories,
				listWatchedRepositories,
				unwatchRepository,
				listPullRequestCommits,
				getCommitDiff,
				getPullRequestDiff,
				listPullRequestComments,
				listPullRequestConversation,
				getPullRequestMergeInfo,
				mergePullRequest,
				closePullRequest,
				createPullRequestComment,
				submitPullRequestReview,
				toggleDraftStatus,
				listRepoLabels,
				addPullRequestLabel,
				removePullRequestLabel,
				addIssueLabel,
				removeIssueLabel,
			})
		}),
	)

	static readonly layer = GitHubService.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))
}
