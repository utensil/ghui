import type { DiffRenderable, PasteEvent, ScrollBoxRenderable } from "@opentui/core"
import { RegistryContext, useAtom, useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useKeymap } from "@ghui/keymap/react"
import { appKeymap, type AppCtx } from "./keymap/all.js"
import { useOpenTuiSubscribe } from "./keyboard/opentuiAdapter.js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Cause, Effect, Layer, Schedule } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { buildAppCommands } from "./appCommands.js"
import type { AppCommand } from "./commands.js"
import { clampCommandIndex, commandEnabled, defineCommand, filterCommands, sortCommandsByScope } from "./commands.js"
import { config } from "./config.js"
import { auxiliarySurfaces, isAuxiliarySurface, surfaceLabels, surfaceShortLabels, type AppSurface, type AuxiliaryItem, type AuxiliarySurface, type CreatePullRequestCommentInput, type DiffCommentSide, type IssueComment, type IssueItem, type ListIssuePageInput, type ListPullRequestPageInput, type LoadStatus, type PullRequestConversationItem, type PullRequestItem, type PullRequestLabel, type PullRequestMergeAction, type PullRequestReviewComment, type SubmitPullRequestReviewInput } from "./domain.js"
import { formatShortDate, formatTimestamp } from "./date.js"
import { errorMessage } from "./errors.js"
import { activeIssueViews, initialIssueView, issueViewCacheKey, issueViewEquals, issueViewLabel, issueViewMode, issueViewRepository, nextIssueView, type IssueView } from "./issueViews.js"
import { availableMergeActions, mergeInfoFromPullRequest } from "./mergeActions.js"
import { Observability } from "./observability.js"
import { mergeCachedDetails } from "./pullRequestCache.js"
import { activePullRequestViews, initialPullRequestView, nextView, parseRepositoryInput, type PullRequestView, viewCacheKey, viewEquals, viewLabel, viewMode, viewRepository } from "./pullRequestViews.js"
import { BrowserOpener } from "./services/BrowserOpener.js"
import { Clipboard } from "./services/Clipboard.js"
import { CommandRunner } from "./services/CommandRunner.js"
import { GitHubService } from "./services/GitHubService.js"
import { loadStoredDiffWhitespaceMode, loadStoredThemeId, saveStoredDiffWhitespaceMode, saveStoredThemeId } from "./themeStore.js"
import { colors, filterThemeDefinitions, mixHex, setActiveTheme, themeDefinitions, type ThemeId } from "./ui/colors.js"
import { AUXILIARY_BODY_SCROLL_LIMIT, AuxiliaryDetailBody, AuxiliaryDetailHeader, AuxiliaryDetailsPane, getAuxiliaryDetailHeaderHeight, getAuxiliaryDetailJunctionRows, getAuxiliaryDetailsPaneHeight, getScrollableAuxiliaryBodyHeight } from "./ui/AuxiliaryDetailsPane.js"
import { auxiliaryListRowIndex, AuxiliaryList, buildAuxiliaryListRows } from "./ui/AuxiliaryList.js"
import { backspace as editorBackspace, deleteForward as editorDeleteForward, deleteToLineEnd, deleteToLineStart, deleteWordBackward, deleteWordForward, insertText, moveLeft as editorMoveLeft, moveLineEnd, moveLineStart, moveRight as editorMoveRight, moveVertically, moveWordBackward, moveWordForward, type CommentEditorValue } from "./ui/commentEditor.js"
import { buildStackedDiffFiles, diffAnchorOnSide, diffCommentAnchorLabel, diffCommentLocationKey, getStackedDiffCommentAnchors, minimizeWhitespaceDiffFiles, nearestDiffCommentAnchorIndex, PullRequestDiffState, pullRequestDiffKey, safeDiffFileIndex, scrollTopForVisibleLine, splitPatchFiles, stackedDiffFileAtLine, verticalDiffAnchor, type DiffCommentAnchor, type DiffView, type DiffWhitespaceMode, type DiffWrapMode, type StackedDiffCommentAnchor } from "./ui/diff.js"
import { DETAIL_BODY_SCROLL_LIMIT, DetailBody, DetailHeader, DetailPlaceholder, DetailsPane, getDetailHeaderHeight, getDetailJunctionRows, getDetailsPaneHeight, getScrollableDetailBodyHeight, LoadingPane, type DetailConversationStatus, type DetailPlaceholderContent } from "./ui/DetailsPane.js"
import { FooterHints, initialRetryProgress, RetryProgress } from "./ui/FooterHints.js"
import { ISSUE_BODY_SCROLL_LIMIT, IssueDetailBody, IssueDetailHeader, IssueDetailsPane, getIssueDetailHeaderHeight, getIssueDetailJunctionRows, getIssueDetailsPaneHeight, getScrollableIssueBodyHeight } from "./ui/IssueDetailsPane.js"
import { buildIssueListRows, issueListRowIndex, IssueList } from "./ui/IssueList.js"
import { Divider, fitCell, PlainLine, SeparatorColumn } from "./ui/primitives.js"
import { CommandPalette } from "./ui/CommandPalette.js"
import { ChangedFilesModal, CloseModal, CommentModal, CommentThreadModal, ConfirmActionModal, filterChangedFiles, filterLabels, initialChangedFilesModalState, initialCloseModalState, initialCommandPaletteState, initialCommentModalState, initialCommentThreadModalState, initialConfirmActionModalState, initialLabelModalState, initialMergeModalState, initialModal, initialOpenRepositoryModalState, initialSubmitReviewModalState, initialThemeModalState, LabelModal, MergeModal, Modal, OpenRepositoryModal, submitReviewOptions, SubmitReviewModal, ThemeModal, type ChangedFilesModalState, type CloseModalState, type CommandPaletteState, type CommentModalState, type CommentThreadModalState, type ConfirmActionModalState, type LabelModalState, type MergeModalState, type ModalState, type ModalTag, type OpenRepositoryModalState, type SubmitReviewModalState, type ThemeModalState } from "./ui/modals.js"
import { groupBy, repositoryOwner, reviewLabel } from "./ui/pullRequests.js"
import { PullRequestDiffPane } from "./ui/PullRequestDiffPane.js"
import { buildPullRequestListRows, pullRequestListRowIndex, PullRequestList } from "./ui/PullRequestList.js"
import { editSingleLineInput, isSingleLineInputKey, printableKeyText, singleLineText } from "./ui/singleLineInput.js"

const parseOptionalPositiveInt = (value: string | undefined, fallback: number | null) => {
	if (value === undefined) return fallback
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const mockPrCount = parseOptionalPositiveInt(process.env.GHUI_MOCK_PR_COUNT, null)
const pullRequestPageSize = Math.min(100, parseOptionalPositiveInt(process.env.GHUI_PR_PAGE_SIZE, config.prPageSize) ?? config.prPageSize)
const githubServiceLayer = mockPrCount !== null
	? (await import("./services/MockGitHubService.js")).MockGitHubService.layer({ prCount: mockPrCount, repoCount: parseOptionalPositiveInt(process.env.GHUI_MOCK_REPO_COUNT, 4) ?? 4 })
	: GitHubService.layerNoDeps

const githubRuntime = Atom.runtime(
	Layer.mergeAll(githubServiceLayer, Clipboard.layerNoDeps, BrowserOpener.layerNoDeps).pipe(
		Layer.provide(CommandRunner.layer),
		Layer.provideMerge(Observability.layer),
	),
)
const [initialThemeId, initialDiffWhitespaceMode] = await Promise.all([Effect.runPromise(loadStoredThemeId), Effect.runPromise(loadStoredDiffWhitespaceMode)])

interface PullRequestLoad {
	readonly view: PullRequestView
	readonly data: readonly PullRequestItem[]
	readonly fetchedAt: Date | null
	readonly endCursor: string | null
	readonly hasNextPage: boolean
}

interface IssueLoad {
	readonly view: IssueView
	readonly data: readonly IssueItem[]
	readonly fetchedAt: Date | null
	readonly endCursor: string | null
	readonly hasNextPage: boolean
}

interface AuxiliaryLoad {
	readonly cacheKey: string
	readonly surface: AuxiliarySurface
	readonly repository: string | null
	readonly data: readonly AuxiliaryItem[]
	readonly fetchedAt: Date | null
}

type AuxiliaryLoadProgress =
	| { readonly _tag: "loading" }
	| { readonly _tag: "error"; readonly message: string }

interface DetailPlaceholderInput {
	readonly surface: AppSurface
	readonly status: LoadStatus
	readonly retryProgress: RetryProgress
	readonly loadingIndicator: string
	readonly visibleCount: number
	readonly filterText: string
}

type BackgroundRefreshTarget =
	| { readonly _tag: "pullRequests" }
	| { readonly _tag: "issues" }
	| { readonly _tag: "auxiliary"; readonly surface: AuxiliarySurface; readonly repository: string | null; readonly cacheKey: string }

const backgroundRefreshTargetKey = (target: BackgroundRefreshTarget) =>
	target._tag === "auxiliary" ? `aux:${target.cacheKey}` : target._tag

type DiffLineColorConfig = {
	readonly gutter: string
	readonly content: string
}

type DiffSideRenderable = {
	readonly setLineColor: (line: number, color: DiffLineColorConfig) => void
}

type DiffRenderableRuntimeSides = {
	readonly leftSide?: DiffSideRenderable
	readonly rightSide?: DiffSideRenderable
}

interface AppliedDiffLineColor {
	readonly anchor: StackedDiffCommentAnchor
	readonly view: DiffView
}

interface AppliedDiffLineColorState {
	readonly contextKey: string | null
	readonly entries: readonly AppliedDiffLineColor[]
}

interface DetailHydration {
	readonly token: symbol
	notifyError: boolean
}

const PR_FETCH_RETRIES = 6
const FOCUSED_IDLE_REFRESH_MS = 5 * 60_000
const AUTO_REFRESH_JITTER_MS = 10_000
const STAGGERED_REFRESH_INITIAL_DELAY_MS = 5_000
const STAGGERED_REFRESH_GAP_MS = 20_000
const USER_INPUT_REFRESH_IDLE_MS = 1_500
const DIFF_STICKY_HEADER_LINES = 2
const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const
const MAX_REPOSITORY_CACHE_ENTRIES = 8
const LOAD_MORE_SELECTION_THRESHOLD = 8
const LOAD_MORE_SCROLL_THRESHOLD = 3
const DETAIL_PREFETCH_BEHIND = 1
const DETAIL_PREFETCH_AHEAD = 3
const DETAIL_PREFETCH_CONCURRENCY = 3
const DETAIL_PREFETCH_DELAY_MS = 120

const isReactActEnvironment = () =>
	(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT === true

const appendPullRequestPage = (existing: readonly PullRequestItem[], incoming: readonly PullRequestItem[]) => {
	const seen = new Set(existing.map((pullRequest) => pullRequest.url))
	const mergedIncoming = mergeCachedDetails(incoming, existing)
	return [...existing, ...mergedIncoming.filter((pullRequest) => !seen.has(pullRequest.url))]
}

const appendIssuePage = (existing: readonly IssueItem[], incoming: readonly IssueItem[]) => {
	const seen = new Set(existing.map((issue) => issue.url))
	return [...existing, ...incoming.filter((issue) => !seen.has(issue.url))]
}

const mergeCachedIssueDetails = (incoming: readonly IssueItem[], existing: readonly IssueItem[] | undefined) => {
	if (!existing) return incoming
	const existingByUrl = new Map(existing.map((issue) => [issue.url, issue]))
	return incoming.map((issue) => {
		const cached = existingByUrl.get(issue.url)
		if (!cached || !cached.detailLoaded && cached.timeline.length === 0) return issue
		return {
			...issue,
			body: cached.detailLoaded ? cached.body : issue.body,
			detailLoaded: cached.detailLoaded || issue.detailLoaded,
			timeline: cached.timeline.length > 0 ? cached.timeline : issue.timeline,
			comments: Math.max(issue.comments, cached.comments),
		} satisfies IssueItem
	})
}

const isRepositoryScopedAuxiliarySurface = (surface: AuxiliarySurface) =>
	surface === "discussions" || surface === "notifications"

const auxiliaryCacheKey = (surface: AuxiliarySurface, repository: string | null) =>
	isRepositoryScopedAuxiliarySurface(surface) ? `${surface}:${repository ?? ""}` : surface

const retryProgressAtom = Atom.make<RetryProgress>(initialRetryProgress).pipe(Atom.keepAlive)
const activeSurfaceAtom = Atom.make<AppSurface>("issues").pipe(Atom.keepAlive)
const activeViewAtom = Atom.make<PullRequestView>(initialPullRequestView()).pipe(Atom.keepAlive)
const activeIssueViewAtom = Atom.make<IssueView>(initialIssueView(null)).pipe(Atom.keepAlive)
const discussionRepositoryAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)
const notificationRepositoryAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)
const queueLoadCacheAtom = Atom.make<Partial<Record<string, PullRequestLoad>>>({}).pipe(Atom.keepAlive)
const issueLoadCacheAtom = Atom.make<Partial<Record<string, IssueLoad>>>({}).pipe(Atom.keepAlive)
const auxiliaryLoadCacheAtom = Atom.make<Partial<Record<string, AuxiliaryLoad>>>({}).pipe(Atom.keepAlive)
const queueSelectionAtom = Atom.make<Partial<Record<string, number>>>({}).pipe(Atom.keepAlive)
const issueSelectionAtom = Atom.make<Partial<Record<string, number>>>({}).pipe(Atom.keepAlive)
const auxiliarySelectionAtom = Atom.make<Partial<Record<string, number>>>({}).pipe(Atom.keepAlive)
const trimQueueLoadCache = (cache: Partial<Record<string, PullRequestLoad>>) => {
	const repositoryKeys = Object.keys(cache).filter((key) => key.startsWith("repository:"))
	if (repositoryKeys.length <= MAX_REPOSITORY_CACHE_ENTRIES) return cache
	const remove = new Set(repositoryKeys.slice(0, repositoryKeys.length - MAX_REPOSITORY_CACHE_ENTRIES))
	return Object.fromEntries(Object.entries(cache).filter(([key]) => !remove.has(key))) as Partial<Record<string, PullRequestLoad>>
}

const trimIssueLoadCache = (cache: Partial<Record<string, IssueLoad>>) => {
	const repositoryKeys = Object.keys(cache).filter((key) => key.startsWith("repository:"))
	if (repositoryKeys.length <= MAX_REPOSITORY_CACHE_ENTRIES) return cache
	const remove = new Set(repositoryKeys.slice(0, repositoryKeys.length - MAX_REPOSITORY_CACHE_ENTRIES))
	return Object.fromEntries(Object.entries(cache).filter(([key]) => !remove.has(key))) as Partial<Record<string, IssueLoad>>
}
const pullRequestsAtom = githubRuntime.atom(
	GitHubService.use((github) =>
		Effect.gen(function*() {
			const view = yield* Atom.get(activeViewAtom)
			const queueMode = viewMode(view)
			const repository = viewRepository(view)
			const cacheKey = viewCacheKey(view)
			yield* Atom.set(retryProgressAtom, initialRetryProgress)
			const page = yield* github.listOpenPullRequestPage({
				mode: queueMode,
				repository,
				cursor: null,
				pageSize: Math.min(pullRequestPageSize, config.prFetchLimit),
			}).pipe(
					Effect.tapError(() =>
						Atom.update(retryProgressAtom, (current) => RetryProgress.Retrying({
							attempt: Math.min(RetryProgress.$match(current, { Idle: () => 0, Retrying: ({ attempt }) => attempt }) + 1, PR_FETCH_RETRIES),
							max: PR_FETCH_RETRIES,
						}))
					),
					Effect.retry({ times: PR_FETCH_RETRIES, schedule: Schedule.exponential("300 millis", 2) }),
					Effect.tapError(() => Atom.set(retryProgressAtom, initialRetryProgress)),
				)

			yield* Atom.set(retryProgressAtom, initialRetryProgress)
			const cache = yield* Atom.get(queueLoadCacheAtom)
			const existingLoad = cache[cacheKey]
			const data = mergeCachedDetails(page.items, existingLoad?.data)
			const load = {
				view,
				data,
				fetchedAt: new Date(),
				endCursor: page.endCursor,
				hasNextPage: page.hasNextPage && data.length < config.prFetchLimit,
			} satisfies PullRequestLoad
			const nextCache = { ...cache }
			delete nextCache[cacheKey]
			nextCache[cacheKey] = load
			yield* Atom.set(queueLoadCacheAtom, trimQueueLoadCache(nextCache))
			return load
		})
	),
).pipe(Atom.keepAlive)
const issuesAtom = githubRuntime.atom(
	GitHubService.use((github) =>
		Effect.gen(function*() {
			const view = yield* Atom.get(activeIssueViewAtom)
			const queueMode = issueViewMode(view)
			const repository = issueViewRepository(view)
			const cacheKey = issueViewCacheKey(view)
			const page = yield* github.listOpenIssuePage({
				mode: queueMode,
				repository,
				cursor: null,
				pageSize: Math.min(pullRequestPageSize, config.prFetchLimit),
			}).pipe(
					Effect.tapError(() =>
						Atom.update(retryProgressAtom, (current) => RetryProgress.Retrying({
							attempt: Math.min(RetryProgress.$match(current, { Idle: () => 0, Retrying: ({ attempt }) => attempt }) + 1, PR_FETCH_RETRIES),
							max: PR_FETCH_RETRIES,
						}))
					),
					Effect.retry({ times: PR_FETCH_RETRIES, schedule: Schedule.exponential("300 millis", 2) }),
					Effect.tapError(() => Atom.set(retryProgressAtom, initialRetryProgress)),
				)

			yield* Atom.set(retryProgressAtom, initialRetryProgress)
			const cache = yield* Atom.get(issueLoadCacheAtom)
			const existingLoad = cache[cacheKey]
			const data = mergeCachedIssueDetails(page.items, existingLoad?.data)
			const load = {
				view,
				data,
				fetchedAt: new Date(),
				endCursor: page.endCursor,
				hasNextPage: page.hasNextPage && data.length < config.prFetchLimit,
			} satisfies IssueLoad
			const nextCache = { ...cache }
			delete nextCache[cacheKey]
			nextCache[cacheKey] = load
			yield* Atom.set(issueLoadCacheAtom, trimIssueLoadCache(nextCache))
			return load
		})
	),
).pipe(Atom.keepAlive)
const auxiliaryAtom = githubRuntime.atom(
	GitHubService.use((github) =>
		Effect.gen(function*() {
			const activeSurface = yield* Atom.get(activeSurfaceAtom)
			if (!isAuxiliarySurface(activeSurface)) return null
			const repository = activeSurface === "discussions"
				? yield* Atom.get(discussionRepositoryAtom)
				: activeSurface === "notifications"
					? yield* Atom.get(notificationRepositoryAtom)
					: null
			const cacheKey = auxiliaryCacheKey(activeSurface, repository)
			const data = yield* (() => {
				switch (activeSurface) {
					case "notifications":
						return github.listNotifications().pipe(Effect.map((items) => repository ? items.filter((item) => item.repository === repository) : items))
					case "discussions":
						return github.listRepositoryDiscussions(repository)
					case "myRepos":
						return github.listMyRepositories()
					case "stars":
						return github.listStarredRepositories()
					case "sharedRepos":
						return github.listSharedRepositories()
					case "watchedRepos":
						return github.listWatchedRepositories()
				}
			})().pipe(
				Effect.tapError(() =>
					Atom.update(retryProgressAtom, (current) => RetryProgress.Retrying({
						attempt: Math.min(RetryProgress.$match(current, { Idle: () => 0, Retrying: ({ attempt }) => attempt }) + 1, PR_FETCH_RETRIES),
						max: PR_FETCH_RETRIES,
					}))
				),
				Effect.retry({ times: PR_FETCH_RETRIES, schedule: Schedule.exponential("300 millis", 2) }),
				Effect.tapError(() => Atom.set(retryProgressAtom, initialRetryProgress)),
			)

			yield* Atom.set(retryProgressAtom, initialRetryProgress)
			const load = {
				cacheKey,
				surface: activeSurface,
				repository,
				data,
				fetchedAt: new Date(),
			} satisfies AuxiliaryLoad
			yield* Atom.update(auxiliaryLoadCacheAtom, (cache) => ({ ...cache, [cacheKey]: load }))
			return load
		})
	),
).pipe(Atom.keepAlive)
const selectedIndexAtom = Atom.make(0)
const noticeAtom = Atom.make<string | null>(null)
const filterQueryAtom = Atom.make("")
const filterDraftAtom = Atom.make("")
const filterModeAtom = Atom.make(false)
const detailFullViewAtom = Atom.make(false)
const detailScrollOffsetAtom = Atom.make(0)
const diffFullViewAtom = Atom.make(false)
const diffFileIndexAtom = Atom.make(0)
const diffScrollTopAtom = Atom.make(0)
const diffRenderViewAtom = Atom.make<DiffView>("split")
const diffWrapModeAtom = Atom.make<DiffWrapMode>("none")
const diffWhitespaceModeAtom = Atom.make<DiffWhitespaceMode>(initialDiffWhitespaceMode)
const diffCommentModeAtom = Atom.make(false)
const diffCommentAnchorIndexAtom = Atom.make(0)
const diffPreferredSideAtom = Atom.make<DiffCommentSide | null>(null)
const diffCommentThreadsAtom = Atom.make<Record<string, readonly PullRequestReviewComment[]>>({}).pipe(Atom.keepAlive)
const diffCommentsLoadedAtom = Atom.make<Record<string, "loading" | "ready">>({}).pipe(Atom.keepAlive)
const pullRequestConversationAtom = Atom.make<Record<string, readonly PullRequestConversationItem[]>>({}).pipe(Atom.keepAlive)
const pullRequestConversationLoadedAtom = Atom.make<Record<string, "loading" | "ready">>({}).pipe(Atom.keepAlive)
const issueCommentsLoadedAtom = Atom.make<Record<string, "loading" | "ready" | "error">>({}).pipe(Atom.keepAlive)
const pullRequestDiffCacheAtom = Atom.make<Record<string, PullRequestDiffState>>({}).pipe(Atom.keepAlive)

const activeModalAtom = Atom.make<Modal>(initialModal)
const themeIdAtom = Atom.make<ThemeId>(initialThemeId).pipe(Atom.keepAlive)
const labelCacheAtom = Atom.make<Record<string, readonly PullRequestLabel[]>>({}).pipe(Atom.keepAlive)
const pullRequestOverridesAtom = Atom.make<Record<string, PullRequestItem>>({}).pipe(Atom.keepAlive)
const issueOverridesAtom = Atom.make<Record<string, IssueItem>>({}).pipe(Atom.keepAlive)
const recentlyCompletedPullRequestsAtom = Atom.make<Record<string, PullRequestItem>>({}).pipe(Atom.keepAlive)
const recentlyCompletedIssuesAtom = Atom.make<Record<string, IssueItem>>({}).pipe(Atom.keepAlive)
const usernameAtom = githubRuntime.atom(GitHubService.use((github) => github.getAuthenticatedUser())).pipe(Atom.keepAlive)

const pullRequestLoadAtom = Atom.make((get) => {
	const view = get(activeViewAtom)
	const cacheKey = viewCacheKey(view)
	const cache = get(queueLoadCacheAtom)
	const result = get(pullRequestsAtom)
	const resolved = AsyncResult.getOrElse(result, () => null)
	return cache[cacheKey] ?? (resolved && viewCacheKey(resolved.view) === cacheKey ? resolved : null)
})

const issueLoadAtom = Atom.make((get) => {
	const view = get(activeIssueViewAtom)
	const cacheKey = issueViewCacheKey(view)
	const cache = get(issueLoadCacheAtom)
	const result = get(issuesAtom)
	const resolved = AsyncResult.getOrElse(result, () => null)
	return cache[cacheKey] ?? (resolved && issueViewCacheKey(resolved.view) === cacheKey ? resolved : null)
})

const auxiliaryLoadAtom = Atom.make((get) => {
	const activeSurface = get(activeSurfaceAtom)
	if (!isAuxiliarySurface(activeSurface)) return null
	const repository = activeSurface === "discussions" ? get(discussionRepositoryAtom) : activeSurface === "notifications" ? get(notificationRepositoryAtom) : null
	const cacheKey = auxiliaryCacheKey(activeSurface, repository)
	const cache = get(auxiliaryLoadCacheAtom)
	const result = get(auxiliaryAtom)
	const resolved = AsyncResult.getOrElse(result, () => null)
	return cache[cacheKey] ?? (resolved && resolved.cacheKey === cacheKey ? resolved : null)
})

const isLoadingQueueModeAtom = Atom.make((get) => {
	const cacheKey = viewCacheKey(get(activeViewAtom))
	const resolved = AsyncResult.getOrElse(get(pullRequestsAtom), () => null)
	return resolved !== null && viewCacheKey(resolved.view) !== cacheKey
})

const isLoadingIssueQueueModeAtom = Atom.make((get) => {
	const cacheKey = issueViewCacheKey(get(activeIssueViewAtom))
	const resolved = AsyncResult.getOrElse(get(issuesAtom), () => null)
	return resolved !== null && issueViewCacheKey(resolved.view) !== cacheKey
})

const pullRequestStatusAtom = Atom.make((get): LoadStatus => {
	const result = get(pullRequestsAtom)
	const load = get(pullRequestLoadAtom)
	const isLoadingQueue = get(isLoadingQueueModeAtom)
	if ((result.waiting || isLoadingQueue) && load === null) return "loading"
	return AsyncResult.isFailure(result) ? "error" : "ready"
})

const issueStatusAtom = Atom.make((get): LoadStatus => {
	const result = get(issuesAtom)
	const load = get(issueLoadAtom)
	const isLoadingQueue = get(isLoadingIssueQueueModeAtom)
	if ((result.waiting || isLoadingQueue) && load === null) return "loading"
	return AsyncResult.isFailure(result) ? "error" : "ready"
})

const auxiliaryStatusAtom = Atom.make((get): LoadStatus => {
	const activeSurface = get(activeSurfaceAtom)
	if (!isAuxiliarySurface(activeSurface)) return "ready"
	const result = get(auxiliaryAtom)
	const load = get(auxiliaryLoadAtom)
	if (result.waiting && load === null) return "loading"
	return AsyncResult.isFailure(result) && load === null ? "error" : "ready"
})

const displayedPullRequestsAtom = Atom.make((get) => {
	const load = get(pullRequestLoadAtom)
	const overrides = get(pullRequestOverridesAtom)
	const recentlyCompleted = get(recentlyCompletedPullRequestsAtom)
	const source = load?.data ?? []
	const seenUrls = new Set<string>()
	const open = source.map((pullRequest) => {
		seenUrls.add(pullRequest.url)
		return recentlyCompleted[pullRequest.url] ?? overrides[pullRequest.url] ?? pullRequest
	})
	return [
		...open,
		...Object.values(recentlyCompleted).filter((pullRequest) => !seenUrls.has(pullRequest.url)),
	]
})

const displayedIssuesAtom = Atom.make((get) => {
	const load = get(issueLoadAtom)
	const overrides = get(issueOverridesAtom)
	const recentlyCompleted = get(recentlyCompletedIssuesAtom)
	const source = load?.data ?? []
	const seenUrls = new Set<string>()
	const open = source.map((issue) => {
		seenUrls.add(issue.url)
		return recentlyCompleted[issue.url] ?? overrides[issue.url] ?? issue
	})
	return [
		...open,
		...Object.values(recentlyCompleted).filter((issue) => !seenUrls.has(issue.url)),
	]
})

const displayedAuxiliaryItemsAtom = Atom.make((get) => get(auxiliaryLoadAtom)?.data ?? [])

const effectiveFilterQueryAtom = Atom.make((get) =>
	(get(filterModeAtom) ? get(filterDraftAtom) : get(filterQueryAtom)).trim().toLowerCase(),
)

const filteredPullRequestsAtom = Atom.make((get) => {
	const pullRequests = get(displayedPullRequestsAtom)
	const query = get(effectiveFilterQueryAtom)
	if (query.length === 0) return pullRequests
	return pullRequests.flatMap((pullRequest) => {
		const score = pullRequestFilterScore(pullRequest, query)
		return score === null ? [] : [{ pullRequest, score }]
	}).sort((left, right) =>
		left.score - right.score || right.pullRequest.createdAt.getTime() - left.pullRequest.createdAt.getTime()
	).map(({ pullRequest }) => pullRequest)
})

const filteredIssuesAtom = Atom.make((get) => {
	const issues = get(displayedIssuesAtom)
	const query = get(effectiveFilterQueryAtom)
	if (query.length === 0) return issues
	return issues.flatMap((issue) => {
		const fields = [
			issue.title.toLowerCase(),
			issue.repository.toLowerCase(),
			String(issue.number),
			issue.author.toLowerCase(),
			...issue.labels.map((label) => label.name.toLowerCase()),
		]
		const score = fields.flatMap((field, index) => {
			const matchIndex = field.indexOf(query)
			return matchIndex >= 0 ? [index * 1000 + matchIndex] : []
		})
		return score.length > 0 ? [{ issue, score: Math.min(...score) }] : []
	}).sort((left, right) =>
		left.score - right.score || right.issue.updatedAt.getTime() - left.issue.updatedAt.getTime()
	).map(({ issue }) => issue)
})

const auxiliaryFilterScore = (item: AuxiliaryItem, query: string) => {
	const fields = [
		item.title.toLowerCase(),
		item.repository?.toLowerCase() ?? "",
		item.subtitle?.toLowerCase() ?? "",
		item.itemType.toLowerCase(),
		item.state?.toLowerCase() ?? "",
		item.author?.toLowerCase() ?? "",
		...item.meta.map((entry) => entry.toLowerCase()),
	]
	const scores = fields.flatMap((field, index) => {
		const matchIndex = field.indexOf(query)
		return matchIndex >= 0 ? [index * 1000 + matchIndex] : []
	})
	return scores.length > 0 ? Math.min(...scores) : null
}

const filteredAuxiliaryItemsAtom = Atom.make((get) => {
	const items = get(displayedAuxiliaryItemsAtom)
	const query = get(effectiveFilterQueryAtom)
	if (query.length === 0) return items
	return items.flatMap((item) => {
		const score = auxiliaryFilterScore(item, query)
		return score === null ? [] : [{ item, score }]
	}).sort((left, right) =>
		left.score - right.score || (right.item.updatedAt?.getTime() ?? 0) - (left.item.updatedAt?.getTime() ?? 0)
	).map(({ item }) => item)
})

const visibleRepoOrderAtom = Atom.make((get) => {
	const query = get(effectiveFilterQueryAtom)
	if (query.length === 0) return [] as readonly string[]
	return [...new Set(get(filteredPullRequestsAtom).map((pullRequest) => pullRequest.repository))]
})

const visibleGroupsAtom = Atom.make((get) =>
	groupBy(get(filteredPullRequestsAtom), (pullRequest) => pullRequest.repository, get(visibleRepoOrderAtom)),
)

const visibleIssueRepoOrderAtom = Atom.make((get) => {
	const query = get(effectiveFilterQueryAtom)
	if (query.length === 0) return [] as readonly string[]
	return [...new Set(get(filteredIssuesAtom).map((issue) => issue.repository))]
})

const visibleIssueGroupsAtom = Atom.make((get) =>
	groupBy(get(filteredIssuesAtom), (issue) => issue.repository, get(visibleIssueRepoOrderAtom)),
)

const auxiliaryGroupKey = (item: AuxiliaryItem) => {
	if ((item.surface === "myRepos" || item.surface === "stars" || item.surface === "sharedRepos" || item.surface === "watchedRepos") && item.repository) {
		return repositoryOwner(item.repository)
	}
	if (item.repository) return item.repository
	if (item.author) return item.author
	return surfaceShortLabels[item.surface]
}

const visibleAuxiliaryRepoOrderAtom = Atom.make((get) => {
	const query = get(effectiveFilterQueryAtom)
	if (query.length === 0) return [] as readonly string[]
	return [...new Set(get(filteredAuxiliaryItemsAtom).map(auxiliaryGroupKey))]
})

const visibleAuxiliaryGroupsAtom = Atom.make((get) =>
	groupBy(get(filteredAuxiliaryItemsAtom), auxiliaryGroupKey, get(visibleAuxiliaryRepoOrderAtom)),
)

const visiblePullRequestsAtom = Atom.make((get) => get(visibleGroupsAtom).flatMap(([, pullRequests]) => pullRequests))
const visibleIssuesAtom = Atom.make((get) => get(visibleIssueGroupsAtom).flatMap(([, issues]) => issues))
const visibleAuxiliaryItemsAtom = Atom.make((get) => get(visibleAuxiliaryGroupsAtom).flatMap(([, items]) => items))

const groupStartsAtom = Atom.make((get) => {
	const groups = get(visibleGroupsAtom)
	const starts: number[] = []
	for (let index = 0; index < groups.length; index++) {
		if (index === 0) starts.push(0)
		else starts.push(starts[index - 1]! + groups[index - 1]![1].length)
	}
	return starts
})

const issueGroupStartsAtom = Atom.make((get) => {
	const groups = get(visibleIssueGroupsAtom)
	const starts: number[] = []
	for (let index = 0; index < groups.length; index++) {
		if (index === 0) starts.push(0)
		else starts.push(starts[index - 1]! + groups[index - 1]![1].length)
	}
	return starts
})

const auxiliaryGroupStartsAtom = Atom.make((get) => {
	const groups = get(visibleAuxiliaryGroupsAtom)
	const starts: number[] = []
	for (let index = 0; index < groups.length; index++) {
		if (index === 0) starts.push(0)
		else starts.push(starts[index - 1]! + groups[index - 1]![1].length)
	}
	return starts
})

const selectedPullRequestAtom = Atom.make((get) => {
	const pullRequests = get(visiblePullRequestsAtom)
	const index = get(selectedIndexAtom)
	return pullRequests[index] ?? null
})

const selectedIssueAtom = Atom.make((get) => {
	const issues = get(visibleIssuesAtom)
	const index = get(selectedIndexAtom)
	return issues[index] ?? null
})

const selectedAuxiliaryItemAtom = Atom.make((get) => {
	const items = get(visibleAuxiliaryItemsAtom)
	const index = get(selectedIndexAtom)
	return items[index] ?? null
})

const selectedDiffKeyAtom = Atom.make((get) => {
	const pullRequest = get(selectedPullRequestAtom)
	return pullRequest ? pullRequestDiffKey(pullRequest) : null
})

const selectedDiffStateAtom = Atom.make((get) => {
	const key = get(selectedDiffKeyAtom)
	if (!key) return undefined
	return get(pullRequestDiffCacheAtom)[key]
})

const listRepoLabelsAtom = githubRuntime.fn<string>()((repository) =>
	GitHubService.use((github) => github.listRepoLabels(repository))
)
const listOpenPullRequestPageAtom = githubRuntime.fn<ListPullRequestPageInput>()((input) =>
	GitHubService.use((github) => github.listOpenPullRequestPage(input))
)
const listOpenIssuePageAtom = githubRuntime.fn<ListIssuePageInput>()((input) =>
	GitHubService.use((github) => github.listOpenIssuePage(input))
)
const pullRequestDetailsAtom = Atom.family((key: string) => {
	const { repository, number } = parsePullRequestDetailAtomKey(key)
	return githubRuntime.atom(GitHubService.use((github) => github.getPullRequestDetails(repository, number)))
})
const issueDetailsAtom = Atom.family((key: string) => {
	const { repository, number } = parseIssueDetailAtomKey(key)
	return githubRuntime.atom(GitHubService.use((github) => github.getIssueDetails(repository, number)))
})
const addPullRequestLabelAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly label: string }>()((input) =>
	GitHubService.use((github) => github.addPullRequestLabel(input.repository, input.number, input.label))
)
const removePullRequestLabelAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly label: string }>()((input) =>
	GitHubService.use((github) => github.removePullRequestLabel(input.repository, input.number, input.label))
)
const toggleDraftAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly isDraft: boolean }>()((input) =>
	GitHubService.use((github) => github.toggleDraftStatus(input.repository, input.number, input.isDraft))
)
const pullRequestDiffAtom = Atom.family((key: string) => {
	const { repository, number } = parsePullRequestDiffAtomKey(key)
	return githubRuntime.atom(GitHubService.use((github) => github.getPullRequestDiff(repository, number)))
})
const listPullRequestCommentsAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.listPullRequestComments(input.repository, input.number))
)
const listPullRequestConversationAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.listPullRequestConversation(input.repository, input.number))
)
const listIssueCommentsAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.listIssueComments(input.repository, input.number))
)
const loadAuxiliarySurfaceAtom = githubRuntime.fn<{ readonly surface: AuxiliarySurface; readonly repository: string | null }>()((input) =>
	GitHubService.use((github) =>
		Effect.gen(function*() {
			const repository = isRepositoryScopedAuxiliarySurface(input.surface) ? input.repository : null
			const data = yield* (() => {
				switch (input.surface) {
					case "notifications":
						return github.listNotifications().pipe(Effect.map((items) => repository ? items.filter((item) => item.repository === repository) : items))
					case "discussions":
						return github.listRepositoryDiscussions(repository)
					case "myRepos":
						return github.listMyRepositories()
					case "stars":
						return github.listStarredRepositories()
					case "sharedRepos":
						return github.listSharedRepositories()
					case "watchedRepos":
						return github.listWatchedRepositories()
				}
			})()
			return {
				cacheKey: auxiliaryCacheKey(input.surface, repository),
				surface: input.surface,
				repository,
				data,
				fetchedAt: new Date(),
			} satisfies AuxiliaryLoad
		})
	)
)
const getPullRequestMergeInfoAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.getPullRequestMergeInfo(input.repository, input.number))
)
const mergePullRequestAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly action: PullRequestMergeAction }>()((input) =>
	GitHubService.use((github) => github.mergePullRequest(input.repository, input.number, input.action))
)
const closePullRequestAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.closePullRequest(input.repository, input.number))
)
const closeIssueAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.closeIssue(input.repository, input.number))
)
const reopenIssueAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.reopenIssue(input.repository, input.number))
)
const createPullRequestCommentAtom = githubRuntime.fn<CreatePullRequestCommentInput>()((input) => GitHubService.use((github) => github.createPullRequestComment(input)))
const submitPullRequestReviewAtom = githubRuntime.fn<SubmitPullRequestReviewInput>()((input) => GitHubService.use((github) => github.submitPullRequestReview(input)))
const createIssueCommentAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly body: string }>()((input) =>
	GitHubService.use((github) => github.createIssueComment(input.repository, input.number, input.body))
)
const copyToClipboardAtom = githubRuntime.fn<string>()((text) => Clipboard.use((clipboard) => clipboard.copy(text)))
const openInBrowserAtom = githubRuntime.fn<PullRequestItem>()((pullRequest) => BrowserOpener.use((browser) => browser.openPullRequest(pullRequest)))
const openIssueInBrowserAtom = githubRuntime.fn<IssueItem>()((issue) => BrowserOpener.use((browser) => browser.openIssue(issue)))
const openAuxiliaryInBrowserAtom = githubRuntime.fn<AuxiliaryItem>()((item) => BrowserOpener.use((browser) => browser.openAuxiliaryItem(item)))
const markNotificationReadAtom = githubRuntime.fn<string>()((notificationId) => GitHubService.use((github) => github.markNotificationRead(notificationId)))
const unstarRepositoryAtom = githubRuntime.fn<string>()((repository) => GitHubService.use((github) => github.unstarRepository(repository)))
const unwatchRepositoryAtom = githubRuntime.fn<string>()((repository) => GitHubService.use((github) => github.unwatchRepository(repository)))
const addIssueLabelAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly label: string }>()((input) =>
	GitHubService.use((github) => github.addIssueLabel(input.repository, input.number, input.label))
)
const removeIssueLabelAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly label: string }>()((input) =>
	GitHubService.use((github) => github.removeIssueLabel(input.repository, input.number, input.label))
)

const centeredOffset = (outer: number, inner: number) => Math.floor((outer - inner) / 2)


const pasteText = (event: PasteEvent) => new TextDecoder().decode(event.bytes)

const pullRequestFilterScore = (pullRequest: PullRequestItem, query: string) => {
	const normalized = query.trim().toLowerCase()
	if (normalized.length === 0) return 0
	const fields = [
		pullRequest.title.toLowerCase(),
		pullRequest.repository.toLowerCase(),
		String(pullRequest.number),
	]
	const scores = fields.flatMap((field, index) => {
		const matchIndex = field.indexOf(normalized)
		return matchIndex >= 0 ? [index * 1000 + matchIndex] : []
	})
	return scores.length > 0 ? Math.min(...scores) : null
}

const pullRequestMetadataText = (pullRequest: PullRequestItem) => {
	const lines = [
		pullRequest.title,
		`${pullRequest.repository} #${pullRequest.number}`,
		pullRequest.url,
	]
	const review = reviewLabel(pullRequest)
	if (review) lines.push(`review: ${review}`)
	if (pullRequest.checkSummary) lines.push(pullRequest.checkSummary)
	return lines.join("\n")
}

const issueMetadataText = (issue: IssueItem) => {
	const lines = [
		issue.title,
		`${issue.repository} #${issue.number}`,
		issue.url,
		`state: ${issue.state}`,
	]
	if (issue.labels.length > 0) lines.push(`labels: ${issue.labels.map((label) => label.name).join(", ")}`)
	if (issue.assignees.length > 0) lines.push(`assignees: ${issue.assignees.map((assignee) => `@${assignee}`).join(", ")}`)
	return lines.join("\n")
}

const auxiliaryMetadataText = (item: AuxiliaryItem) => {
	const lines = [
		item.title,
		item.repository ?? item.itemType,
	]
	if (item.url) lines.push(item.url)
	if (item.state) lines.push(`state: ${item.state}`)
	if (item.subtitle) lines.push(item.subtitle)
	if (item.meta.length > 0) lines.push(`details: ${item.meta.join(", ")}`)
	return lines.join("\n")
}

const auxiliaryActionSpec = (item: Pick<AuxiliaryItem, "action" | "repository" | "title"> | null) => {
	if (item?.action === "mark-notification-read") {
		return {
			actionLabel: "Mark notification read",
			confirmLabel: "mark read",
			footerLabel: "read?",
			description: "This removes the notification from the unread queue.",
			success: "Marked notification read",
		}
	}
	if (item?.action === "unstar-repository") {
		return {
			actionLabel: "Unstar repository",
			confirmLabel: "unstar",
			footerLabel: "unstar?",
			description: "This removes the repository from your starred repositories.",
			success: item.repository ? `Unstarred ${item.repository}` : "Unstarred repository",
		}
	}
	if (item?.action === "unwatch-repository") {
		return {
			actionLabel: "Unwatch repository",
			confirmLabel: "unwatch",
			footerLabel: "unwatch?",
			description: "This stops watching the repository for notifications.",
			success: item.repository ? `Unwatched ${item.repository}` : "Unwatched repository",
		}
	}
	return null
}

const pullRequestDetailKey = (pullRequest: PullRequestItem) => `${pullRequest.url}:${pullRequest.headRefOid}`
const pullRequestRevisionAtomKey = (pullRequest: PullRequestItem) => `${pullRequest.repository}\u0000${pullRequest.number}\u0000${pullRequest.headRefOid}`
const parsePullRequestRevisionAtomKey = (key: string, label: string) => {
	const [repository, number] = key.split("\u0000")
	if (!repository || !number) throw new Error(`Invalid pull request ${label} key: ${key}`)
	return { repository, number: Number.parseInt(number, 10) }
}
const pullRequestDetailAtomKey = pullRequestRevisionAtomKey
const pullRequestDiffAtomKey = pullRequestRevisionAtomKey
const parsePullRequestDetailAtomKey = (key: string) => parsePullRequestRevisionAtomKey(key, "detail")
const parsePullRequestDiffAtomKey = (key: string) => parsePullRequestRevisionAtomKey(key, "diff")
const issueDetailKey = (issue: IssueItem) => `${issue.repository}\u0000${issue.number}`
const issueDetailAtomKey = issueDetailKey
const issueCommentsKey = (issue: Pick<IssueItem, "repository" | "number">) => `${issue.repository}\u0000${issue.number}:comments`
const parseIssueDetailAtomKey = (key: string) => {
	const [repository, number] = key.split("\u0000")
	if (!repository || !number) throw new Error(`Invalid issue detail key: ${key}`)
	return { repository, number: Number.parseInt(number, 10) }
}



const diffCommentThreadKey = (pullRequest: PullRequestItem, comment: Pick<PullRequestReviewComment, "path" | "side" | "line">) =>
	`${pullRequestDiffKey(pullRequest)}:${diffCommentLocationKey(comment)}`

const groupDiffCommentThreads = (pullRequest: PullRequestItem, comments: readonly PullRequestReviewComment[]) => {
	const threads: Record<string, PullRequestReviewComment[]> = {}
	for (const comment of comments) {
		const key = diffCommentThreadKey(pullRequest, comment)
		const thread = threads[key]
		if (thread) thread.push(comment)
		else threads[key] = [comment]
	}
	return threads
}

const isLocalDiffComment = (comment: PullRequestReviewComment) => comment.id.startsWith("local:")

const reviewStatusAfterSubmit = {
	COMMENT: null,
	APPROVE: "approved",
	REQUEST_CHANGES: "changes",
} satisfies Record<SubmitPullRequestReviewInput["event"], PullRequestItem["reviewStatus"] | null>

const originalDiffLineColor = (anchor: DiffCommentAnchor): DiffLineColorConfig => {
	if (anchor.kind === "addition") {
		return { gutter: colors.diff.addedLineNumberBg, content: colors.diff.addedBg }
	}
	if (anchor.kind === "deletion") {
		return { gutter: colors.diff.removedLineNumberBg, content: colors.diff.removedBg }
	}
	return { gutter: colors.diff.lineNumberBg, content: colors.diff.contextBg }
}

const diffCommentGutterColor = (anchor: DiffCommentAnchor, kind: "selected" | "thread") => {
	const accent = kind === "thread"
		? colors.status.pending
		: anchor.side === "RIGHT" ? colors.status.passing : colors.status.failing
	return mixHex(originalDiffLineColor(anchor).gutter, accent, 0.45)
}

const diffSideTargets = (diff: DiffRenderable, anchor: DiffCommentAnchor, view: DiffView) => {
	const withSides = diff as unknown as DiffRenderableRuntimeSides
	if (view === "split") {
		const target = anchor.side === "LEFT" ? withSides.leftSide : withSides.rightSide
		return target ? [target] : []
	}
	return withSides.leftSide ? [withSides.leftSide] : []
}

const setDiffCommentLineColor = (diff: DiffRenderable, entry: AppliedDiffLineColor, color: DiffLineColorConfig) => {
	for (const target of diffSideTargets(diff, entry.anchor, entry.view)) {
		target.setLineColor(entry.anchor.localRenderLine, color)
	}
}

const getDetailPlaceholderContent = ({
	surface,
	status,
	retryProgress,
	loadingIndicator,
	visibleCount,
	filterText,
}: DetailPlaceholderInput): DetailPlaceholderContent => {
	const noun = surfaceLabels[surface]
	const singularNoun = surface === "pullRequests"
		? "pull request"
		: surface === "issues"
			? "issue"
			: "item"

	if (status === "loading") {
		return {
			title: `${loadingIndicator} Loading ${noun}`,
			hint: retryProgress._tag === "Retrying" ? `Retry ${retryProgress.attempt}/${retryProgress.max}` : `Fetching latest ${noun}`,
		}
	}

	if (status === "error") {
		return {
			title: `Could not load ${noun}`,
			hint: "Press r to retry",
		}
	}

	if (visibleCount === 0 && filterText.length > 0) {
		return {
			title: `No matching ${noun}`,
			hint: "Press esc to clear the filter",
		}
	}

	if (visibleCount === 0) {
		return {
			title: surface === "pullRequests" || surface === "issues" ? `No open ${noun}` : `No ${noun}`,
			hint: "Press r to refresh",
		}
	}

	return {
		title: `Select a ${singularNoun}`,
		hint: "Use up/down to move",
	}
}

export const App = () => {
	const renderer = useRenderer()
	const { width, height } = useTerminalDimensions()
	const registry = useContext(RegistryContext)
	const pullRequestResult = useAtomValue(pullRequestsAtom)
	const issueResult = useAtomValue(issuesAtom)
	const auxiliaryResult = useAtomValue(auxiliaryAtom)
	const refreshPullRequestsAtom = useAtomRefresh(pullRequestsAtom)
	const refreshIssuesAtom = useAtomRefresh(issuesAtom)
	const [activeSurface, setActiveSurface] = useAtom(activeSurfaceAtom)
	const [activeView, setActiveView] = useAtom(activeViewAtom)
	const [activeIssueView, setActiveIssueView] = useAtom(activeIssueViewAtom)
	const [discussionRepository, setDiscussionRepository] = useAtom(discussionRepositoryAtom)
	const [notificationRepository, setNotificationRepository] = useAtom(notificationRepositoryAtom)
	const setQueueLoadCache = useAtomSet(queueLoadCacheAtom)
	const setIssueLoadCache = useAtomSet(issueLoadCacheAtom)
	const setAuxiliaryLoadCache = useAtomSet(auxiliaryLoadCacheAtom)
	const setQueueSelection = useAtomSet(queueSelectionAtom)
	const setIssueSelection = useAtomSet(issueSelectionAtom)
	const setAuxiliarySelection = useAtomSet(auxiliarySelectionAtom)
	const [selectedIndex, setSelectedIndex] = useAtom(selectedIndexAtom)
	const [notice, setNotice] = useAtom(noticeAtom)
	const [filterQuery, setFilterQuery] = useAtom(filterQueryAtom)
	const [filterDraft, setFilterDraft] = useAtom(filterDraftAtom)
	const [filterMode, setFilterMode] = useAtom(filterModeAtom)
	const [detailFullView, setDetailFullView] = useAtom(detailFullViewAtom)
	const setDetailScrollOffset = useAtomSet(detailScrollOffsetAtom)
	const [diffFullView, setDiffFullView] = useAtom(diffFullViewAtom)
	const [diffFileIndex, setDiffFileIndex] = useAtom(diffFileIndexAtom)
	const [diffScrollTop, setDiffScrollTop] = useAtom(diffScrollTopAtom)
	const [diffRenderView, setDiffRenderView] = useAtom(diffRenderViewAtom)
	const [diffWrapMode, setDiffWrapMode] = useAtom(diffWrapModeAtom)
	const [diffWhitespaceMode, setDiffWhitespaceMode] = useAtom(diffWhitespaceModeAtom)
	const [diffCommentMode, setDiffCommentMode] = useAtom(diffCommentModeAtom)
	const [diffCommentAnchorIndex, setDiffCommentAnchorIndex] = useAtom(diffCommentAnchorIndexAtom)
	const [diffPreferredSide, setDiffPreferredSide] = useAtom(diffPreferredSideAtom)
	const [diffCommentThreads, setDiffCommentThreads] = useAtom(diffCommentThreadsAtom)
	const setDiffCommentsLoaded = useAtomSet(diffCommentsLoadedAtom)
	const setPullRequestConversation = useAtomSet(pullRequestConversationAtom)
	const setPullRequestConversationLoaded = useAtomSet(pullRequestConversationLoadedAtom)
	const setPullRequestDiffCache = useAtomSet(pullRequestDiffCacheAtom)
	const [issueCommentsLoaded, setIssueCommentsLoaded] = useAtom(issueCommentsLoadedAtom)
	const [activeModal, setActiveModal] = useAtom(activeModalAtom)
	const [themeId, setThemeId] = useAtom(themeIdAtom)
	const closeActiveModal = () => setActiveModal(initialModal)
	const labelModalActive = Modal.$is("Label")(activeModal)
	const closeModalActive = Modal.$is("Close")(activeModal)
	const confirmActionModalActive = Modal.$is("ConfirmAction")(activeModal)
	const mergeModalActive = Modal.$is("Merge")(activeModal)
	const commentModalActive = Modal.$is("Comment")(activeModal)
	const commentThreadModalActive = Modal.$is("CommentThread")(activeModal)
	const changedFilesModalActive = Modal.$is("ChangedFiles")(activeModal)
	const submitReviewModalActive = Modal.$is("SubmitReview")(activeModal)
	const themeModalActive = Modal.$is("Theme")(activeModal)
	const commandPaletteActive = Modal.$is("CommandPalette")(activeModal)
	const openRepositoryModalActive = Modal.$is("OpenRepository")(activeModal)
	const labelModal: LabelModalState = labelModalActive ? activeModal : initialLabelModalState
	const closeModal: CloseModalState = closeModalActive ? activeModal : initialCloseModalState
	const confirmActionModal: ConfirmActionModalState = confirmActionModalActive ? activeModal : initialConfirmActionModalState
	const mergeModal: MergeModalState = mergeModalActive ? activeModal : initialMergeModalState
	const commentModal: CommentModalState = commentModalActive ? activeModal : initialCommentModalState
	const commentThreadModal: CommentThreadModalState = commentThreadModalActive ? activeModal : initialCommentThreadModalState
	const changedFilesModal: ChangedFilesModalState = changedFilesModalActive ? activeModal : initialChangedFilesModalState
	const submitReviewModal: SubmitReviewModalState = submitReviewModalActive ? activeModal : initialSubmitReviewModalState
	const themeModal: ThemeModalState = themeModalActive ? activeModal : initialThemeModalState
	const commandPalette: CommandPaletteState = commandPaletteActive ? activeModal : initialCommandPaletteState
	const openRepositoryModal: OpenRepositoryModalState = openRepositoryModalActive ? activeModal : initialOpenRepositoryModalState
	const makeModalSetter = <Tag extends Exclude<ModalTag, "None">>(tag: Tag) =>
		(next: ModalState<Tag> | ((prev: ModalState<Tag>) => ModalState<Tag>)) => setActiveModal((current) => {
			const ctor = Modal[tag] as unknown as (args: ModalState<Tag>) => Modal
			if (typeof next === "function") {
				const updater = next as (prev: ModalState<Tag>) => ModalState<Tag>
				if (current._tag !== tag) return current
				return ctor(updater(current as unknown as ModalState<Tag>))
			}
			return ctor(next)
		})
	const setLabelModal = makeModalSetter("Label")
	const setCloseModal = makeModalSetter("Close")
	const setConfirmActionModal = makeModalSetter("ConfirmAction")
	const setMergeModal = makeModalSetter("Merge")
	const setCommentModal = makeModalSetter("Comment")
	const setCommentThreadModal = makeModalSetter("CommentThread")
	const setChangedFilesModal = makeModalSetter("ChangedFiles")
	const setSubmitReviewModal = makeModalSetter("SubmitReview")
	const setThemeModal = makeModalSetter("Theme")
	const setCommandPalette = makeModalSetter("CommandPalette")
	const setOpenRepositoryModal = makeModalSetter("OpenRepository")
	setActiveTheme(themeId)
	const themeIdRef = useRef(themeId)
	const themeModalRef = useRef(themeModal)
	themeIdRef.current = themeId
	themeModalRef.current = themeModal
	const setLabelCache = useAtomSet(labelCacheAtom)
	const setPullRequestOverrides = useAtomSet(pullRequestOverridesAtom)
	const setIssueOverrides = useAtomSet(issueOverridesAtom)
	const setRecentlyCompletedPullRequests = useAtomSet(recentlyCompletedPullRequestsAtom)
	const setRecentlyCompletedIssues = useAtomSet(recentlyCompletedIssuesAtom)
	const retryProgress = useAtomValue(retryProgressAtom)
	const [loadingFrame, setLoadingFrame] = useState(0)
	const [refreshCompletionMessage, setRefreshCompletionMessage] = useState<string | null>(null)
	const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(null)
	const [terminalFocused, setTerminalFocused] = useState(true)
	const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
	const [auxiliaryLoadProgress, setAuxiliaryLoadProgress] = useState<Partial<Record<string, AuxiliaryLoadProgress>>>({})
	const usernameResult = useAtomValue(usernameAtom)
	const loadRepoLabels = useAtomSet(listRepoLabelsAtom, { mode: "promise" })
	const loadPullRequestPage = useAtomSet(listOpenPullRequestPageAtom, { mode: "promise" })
	const loadIssuePage = useAtomSet(listOpenIssuePageAtom, { mode: "promise" })
	const addPullRequestLabel = useAtomSet(addPullRequestLabelAtom, { mode: "promise" })
	const removePullRequestLabel = useAtomSet(removePullRequestLabelAtom, { mode: "promise" })
	const addIssueLabel = useAtomSet(addIssueLabelAtom, { mode: "promise" })
	const removeIssueLabel = useAtomSet(removeIssueLabelAtom, { mode: "promise" })
	const toggleDraftStatus = useAtomSet(toggleDraftAtom, { mode: "promise" })
	const listPullRequestComments = useAtomSet(listPullRequestCommentsAtom, { mode: "promise" })
	const listPullRequestConversation = useAtomSet(listPullRequestConversationAtom, { mode: "promise" })
	const listIssueComments = useAtomSet(listIssueCommentsAtom, { mode: "promise" })
	const getPullRequestMergeInfo = useAtomSet(getPullRequestMergeInfoAtom, { mode: "promise" })
	const mergePullRequest = useAtomSet(mergePullRequestAtom, { mode: "promise" })
	const closePullRequest = useAtomSet(closePullRequestAtom, { mode: "promise" })
	const closeIssue = useAtomSet(closeIssueAtom, { mode: "promise" })
	const reopenIssueAction = useAtomSet(reopenIssueAtom, { mode: "promise" })
	const createPullRequestComment = useAtomSet(createPullRequestCommentAtom, { mode: "promise" })
	const submitPullRequestReview = useAtomSet(submitPullRequestReviewAtom, { mode: "promise" })
	const createIssueComment = useAtomSet(createIssueCommentAtom, { mode: "promise" })
	const copyToClipboard = useAtomSet(copyToClipboardAtom, { mode: "promise" })
	const openInBrowser = useAtomSet(openInBrowserAtom, { mode: "promise" })
	const openIssueInBrowser = useAtomSet(openIssueInBrowserAtom, { mode: "promise" })
	const openAuxiliaryInBrowser = useAtomSet(openAuxiliaryInBrowserAtom, { mode: "promise" })
	const markNotificationRead = useAtomSet(markNotificationReadAtom, { mode: "promise" })
	const unstarRepository = useAtomSet(unstarRepositoryAtom, { mode: "promise" })
	const unwatchRepository = useAtomSet(unwatchRepositoryAtom, { mode: "promise" })
	const loadAuxiliarySurface = useAtomSet(loadAuxiliarySurfaceAtom, { mode: "promise" })
	const terminalWidth = width ?? 100
	const terminalHeight = height ?? 24
	const contentWidth = Math.max(1, terminalWidth)
	const isWideLayout = terminalWidth >= 100
	const splitGap = 1
	const sectionPadding = 1
	const leftPaneWidth = isWideLayout ? Math.max(44, Math.floor((contentWidth - splitGap) * 0.56)) : contentWidth
	const rightPaneWidth = isWideLayout ? Math.max(28, contentWidth - leftPaneWidth - splitGap) : contentWidth
	const dividerJunctionAt = Math.max(1, leftPaneWidth)
	const leftContentWidth = isWideLayout ? Math.max(24, leftPaneWidth - 2) : Math.max(24, contentWidth - sectionPadding * 2)
	const rightContentWidth = isWideLayout ? Math.max(24, rightPaneWidth - sectionPadding * 2) : Math.max(24, contentWidth - sectionPadding * 2)
	const wideDetailLines = Math.max(8, terminalHeight - 8)
	const wideBodyHeight = Math.max(8, terminalHeight - 4)
	const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const diffPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const detailPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const detailHydrationRef = useRef(new Map<string, DetailHydration>())
	const refreshGenerationRef = useRef(0)
	const didMountQueueModeRef = useRef(false)
	const didMountIssueQueueModeRef = useRef(false)
	const lastPullRequestRefreshAtRef = useRef(0)
	const lastIssueRefreshAtRef = useRef(0)
	const lastAuxiliaryRefreshAtRef = useRef(0)
	const pullRequestRefreshAtRef = useRef<Partial<Record<string, number>>>({})
	const issueRefreshAtRef = useRef<Partial<Record<string, number>>>({})
	const auxiliaryRefreshAtRef = useRef<Partial<Record<string, number>>>({})
	const backgroundRefreshInFlightRef = useRef(new Set<string>())
	const auxiliaryLoadInFlightRef = useRef(new Map<string, Promise<void>>())
	const terminalFocusedRef = useRef(true)
	const lastUserInputAtRef = useRef(Date.now())
	const pullRequestStatusRef = useRef<LoadStatus>("loading")
	const issueStatusRef = useRef<LoadStatus>("loading")
	const auxiliaryStatusRef = useRef<LoadStatus>("loading")
	const activeSurfaceRef = useRef(activeSurface)
	const backgroundRefreshTargetsRef = useRef<readonly BackgroundRefreshTarget[]>([])
	const refreshBackgroundTargetRef = useRef<(target: BackgroundRefreshTarget, minimumAgeMs: number) => void>(() => {})
	const refreshPullRequestsRef = useRef<(message?: string) => void>(() => {})
	const refreshIssuesRef = useRef<(message?: string) => void>(() => {})
	const refreshAuxiliaryRef = useRef<(message?: string) => void>(() => {})
	const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const detailPreviewScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const diffScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const prListScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const diffRenderableRefs = useRef(new Map<number, DiffRenderable>())
	const diffCommentLineColorsRef = useRef<AppliedDiffLineColorState>({ contextKey: null, entries: [] })
	const suppressNextDiffCommentScrollRef = useRef(false)
	const headerFooterWidth = Math.max(24, contentWidth - 2)

	const flashNotice = (message: string) => {
		if (noticeTimeoutRef.current !== null) {
			clearTimeout(noticeTimeoutRef.current)
		}
		setNotice(message)
		noticeTimeoutRef.current = globalThis.setTimeout(() => {
			setNotice((current) => (current === message ? null : current))
		}, 2500)
	}

	useEffect(() => {
		renderer.setBackgroundColor(colors.background)
	}, [renderer, themeId])

	useEffect(() => () => {
		refreshGenerationRef.current += 1
		detailHydrationRef.current.clear()
		if (noticeTimeoutRef.current !== null) {
			clearTimeout(noticeTimeoutRef.current)
		}
		if (diffPrefetchTimeoutRef.current !== null) {
			clearTimeout(diffPrefetchTimeoutRef.current)
		}
		if (detailPrefetchTimeoutRef.current !== null) {
			clearTimeout(detailPrefetchTimeoutRef.current)
		}
	}, [])

	const pullRequestLoad = useAtomValue(pullRequestLoadAtom)
	const issueLoad = useAtomValue(issueLoadAtom)
	const auxiliaryLoad = useAtomValue(auxiliaryLoadAtom)
	const pullRequests = useAtomValue(displayedPullRequestsAtom)
	const issues = useAtomValue(displayedIssuesAtom)
	const auxiliaryItems = useAtomValue(displayedAuxiliaryItemsAtom)
	const pullRequestStatus = useAtomValue(pullRequestStatusAtom)
	const issueStatus = useAtomValue(issueStatusAtom)
	const auxiliaryStatus = useAtomValue(auxiliaryStatusAtom)
	const currentAuxiliaryCacheKey = isAuxiliarySurface(activeSurface) ? auxiliaryCacheKey(activeSurface, activeSurface === "discussions" ? discussionRepository : activeSurface === "notifications" ? notificationRepository : null) : null
	const currentAuxiliaryLoadProgress = currentAuxiliaryCacheKey ? auxiliaryLoadProgress[currentAuxiliaryCacheKey] : undefined
	const effectiveAuxiliaryStatus: LoadStatus =
		currentAuxiliaryLoadProgress?._tag === "loading" && auxiliaryLoad === null
			? "loading"
			: currentAuxiliaryLoadProgress?._tag === "error" && auxiliaryLoad === null
				? "error"
				: auxiliaryStatus
	const activeStatus = activeSurface === "issues" ? issueStatus : activeSurface === "pullRequests" ? pullRequestStatus : effectiveAuxiliaryStatus
	const isInitialLoading = activeSurface === "issues"
		? issueStatus === "loading" && issues.length === 0
		: activeSurface === "pullRequests"
			? pullRequestStatus === "loading" && pullRequests.length === 0
			: effectiveAuxiliaryStatus === "loading" && auxiliaryItems.length === 0
	const pullRequestError = AsyncResult.isFailure(pullRequestResult) ? errorMessage(Cause.squash(pullRequestResult.cause)) : null
	const issueError = AsyncResult.isFailure(issueResult) ? errorMessage(Cause.squash(issueResult.cause)) : null
	const auxiliaryError = currentAuxiliaryLoadProgress?._tag === "error" && auxiliaryLoad === null
		? currentAuxiliaryLoadProgress.message
		: AsyncResult.isFailure(auxiliaryResult) && auxiliaryLoad === null ? errorMessage(Cause.squash(auxiliaryResult.cause)) : null
	const username = AsyncResult.isSuccess(usernameResult) ? usernameResult.value : null
	pullRequestStatusRef.current = pullRequestStatus
	issueStatusRef.current = issueStatus
	auxiliaryStatusRef.current = effectiveAuxiliaryStatus
	activeSurfaceRef.current = activeSurface

	const visibleFilterText = filterMode ? filterDraft : filterQuery

	const visibleGroups = useAtomValue(visibleGroupsAtom)
	const visibleIssueGroups = useAtomValue(visibleIssueGroupsAtom)
	const visibleAuxiliaryGroups = useAtomValue(visibleAuxiliaryGroupsAtom)
	const visiblePullRequests = useAtomValue(visiblePullRequestsAtom)
	const visibleIssues = useAtomValue(visibleIssuesAtom)
	const visibleAuxiliaryItems = useAtomValue(visibleAuxiliaryItemsAtom)
	const selectedPullRequest = useAtomValue(selectedPullRequestAtom)
	const selectedIssue = useAtomValue(selectedIssueAtom)
	const selectedAuxiliaryItem = useAtomValue(selectedAuxiliaryItemAtom)
	const selectedIssueCommentsKey = selectedIssue ? issueCommentsKey(selectedIssue) : null
	const selectedIssueCommentsState = selectedIssueCommentsKey ? issueCommentsLoaded[selectedIssueCommentsKey] : undefined
	const selectedIssueCommentsPending = selectedIssue !== null
		&& selectedIssue.comments > 0
		&& selectedIssue.timeline.length < selectedIssue.comments
		&& selectedIssueCommentsState === undefined
	const selectedIssueCommentsLoading = selectedIssueCommentsState === "loading" || selectedIssueCommentsPending
	const selectedRepository = viewRepository(activeView)
	const selectedIssueRepository = issueViewRepository(activeIssueView)
	const activeAuxiliaryRepository = activeSurface === "discussions" ? discussionRepository : activeSurface === "notifications" ? notificationRepository : null
	const activeRepository = activeSurface === "issues" ? selectedIssueRepository : activeAuxiliaryRepository ?? selectedRepository
	const activeViews = activePullRequestViews(activeView)
	const activeIssueViewList = activeIssueViews(activeIssueView)
	const currentQueueCacheKey = viewCacheKey(activeView)
	const currentIssueQueueCacheKey = issueViewCacheKey(activeIssueView)
	backgroundRefreshTargetsRef.current = [
		{ _tag: "issues" },
		{ _tag: "pullRequests" },
		...auxiliarySurfaces.map((surface) => {
			const repository = surface === "discussions" ? discussionRepository : surface === "notifications" ? notificationRepository : null
			return { _tag: "auxiliary" as const, surface, repository, cacheKey: auxiliaryCacheKey(surface, repository) }
		}),
	]
	const loadedPullRequestCount = pullRequestLoad?.data.length ?? 0
	const loadedIssueCount = issueLoad?.data.length ?? 0
	const loadedAuxiliaryCount = auxiliaryLoad?.data.length ?? 0
	const hasMorePullRequests = Boolean(pullRequestLoad?.hasNextPage && loadedPullRequestCount < config.prFetchLimit)
	const hasMoreIssues = Boolean(issueLoad?.hasNextPage && loadedIssueCount < config.prFetchLimit)
	const isLoadingMorePullRequests = loadingMoreKey === currentQueueCacheKey
	const isLoadingMoreIssues = loadingMoreKey === `issue:${currentIssueQueueCacheKey}`
	const pullRequestListRows = useMemo(() => buildPullRequestListRows({
		groups: visibleGroups,
		status: pullRequestStatus,
		error: pullRequestError,
		filterText: visibleFilterText,
		showFilterBar: filterMode || filterQuery.length > 0,
		loadedCount: loadedPullRequestCount,
		hasMore: hasMorePullRequests,
		isLoadingMore: isLoadingMorePullRequests,
	}), [visibleGroups, pullRequestStatus, pullRequestError, visibleFilterText, filterMode, filterQuery, loadedPullRequestCount, hasMorePullRequests, isLoadingMorePullRequests])
	const selectedPullRequestRowIndex = pullRequestListRowIndex(pullRequestListRows, selectedPullRequest?.url ?? null)
	const issueListRows = useMemo(() => buildIssueListRows({
		groups: visibleIssueGroups,
		status: issueStatus,
		error: issueError,
		filterText: visibleFilterText,
		showFilterBar: filterMode || filterQuery.length > 0,
		loadedCount: loadedIssueCount,
		hasMore: hasMoreIssues,
		isLoadingMore: isLoadingMoreIssues,
	}), [visibleIssueGroups, issueStatus, issueError, visibleFilterText, filterMode, filterQuery, loadedIssueCount, hasMoreIssues, isLoadingMoreIssues])
	const selectedIssueRowIndex = issueListRowIndex(issueListRows, selectedIssue?.url ?? null)
	const auxiliaryListRows = useMemo(() => isAuxiliarySurface(activeSurface) ? buildAuxiliaryListRows({
		surface: activeSurface,
		groups: visibleAuxiliaryGroups,
		status: effectiveAuxiliaryStatus,
		error: auxiliaryError,
		filterText: visibleFilterText,
		showFilterBar: filterMode || filterQuery.length > 0,
	}) : [], [activeSurface, visibleAuxiliaryGroups, effectiveAuxiliaryStatus, auxiliaryError, visibleFilterText, filterMode, filterQuery])
	const selectedAuxiliaryRowIndex = auxiliaryListRowIndex(auxiliaryListRows, selectedAuxiliaryItem?.id ?? null)
	const selectedDiffKey = useAtomValue(selectedDiffKeyAtom)
	const selectedDiffState = useAtomValue(selectedDiffStateAtom)
	const effectiveDiffRenderView = contentWidth >= 100 ? diffRenderView : "unified"
	const readyDiffFiles = useMemo(
		() => (selectedDiffState?._tag === "Ready" ? (diffWhitespaceMode === "ignore" ? minimizeWhitespaceDiffFiles(selectedDiffState.files) : selectedDiffState.files) : []),
		[selectedDiffState, diffWhitespaceMode],
	)
	const changedFileResults = useMemo(
		() => (changedFilesModalActive ? filterChangedFiles(readyDiffFiles, changedFilesModal.query) : []),
		[changedFilesModalActive, readyDiffFiles, changedFilesModal.query],
	)
	const displayedDiffState = useMemo(
		() => selectedDiffState?._tag === "Ready"
			? PullRequestDiffState.Ready({ patch: readyDiffFiles.map((file) => file.patch).join("\n"), files: readyDiffFiles })
			: selectedDiffState,
		[selectedDiffState, readyDiffFiles],
	)
	const stackedDiffFiles = useMemo(() => buildStackedDiffFiles(readyDiffFiles, effectiveDiffRenderView, diffWrapMode, contentWidth), [readyDiffFiles, effectiveDiffRenderView, diffWrapMode, contentWidth])
	const diffCommentAnchors = useMemo(
		() => diffFullView ? getStackedDiffCommentAnchors(stackedDiffFiles, effectiveDiffRenderView, diffWrapMode, contentWidth) : [],
		[diffFullView, stackedDiffFiles, effectiveDiffRenderView, diffWrapMode, contentWidth],
	)
	const selectedDiffCommentAnchor = diffCommentAnchors[Math.max(0, Math.min(diffCommentAnchorIndex, diffCommentAnchors.length - 1))] ?? null
	const selectedDiffCommentThreadKey = selectedDiffKey && selectedDiffCommentAnchor ? `${selectedDiffKey}:${diffCommentLocationKey(selectedDiffCommentAnchor)}` : null
	const selectedDiffCommentThread = selectedDiffCommentThreadKey ? diffCommentThreads[selectedDiffCommentThreadKey] ?? [] : []
	const selectedDiffCommentLabel = selectedDiffCommentAnchor ? diffCommentAnchorLabel(selectedDiffCommentAnchor) : null
	const pullRequestConversation = useAtomValue(pullRequestConversationAtom)
	const pullRequestConversationLoaded = useAtomValue(pullRequestConversationLoadedAtom)
	const selectedConversationItems = selectedDiffKey ? (pullRequestConversation[selectedDiffKey] ?? []) : []
	const selectedConversationStatus: DetailConversationStatus = selectedDiffKey ? (pullRequestConversationLoaded[selectedDiffKey] ?? "idle") : "idle"
	const diffLineColorContextKey = selectedDiffKey ? `${selectedDiffKey}:${effectiveDiffRenderView}:${diffWrapMode}` : null
	const groupStarts = useAtomValue(groupStartsAtom)
	const issueGroupStarts = useAtomValue(issueGroupStartsAtom)
	const auxiliaryGroupStarts = useAtomValue(auxiliaryGroupStartsAtom)
	const activeVisibleCount = activeSurface === "issues" ? visibleIssues.length : activeSurface === "pullRequests" ? visiblePullRequests.length : visibleAuxiliaryItems.length
	const activeGroupStarts = activeSurface === "issues" ? issueGroupStarts : activeSurface === "pullRequests" ? groupStarts : auxiliaryGroupStarts
	const getCurrentGroupIndex = (current: number, starts: readonly number[]) => {
		if (starts.length === 0) return 0
		let low = 0
		let high = starts.length - 1
		while (low < high) {
			const mid = (low + high + 1) >>> 1
			if (starts[mid]! <= current) low = mid
			else high = mid - 1
		}
		return low
	}
	const activeLoadFetchedAt = activeSurface === "issues" ? issueLoad?.fetchedAt : activeSurface === "pullRequests" ? pullRequestLoad?.fetchedAt : auxiliaryLoad?.fetchedAt
	const summaryRight = activeLoadFetchedAt
		? `updated ${formatShortDate(activeLoadFetchedAt)} ${formatTimestamp(activeLoadFetchedAt)}`
		: activeStatus === "loading"
			? `loading ${surfaceLabels[activeSurface]}...`
			: ""
	const activeViewLabel = activeSurface === "issues"
		? `issues  ${issueViewLabel(activeIssueView)}`
		: activeSurface === "pullRequests"
			? `pull requests  ${viewLabel(activeView)}`
			: activeSurface === "notifications" && notificationRepository
				? `notifications  ${notificationRepository}`
			: activeSurface === "discussions" && discussionRepository
				? `discussions  ${discussionRepository}`
				: surfaceShortLabels[activeSurface]
	const headerLeft = username ? `GHUI  ${username}  ${activeViewLabel}` : `GHUI  ${activeViewLabel}`
	const headerLine = `${fitCell(headerLeft, Math.max(0, headerFooterWidth - summaryRight.length))}${summaryRight}`
	const footerNotice = notice ? fitCell(notice, headerFooterWidth) : null
	const selectPullRequestByUrl = (url: string) => {
		const index = visiblePullRequests.findIndex((pullRequest) => pullRequest.url === url)
		if (index >= 0) {
			setSelectedIndex(index)
			setQueueSelection((current) => ({ ...current, [currentQueueCacheKey]: index }))
		}
	}
	const selectIssueByUrl = (url: string) => {
		const index = visibleIssues.findIndex((issue) => issue.url === url)
		if (index >= 0) {
			setSelectedIndex(index)
			setIssueSelection((current) => ({ ...current, [currentIssueQueueCacheKey]: index }))
		}
	}
	const selectAuxiliaryById = (id: string) => {
		if (!currentAuxiliaryCacheKey) return
		const index = visibleAuxiliaryItems.findIndex((item) => item.id === id)
		if (index >= 0) {
			setSelectedIndex(index)
			setAuxiliarySelection((current) => ({ ...current, [currentAuxiliaryCacheKey]: index }))
		}
	}
	const updatePullRequest = (url: string, transform: (pullRequest: PullRequestItem) => PullRequestItem) => {
		const pullRequest = pullRequests.find((item) => item.url === url)
		if (!pullRequest) return
		setPullRequestOverrides((current) => ({ ...current, [url]: transform(pullRequest) }))
	}
	const updateIssue = (url: string, transform: (issue: IssueItem) => IssueItem) => {
		const issue = issues.find((item) => item.url === url)
		if (!issue) return
		setIssueOverrides((current) => ({ ...current, [url]: transform(issue) }))
	}
	const refreshPullRequests = (message?: string) => {
		refreshGenerationRef.current += 1
		detailHydrationRef.current.clear()
		if (detailPrefetchTimeoutRef.current !== null) clearTimeout(detailPrefetchTimeoutRef.current)
		setLoadingMoreKey(null)
		setPullRequestOverrides({})
		if (message) {
			setNotice(null)
			setRefreshCompletionMessage(message)
			setRefreshStartedAt(lastPullRequestRefreshAtRef.current)
		}
		refreshPullRequestsAtom()
	}
	refreshPullRequestsRef.current = refreshPullRequests
	const refreshIssues = (message?: string) => {
		refreshGenerationRef.current += 1
		setLoadingMoreKey(null)
		setIssueOverrides({})
		setIssueCommentsLoaded({})
		if (message) {
			setNotice(null)
			setRefreshCompletionMessage(message)
			setRefreshStartedAt(lastIssueRefreshAtRef.current)
		}
		refreshIssuesAtom()
	}
	refreshIssuesRef.current = refreshIssues
	const refreshAuxiliarySurface = (message?: string) => {
		refreshGenerationRef.current += 1
		if (!isAuxiliarySurface(activeSurface)) return
		if (message) {
			setNotice(null)
			setRefreshCompletionMessage(message)
			setRefreshStartedAt(lastAuxiliaryRefreshAtRef.current)
		}
		void refreshAuxiliaryQuietly(activeSurface, activeSurface === "discussions" ? discussionRepository : activeSurface === "notifications" ? notificationRepository : null).then(() => {
			if (message) flashNotice(`✓ ${message}`)
			setRefreshCompletionMessage(null)
			setRefreshStartedAt(null)
		}).catch((error) => {
			flashNotice(errorMessage(error))
			setRefreshCompletionMessage(null)
			setRefreshStartedAt(null)
		})
	}
	refreshAuxiliaryRef.current = refreshAuxiliarySurface
	const refreshPullRequestsQuietly = () => {
		const view = activeView
		const cacheKey = viewCacheKey(view)
		const repository = viewRepository(view)
		return loadPullRequestPage({
			mode: viewMode(view),
			repository,
			cursor: null,
			pageSize: Math.min(pullRequestPageSize, config.prFetchLimit),
		}).then((page) => {
			const fetchedAt = new Date()
			setQueueLoadCache((current) => {
				const existingLoad = current[cacheKey]
				const data = mergeCachedDetails(page.items, existingLoad?.data)
				return {
					...current,
					[cacheKey]: {
						view,
						data,
						fetchedAt,
						endCursor: page.endCursor,
						hasNextPage: page.hasNextPage && data.length < config.prFetchLimit,
					},
				}
			})
			pullRequestRefreshAtRef.current[cacheKey] = fetchedAt.getTime()
		})
	}
	const refreshIssuesQuietly = () => {
		const view = activeIssueView
		const cacheKey = issueViewCacheKey(view)
		const repository = issueViewRepository(view)
		return loadIssuePage({
			mode: issueViewMode(view),
			repository,
			cursor: null,
			pageSize: Math.min(pullRequestPageSize, config.prFetchLimit),
		}).then((page) => {
			const fetchedAt = new Date()
			setIssueLoadCache((current) => {
				const existingLoad = current[cacheKey]
				const data = mergeCachedIssueDetails(page.items, existingLoad?.data)
				return {
					...current,
					[cacheKey]: {
						view,
						data,
						fetchedAt,
						endCursor: page.endCursor,
						hasNextPage: page.hasNextPage && data.length < config.prFetchLimit,
					},
				}
			})
			issueRefreshAtRef.current[cacheKey] = fetchedAt.getTime()
		})
	}
	const refreshAuxiliaryQuietly = (surface: AuxiliarySurface, repository: string | null) => {
		const cacheKey = auxiliaryCacheKey(surface, isRepositoryScopedAuxiliarySurface(surface) ? repository : null)
		const existing = auxiliaryLoadInFlightRef.current.get(cacheKey)
		if (existing) return existing
		setAuxiliaryLoadProgress((current) => ({ ...current, [cacheKey]: { _tag: "loading" } }))
		const run = loadAuxiliarySurface({ surface, repository }).then((load) => {
			setAuxiliaryLoadCache((current) => ({ ...current, [load.cacheKey]: load }))
			if (load.fetchedAt) auxiliaryRefreshAtRef.current[load.cacheKey] = load.fetchedAt.getTime()
			setAuxiliaryLoadProgress((current) => {
				const next = { ...current }
				delete next[load.cacheKey]
				return next
			})
		}).catch((error) => {
			const message = errorMessage(error)
			setAuxiliaryLoadProgress((current) => ({ ...current, [cacheKey]: { _tag: "error", message } }))
			throw error
		}).finally(() => {
			auxiliaryLoadInFlightRef.current.delete(cacheKey)
		})
		auxiliaryLoadInFlightRef.current.set(cacheKey, run)
		return run
	}
	const refreshBackgroundTarget = (target: BackgroundRefreshTarget, minimumAgeMs: number) => {
		if (!terminalFocusedRef.current) return
		const key = backgroundRefreshTargetKey(target)
		if (backgroundRefreshInFlightRef.current.has(key)) return
		const lastRefreshAt = target._tag === "pullRequests"
			? pullRequestRefreshAtRef.current[currentQueueCacheKey] ?? lastPullRequestRefreshAtRef.current
			: target._tag === "issues"
				? issueRefreshAtRef.current[currentIssueQueueCacheKey] ?? lastIssueRefreshAtRef.current
				: auxiliaryRefreshAtRef.current[target.cacheKey] ?? 0
		const coldLoad = lastRefreshAt === 0
		if (!coldLoad && Date.now() - lastUserInputAtRef.current < USER_INPUT_REFRESH_IDLE_MS) return
		if (lastRefreshAt > 0 && Date.now() - lastRefreshAt < minimumAgeMs) return
		if (target._tag === "pullRequests" && pullRequestStatusRef.current === "loading") return
		if (target._tag === "issues" && issueStatusRef.current === "loading") return
		if (target._tag === "auxiliary" && activeSurfaceRef.current === target.surface && auxiliaryStatusRef.current === "loading") return

		backgroundRefreshInFlightRef.current.add(key)
		const run = target._tag === "pullRequests"
			? refreshPullRequestsQuietly()
			: target._tag === "issues"
				? refreshIssuesQuietly()
				: refreshAuxiliaryQuietly(target.surface, target.repository)
		void run.catch(() => {
			// Background refreshes keep stale cached data and avoid stealing the footer with errors.
		}).finally(() => {
			backgroundRefreshInFlightRef.current.delete(key)
		})
	}
	refreshBackgroundTargetRef.current = refreshBackgroundTarget
	const rememberActiveSelection = () => {
		if (activeSurface === "pullRequests") {
			setQueueSelection((current) => ({ ...current, [currentQueueCacheKey]: selectedIndex }))
		} else if (activeSurface === "issues") {
			setIssueSelection((current) => ({ ...current, [currentIssueQueueCacheKey]: selectedIndex }))
		} else if (currentAuxiliaryCacheKey) {
			setAuxiliarySelection((current) => ({ ...current, [currentAuxiliaryCacheKey]: selectedIndex }))
		}
	}
	const showPullRequests = () => {
		if (activeSurface === "pullRequests") return
		rememberActiveSelection()
		setActiveSurface("pullRequests")
		setSelectedIndex(registry.get(queueSelectionAtom)[currentQueueCacheKey] ?? 0)
		setDetailFullView(false)
		setDiffFullView(false)
		setFilterDraft(filterQuery)
		setNotice(null)
	}
	const showIssues = () => {
		if (activeSurface === "issues") return
		rememberActiveSelection()
		setActiveSurface("issues")
		setSelectedIndex(registry.get(issueSelectionAtom)[currentIssueQueueCacheKey] ?? 0)
		setDetailFullView(false)
		setDiffFullView(false)
		setDiffCommentMode(false)
		setFilterDraft(filterQuery)
		setNotice(null)
	}
	const showAuxiliarySurface = (surface: AuxiliarySurface) => {
		if (activeSurface === surface && !(surface === "notifications" && notificationRepository !== null)) return
		rememberActiveSelection()
		const repository = surface === "discussions" ? discussionRepository : null
		if (surface === "notifications") setNotificationRepository(null)
		const nextCacheKey = auxiliaryCacheKey(surface, repository)
		setActiveSurface(surface)
		setSelectedIndex(registry.get(auxiliarySelectionAtom)[nextCacheKey] ?? 0)
		setDetailFullView(false)
		setDiffFullView(false)
		setDiffCommentMode(false)
		setFilterDraft(filterQuery)
		setNotice(null)
		if (!registry.get(auxiliaryLoadCacheAtom)[nextCacheKey]) {
			void refreshAuxiliaryQuietly(surface, repository).catch((error) => flashNotice(errorMessage(error)))
		}
	}
	const viewRepositoryPullRequests = (repository: string) => {
		showPullRequests()
		switchViewTo({ _tag: "Repository", repository })
		flashNotice(`Viewing pull requests for ${repository}`)
	}
	const viewRepositoryIssues = (repository: string) => {
		showIssues()
		switchIssueViewTo({ _tag: "Repository", repository })
		flashNotice(`Viewing issues for ${repository}`)
	}
	const viewRepositoryDiscussions = (repository: string) => {
		rememberActiveSelection()
		const nextCacheKey = auxiliaryCacheKey("discussions", repository)
		setDiscussionRepository(repository)
		setActiveSurface("discussions")
		setSelectedIndex(registry.get(auxiliarySelectionAtom)[nextCacheKey] ?? 0)
		setDetailFullView(false)
		setDiffFullView(false)
		setDiffCommentMode(false)
		setFilterDraft(filterQuery)
		setNotice(null)
		setRefreshCompletionMessage(null)
		setRefreshStartedAt(null)
		flashNotice(`Viewing discussions for ${repository}`)
	}
	const viewRepositoryNotifications = (repository: string) => {
		rememberActiveSelection()
		const nextCacheKey = auxiliaryCacheKey("notifications", repository)
		setNotificationRepository(repository)
		setActiveSurface("notifications")
		setSelectedIndex(registry.get(auxiliarySelectionAtom)[nextCacheKey] ?? 0)
		setDetailFullView(false)
		setDiffFullView(false)
		setDiffCommentMode(false)
		setFilterDraft(filterQuery)
		setNotice(null)
		setRefreshCompletionMessage(null)
		setRefreshStartedAt(null)
		if (!registry.get(auxiliaryLoadCacheAtom)[nextCacheKey]) {
			void refreshAuxiliaryQuietly("notifications", repository).catch((error) => flashNotice(errorMessage(error)))
		}
		flashNotice(`Viewing notifications for ${repository}`)
	}
	const switchViewTo = (view: PullRequestView) => {
		if (viewEquals(view, activeView)) return
		refreshGenerationRef.current += 1
		setQueueSelection((current) => ({ ...current, [currentQueueCacheKey]: selectedIndex }))
		setActiveView(view)
		setSelectedIndex(registry.get(queueSelectionAtom)[viewCacheKey(view)] ?? 0)
		setRecentlyCompletedPullRequests({})
		detailHydrationRef.current.clear()
		if (detailPrefetchTimeoutRef.current !== null) clearTimeout(detailPrefetchTimeoutRef.current)
		setLoadingMoreKey(null)
		setDetailFullView(false)
		setDiffFullView(false)
		setDiffCommentMode(false)
		setFilterDraft(filterQuery)
		setNotice(null)
		setRefreshCompletionMessage(null)
		setRefreshStartedAt(null)
	}
	const switchIssueViewTo = (view: IssueView) => {
		if (issueViewEquals(view, activeIssueView)) return
		refreshGenerationRef.current += 1
		setIssueSelection((current) => ({ ...current, [currentIssueQueueCacheKey]: selectedIndex }))
		setActiveIssueView(view)
		setSelectedIndex(registry.get(issueSelectionAtom)[issueViewCacheKey(view)] ?? 0)
		setRecentlyCompletedIssues({})
		setLoadingMoreKey(null)
		setDetailFullView(false)
		setDiffFullView(false)
		setDiffCommentMode(false)
		setFilterDraft(filterQuery)
		setNotice(null)
		setRefreshCompletionMessage(null)
		setRefreshStartedAt(null)
	}
	const switchQueueMode = (delta: 1 | -1) => {
		if (activeSurface === "issues") switchIssueViewTo(nextIssueView(activeIssueView, activeIssueViewList, delta))
		else if (activeSurface === "pullRequests") switchViewTo(nextView(activeView, activeViews, delta))
	}
	const loadMorePullRequests = () => {
		if (!pullRequestLoad || !hasMorePullRequests || isLoadingMorePullRequests || !pullRequestLoad.endCursor) return false
		const remaining = config.prFetchLimit - pullRequestLoad.data.length
		if (remaining <= 0) return false
		const cacheKey = currentQueueCacheKey
		const generation = refreshGenerationRef.current
		setLoadingMoreKey(cacheKey)
		void loadPullRequestPage({
			mode: viewMode(activeView),
			repository: selectedRepository,
			cursor: pullRequestLoad.endCursor,
			pageSize: Math.min(pullRequestPageSize, remaining),
		}).then((page) => {
			if (generation !== refreshGenerationRef.current) return
			setQueueLoadCache((current) => {
				const load = current[cacheKey]
				if (!load) return current
				const data = appendPullRequestPage(load.data, page.items)
				return {
					...current,
					[cacheKey]: {
						...load,
						data,
						endCursor: page.endCursor,
						hasNextPage: page.hasNextPage && data.length < config.prFetchLimit,
					},
				}
			})
		}).catch((error) => {
			flashNotice(errorMessage(error))
		}).finally(() => {
			setLoadingMoreKey((current) => current === cacheKey ? null : current)
		})
		return true
	}
	const loadMoreIssues = () => {
		if (!issueLoad || !hasMoreIssues || isLoadingMoreIssues || !issueLoad.endCursor) return false
		const remaining = config.prFetchLimit - issueLoad.data.length
		if (remaining <= 0) return false
		const cacheKey = currentIssueQueueCacheKey
		const loadingKey = `issue:${cacheKey}`
		const generation = refreshGenerationRef.current
		setLoadingMoreKey(loadingKey)
		void loadIssuePage({
			mode: issueViewMode(activeIssueView),
			repository: selectedIssueRepository,
			cursor: issueLoad.endCursor,
			pageSize: Math.min(pullRequestPageSize, remaining),
		}).then((page) => {
			if (generation !== refreshGenerationRef.current) return
			setIssueLoadCache((current) => {
				const load = current[cacheKey]
				if (!load) return current
				const data = appendIssuePage(load.data, page.items)
				return {
					...current,
					[cacheKey]: {
						...load,
						data,
						endCursor: page.endCursor,
						hasNextPage: page.hasNextPage && data.length < config.prFetchLimit,
					},
				}
			})
		}).catch((error) => {
			flashNotice(errorMessage(error))
		}).finally(() => {
			setLoadingMoreKey((current) => current === loadingKey ? null : current)
		})
		return true
	}
	const applyPullRequestDetail = (detail: PullRequestItem) => {
		setQueueLoadCache((current) => {
			const next = { ...current }
			let changed = false
			for (const [cacheKey, load] of Object.entries(current)) {
				if (!load) continue
				const index = load.data.findIndex((pullRequest) => pullRequest.url === detail.url)
				if (index < 0) continue
				const data = [...load.data]
				data[index] = detail
				changed = true
				next[cacheKey] = { ...load, data }
			}
			return changed ? next : current
		})
	}
	const applyIssueDetail = (detail: IssueItem) => {
		setIssueLoadCache((current) => {
			const next = { ...current }
			let changed = false
			for (const [cacheKey, load] of Object.entries(current)) {
				if (!load) continue
				const index = load.data.findIndex((issue) => issue.url === detail.url)
				if (index < 0) continue
				const data = [...load.data]
				data[index] = { ...data[index]!, ...detail, timeline: detail.timeline.length > 0 ? detail.timeline : data[index]!.timeline }
				changed = true
				next[cacheKey] = { ...load, data }
			}
			return changed ? next : current
		})
	}
	const hydratePullRequestDetails = (pullRequest: PullRequestItem, notifyError: boolean) => {
		if (pullRequest.state !== "open" || pullRequest.detailLoaded) return false
		const detailKey = pullRequestDetailKey(pullRequest)
		const existing = detailHydrationRef.current.get(detailKey)
		if (existing) {
			if (notifyError) existing.notifyError = true
			return false
		}
		if (!notifyError && detailHydrationRef.current.size >= DETAIL_PREFETCH_CONCURRENCY) return false
		const entry: DetailHydration = { token: Symbol(detailKey), notifyError }
		detailHydrationRef.current.set(detailKey, entry)
		const generation = refreshGenerationRef.current
		const atom = pullRequestDetailsAtom(pullRequestDetailAtomKey(pullRequest))
		void Effect.runPromise(AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })).then((detail) => {
			if (generation === refreshGenerationRef.current && detailHydrationRef.current.get(detailKey) === entry) applyPullRequestDetail(detail)
		}).catch((error) => {
			if (entry.notifyError && generation === refreshGenerationRef.current && detailHydrationRef.current.get(detailKey) === entry) flashNotice(errorMessage(error))
		}).finally(() => {
			if (detailHydrationRef.current.get(detailKey) === entry) detailHydrationRef.current.delete(detailKey)
		})
		return true
	}
	const loadPullRequestConversation = (pullRequest: PullRequestItem, force = false) => {
		const key = pullRequestDiffKey(pullRequest)
		const previousLoadState = registry.get(pullRequestConversationLoadedAtom)[key]
		if (!force && previousLoadState) return
		const generation = refreshGenerationRef.current
		setPullRequestConversationLoaded((current) => ({ ...current, [key]: "loading" }))
		void listPullRequestConversation({ repository: pullRequest.repository, number: pullRequest.number })
			.then((items) => {
				if (generation !== refreshGenerationRef.current) return
				setPullRequestConversation((current) => ({ ...current, [key]: items }))
				setPullRequestConversationLoaded((current) => ({ ...current, [key]: "ready" }))
			})
			.catch((error) => {
				if (generation !== refreshGenerationRef.current) return
				setPullRequestConversationLoaded((current) => {
					if (previousLoadState === "ready") return { ...current, [key]: previousLoadState }
					const next = { ...current }
					delete next[key]
					return next
				})
				flashNotice(errorMessage(error))
			})
	}
	const hydrateIssueDetails = (issue: IssueItem, notifyError: boolean) => {
		if (issue.detailLoaded) return false
		const detailKey = issueDetailKey(issue)
		const existing = detailHydrationRef.current.get(detailKey)
		if (existing) {
			if (notifyError) existing.notifyError = true
			return false
		}
		const entry: DetailHydration = { token: Symbol(detailKey), notifyError }
		detailHydrationRef.current.set(detailKey, entry)
		const generation = refreshGenerationRef.current
		const atom = issueDetailsAtom(issueDetailAtomKey(issue))
		void Effect.runPromise(AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })).then((detail) => {
			if (generation === refreshGenerationRef.current && detailHydrationRef.current.get(detailKey) === entry) applyIssueDetail(detail)
		}).catch((error) => {
			if (entry.notifyError && generation === refreshGenerationRef.current && detailHydrationRef.current.get(detailKey) === entry) flashNotice(errorMessage(error))
		}).finally(() => {
			if (detailHydrationRef.current.get(detailKey) === entry) detailHydrationRef.current.delete(detailKey)
		})
		return true
	}
	const hydrateIssueComments = (issue: IssueItem, notifyError: boolean) => {
		if (issue.comments === 0 || issue.timeline.length >= issue.comments) return false
		const detailKey = issueCommentsKey(issue)
		const loadState = registry.get(issueCommentsLoadedAtom)[detailKey]
		if (loadState === "loading" || loadState === "ready" || loadState === "error") return false
		const existing = detailHydrationRef.current.get(detailKey)
		if (existing) {
			if (notifyError) existing.notifyError = true
			return false
		}
		const entry: DetailHydration = { token: Symbol(detailKey), notifyError }
		detailHydrationRef.current.set(detailKey, entry)
		setIssueCommentsLoaded((current) => ({ ...current, [detailKey]: "loading" }))
		const generation = refreshGenerationRef.current
		void listIssueComments({ repository: issue.repository, number: issue.number }).then((comments) => {
			if (generation !== refreshGenerationRef.current || detailHydrationRef.current.get(detailKey) !== entry) return
			setIssueCommentsLoaded((current) => ({ ...current, [detailKey]: "ready" }))
			updateIssue(issue.url, (current) => ({ ...current, timeline: comments, comments: Math.max(current.comments, comments.length) }))
		}).catch((error) => {
			if (generation !== refreshGenerationRef.current || detailHydrationRef.current.get(detailKey) !== entry) return
			setIssueCommentsLoaded((current) => ({ ...current, [detailKey]: "error" }))
			if (entry.notifyError) flashNotice(errorMessage(error))
		}).finally(() => {
			if (generation !== refreshGenerationRef.current) {
				setIssueCommentsLoaded((current) => {
					if (current[detailKey] !== "loading") return current
					const next = { ...current }
					delete next[detailKey]
					return next
				})
			}
			if (detailHydrationRef.current.get(detailKey) === entry) detailHydrationRef.current.delete(detailKey)
		})
		return true
	}
	useEffect(() => {
		const fetchedAt = pullRequestLoad?.fetchedAt?.getTime()
		if (fetchedAt !== undefined) {
			lastPullRequestRefreshAtRef.current = fetchedAt
			pullRequestRefreshAtRef.current[currentQueueCacheKey] = fetchedAt
		}
	}, [currentQueueCacheKey, pullRequestLoad?.fetchedAt])

	useEffect(() => {
		const fetchedAt = issueLoad?.fetchedAt?.getTime()
		if (fetchedAt !== undefined) {
			lastIssueRefreshAtRef.current = fetchedAt
			issueRefreshAtRef.current[currentIssueQueueCacheKey] = fetchedAt
		}
	}, [currentIssueQueueCacheKey, issueLoad?.fetchedAt])

	useEffect(() => {
		const cacheKey = auxiliaryLoad?.cacheKey
		const fetchedAt = auxiliaryLoad?.fetchedAt?.getTime()
		if (cacheKey !== undefined && fetchedAt !== undefined) {
			lastAuxiliaryRefreshAtRef.current = fetchedAt
			auxiliaryRefreshAtRef.current[cacheKey] = fetchedAt
		}
	}, [auxiliaryLoad?.cacheKey, auxiliaryLoad?.fetchedAt])

	useEffect(() => {
		if (!didMountQueueModeRef.current) {
			didMountQueueModeRef.current = true
			return
		}
		if (registry.get(queueLoadCacheAtom)[currentQueueCacheKey]) return
		refreshPullRequestsAtom()
	}, [currentQueueCacheKey, refreshPullRequestsAtom, registry])

	useEffect(() => {
		if (!didMountIssueQueueModeRef.current) {
			didMountIssueQueueModeRef.current = true
			return
		}
		if (registry.get(issueLoadCacheAtom)[currentIssueQueueCacheKey]) return
		refreshIssuesAtom()
	}, [currentIssueQueueCacheKey, refreshIssuesAtom, registry])

	useEffect(() => {
		if (!currentAuxiliaryCacheKey) return
		if (registry.get(auxiliaryLoadCacheAtom)[currentAuxiliaryCacheKey]) return
		if (!isAuxiliarySurface(activeSurface)) return
		void refreshAuxiliaryQuietly(activeSurface, activeSurface === "discussions" ? discussionRepository : activeSurface === "notifications" ? notificationRepository : null).catch((error) => flashNotice(errorMessage(error)))
	}, [activeSurface, currentAuxiliaryCacheKey, discussionRepository, notificationRepository, registry])

	useEffect(() => {
		if (!refreshCompletionMessage || refreshStartedAt === null) return
		const fetchedAt = activeSurface === "issues" ? issueLoad?.fetchedAt?.getTime() : activeSurface === "pullRequests" ? pullRequestLoad?.fetchedAt?.getTime() : auxiliaryLoad?.fetchedAt?.getTime()
		const isHydratingDetails = activeSurface === "issues"
			? issueStatus === "ready" && selectedIssue !== null && (!selectedIssue.detailLoaded || selectedIssueCommentsLoading)
			: activeSurface === "pullRequests" && pullRequestStatus === "ready" && selectedPullRequest?.state === "open" && !selectedPullRequest.detailLoaded
		if (activeStatus === "ready" && fetchedAt !== undefined && fetchedAt !== refreshStartedAt && !isHydratingDetails) {
			flashNotice(`✓ ${refreshCompletionMessage}`)
			setRefreshCompletionMessage(null)
			setRefreshStartedAt(null)
		} else if (activeStatus === "error") {
			flashNotice("Refresh failed")
			setRefreshCompletionMessage(null)
			setRefreshStartedAt(null)
		}
	}, [refreshCompletionMessage, refreshStartedAt, activeStatus, activeSurface, pullRequestLoad?.fetchedAt, issueLoad?.fetchedAt, auxiliaryLoad?.fetchedAt, pullRequests, issues, auxiliaryItems, selectedIssueCommentsLoading])

	useEffect(() => {
		const handleFocus = () => {
			terminalFocusedRef.current = true
			setTerminalFocused(true)
		}
		const handleBlur = () => {
			terminalFocusedRef.current = false
			setTerminalFocused(false)
		}

		renderer.on("focus", handleFocus)
		renderer.on("blur", handleBlur)
		return () => {
			renderer.off("focus", handleFocus)
			renderer.off("blur", handleBlur)
		}
	}, [renderer])

	useEffect(() => {
		if (isReactActEnvironment()) return
		if (!terminalFocused) return
		let cancelled = false
		const timers = new Set<ReturnType<typeof setTimeout>>()
		const schedule = (delayMs: number, run: () => void) => {
			const timer = globalThis.setTimeout(() => {
				timers.delete(timer)
				if (!cancelled) run()
			}, delayMs)
			timers.add(timer)
		}
		const runCycle = () => {
			const targets = backgroundRefreshTargetsRef.current
			for (let index = 0; index < targets.length; index++) {
				const target = targets[index]!
				schedule(index * STAGGERED_REFRESH_GAP_MS, () => refreshBackgroundTargetRef.current(target, FOCUSED_IDLE_REFRESH_MS))
			}
			const nextCycleDelay = targets.length * STAGGERED_REFRESH_GAP_MS + FOCUSED_IDLE_REFRESH_MS + Math.floor(Math.random() * AUTO_REFRESH_JITTER_MS)
			schedule(nextCycleDelay, runCycle)
		}
		schedule(STAGGERED_REFRESH_INITIAL_DELAY_MS, runCycle)
		return () => {
			cancelled = true
			for (const timer of timers) globalThis.clearTimeout(timer)
			timers.clear()
		}
	}, [terminalFocused])

	useEffect(() => {
		setSelectedIndex((current) => {
			const visibleCount = activeSurface === "issues" ? visibleIssues.length : activeSurface === "pullRequests" ? visiblePullRequests.length : visibleAuxiliaryItems.length
			if (visibleCount === 0) return 0
			return Math.max(0, Math.min(current, visibleCount - 1))
		})
	}, [activeSurface, visiblePullRequests.length, visibleIssues.length, visibleAuxiliaryItems.length])

	useEffect(() => {
		if (activeSurface === "issues") {
			setIssueSelection((current) => current[currentIssueQueueCacheKey] === selectedIndex ? current : { ...current, [currentIssueQueueCacheKey]: selectedIndex })
		} else if (activeSurface === "pullRequests") {
			setQueueSelection((current) => current[currentQueueCacheKey] === selectedIndex ? current : { ...current, [currentQueueCacheKey]: selectedIndex })
		} else if (currentAuxiliaryCacheKey) {
			setAuxiliarySelection((current) => current[currentAuxiliaryCacheKey] === selectedIndex ? current : { ...current, [currentAuxiliaryCacheKey]: selectedIndex })
		}
	}, [activeSurface, currentQueueCacheKey, currentIssueQueueCacheKey, currentAuxiliaryCacheKey, selectedIndex])

	useEffect(() => {
		if (filterMode || filterQuery.length > 0) return
		if (activeSurface === "issues") {
			if (visibleIssues.length === 0) return
			const thresholdIndex = Math.max(0, visibleIssues.length - LOAD_MORE_SELECTION_THRESHOLD)
			if (selectedIndex >= thresholdIndex) loadMoreIssues()
		} else if (activeSurface === "pullRequests") {
			if (visiblePullRequests.length === 0) return
			const thresholdIndex = Math.max(0, visiblePullRequests.length - LOAD_MORE_SELECTION_THRESHOLD)
			if (selectedIndex >= thresholdIndex) loadMorePullRequests()
		}
	}, [activeSurface, selectedIndex, visiblePullRequests.length, visibleIssues.length, filterMode, filterQuery, hasMorePullRequests, hasMoreIssues, isLoadingMorePullRequests, isLoadingMoreIssues, currentQueueCacheKey, currentIssueQueueCacheKey])

	useEffect(() => {
		if (filterMode || filterQuery.length > 0 || visiblePullRequests.length === 0 || detailFullView || diffFullView) return
		if (!hasMorePullRequests || isLoadingMorePullRequests) return
		const checkScroll = () => {
			const scroll = prListScrollRef.current
			if (!scroll || scroll.viewport.height <= 0) return
			const bottom = scroll.scrollTop + scroll.viewport.height
			if (bottom >= scroll.scrollHeight - LOAD_MORE_SCROLL_THRESHOLD) loadMorePullRequests()
		}
		checkScroll()
		const interval = globalThis.setInterval(checkScroll, 120)
		return () => globalThis.clearInterval(interval)
	}, [visiblePullRequests.length, filterMode, filterQuery, detailFullView, diffFullView, hasMorePullRequests, isLoadingMorePullRequests, currentQueueCacheKey])

	useEffect(() => {
		const scroll = prListScrollRef.current
		const rowIndex = activeSurface === "issues" ? selectedIssueRowIndex : activeSurface === "pullRequests" ? selectedPullRequestRowIndex : selectedAuxiliaryRowIndex
		if (!scroll || rowIndex === null) return
		const viewportHeight = scroll.viewport.height
		if (viewportHeight <= 0) return
		const nextTop = scrollTopForVisibleLine(scroll.scrollTop, viewportHeight, rowIndex, 2)
		if (nextTop !== scroll.scrollTop) scroll.scrollTo({ x: 0, y: nextTop })
	}, [activeSurface, selectedPullRequestRowIndex, selectedIssueRowIndex, selectedAuxiliaryRowIndex])

	useEffect(() => {
		setDiffFileIndex(0)
		setDiffScrollTop(0)
		setDiffCommentAnchorIndex(0)
		detailPreviewScrollRef.current?.scrollTo({ x: 0, y: 0 })
	}, [activeSurface, selectedPullRequest?.url, selectedIssue?.url, selectedAuxiliaryItem?.id])

	useEffect(() => {
		setDiffCommentAnchorIndex((current) => {
			if (diffCommentAnchors.length === 0) return 0
			return Math.max(0, Math.min(current, diffCommentAnchors.length - 1))
		})
	}, [diffCommentAnchors.length])

	useEffect(() => {
		if (!diffCommentMode || !selectedDiffCommentAnchor) return
		setDiffFileIndex((current) => current === selectedDiffCommentAnchor.fileIndex ? current : selectedDiffCommentAnchor.fileIndex)
	}, [diffCommentMode, selectedDiffCommentAnchor?.fileIndex])

	useEffect(() => {
		const previous = diffCommentLineColorsRef.current
		if (previous.contextKey === diffLineColorContextKey) {
			for (const entry of previous.entries) {
				const diff = diffRenderableRefs.current.get(entry.anchor.fileIndex)
				if (diff) setDiffCommentLineColor(diff, entry, originalDiffLineColor(entry.anchor))
			}
		}

		const nextEntries: AppliedDiffLineColor[] = []
		const appliedKeys = new Set<string>()
		const applyLineColor = (anchor: StackedDiffCommentAnchor, gutter: string, override = false) => {
			const key = `${effectiveDiffRenderView}:${anchor.side}:${anchor.renderLine}`
			if (appliedKeys.has(key) && !override) return
			appliedKeys.add(key)
			const entry = { anchor, view: effectiveDiffRenderView } satisfies AppliedDiffLineColor
			const diff = diffRenderableRefs.current.get(anchor.fileIndex)
			if (diff) setDiffCommentLineColor(diff, entry, { ...originalDiffLineColor(anchor), gutter })
			if (!nextEntries.some((existing) => existing.view === entry.view && existing.anchor.side === anchor.side && existing.anchor.renderLine === anchor.renderLine)) {
				nextEntries.push(entry)
			}
		}

		if (selectedDiffKey) {
			for (const anchor of diffCommentAnchors) {
				if ((diffCommentThreads[`${selectedDiffKey}:${diffCommentLocationKey(anchor)}`]?.length ?? 0) > 0) {
					applyLineColor(anchor, diffCommentGutterColor(anchor, "thread"))
				}
			}
		}
		if (diffCommentMode && selectedDiffCommentAnchor) {
			applyLineColor(selectedDiffCommentAnchor, diffCommentGutterColor(selectedDiffCommentAnchor, "selected"), true)
			if (suppressNextDiffCommentScrollRef.current) {
				suppressNextDiffCommentScrollRef.current = false
			} else {
				ensureDiffLineVisible(selectedDiffCommentAnchor.renderLine)
			}
		} else {
			suppressNextDiffCommentScrollRef.current = false
		}
		diffCommentLineColorsRef.current = { contextKey: diffLineColorContextKey, entries: nextEntries }
	}, [diffCommentMode, selectedDiffCommentAnchor?.renderLine, selectedDiffCommentAnchor?.localRenderLine, selectedDiffCommentAnchor?.side, selectedDiffCommentAnchor?.fileIndex, diffLineColorContextKey, effectiveDiffRenderView, diffCommentAnchors, diffCommentThreads])
	const isHydratingPullRequestDetails = pullRequestStatus === "ready" && selectedPullRequest?.state === "open" && !selectedPullRequest.detailLoaded
	const isHydratingIssueDetails = issueStatus === "ready" && selectedIssue !== null && (!selectedIssue.detailLoaded || selectedIssueCommentsLoading)
	const isRefreshingPullRequests = pullRequestResult.waiting && pullRequestLoad !== null
	const isRefreshingIssues = issueResult.waiting && issueLoad !== null
	const isRefreshingAuxiliary = (auxiliaryResult.waiting || currentAuxiliaryLoadProgress?._tag === "loading") && auxiliaryLoad !== null
	const hasActiveLoadingIndicator = (activeSurface === "issues"
		? issueResult.waiting || isHydratingIssueDetails
		: activeSurface === "pullRequests"
			? pullRequestResult.waiting || isHydratingPullRequestDetails
			: auxiliaryResult.waiting)
		|| labelModal.loading || closeModal.running || confirmActionModal.running || mergeModal.loading || mergeModal.running || submitReviewModal.running || selectedDiffState?._tag === "Loading"
	const loadingIndicator = LOADING_FRAMES[loadingFrame % LOADING_FRAMES.length]!

	useEffect(() => {
		if (!hasActiveLoadingIndicator) return
		const interval = globalThis.setInterval(() => {
			setLoadingFrame((current) => (current + 1) % LOADING_FRAMES.length)
		}, 120)
		return () => globalThis.clearInterval(interval)
	}, [hasActiveLoadingIndicator])

	useEffect(() => {
		if (pullRequestStatus !== "ready" || !selectedPullRequest) return
		hydratePullRequestDetails(selectedPullRequest, true)
	}, [pullRequestStatus, selectedPullRequest?.url, selectedPullRequest?.headRefOid, selectedPullRequest?.state, selectedPullRequest?.detailLoaded, selectedPullRequest?.repository, selectedPullRequest?.number])

	useEffect(() => {
		if (pullRequestStatus !== "ready" || !selectedPullRequest) return
		loadPullRequestConversation(selectedPullRequest)
	}, [pullRequestStatus, selectedPullRequest?.url, selectedPullRequest?.headRefOid, selectedPullRequest?.repository, selectedPullRequest?.number])

	useEffect(() => {
		if (issueStatus !== "ready" || !selectedIssue) return
		hydrateIssueDetails(selectedIssue, true)
		hydrateIssueComments(selectedIssue, true)
	}, [issueStatus, selectedIssue?.url, selectedIssue?.detailLoaded, selectedIssue?.comments, selectedIssue?.timeline.length, selectedIssue?.repository, selectedIssue?.number, selectedIssueCommentsState])

	useEffect(() => {
		if (detailPrefetchTimeoutRef.current !== null) clearTimeout(detailPrefetchTimeoutRef.current)
		if (activeSurface !== "pullRequests" || pullRequestStatus !== "ready" || visiblePullRequests.length === 0) return
		detailPrefetchTimeoutRef.current = globalThis.setTimeout(() => {
			detailPrefetchTimeoutRef.current = null
			let started = 0
			for (let distance = 1; distance <= Math.max(DETAIL_PREFETCH_AHEAD, DETAIL_PREFETCH_BEHIND); distance++) {
				const offsets = [distance <= DETAIL_PREFETCH_AHEAD ? distance : null, distance <= DETAIL_PREFETCH_BEHIND ? -distance : null]
				for (const offset of offsets) {
					if (offset === null) continue
					if (started >= DETAIL_PREFETCH_CONCURRENCY) return
					const pullRequest = visiblePullRequests[selectedIndex + offset]
					if (pullRequest && hydratePullRequestDetails(pullRequest, false)) started += 1
				}
			}
		}, DETAIL_PREFETCH_DELAY_MS)
		return () => {
			if (detailPrefetchTimeoutRef.current !== null) clearTimeout(detailPrefetchTimeoutRef.current)
		}
	}, [activeSurface, pullRequestStatus, currentQueueCacheKey, selectedIndex, visiblePullRequests])

	const detailPlaceholderContent = getDetailPlaceholderContent({
		surface: activeSurface,
		status: activeStatus,
		retryProgress,
		loadingIndicator,
		visibleCount: activeVisibleCount,
		filterText: visibleFilterText,
	})
	const isSelectedPullRequestDetailLoading = selectedPullRequest !== null && !selectedPullRequest.detailLoaded
	const isSelectedIssueDetailLoading = selectedIssue !== null && !selectedIssue.detailLoaded
	const detailLoadingContent: DetailPlaceholderContent = selectedPullRequest ? {
		title: `${loadingIndicator} Loading pull request details`,
		hint: `${selectedPullRequest.repository} #${selectedPullRequest.number}`,
	} : detailPlaceholderContent
	const issueDetailLoadingContent: DetailPlaceholderContent = selectedIssue ? {
		title: `${loadingIndicator} Loading issue details`,
		hint: `${selectedIssue.repository} #${selectedIssue.number}`,
	} : detailPlaceholderContent
	const detailJunctions = isSelectedPullRequestDetailLoading ? [] : getDetailJunctionRows({
		pullRequest: selectedPullRequest,
		paneWidth: rightPaneWidth,
		showChecks: true,
		contentWidth: rightContentWidth,
		bodyScrollTop: 0,
		bodyViewportHeight: Math.max(1, wideBodyHeight - getDetailHeaderHeight(selectedPullRequest, rightPaneWidth, true)),
		conversationItems: selectedConversationItems,
		conversationStatus: selectedConversationStatus,
	})
	const issueDetailJunctions = isSelectedIssueDetailLoading ? [] : getIssueDetailJunctionRows(selectedIssue, rightPaneWidth)
	const auxiliaryDetailJunctions = getAuxiliaryDetailJunctionRows(selectedAuxiliaryItem, rightPaneWidth)

	const halfPage = Math.max(1, Math.floor(wideBodyHeight / 2))

	const loadPullRequestComments = (pullRequest: PullRequestItem, force = false) => {
		const key = pullRequestDiffKey(pullRequest)
		const previousLoadState = registry.get(diffCommentsLoadedAtom)[key]
		if (!force && previousLoadState) return
		setDiffCommentsLoaded((current) => ({ ...current, [key]: "loading" }))
		void listPullRequestComments({ repository: pullRequest.repository, number: pullRequest.number })
			.then((comments) => {
				setDiffCommentsLoaded((current) => ({ ...current, [key]: "ready" }))
				setDiffCommentThreads((current) => {
					const prefix = `${key}:`
					const threads = groupDiffCommentThreads(pullRequest, comments)
					const next: Record<string, readonly PullRequestReviewComment[]> = Object.fromEntries(
						Object.entries(current).filter(([threadKey]) => !threadKey.startsWith(prefix)),
					)

					for (const [threadKey, threadComments] of Object.entries(current)) {
						if (!threadKey.startsWith(prefix)) continue
						const localComments = threadComments.filter(isLocalDiffComment)
						if (localComments.length > 0) {
							next[threadKey] = [...(threads[threadKey] ?? []), ...localComments]
						}
					}

					for (const [threadKey, threadComments] of Object.entries(threads)) {
						if (!next[threadKey]) next[threadKey] = threadComments
					}

					return next
				})
			})
			.catch((error) => {
				setDiffCommentsLoaded((current) => {
					if (previousLoadState === "ready") return { ...current, [key]: previousLoadState }
					const next = { ...current }
					delete next[key]
					return next
				})
				flashNotice(errorMessage(error))
			})
	}

	const loadPullRequestDiff = (pullRequest: PullRequestItem, options: { readonly force?: boolean; readonly includeComments?: boolean } = {}) => {
		const force = options.force ?? false
		const includeComments = options.includeComments ?? false
		const key = pullRequestDiffKey(pullRequest)
		const existing = registry.get(pullRequestDiffCacheAtom)[key]
		if (includeComments) loadPullRequestComments(pullRequest, force)
		if (!force && existing && (existing._tag === "Ready" || existing._tag === "Loading")) return

		setPullRequestDiffCache((current) => ({ ...current, [key]: PullRequestDiffState.Loading() }))
		const atom = pullRequestDiffAtom(pullRequestDiffAtomKey(pullRequest))
		if (force) registry.refresh(atom)
		void Effect.runPromise(AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }))
			.then((patch) => {
				setPullRequestDiffCache((current) => ({
					...current,
					[key]: PullRequestDiffState.Ready({ patch, files: splitPatchFiles(patch) }),
				}))
			})
			.catch((error) => {
				setPullRequestDiffCache((current) => ({
					...current,
					[key]: PullRequestDiffState.Error({ error: errorMessage(error) }),
				}))
				flashNotice(errorMessage(error))
			})
	}

	useEffect(() => {
		if (activeSurface !== "pullRequests" || !selectedPullRequest || diffFullView) return
		if (diffPrefetchTimeoutRef.current !== null) {
			clearTimeout(diffPrefetchTimeoutRef.current)
		}
		diffPrefetchTimeoutRef.current = setTimeout(() => {
			loadPullRequestDiff(selectedPullRequest)
		}, 250)
		return () => {
			if (diffPrefetchTimeoutRef.current !== null) {
				clearTimeout(diffPrefetchTimeoutRef.current)
				diffPrefetchTimeoutRef.current = null
			}
		}
	}, [activeSurface, selectedIndex, selectedPullRequest?.url, diffFullView])

	const openDiffView = () => {
		if (!selectedPullRequest) return
		diffRenderableRefs.current.clear()
		diffCommentLineColorsRef.current = { contextKey: null, entries: [] }
		setDiffFullView(true)
		setDetailFullView(false)
		setDiffCommentMode(false)
		setDiffFileIndex(0)
		setDiffScrollTop(0)
		setDiffRenderView(contentWidth >= 100 ? "split" : "unified")
		diffScrollRef.current?.scrollTo({ x: 0, y: 0 })
		loadPullRequestDiff(selectedPullRequest, { includeComments: true })
	}

	const setDiffRenderableRef = (index: number, diff: DiffRenderable | null) => {
		if (diff) diffRenderableRefs.current.set(index, diff)
		else diffRenderableRefs.current.delete(index)
	}

	const scrollToDiffFile = (index: number) => {
		const stackedFile = stackedDiffFiles[index]
		diffScrollRef.current?.scrollTo({ x: 0, y: stackedFile?.headerLine ?? 0 })
		syncDiffScrollState()
	}

	const syncDiffScrollState = () => {
		const scrollTop = diffScrollRef.current?.scrollTop
		if (scrollTop === undefined || stackedDiffFiles.length === 0) return
		setDiffScrollTop((current) => current === scrollTop ? current : scrollTop)
		const nextIndex = stackedDiffFileAtLine(stackedDiffFiles, scrollTop)?.index ?? 0
		setDiffFileIndex((current) => current === nextIndex ? current : nextIndex)
	}

	const scrollDetailPreviewBy = (y: number) => detailPreviewScrollRef.current?.scrollBy({ x: 0, y })
	const scrollDetailPreviewTo = (y: number) => detailPreviewScrollRef.current?.scrollTo({ x: 0, y })

	const ensureDiffLineVisible = (line: number) => {
		const scroll = diffScrollRef.current
		if (!scroll) return
		const viewportHeight = Math.max(1, wideBodyHeight - (selectedDiffCommentThread.length > 0 ? 6 : 3))
		const nextTop = scrollTopForVisibleLine(scroll.scrollTop, viewportHeight, line, DIFF_STICKY_HEADER_LINES)
		if (nextTop !== scroll.scrollTop) {
			scroll.scrollTo({ x: 0, y: nextTop })
			syncDiffScrollState()
		}
	}

	useEffect(() => {
		if (!diffFullView) return
		const interval = globalThis.setInterval(syncDiffScrollState, 80)
		return () => globalThis.clearInterval(interval)
	}, [diffFullView, stackedDiffFiles])

	const selectDiffFile = (index: number) => {
		if (readyDiffFiles.length === 0) return
		const nextIndex = safeDiffFileIndex(readyDiffFiles, index)
		setDiffFileIndex(nextIndex)
		const targetSide = diffPreferredSide ?? selectedDiffCommentAnchor?.side
		const nextAnchor = diffCommentAnchors.find((anchor) => anchor.fileIndex === nextIndex && anchor.side === targetSide)
			?? diffCommentAnchors.find((anchor) => anchor.fileIndex === nextIndex)
		if (nextAnchor) setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
		scrollToDiffFile(nextIndex)
	}

	const jumpDiffFile = (delta: 1 | -1) => {
		selectDiffFile(diffFileIndex + delta)
	}

	const openChangedFilesModal = () => {
		if (readyDiffFiles.length === 0) return
		setChangedFilesModal({
			query: "",
			selectedIndex: safeDiffFileIndex(readyDiffFiles, diffFileIndex),
		})
	}

	const selectChangedFile = () => {
		const selectedIndex = changedFileResults.length === 0 ? 0 : Math.max(0, Math.min(changedFilesModal.selectedIndex, changedFileResults.length - 1))
		const entry = changedFileResults[selectedIndex]
		if (!entry) return
		closeActiveModal()
		selectDiffFile(entry.index)
	}

	const enterDiffCommentMode = () => {
		const scrollTop = diffScrollRef.current?.scrollTop ?? 0
		suppressNextDiffCommentScrollRef.current = true
		setDiffCommentAnchorIndex(nearestDiffCommentAnchorIndex(diffCommentAnchors, scrollTop + DIFF_STICKY_HEADER_LINES))
		setDiffCommentMode(true)
	}

	const moveDiffCommentAnchor = (delta: number, options: { readonly preserveViewportRow?: boolean } = {}) => {
		if (diffCommentAnchors.length === 0) return
		const currentAnchor = selectedDiffCommentAnchor ?? diffCommentAnchors[0] ?? null
		const nextAnchor = verticalDiffAnchor(diffCommentAnchors, currentAnchor, delta, diffPreferredSide)
		if (!nextAnchor) return
		if (options.preserveViewportRow) {
			const scroll = diffScrollRef.current
			if (scroll && currentAnchor) {
				const maxScreenOffset = Math.max(DIFF_STICKY_HEADER_LINES, scroll.viewport.height - 2)
				const screenOffset = Math.max(DIFF_STICKY_HEADER_LINES, Math.min(maxScreenOffset, currentAnchor.renderLine - scroll.scrollTop))
				const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.viewport.height)
				const nextTop = Math.max(0, Math.min(maxScrollTop, nextAnchor.renderLine - screenOffset))
				suppressNextDiffCommentScrollRef.current = true
				scroll.scrollTo({ x: 0, y: nextTop })
				syncDiffScrollState()
			}
		}
		setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
	}

	const selectDiffCommentSide = (side: DiffCommentSide) => {
		setDiffPreferredSide(side)
		if (!selectedDiffCommentAnchor) return
		const nextAnchor = diffAnchorOnSide(diffCommentAnchors, selectedDiffCommentAnchor, side)
		if (!nextAnchor) return
		setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
	}

	const selectDiffCommentLine = (renderLine: number, side: DiffCommentSide | null) => {
		const lineAnchors = diffCommentAnchors.filter((anchor) => anchor.renderLine === renderLine)
		const nextAnchor = (side ? lineAnchors.find((anchor) => anchor.side === side) : undefined) ?? lineAnchors[0]
		if (!nextAnchor) return
		suppressNextDiffCommentScrollRef.current = true
		setDiffPreferredSide(side ?? nextAnchor.side)
		setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
		setDiffFileIndex(nextAnchor.fileIndex)
		setDiffCommentMode(true)
	}

	const editComment = (transform: (state: CommentEditorValue) => CommentEditorValue) => {
		setCommentModal((current) => {
			const next = transform({ body: current.body, cursor: current.cursor })
			if (next.body === current.body && next.cursor === current.cursor && current.error === null) return current
			return { ...current, body: next.body, cursor: next.cursor, error: null }
		})
	}

	const editSubmitReview = (transform: (state: CommentEditorValue) => CommentEditorValue) => {
		setSubmitReviewModal((current) => {
			const next = transform({ body: current.body, cursor: current.cursor })
			if (next.body === current.body && next.cursor === current.cursor && current.error === null) return current
			return { ...current, body: next.body, cursor: next.cursor, error: null }
		})
	}

	const openSubmitReviewModal = (initialEvent: SubmitPullRequestReviewInput["event"] = "APPROVE") => {
		if (!selectedPullRequest || selectedPullRequest.state !== "open") return
		const selectedIndex = Math.max(
			0,
			submitReviewOptions.findIndex((option) => option.event === initialEvent),
		)
		setSubmitReviewModal({
			repository: selectedPullRequest.repository,
			number: selectedPullRequest.number,
			focus: "action",
			selectedIndex,
			body: "",
			cursor: 0,
			running: false,
			error: null,
		})
	}

	const openDiffCommentModal = () => {
		if (!selectedDiffCommentAnchor || !selectedPullRequest) return
		setCommentModal(initialCommentModalState)
	}

	const openIssueCommentModal = () => {
		if (!selectedIssue || selectedIssue.state !== "open") return
		hydrateIssueComments(selectedIssue, false)
		setCommentModal(initialCommentModalState)
	}

	const openDiffCommentThreadModal = () => {
		if (!selectedDiffCommentAnchor || selectedDiffCommentThread.length === 0) return
		setCommentThreadModal({ scrollOffset: 0 })
	}

	const submitDiffComment = () => {
		if (!selectedPullRequest || !selectedDiffCommentAnchor) return
		const body = commentModal.body.trim()
		if (body.length === 0) {
			setCommentModal((current) => ({ ...current, error: "Write a comment before saving." }))
			return
		}

		const threadKey = selectedDiffCommentThreadKey
		const target = selectedDiffCommentAnchor
		const optimisticComment = {
			id: `local:${Date.now()}`,
			path: target.path,
			line: target.line,
			side: target.side,
			author: username ?? "you",
			body,
			createdAt: new Date(),
			url: null,
		} satisfies PullRequestReviewComment
		const input = {
			repository: selectedPullRequest.repository,
			number: selectedPullRequest.number,
			commitId: selectedPullRequest.headRefOid,
			path: target.path,
			line: target.line,
			side: target.side,
			body,
		} satisfies CreatePullRequestCommentInput

		if (threadKey) {
			setDiffCommentThreads((current) => ({
				...current,
				[threadKey]: [...(current[threadKey] ?? []), optimisticComment],
			}))
		}
		closeActiveModal()
		flashNotice(`Commenting on ${target.path}:${target.line}`)
		void createPullRequestComment(input).then((comment) => {
			if (threadKey) {
				setDiffCommentThreads((current) => ({
					...current,
					[threadKey]: (current[threadKey] ?? []).map((existing) => existing.id === optimisticComment.id ? comment : existing),
				}))
			}
			flashNotice(`Commented on ${target.path}:${target.line}`)
		}).catch((error) => {
			if (threadKey) {
				setDiffCommentThreads((current) => {
					const next = { ...current }
					const comments = (next[threadKey] ?? []).filter((comment) => comment.id !== optimisticComment.id)
					if (comments.length > 0) next[threadKey] = comments
					else delete next[threadKey]
					return next
				})
			}
			flashNotice(errorMessage(error))
		})
	}

	const submitIssueComment = () => {
		if (!selectedIssue) return
		const body = commentModal.body.trim()
		if (body.length === 0) {
			setCommentModal((current) => ({ ...current, error: "Write a comment before saving." }))
			return
		}

		const targetIssue = selectedIssue
		const previousIssue = targetIssue
		const optimisticComment = {
			id: `local:${Date.now()}`,
			author: username ?? "you",
			body,
			createdAt: new Date(),
			updatedAt: null,
			url: null,
		} satisfies IssueComment

		updateIssue(targetIssue.url, (issue) => ({
			...issue,
			comments: issue.comments + 1,
			timeline: [...issue.timeline, optimisticComment],
		}))
		closeActiveModal()
		flashNotice(`Commenting on #${targetIssue.number}`)
		void createIssueComment({ repository: targetIssue.repository, number: targetIssue.number, body })
			.then((comment) => {
				updateIssue(targetIssue.url, (issue) => ({
					...issue,
					timeline: issue.timeline.map((existing) => existing.id === optimisticComment.id ? comment : existing),
				}))
				flashNotice(`Commented on #${targetIssue.number}`)
			})
			.catch((error) => {
				updateIssue(targetIssue.url, () => previousIssue)
				flashNotice(errorMessage(error))
			})
	}

	const submitActiveComment = () => {
		if (activeSurface === "issues") submitIssueComment()
		else submitDiffComment()
	}

	const confirmSubmitReview = () => {
		if (!submitReviewModal.repository || submitReviewModal.number === null || submitReviewModal.running) return
		const option = submitReviewOptions[submitReviewModal.selectedIndex]
		if (!option) return
		const repository = submitReviewModal.repository
		const number = submitReviewModal.number
		const body = submitReviewModal.body.trim()
		const targetPullRequest = pullRequests.find((pullRequest) => pullRequest.repository === repository && pullRequest.number === number) ?? null
		const nextReviewStatus = reviewStatusAfterSubmit[option.event]

		setSubmitReviewModal((current) => ({ ...current, running: true, error: null }))
		void submitPullRequestReview({ repository, number, event: option.event, body })
			.then(() => {
				if (targetPullRequest && nextReviewStatus) {
					updatePullRequest(targetPullRequest.url, (pullRequest) => ({ ...pullRequest, reviewStatus: nextReviewStatus }))
				}
				closeActiveModal()
				flashNotice(`Submitted ${option.title.toLowerCase()} review for #${number}`)
			})
			.catch((error) => {
				setSubmitReviewModal((current) => ({ ...current, running: false, error: errorMessage(error) }))
				flashNotice(errorMessage(error))
			})
	}

	const openSelectedPullRequestInBrowser = (pullRequest: PullRequestItem) => {
		void openInBrowser(pullRequest)
			.then(() => flashNotice(`Opened #${pullRequest.number} in browser`))
			.catch((error) => flashNotice(errorMessage(error)))
	}

	const openSelectedIssueInBrowser = () => {
		if (!selectedIssue) return
		void openIssueInBrowser(selectedIssue)
			.then(() => flashNotice(`Opened #${selectedIssue.number} in browser`))
			.catch((error) => flashNotice(errorMessage(error)))
	}

	const openSelectedAuxiliaryInBrowser = () => {
		if (!selectedAuxiliaryItem) return
		void openAuxiliaryInBrowser(selectedAuxiliaryItem)
			.then(() => flashNotice(`Opened ${selectedAuxiliaryItem.title}`))
			.catch((error) => flashNotice(errorMessage(error)))
	}

	const copySelectedPullRequestMetadata = () => {
		if (!selectedPullRequest) return
		void copyToClipboard(pullRequestMetadataText(selectedPullRequest))
			.then(() => flashNotice(`Copied #${selectedPullRequest.number} metadata`))
			.catch((error) => flashNotice(errorMessage(error)))
	}

	const copySelectedIssueMetadata = () => {
		if (!selectedIssue) return
		void copyToClipboard(issueMetadataText(selectedIssue))
			.then(() => flashNotice(`Copied #${selectedIssue.number} metadata`))
			.catch((error) => flashNotice(errorMessage(error)))
	}

	const copySelectedAuxiliaryMetadata = () => {
		if (!selectedAuxiliaryItem) return
		void copyToClipboard(auxiliaryMetadataText(selectedAuxiliaryItem))
			.then(() => flashNotice(`Copied ${selectedAuxiliaryItem.title}`))
			.catch((error) => flashNotice(errorMessage(error)))
	}

	const removeAuxiliaryItem = (id: string) => {
		if (!currentAuxiliaryCacheKey) return
		setAuxiliaryLoadCache((current) => {
			const load = current[currentAuxiliaryCacheKey]
			if (!load) return current
			return {
				...current,
				[currentAuxiliaryCacheKey]: {
					...load,
					data: load.data.filter((item) => item.id !== id),
				},
			}
		})
	}

	const manageSelectedAuxiliary = () => {
		if (!selectedAuxiliaryItem?.action) return
		const spec = auxiliaryActionSpec(selectedAuxiliaryItem)
		if (!spec) return
		setConfirmActionModal({
			itemId: selectedAuxiliaryItem.id,
			repository: selectedAuxiliaryItem.repository,
			title: selectedAuxiliaryItem.title,
			action: selectedAuxiliaryItem.action,
			actionLabel: spec.actionLabel,
			description: spec.description,
			confirmLabel: spec.confirmLabel,
			running: false,
			error: null,
		})
	}

	const confirmAuxiliaryAction = () => {
		if (!confirmActionModal.itemId || !confirmActionModal.action || confirmActionModal.running) return
		const item = auxiliaryItems.find((entry) => entry.id === confirmActionModal.itemId)
		if (!item || item.action !== confirmActionModal.action) return
		const spec = auxiliaryActionSpec(item)
		if (!spec) return
		const cacheKey = currentAuxiliaryCacheKey
		const previousLoad = cacheKey ? registry.get(auxiliaryLoadCacheAtom)[cacheKey] ?? null : null
		const run = item.action === "mark-notification-read"
			? markNotificationRead(item.id)
			: item.repository && item.action === "unstar-repository"
				? unstarRepository(item.repository)
				: item.repository && item.action === "unwatch-repository"
					? unwatchRepository(item.repository)
					: null
		if (!run) return

		setConfirmActionModal((current) => ({ ...current, running: true, error: null }))
		removeAuxiliaryItem(item.id)
		const restore = () => {
			if (!cacheKey || !previousLoad) return
			setAuxiliaryLoadCache((current) => ({ ...current, [cacheKey]: previousLoad }))
		}
		void run
			.then(() => {
				closeActiveModal()
				flashNotice(spec.success)
			})
			.catch((error) => {
				restore()
				setConfirmActionModal((current) => ({ ...current, running: false, error: errorMessage(error) }))
				flashNotice(errorMessage(error))
			})
	}

	const toggleSelectedPullRequestDraftStatus = () => {
		if (!selectedPullRequest) return
		const previousPullRequest = selectedPullRequest
		const nextReviewStatus = selectedPullRequest.reviewStatus === "draft" ? "review" : "draft"
		updatePullRequest(selectedPullRequest.url, (pullRequest) => ({
			...pullRequest,
			reviewStatus: nextReviewStatus,
		}))
		void toggleDraftStatus({ repository: selectedPullRequest.repository, number: selectedPullRequest.number, isDraft: selectedPullRequest.reviewStatus === "draft" })
			.then(() => {
				flashNotice(selectedPullRequest.reviewStatus === "draft" ? `Marked #${selectedPullRequest.number} ready` : `Marked #${selectedPullRequest.number} draft`)
			})
			.catch((error) => {
				updatePullRequest(selectedPullRequest.url, () => previousPullRequest)
				flashNotice(errorMessage(error))
			})
	}

	const openCloseModal = () => {
		if (activeSurface === "issues") {
			if (!selectedIssue || selectedIssue.state !== "open") return
			setCloseModal({
				repository: selectedIssue.repository,
				number: selectedIssue.number,
				title: selectedIssue.title,
				url: selectedIssue.url,
				kind: "issue",
				action: "close",
				running: false,
				error: null,
			})
			return
		}
		if (!selectedPullRequest || selectedPullRequest.state !== "open") return
		setCloseModal({
			repository: selectedPullRequest.repository,
			number: selectedPullRequest.number,
			title: selectedPullRequest.title,
			url: selectedPullRequest.url,
			kind: "pull request",
			action: "close",
			running: false,
			error: null,
		})
	}

	const openReopenIssueModal = () => {
		if (!selectedIssue || selectedIssue.state !== "closed") return
		setCloseModal({
			repository: selectedIssue.repository,
			number: selectedIssue.number,
			title: selectedIssue.title,
			url: selectedIssue.url,
			kind: "issue",
			action: "reopen",
			running: false,
			error: null,
		})
	}

	const confirmCloseTarget = () => {
		if (!closeModal.repository || closeModal.number === null || !closeModal.url || closeModal.running) return
		const { repository, number, url, kind, action } = closeModal

		setCloseModal((current) => ({ ...current, running: true, error: null }))
		if (kind === "issue") {
			const targetIssue = issues.find((issue) => issue.url === url)
			const previousIssue = targetIssue ?? null
			const run = action === "reopen" ? reopenIssueAction : closeIssue
			void run({ repository, number })
				.then(() => {
					if (previousIssue) {
						setRecentlyCompletedIssues((current) => ({
							...current,
							[previousIssue.url]: {
								...previousIssue,
								state: action === "reopen" ? "open" : "closed",
								closedAt: action === "reopen" ? null : previousIssue.closedAt ?? new Date(),
							},
						}))
					}
					closeActiveModal()
					refreshIssues(`${action === "reopen" ? "Reopened" : "Closed"} #${number}`)
				})
				.catch((error) => {
					setCloseModal((current) => ({ ...current, running: false, error: errorMessage(error) }))
					flashNotice(errorMessage(error))
				})
			return
		}

		const targetPullRequest = pullRequests.find((pullRequest) => pullRequest.url === url)
		const previousPullRequest = targetPullRequest ?? null
		void closePullRequest({ repository, number })
			.then(() => {
				if (previousPullRequest) {
					setRecentlyCompletedPullRequests((current) => ({
						...current,
						[previousPullRequest.url]: {
							...previousPullRequest,
							state: "closed",
							autoMergeEnabled: false,
						},
					}))
				}
				closeActiveModal()
				refreshPullRequests(`Closed #${number}`)
			})
			.catch((error) => {
				setCloseModal((current) => ({ ...current, running: false, error: errorMessage(error) }))
				flashNotice(errorMessage(error))
			})
	}

	const openThemeModal = () => {
		setThemeModal({
			query: "",
			filterMode: false,
			initialThemeId: themeId,
		})
	}

	const closeThemeModal = (confirm: boolean) => {
		const selectedTheme = themeDefinitions.find((theme) => theme.id === themeIdRef.current)
		if (!confirm) {
			setThemeId(themeModal.initialThemeId)
		} else if (selectedTheme) {
			void Effect.runPromise(saveStoredThemeId(selectedTheme.id)).catch((error) => flashNotice(errorMessage(error)))
			flashNotice(`Theme: ${selectedTheme.name}`)
		}
		closeActiveModal()
	}

	const previewTheme = (id: ThemeId) => {
		if (id === themeIdRef.current) return
		themeIdRef.current = id
		setThemeId(id)
	}

	const moveThemeSelection = (delta: number) => {
		const filteredThemes = filterThemeDefinitions(themeModalRef.current.query)
		if (filteredThemes.length === 0) return
		const currentIndex = Math.max(0, filteredThemes.findIndex((theme) => theme.id === themeIdRef.current))
		const selectedIndex = Math.max(0, Math.min(filteredThemes.length - 1, currentIndex + delta))
		if (selectedIndex === currentIndex) return
		const theme = filteredThemes[selectedIndex]
		if (theme) previewTheme(theme.id)
	}

	const updateThemeQuery = (query: string, options: { readonly previewFirst?: boolean; readonly filterMode?: boolean } = {}) => {
		const current = themeModalRef.current
		const next = {
			...current,
			query,
			filterMode: options.filterMode ?? current.filterMode,
		}
		if (next.query === current.query && next.filterMode === current.filterMode) return

		themeModalRef.current = next
		setThemeModal(next)

		if (options.previewFirst && query.trim().length > 0) {
			const firstTheme = filterThemeDefinitions(query)[0]
			if (firstTheme) previewTheme(firstTheme.id)
		}
	}

	const editThemeQuery = (transform: (query: string) => string) => {
		updateThemeQuery(transform(themeModalRef.current.query), { previewFirst: true })
	}

	const openLabelModal = () => {
		const repository = activeSurface === "issues" ? selectedIssue?.repository : activeSurface === "pullRequests" ? selectedPullRequest?.repository : null
		if (!repository) return
		const cachedLabels = registry.get(labelCacheAtom)[repository]
		if (cachedLabels) {
			setLabelModal({
				repository,
				query: "",
				selectedIndex: 0,
				availableLabels: cachedLabels,
				loading: false,
			})
			return
		}

		setLabelModal({ repository, query: "", selectedIndex: 0, availableLabels: [], loading: true })
		void loadRepoLabels(repository)
			.then((labels) => {
				setLabelCache((current) => ({ ...current, [repository]: labels }))
				setLabelModal((current) => current.repository === repository ? { ...current, availableLabels: labels, loading: false } : current)
			})
			.catch((error) => {
				setLabelModal((current) => current.repository === repository ? { ...current, loading: false } : current)
				flashNotice(errorMessage(error))
			})
	}

	const openMergeModal = () => {
		if (!selectedPullRequest) return
		const repository = selectedPullRequest.repository
		const number = selectedPullRequest.number
		const seededInfo = mergeInfoFromPullRequest(selectedPullRequest)
		setMergeModal({
			repository,
			number,
			selectedIndex: 0,
			loading: true,
			running: false,
			info: seededInfo,
			error: null,
		})
		void getPullRequestMergeInfo({ repository, number })
			.then((info) => {
				setMergeModal((current) => current.repository === repository && current.number === number
					? { ...current, loading: false, info, selectedIndex: 0 }
					: current)
			})
			.catch((error) => {
				setMergeModal((current) => current.repository === repository && current.number === number
					? { ...current, loading: false, error: errorMessage(error) }
					: current)
			})
	}

	const confirmMergeAction = () => {
		if (!mergeModal.info || mergeModal.loading || mergeModal.running) return
		const options = availableMergeActions(mergeModal.info)
		const option = options[mergeModal.selectedIndex]
		if (!option) return

		const { repository, number } = mergeModal.info
		const targetPullRequest = pullRequests.find((pullRequest) => pullRequest.repository === repository && pullRequest.number === number)
		const previousPullRequest = targetPullRequest ?? null
		const previousMergeInfo = mergeModal.info

		if (targetPullRequest && option.optimisticAutoMergeEnabled !== undefined) {
			updatePullRequest(targetPullRequest.url, (pullRequest) => ({ ...pullRequest, autoMergeEnabled: option.optimisticAutoMergeEnabled! }))
			setMergeModal((current) => ({
				...current,
				info: current.info ? { ...current.info, autoMergeEnabled: option.optimisticAutoMergeEnabled! } : current.info,
			}))
		}

		setMergeModal((current) => ({ ...current, running: true, error: null }))
		void mergePullRequest({ repository, number, action: option.action })
			.then(() => {
				if (option.refreshOnSuccess && previousPullRequest) {
					setRecentlyCompletedPullRequests((current) => ({
						...current,
						[previousPullRequest.url]: {
							...previousPullRequest,
							state: "merged",
							autoMergeEnabled: false,
						},
					}))
				}
				closeActiveModal()
				if (option.refreshOnSuccess) {
					refreshPullRequests(`${option.pastTense} #${number}`)
				} else {
					flashNotice(`${option.pastTense} #${number}`)
				}
			})
			.catch((error) => {
				if (previousPullRequest) updatePullRequest(previousPullRequest.url, () => previousPullRequest)
				setMergeModal((current) => ({ ...current, running: false, info: previousMergeInfo, error: errorMessage(error) }))
				flashNotice(errorMessage(error))
			})
	}

	const toggleLabelAtIndex = () => {
		if (activeSurface === "issues" && !selectedIssue) return
		if (activeSurface === "pullRequests" && !selectedPullRequest) return
		const filtered = filterLabels(labelModal.availableLabels, labelModal.query)
		const label = filtered[labelModal.selectedIndex]
		if (!label) return

		if (activeSurface === "issues") {
			if (!selectedIssue) return
			const isActive = selectedIssue.labels.some((l) => l.name.toLowerCase() === label.name.toLowerCase())
			const previousIssue = selectedIssue

			if (isActive) {
				updateIssue(selectedIssue.url, (issue) => ({
					...issue,
					labels: issue.labels.filter((l) => l.name.toLowerCase() !== label.name.toLowerCase()),
				}))
				void removeIssueLabel({ repository: selectedIssue.repository, number: selectedIssue.number, label: label.name })
					.then(() => flashNotice(`Removed ${label.name} from #${selectedIssue.number}`))
					.catch((error) => {
						updateIssue(selectedIssue.url, () => previousIssue)
						flashNotice(errorMessage(error))
					})
			} else {
				updateIssue(selectedIssue.url, (issue) => ({
					...issue,
					labels: [...issue.labels, { name: label.name, color: label.color }],
				}))
				void addIssueLabel({ repository: selectedIssue.repository, number: selectedIssue.number, label: label.name })
					.then(() => flashNotice(`Added ${label.name} to #${selectedIssue.number}`))
					.catch((error) => {
						updateIssue(selectedIssue.url, () => previousIssue)
						flashNotice(errorMessage(error))
					})
			}
			return
		}

		if (!selectedPullRequest) return

		const isActive = selectedPullRequest.labels.some((l) => l.name.toLowerCase() === label.name.toLowerCase())
		const previousPullRequest = selectedPullRequest

		if (isActive) {
			updatePullRequest(selectedPullRequest.url, (pr) => ({
				...pr,
				labels: pr.labels.filter((l) => l.name.toLowerCase() !== label.name.toLowerCase()),
			}))
			void removePullRequestLabel({ repository: selectedPullRequest.repository, number: selectedPullRequest.number, label: label.name })
				.then(() => flashNotice(`Removed ${label.name} from #${selectedPullRequest.number}`))
				.catch((error) => {
					updatePullRequest(selectedPullRequest.url, () => previousPullRequest)
					flashNotice(errorMessage(error))
				})
		} else {
			updatePullRequest(selectedPullRequest.url, (pr) => ({
				...pr,
				labels: [...pr.labels, { name: label.name, color: label.color }],
			}))
			void addPullRequestLabel({ repository: selectedPullRequest.repository, number: selectedPullRequest.number, label: label.name })
				.then(() => flashNotice(`Added ${label.name} to #${selectedPullRequest.number}`))
				.catch((error) => {
					updatePullRequest(selectedPullRequest.url, () => previousPullRequest)
					flashNotice(errorMessage(error))
				})
		}
	}

	const openCommandPalette = () => {
		setCommandPalette(initialCommandPaletteState)
	}
	const openRepositoryPicker = () => {
		setOpenRepositoryModal({ query: activeRepository ?? "", error: null })
	}
	const openRepositoryFromInput = () => {
		const repository = parseRepositoryInput(openRepositoryModal.query)
		if (!repository) {
			setOpenRepositoryModal((current) => ({ ...current, error: "Enter a repository as owner/name or a GitHub URL." }))
			return
		}
		closeActiveModal()
		if (activeSurface === "issues") switchIssueViewTo({ _tag: "Repository", repository })
		else if (activeSurface === "pullRequests") switchViewTo({ _tag: "Repository", repository })
		else if (activeSurface === "discussions") {
			const nextCacheKey = auxiliaryCacheKey("discussions", repository)
			rememberActiveSelection()
			setDiscussionRepository(repository)
			setSelectedIndex(registry.get(auxiliarySelectionAtom)[nextCacheKey] ?? 0)
			setDetailFullView(false)
			setFilterDraft(filterQuery)
		}
		flashNotice(`Opened ${repository}`)
	}
	const insertPastedText = (text: string) => {
		if (text.length === 0) return false
		if (commandPaletteActive) {
			setCommandPalette((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (openRepositoryModalActive) {
			setOpenRepositoryModal((current) => ({ ...current, query: current.query + singleLineText(text), error: null }))
			return true
		}
		if (themeModalActive && themeModal.filterMode) {
			editThemeQuery((query) => query + singleLineText(text))
			return true
		}
		if (commentModalActive) {
			editComment((state) => insertText(state, text.replace(/\r\n?/g, "\n")))
			return true
		}
		if (submitReviewModalActive) {
			setSubmitReviewModal((current) => {
				const next = insertText({ body: current.body, cursor: current.cursor }, text.replace(/\r\n?/g, "\n"))
				return { ...current, focus: "body", body: next.body, cursor: next.cursor, error: null }
			})
			return true
		}
		if (labelModalActive) {
			setLabelModal((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (changedFilesModalActive) {
			setChangedFilesModal((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (filterMode) {
			setFilterDraft((current) => current + singleLineText(text))
			return true
		}
		return false
	}

	useEffect(() => {
		const handlePaste = (event: PasteEvent) => {
			if (insertPastedText(pasteText(event))) event.preventDefault()
		}
		const keyInput = renderer.keyInput as unknown as {
			on: (event: "paste", handler: (event: PasteEvent) => void) => void
			off: (event: "paste", handler: (event: PasteEvent) => void) => void
		}
		keyInput.on("paste", handlePaste)
		return () => {
			keyInput.off("paste", handlePaste)
		}
	}, [renderer, commandPaletteActive, openRepositoryModalActive, themeModalActive, themeModal.filterMode, commentModalActive, submitReviewModalActive, labelModalActive, changedFilesModalActive, filterMode])

	const appCommands: readonly AppCommand[] = buildAppCommands({
		activeSurface,
		pullRequestStatus,
		issueStatus,
		auxiliaryStatus: effectiveAuxiliaryStatus,
		filterQuery,
		filterMode,
		selectedRepository: activeRepository,
		activeAuxiliaryRepository,
		activeViews,
		activeView,
		activeIssueViews: activeIssueViewList,
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
		diffReady: selectedDiffState?._tag === "Ready",
		effectiveDiffRenderView,
		diffWrapMode,
		diffWhitespaceMode,
		readyDiffFileCount: readyDiffFiles.length,
		diffFileIndex,
		diffRangeActive: diffCommentMode,
		selectedDiffCommentAnchorLabel: selectedDiffCommentLabel,
		selectedDiffCommentThreadCount: selectedDiffCommentThread.length,
		hasDiffCommentThreads: Object.values(diffCommentThreads).some((threads) => threads.length > 0),
		actions: {
			openCommandPalette,
			refreshPullRequests,
			refreshIssues,
			refreshAuxiliarySurface,
			openFilter: () => {
				setFilterDraft(filterQuery)
				setFilterMode(true)
			},
			clearFilter: () => {
				setFilterQuery("")
				setFilterDraft("")
				setFilterMode(false)
			},
			openThemeModal,
			openRepositoryPicker,
			loadMorePullRequests,
			loadMoreIssues,
			switchViewTo,
			switchIssueViewTo,
			showPullRequests,
			showIssues,
			showAuxiliarySurface,
			viewRepositoryPullRequests,
			viewRepositoryIssues,
			viewRepositoryDiscussions,
			viewRepositoryNotifications,
			openDetails: () => {
				setDetailFullView(true)
				setDetailScrollOffset(0)
			},
			closeDetails: () => {
				setDetailFullView(false)
				setDetailScrollOffset(0)
			},
			openDiffView,
			closeDiffView: () => {
				setDiffFullView(false)
				setDiffCommentMode(false)
			},
			reloadDiff: () => {
				if (!selectedPullRequest) return
				loadPullRequestDiff(selectedPullRequest, { force: true, includeComments: true })
				flashNotice(`Refreshing diff for #${selectedPullRequest.number}`)
			},
			toggleDiffRenderView: () => setDiffRenderView((current) => current === "unified" ? "split" : "unified"),
			toggleDiffWrapMode: () => setDiffWrapMode((current) => current === "none" ? "word" : "none"),
			toggleDiffWhitespaceMode: () => {
				const next = diffWhitespaceMode === "ignore" ? "show" : "ignore"
				setDiffWhitespaceMode(next)
				void Effect.runPromise(saveStoredDiffWhitespaceMode(next)).catch((error) => flashNotice(errorMessage(error)))
			},
			openChangedFilesModal,
			jumpDiffFile,
			openSelectedDiffComment: () => {
				if (selectedDiffCommentThread.length > 0) openDiffCommentThreadModal()
				else openDiffCommentModal()
			},
			toggleDiffCommentRange: () => {
				if (diffCommentMode) setDiffCommentMode(false)
				else enterDiffCommentMode()
			},
			moveDiffCommentThread: moveDiffCommentAnchor,
			openDiffCommentModal,
			openSubmitReviewModal,
			togglePullRequestDraftStatus: toggleSelectedPullRequestDraftStatus,
			openLabelModal,
			openMergeModal,
			openCloseModal,
			openIssueCommentModal,
			reopenIssue: openReopenIssueModal,
			openPullRequestInBrowser: () => {
				if (selectedPullRequest) openSelectedPullRequestInBrowser(selectedPullRequest)
			},
			openIssueInBrowser: openSelectedIssueInBrowser,
			openAuxiliaryItemInBrowser: openSelectedAuxiliaryInBrowser,
			copyPullRequestMetadata: copySelectedPullRequestMetadata,
			copyIssueMetadata: copySelectedIssueMetadata,
			copyAuxiliaryItemMetadata: copySelectedAuxiliaryMetadata,
			manageAuxiliaryItem: manageSelectedAuxiliary,
			quit: () => renderer.destroy(),
		},
	})
	const runCommand = (command: AppCommand, options: { readonly notifyDisabled?: boolean; readonly closePalette?: boolean } = {}) => {
		if (!commandEnabled(command)) {
			if (options.notifyDisabled && command.disabledReason) flashNotice(command.disabledReason)
			return false
		}
		if (options.closePalette) closeActiveModal()
		command.run()
		return true
	}
	const runCommandById = (id: string, options: { readonly notifyDisabled?: boolean } = {}) => {
		const command = appCommands.find((entry) => entry.id === id)
		return command ? runCommand(command, options) : false
	}
	const runCommandByIdRef = useRef(runCommandById)
	runCommandByIdRef.current = runCommandById
	const dynamicPaletteCommands: readonly AppCommand[] = (() => {
		if (!commandPaletteActive) return []
		const repository = parseRepositoryInput(commandPalette.query)
		if (!repository || repository === selectedRepository) return []
		return [defineCommand({
			id: `view.repository.dynamic:${repository}`,
			title: `Open ${repository}`,
			scope: "View",
			subtitle: "Switch to this repository",
			run: () => switchViewTo({ _tag: "Repository", repository }),
		})]
	})()
	// Dynamic commands always pin to the top of the palette; they came directly from the
	// user's typed input so they shouldn't be filtered by fuzzy score against themselves.
	const commandPaletteCommands = commandPaletteActive
		? [
			...dynamicPaletteCommands,
			...sortCommandsByScope(filterCommands(appCommands.filter((command) => command.id !== "command.open" && commandEnabled(command)), commandPalette.query)),
		]
		: []
	const selectedCommandIndex = clampCommandIndex(commandPalette.selectedIndex, commandPaletteCommands)
	const selectedCommand = commandPaletteCommands[selectedCommandIndex] ?? null

	const moveMergeSelection = (delta: -1 | 1) => setMergeModal((current) => {
		const max = Math.max(0, availableMergeActions(mergeModal.info).length - 1)
		return { ...current, selectedIndex: Math.max(0, Math.min(max, current.selectedIndex + delta)) }
	})

	const scrollCommentThread = (delta: number) => setCommentThreadModal((current) => ({
		...current,
		scrollOffset: Math.max(0, current.scrollOffset + delta),
	}))

	const moveLabelSelection = (delta: -1 | 1) => setLabelModal((current) => {
		const max = Math.max(0, filterLabels(labelModal.availableLabels, labelModal.query).length - 1)
		return { ...current, selectedIndex: Math.max(0, Math.min(max, current.selectedIndex + delta)) }
	})

	const moveChangedFileSelection = (delta: -1 | 1) => setChangedFilesModal((current) => {
		const max = Math.max(0, changedFileResults.length - 1)
		const selectedIndex = Math.max(0, Math.min(max, current.selectedIndex + delta))
		return selectedIndex === current.selectedIndex ? current : { ...current, selectedIndex }
	})

	const moveSubmitReviewActionSelection = (delta: -1 | 1) => setSubmitReviewModal((current) => {
		const max = Math.max(0, submitReviewOptions.length - 1)
		return { ...current, selectedIndex: Math.max(0, Math.min(max, current.selectedIndex + delta)), error: null }
	})

	const moveCommandPaletteSelection = (delta: -1 | 1) => setCommandPalette((current) => {
		const selectedIndex = clampCommandIndex(current.selectedIndex + delta, commandPaletteCommands)
		return selectedIndex === current.selectedIndex ? current : { ...current, selectedIndex }
	})
	const runCommandPaletteCommand = (command: AppCommand) => {
		runCommand(command, { notifyDisabled: true, closePalette: true })
	}

	const scrollDetailFullViewBy = (delta: number) => {
		detailScrollRef.current?.scrollBy({ x: 0, y: delta })
		setDetailScrollOffset((current) => Math.max(0, current + delta))
	}
	const scrollDetailFullViewTo = (y: number) => {
		detailScrollRef.current?.scrollTo({ x: 0, y })
		setDetailScrollOffset(y)
	}
	const activeRefreshCommand = () => activeSurfaceRef.current === "issues" ? "issue.refresh" : activeSurfaceRef.current === "pullRequests" ? "pull.refresh" : "aux.refresh"
	const activeCloseCommand = () => activeSurfaceRef.current === "issues" ? "issue.close" : activeSurfaceRef.current === "pullRequests" ? "pull.close" : "aux.manage"
	const activeOpenBrowserCommand = () => activeSurfaceRef.current === "issues" ? "issue.open-browser" : activeSurfaceRef.current === "pullRequests" ? "pull.open-browser" : "aux.open-browser"
	const activeCopyCommand = () => activeSurfaceRef.current === "issues" ? "issue.copy-metadata" : activeSurfaceRef.current === "pullRequests" ? "pull.copy-metadata" : "aux.copy-metadata"
	const translateListCommand = (id: string) => {
		if (id === "pull.refresh") return activeRefreshCommand()
		if (id === "pull.close") return activeCloseCommand()
		if (id === "pull.open-browser") return activeOpenBrowserCommand()
		if (id === "pull.copy-metadata") return activeCopyCommand()
		if (id === "pull.labels" && activeSurfaceRef.current === "issues") return "issue.labels"
		if (id === "diff.open" && activeSurfaceRef.current !== "pullRequests") return "detail.open"
		return id
	}
	const activeSelectedItem = activeSurface === "issues" ? selectedIssue : activeSurface === "pullRequests" ? selectedPullRequest : selectedAuxiliaryItem

	const moveSelectedToPreviousGroup = () => setSelectedIndex((current) => {
		if (activeVisibleCount === 0 || activeGroupStarts.length === 0) return 0
		const currentGroup = getCurrentGroupIndex(current, activeGroupStarts)
		if (currentGroup <= 0) return activeGroupStarts[activeGroupStarts.length - 1]!
		return activeGroupStarts[currentGroup - 1]!
	})
	const moveSelectedToNextGroup = () => setSelectedIndex((current) => {
		if (activeVisibleCount === 0 || activeGroupStarts.length === 0) return 0
		const currentGroup = getCurrentGroupIndex(current, activeGroupStarts)
		if (currentGroup >= activeGroupStarts.length - 1) return activeGroupStarts[0]!
		return activeGroupStarts[currentGroup + 1]!
	})
	const stepSelected = (delta: number) => setSelectedIndex((current) => {
		if (activeVisibleCount === 0) return 0
		return Math.max(0, Math.min(activeVisibleCount - 1, current + delta))
	})
	const stepSelectedUp = (count = 1) => stepSelected(-count)
	const stepSelectedDown = (count = 1) => {
		if (activeVisibleCount === 0) return
		if (selectedIndex + count >= activeVisibleCount) {
			if (activeSurface === "issues" && hasMoreIssues) loadMoreIssues()
			else if (activeSurface === "pullRequests" && hasMorePullRequests) loadMorePullRequests()
		}
		stepSelected(count)
	}
	const stepSelectedDownWithLoadMore = () => {
		if (activeVisibleCount > 0 && selectedIndex >= activeVisibleCount - 1 && (activeSurface === "issues" ? hasMoreIssues : activeSurface === "pullRequests" ? hasMorePullRequests : false)) {
			if (activeSurface === "issues") loadMoreIssues()
			else if (activeSurface === "pullRequests") loadMorePullRequests()
			return
		}
		setSelectedIndex((current) => {
			if (activeVisibleCount === 0) return 0
			return current >= activeVisibleCount - 1 ? 0 : current + 1
		})
	}
	const stepSelectedUpWrap = () => setSelectedIndex((current) => {
		if (activeVisibleCount === 0) return 0
		return current <= 0 ? activeVisibleCount - 1 : current - 1
	})

	const handleQuitOrClose = () => {
		if (themeModalActive) {
			closeThemeModal(false)
			return
		}
		if (activeModal._tag !== "None") {
			closeActiveModal()
			return
		}
		runCommandById("app.quit")
	}

	const moveDiffCommentToBoundary = (boundary: "first" | "last") => {
		const nextAnchor = boundary === "first" ? diffCommentAnchors[0] : diffCommentAnchors[diffCommentAnchors.length - 1]
		if (!nextAnchor) return
		setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
		setDiffFileIndex(nextAnchor.fileIndex)
	}

	const alignSelectedDiffCommentAnchor = (position: "top" | "center" | "bottom") => {
		if (!selectedDiffCommentAnchor) return
		const scroll = diffScrollRef.current
		if (!scroll) return
		const viewportHeight = Math.max(1, scroll.viewport.height)
		const offset = position === "top"
			? DIFF_STICKY_HEADER_LINES
			: position === "center"
				? Math.max(DIFF_STICKY_HEADER_LINES, Math.floor(viewportHeight / 2))
				: Math.max(DIFF_STICKY_HEADER_LINES, viewportHeight - 2)
		const maxScrollTop = Math.max(0, scroll.scrollHeight - viewportHeight)
		const nextTop = Math.max(0, Math.min(maxScrollTop, selectedDiffCommentAnchor.renderLine - offset))
		scroll.scrollTo({ x: 0, y: nextTop })
		syncDiffScrollState()
	}

	const appCtx: AppCtx = {
		closeModalActive,
		confirmActionModalActive,
		mergeModalActive,
		commentThreadModalActive,
		changedFilesModalActive,
		submitReviewModalActive,
		labelModalActive,
		themeModalActive,
		openRepositoryModalActive,
		commentModalActive,
		commandPaletteActive,
		filterMode,
		diffFullView,
		detailFullView,
		textInputActive: commentModalActive || commandPaletteActive || openRepositoryModalActive || changedFilesModalActive || submitReviewModalActive || labelModalActive || filterMode || (themeModalActive && themeModal.filterMode),
		closeModal: { closeModal: closeActiveModal, confirmClose: confirmCloseTarget },
		confirmActionModal: { closeModal: closeActiveModal, confirmClose: confirmAuxiliaryAction },
		mergeModal: {
			availableActionCount: availableMergeActions(mergeModal.info).length,
			closeModal: closeActiveModal,
			confirmMerge: confirmMergeAction,
			moveSelection: moveMergeSelection,
		},
		commentThreadModal: {
			halfPage,
			closeModal: closeActiveModal,
			openInlineComment: openDiffCommentModal,
			scrollBy: scrollCommentThread,
		},
		changedFilesModal: {
			hasResults: changedFileResults.length > 0,
			closeModal: closeActiveModal,
			selectFile: selectChangedFile,
			moveSelection: moveChangedFileSelection,
		},
		submitReviewModal: {
			summaryFocused: submitReviewModal.focus === "body",
			handleEscape: () => {
				if (submitReviewModal.focus === "body") setSubmitReviewModal((current) => ({ ...current, focus: "action" }))
				else closeActiveModal()
			},
			submit: confirmSubmitReview,
			focusSummary: () => setSubmitReviewModal((current) => ({ ...current, focus: "body", error: null })),
			insertNewline: () => editSubmitReview((state) => insertText(state, "\n")),
			moveActionSelection: moveSubmitReviewActionSelection,
			moveLeft: () => editSubmitReview(editorMoveLeft),
			moveRight: () => editSubmitReview(editorMoveRight),
			moveUp: () => editSubmitReview((state) => moveVertically(state, -1)),
			moveDown: () => editSubmitReview((state) => moveVertically(state, 1)),
			moveLineStart: () => editSubmitReview(moveLineStart),
			moveLineEnd: () => editSubmitReview(moveLineEnd),
			moveWordBackward: () => editSubmitReview(moveWordBackward),
			moveWordForward: () => editSubmitReview(moveWordForward),
			backspace: () => editSubmitReview(editorBackspace),
			deleteForward: () => editSubmitReview(editorDeleteForward),
			deleteWordBackward: () => editSubmitReview(deleteWordBackward),
			deleteWordForward: () => editSubmitReview(deleteWordForward),
			deleteToLineStart: () => editSubmitReview(deleteToLineStart),
			deleteToLineEnd: () => editSubmitReview(deleteToLineEnd),
		},
		labelModal: { closeModal: closeActiveModal, toggleSelected: toggleLabelAtIndex, moveSelection: moveLabelSelection },
		themeModal: {
			filterMode: themeModal.filterMode,
			hasFilteredResults: filterThemeDefinitions(themeModal.query).length > 0,
			closeWithoutSaving: () => closeThemeModal(false),
			clearFilter: () => updateThemeQuery("", { filterMode: false }),
			enterFilterMode: () => updateThemeQuery("", { filterMode: true }),
			confirmSelection: () => closeThemeModal(true),
			moveSelection: moveThemeSelection,
		},
		openRepositoryModal: { closeModal: closeActiveModal, openFromInput: openRepositoryFromInput },
		commentModal: {
			closeModal: closeActiveModal,
			submit: submitActiveComment,
			insertNewline: () => editComment((state) => insertText(state, "\n")),
			moveLeft: () => editComment(editorMoveLeft),
			moveRight: () => editComment(editorMoveRight),
			moveUp: () => editComment((state) => moveVertically(state, -1)),
			moveDown: () => editComment((state) => moveVertically(state, 1)),
			moveLineStart: () => editComment(moveLineStart),
			moveLineEnd: () => editComment(moveLineEnd),
			moveWordBackward: () => editComment(moveWordBackward),
			moveWordForward: () => editComment(moveWordForward),
			backspace: () => editComment(editorBackspace),
			deleteForward: () => editComment(editorDeleteForward),
			deleteWordBackward: () => editComment(deleteWordBackward),
			deleteWordForward: () => editComment(deleteWordForward),
			deleteToLineStart: () => editComment(deleteToLineStart),
			deleteToLineEnd: () => editComment(deleteToLineEnd),
		},
		commandPalette: {
			closeModal: closeActiveModal,
			runSelected: () => { if (selectedCommand) runCommandPaletteCommand(selectedCommand) },
			moveSelection: moveCommandPaletteSelection,
		},
		filterModeCtx: {
			cancel: () => { setFilterDraft(filterQuery); setFilterMode(false) },
			commit: () => { setFilterQuery(filterDraft); setFilterMode(false) },
		},
		diff: {
			halfPage,
			handleEscape: () => { if (diffCommentMode) setDiffCommentMode(false); else runCommandById("diff.close") },
			openSelectedComment: () => { if (selectedDiffCommentThread.length > 0) openDiffCommentThreadModal(); else openDiffCommentModal() },
			toggleRange: () => runCommandById("diff.toggle-range"),
			toggleView: () => runCommandById("diff.toggle-view"),
			toggleWrap: () => runCommandById("diff.toggle-wrap"),
			reload: () => runCommandById("diff.reload"),
			nextThread: () => moveDiffCommentAnchor(1),
			previousThread: () => moveDiffCommentAnchor(-1),
			moveAnchor: (delta, options) => moveDiffCommentAnchor(delta, options),
			moveAnchorToBoundary: moveDiffCommentToBoundary,
			alignAnchor: alignSelectedDiffCommentAnchor,
			selectSide: selectDiffCommentSide,
			openChangedFiles: () => runCommandById("diff.changed-files"),
			openSubmitReview: () => runCommandById("pull.submit-review"),
			nextFile: () => runCommandById("diff.next-file"),
			previousFile: () => runCommandById("diff.previous-file"),
			openInBrowser: () => runCommandById("pull.open-browser"),
		},
		detail: {
			halfPage,
			scrollBy: scrollDetailFullViewBy,
			scrollTo: scrollDetailFullViewTo,
			closeDetail: () => runCommandById("detail.close"),
			openTheme: () => runCommandById("theme.open"),
			openDiff: () => { if (activeSurfaceRef.current === "pullRequests") runCommandById("diff.open") },
			openReview: () => { if (activeSurfaceRef.current === "pullRequests") runCommandById("pull.submit-review") },
			closePullRequest: () => runCommandById(activeCloseCommand()),
			openLabels: () => runCommandById(activeSurfaceRef.current === "issues" ? "issue.labels" : "pull.labels"),
			openMerge: () => { if (activeSurfaceRef.current === "pullRequests") runCommandById("pull.merge") },
			toggleDraft: () => { if (activeSurfaceRef.current === "pullRequests") runCommandById("pull.toggle-draft") },
			refresh: () => runCommandById(activeRefreshCommand()),
			openInBrowser: () => runCommandById(activeOpenBrowserCommand()),
			copyMetadata: () => runCommandById(activeCopyCommand()),
		},
		listNav: {
			halfPage,
			visibleCount: activeVisibleCount,
			hasFilter: filterQuery.length > 0,
			canScrollDetailPreview: isWideLayout && activeSelectedItem !== null,
			runCommandById: (id) => { runCommandById(translateListCommand(id)) },
			switchQueueMode,
			scrollDetailPreviewBy,
			scrollDetailPreviewTo,
			clearFilter: () => { runCommandById("filter.clear") },
			stepSelected,
			stepSelectedUp,
			stepSelectedDown,
			stepSelectedUpWrap,
			stepSelectedDownWithLoadMore,
			moveSelectedToPreviousGroup,
			moveSelectedToNextGroup,
			setSelected: (index) => setSelectedIndex(index),
		},
		openCommandPalette: () => { runCommandById("command.open") },
		handleQuitOrClose,
	}

	useKeymap(appKeymap, appCtx, useOpenTuiSubscribe())

	useKeyboard((key) => {
		lastUserInputAtRef.current = Date.now()
		if (commandPaletteActive) {
			if (isSingleLineInputKey(key)) {
				setCommandPalette((current) => {
					const query = editSingleLineInput(current.query, key) ?? current.query
					return current.query === query && current.selectedIndex === 0 ? current : { ...current, query, selectedIndex: 0 }
				})
			}
			return
		}

		if (openRepositoryModalActive) {
			if (isSingleLineInputKey(key)) {
				setOpenRepositoryModal((current) => ({
					...current,
					query: editSingleLineInput(current.query, key) ?? current.query,
					error: null,
				}))
			}
			return
		}


		if (themeModalActive) {
			if (themeModal.filterMode && isSingleLineInputKey(key)) {
				editThemeQuery((query) => editSingleLineInput(query, key) ?? query)
			}
			return
		}

		if (commentModalActive) {
			const text = printableKeyText(key)
			if (text) editComment((state) => insertText(state, text))
			return
		}

		if (submitReviewModalActive) {
			if (submitReviewModal.focus !== "body") return
			const text = printableKeyText(key)
			if (text) editSubmitReview((state) => insertText(state, text))
			return
		}

		if (changedFilesModalActive) {
			if (isSingleLineInputKey(key)) {
				setChangedFilesModal((current) => {
					const query = editSingleLineInput(current.query, key) ?? current.query
					return query === current.query ? current : { ...current, query, selectedIndex: 0 }
				})
			}
			return
		}

		if (labelModalActive) {
			if (isSingleLineInputKey(key)) {
				setLabelModal((current) => ({
					...current,
					query: editSingleLineInput(current.query, key) ?? current.query,
					selectedIndex: 0,
				}))
			}
			return
		}

		if (filterMode) {
			if (isSingleLineInputKey(key)) {
				setFilterDraft((current) => editSingleLineInput(current, key) ?? current)
			}
		}
	})

	const fullscreenContentWidth = Math.max(24, contentWidth - 2)
	const fullscreenBodyLines = Math.max(8, terminalHeight - 8)
	const wideFullscreenDetailScrollable = getDetailsPaneHeight({
		pullRequest: selectedPullRequest,
		contentWidth: fullscreenContentWidth,
		bodyLines: DETAIL_BODY_SCROLL_LIMIT,
		paneWidth: contentWidth,
		showChecks: true,
		conversationItems: selectedConversationItems,
		conversationStatus: selectedConversationStatus,
	}) > wideBodyHeight
	const wideFullscreenIssueDetailScrollable = getIssueDetailsPaneHeight({
		issue: selectedIssue,
		contentWidth: fullscreenContentWidth,
		bodyLines: ISSUE_BODY_SCROLL_LIMIT,
		paneWidth: contentWidth,
	}) > wideBodyHeight
	const wideFullscreenAuxiliaryDetailScrollable = getAuxiliaryDetailsPaneHeight({
		item: selectedAuxiliaryItem,
		contentWidth: fullscreenContentWidth,
		bodyLines: AUXILIARY_BODY_SCROLL_LIMIT,
		paneWidth: contentWidth,
	}) > wideBodyHeight
	const narrowFullscreenDetailScrollable = getDetailsPaneHeight({
		pullRequest: selectedPullRequest,
		contentWidth: fullscreenContentWidth,
		bodyLines: DETAIL_BODY_SCROLL_LIMIT,
		paneWidth: contentWidth,
		conversationItems: selectedConversationItems,
		conversationStatus: selectedConversationStatus,
	}) > wideBodyHeight
	const narrowFullscreenIssueDetailScrollable = getIssueDetailsPaneHeight({
		issue: selectedIssue,
		contentWidth: fullscreenContentWidth,
		bodyLines: ISSUE_BODY_SCROLL_LIMIT,
		paneWidth: contentWidth,
	}) > wideBodyHeight
	const narrowFullscreenAuxiliaryDetailScrollable = getAuxiliaryDetailsPaneHeight({
		item: selectedAuxiliaryItem,
		contentWidth: fullscreenContentWidth,
		bodyLines: AUXILIARY_BODY_SCROLL_LIMIT,
		paneWidth: contentWidth,
	}) > wideBodyHeight
	const wideDetailHeaderHeight = getDetailHeaderHeight(selectedPullRequest, rightPaneWidth, true)
	const wideDetailBodyViewportHeight = Math.max(1, wideBodyHeight - wideDetailHeaderHeight)
	const wideDetailBodyHeight = getScrollableDetailBodyHeight(selectedPullRequest, rightContentWidth, selectedConversationItems, selectedConversationStatus)
	const wideDetailBodyScrollable = wideDetailBodyHeight > wideDetailBodyViewportHeight
	const wideIssueDetailHeaderHeight = getIssueDetailHeaderHeight(selectedIssue, rightPaneWidth)
	const wideIssueDetailBodyViewportHeight = Math.max(1, wideBodyHeight - wideIssueDetailHeaderHeight)
	const wideIssueDetailBodyHeight = getScrollableIssueBodyHeight(selectedIssue, rightContentWidth)
	const wideIssueDetailBodyScrollable = wideIssueDetailBodyHeight > wideIssueDetailBodyViewportHeight
	const wideAuxiliaryDetailHeaderHeight = getAuxiliaryDetailHeaderHeight(selectedAuxiliaryItem, rightPaneWidth)
	const wideAuxiliaryDetailBodyViewportHeight = Math.max(1, wideBodyHeight - wideAuxiliaryDetailHeaderHeight)
	const wideAuxiliaryDetailBodyHeight = getScrollableAuxiliaryBodyHeight(selectedAuxiliaryItem, rightContentWidth)
	const wideAuxiliaryDetailBodyScrollable = wideAuxiliaryDetailBodyHeight > wideAuxiliaryDetailBodyViewportHeight

	const prListProps = {
		groups: visibleGroups,
		selectedUrl: selectedPullRequest?.url ?? null,
		status: pullRequestStatus,
		error: pullRequestError,
		filterText: visibleFilterText,
		showFilterBar: filterMode || filterQuery.length > 0,
		isFilterEditing: filterMode,
		loadedCount: loadedPullRequestCount,
		hasMore: hasMorePullRequests,
		isLoadingMore: isLoadingMorePullRequests,
		loadingIndicator,
		onSelectPullRequest: selectPullRequestByUrl,
	} as const
	const issueListProps = {
		groups: visibleIssueGroups,
		selectedUrl: selectedIssue?.url ?? null,
		status: issueStatus,
		error: issueError,
		filterText: visibleFilterText,
		showFilterBar: filterMode || filterQuery.length > 0,
		isFilterEditing: filterMode,
		loadedCount: loadedIssueCount,
		hasMore: hasMoreIssues,
		isLoadingMore: isLoadingMoreIssues,
		onSelectIssue: selectIssueByUrl,
	} as const
	const auxiliaryListProps = {
		surface: isAuxiliarySurface(activeSurface) ? activeSurface : "notifications" as const,
		groups: visibleAuxiliaryGroups,
		selectedId: selectedAuxiliaryItem?.id ?? null,
		status: effectiveAuxiliaryStatus,
		error: auxiliaryError,
		filterText: visibleFilterText,
		showFilterBar: filterMode || filterQuery.length > 0,
		isFilterEditing: filterMode,
		onSelectItem: selectAuxiliaryById,
	} as const

	const longestLabelName = labelModal.availableLabels.reduce((max, label) => Math.max(max, label.name.length), 0)
	const labelModalWidth = Math.min(Math.max(42, longestLabelName + 16), 56, contentWidth - 4)
	const labelModalHeight = Math.min(20, terminalHeight - 4)
	const labelModalLeft = centeredOffset(contentWidth, labelModalWidth)
	const labelModalTop = centeredOffset(terminalHeight, labelModalHeight)
	const longestDiffFileName = changedFilesModalActive ? readyDiffFiles.reduce((max, file) => Math.max(max, file.name.length), 0) : 0
	const changedFilesModalWidth = changedFilesModalActive ? Math.min(Math.max(46, longestDiffFileName + 16), 88, contentWidth - 4) : 46
	const changedFilesModalHeight = Math.min(22, terminalHeight - 4)
	const changedFilesModalLeft = centeredOffset(contentWidth, changedFilesModalWidth)
	const changedFilesModalTop = centeredOffset(terminalHeight, changedFilesModalHeight)
	const sizedModal = (minW: number, maxW: number, padX: number, maxH: number) => {
		const w = Math.min(maxW, Math.max(minW, contentWidth - padX))
		const h = Math.min(maxH, terminalHeight - 4)
		return { width: w, height: h, left: centeredOffset(contentWidth, w), top: centeredOffset(terminalHeight, h) }
	}
	const closeLayout = sizedModal(46, 68, 12, 12)
	const closeModalWidth = closeLayout.width
	const closeModalHeight = closeLayout.height
	const closeModalLeft = closeLayout.left
	const closeModalTop = closeLayout.top
	const confirmActionLayout = sizedModal(46, 72, 12, 12)
	const confirmActionModalWidth = confirmActionLayout.width
	const confirmActionModalHeight = confirmActionLayout.height
	const confirmActionModalLeft = confirmActionLayout.left
	const confirmActionModalTop = confirmActionLayout.top
	const commentLayout = sizedModal(46, 76, 8, 16)
	const commentModalWidth = commentLayout.width
	const commentModalHeight = commentLayout.height
	const commentModalLeft = commentLayout.left
	const commentModalTop = commentLayout.top
	const commentThreadLayout = sizedModal(50, 86, 8, 22)
	const commentThreadModalWidth = commentThreadLayout.width
	const commentThreadModalHeight = commentThreadLayout.height
	const commentThreadModalLeft = commentThreadLayout.left
	const commentThreadModalTop = commentThreadLayout.top
	const submitReviewLayout = sizedModal(54, 88, 8, 18)
	const submitReviewModalWidth = submitReviewLayout.width
	const submitReviewModalHeight = submitReviewLayout.height
	const submitReviewModalLeft = submitReviewLayout.left
	const submitReviewModalTop = submitReviewLayout.top
	const commentAnchorLabel = selectedDiffCommentAnchor && selectedDiffCommentLabel
		? `${selectedDiffCommentAnchor.path} ${selectedDiffCommentLabel}`
		: "No diff line selected"
	const activeCommentAnchorLabel = activeSurface === "issues" && selectedIssue
		? `${selectedIssue.repository} #${selectedIssue.number}`
		: commentAnchorLabel
	const mergeLayout = sizedModal(46, 68, 12, 16)
	const mergeModalWidth = mergeLayout.width
	const mergeModalHeight = mergeLayout.height
	const mergeModalLeft = mergeLayout.left
	const mergeModalTop = mergeLayout.top
	const themeLayout = sizedModal(38, 58, 12, 16)
	const themeModalWidth = themeLayout.width
	const themeModalHeight = themeLayout.height
	const themeModalLeft = themeLayout.left
	const themeModalTop = themeLayout.top
	const openRepositoryLayout = sizedModal(46, 76, 8, 8)
	const openRepositoryModalWidth = openRepositoryLayout.width
	const openRepositoryModalHeight = openRepositoryLayout.height
	const openRepositoryModalLeft = openRepositoryLayout.left
	const openRepositoryModalTop = openRepositoryLayout.top
	const commandPaletteLayout = sizedModal(50, 88, 8, 24)
	const commandPaletteWidth = commandPaletteLayout.width
	const commandPaletteHeight = commandPaletteLayout.height
	const commandPaletteLeft = commandPaletteLayout.left
	const commandPaletteTop = commandPaletteLayout.top

	return (
		<box width={terminalWidth} height={terminalHeight} flexDirection="column" backgroundColor={colors.background}>
			<box paddingLeft={1} paddingRight={1} flexDirection="column" backgroundColor={colors.background}>
				<PlainLine text={headerLine} fg={colors.muted} bold />
			</box>
			{isWideLayout && !detailFullView && !diffFullView && !isInitialLoading ? (
				<Divider width={contentWidth} junctionAt={dividerJunctionAt} junctionChar="┬" />
			) : (
				<Divider width={contentWidth} />
			)}
			{isInitialLoading ? (
				<LoadingPane content={detailPlaceholderContent} width={contentWidth} height={wideBodyHeight} />
			) : diffFullView ? (
				<PullRequestDiffPane
					pullRequest={selectedPullRequest}
					diffState={displayedDiffState}
					stackedFiles={stackedDiffFiles}
					scrollTop={diffScrollTop}
					view={effectiveDiffRenderView}
					whitespaceMode={diffWhitespaceMode}
					wrapMode={diffWrapMode}
					paneWidth={contentWidth}
					height={wideBodyHeight}
					loadingIndicator={loadingIndicator}
					scrollRef={diffScrollRef}
					setDiffRef={setDiffRenderableRef}
					selectedCommentAnchor={selectedDiffCommentAnchor}
					selectedCommentLabel={selectedDiffCommentLabel}
					selectedCommentThread={selectedDiffCommentThread}
					onSelectCommentLine={selectDiffCommentLine}
					themeId={themeId}
				/>
			) : detailFullView && activeSurface === "issues" && isSelectedIssueDetailLoading && selectedIssue ? (
				<box flexGrow={1} flexDirection="column">
					<IssueDetailHeader issue={selectedIssue} viewerUsername={username} contentWidth={fullscreenContentWidth} paneWidth={contentWidth} />
					<LoadingPane content={issueDetailLoadingContent} width={contentWidth} height={Math.max(1, wideBodyHeight - getIssueDetailHeaderHeight(selectedIssue, contentWidth))} />
				</box>
			) : detailFullView && activeSurface === "pullRequests" && isSelectedPullRequestDetailLoading && selectedPullRequest ? (
				<box flexGrow={1} flexDirection="column">
					<DetailHeader pullRequest={selectedPullRequest} viewerUsername={username} contentWidth={fullscreenContentWidth} paneWidth={contentWidth} showChecks={isWideLayout} />
					<LoadingPane content={detailLoadingContent} width={contentWidth} height={Math.max(1, wideBodyHeight - getDetailHeaderHeight(selectedPullRequest, contentWidth, isWideLayout))} />
				</box>
			) : isWideLayout && detailFullView && activeSurface === "issues" ? (
				<box flexGrow={1} flexDirection="column">
					<scrollbox ref={detailScrollRef} focused flexGrow={1} verticalScrollbarOptions={{ visible: wideFullscreenIssueDetailScrollable }}>
						<IssueDetailsPane
							issue={selectedIssue}
							viewerUsername={username}
							contentWidth={fullscreenContentWidth}
							bodyLines={fullscreenBodyLines}
							bodyLineLimit={ISSUE_BODY_SCROLL_LIMIT}
							paneWidth={contentWidth}
							placeholderContent={detailPlaceholderContent}
							loadingIndicator={loadingIndicator}
							themeId={themeId}
						/>
					</scrollbox>
				</box>
			) : isWideLayout && detailFullView && isAuxiliarySurface(activeSurface) ? (
				<box flexGrow={1} flexDirection="column">
					<scrollbox ref={detailScrollRef} focused flexGrow={1} verticalScrollbarOptions={{ visible: wideFullscreenAuxiliaryDetailScrollable }}>
						<AuxiliaryDetailsPane
							item={selectedAuxiliaryItem}
							contentWidth={fullscreenContentWidth}
							bodyLines={fullscreenBodyLines}
							bodyLineLimit={AUXILIARY_BODY_SCROLL_LIMIT}
							paneWidth={contentWidth}
							placeholderContent={detailPlaceholderContent}
							themeId={themeId}
						/>
					</scrollbox>
				</box>
			) : isWideLayout && detailFullView ? (
				<box flexGrow={1} flexDirection="column">
					<scrollbox ref={detailScrollRef} focused flexGrow={1} verticalScrollbarOptions={{ visible: wideFullscreenDetailScrollable }}>
						<DetailsPane
							pullRequest={selectedPullRequest}
							viewerUsername={username}
							contentWidth={fullscreenContentWidth}
							bodyLines={fullscreenBodyLines}
							bodyLineLimit={DETAIL_BODY_SCROLL_LIMIT}
							paneWidth={contentWidth}
							showChecks
							placeholderContent={detailPlaceholderContent}
							loadingIndicator={loadingIndicator}
							themeId={themeId}
							conversationItems={selectedConversationItems}
							conversationStatus={selectedConversationStatus}
						/>
					</scrollbox>
				</box>
			) : isWideLayout ? (
				<box key="wide-main" flexGrow={1} flexDirection="row">
					<box width={leftPaneWidth} height={wideBodyHeight} flexDirection="column">
						<scrollbox ref={prListScrollRef} focusable={false} height={wideBodyHeight} flexGrow={0}>
							<box paddingLeft={sectionPadding} paddingRight={0}>
								{activeSurface === "issues" ? (
									<IssueList key={`wide-issues-${leftContentWidth}`} {...issueListProps} contentWidth={leftContentWidth} />
								) : isAuxiliarySurface(activeSurface) ? (
									<AuxiliaryList key={`wide-aux-${activeSurface}-${leftContentWidth}`} {...auxiliaryListProps} contentWidth={leftContentWidth} />
								) : (
									<PullRequestList key={`wide-pulls-${leftContentWidth}`} {...prListProps} contentWidth={leftContentWidth} />
								)}
							</box>
						</scrollbox>
					</box>
					<SeparatorColumn height={wideBodyHeight} junctionRows={activeSurface === "issues" ? issueDetailJunctions : isAuxiliarySurface(activeSurface) ? auxiliaryDetailJunctions : detailJunctions} />
					<box width={rightPaneWidth} height={wideBodyHeight} flexDirection="column">
						{activeSurface === "issues" && isSelectedIssueDetailLoading && selectedIssue ? (
							<>
								<IssueDetailHeader issue={selectedIssue} viewerUsername={username} contentWidth={rightContentWidth} paneWidth={rightPaneWidth} />
								<LoadingPane content={issueDetailLoadingContent} width={rightPaneWidth} height={Math.max(1, wideBodyHeight - getIssueDetailHeaderHeight(selectedIssue, rightPaneWidth))} />
							</>
						) : activeSurface === "issues" && selectedIssue ? (
							<>
								<IssueDetailHeader key={`issue-header-${selectedIssue.url}`} issue={selectedIssue} viewerUsername={username} contentWidth={rightContentWidth} paneWidth={rightPaneWidth} />
								<scrollbox key={`issue-body-${selectedIssue.url}`} ref={detailPreviewScrollRef} flexGrow={1} verticalScrollbarOptions={{ visible: wideIssueDetailBodyScrollable }}>
									<IssueDetailBody issue={selectedIssue} contentWidth={rightContentWidth} bodyLines={wideDetailLines} bodyLineLimit={ISSUE_BODY_SCROLL_LIMIT} loadingIndicator={loadingIndicator} themeId={themeId} />
								</scrollbox>
							</>
						) : activeSurface === "issues" ? (
							<DetailPlaceholder content={detailPlaceholderContent} paneWidth={rightPaneWidth} />
						) : isAuxiliarySurface(activeSurface) && selectedAuxiliaryItem ? (
							<>
								<AuxiliaryDetailHeader key={`aux-header-${selectedAuxiliaryItem.id}`} item={selectedAuxiliaryItem} contentWidth={rightContentWidth} paneWidth={rightPaneWidth} />
								<scrollbox key={`aux-body-${selectedAuxiliaryItem.id}`} ref={detailPreviewScrollRef} flexGrow={1} verticalScrollbarOptions={{ visible: wideAuxiliaryDetailBodyScrollable }}>
									<AuxiliaryDetailBody item={selectedAuxiliaryItem} contentWidth={rightContentWidth} bodyLines={wideDetailLines} bodyLineLimit={AUXILIARY_BODY_SCROLL_LIMIT} themeId={themeId} />
								</scrollbox>
							</>
						) : isAuxiliarySurface(activeSurface) ? (
							<DetailPlaceholder content={detailPlaceholderContent} paneWidth={rightPaneWidth} />
						) : isSelectedPullRequestDetailLoading && selectedPullRequest ? (
							<>
								<DetailHeader pullRequest={selectedPullRequest} viewerUsername={username} contentWidth={rightContentWidth} paneWidth={rightPaneWidth} showChecks />
								<LoadingPane content={detailLoadingContent} width={rightPaneWidth} height={Math.max(1, wideBodyHeight - getDetailHeaderHeight(selectedPullRequest, rightPaneWidth, true))} />
							</>
						) : selectedPullRequest ? (
							<>
								<DetailHeader key={`pull-header-${selectedPullRequest.url}`} pullRequest={selectedPullRequest} viewerUsername={username} contentWidth={rightContentWidth} paneWidth={rightPaneWidth} showChecks />
								<scrollbox key={`pull-body-${selectedPullRequest.url}`} ref={detailPreviewScrollRef} flexGrow={1} verticalScrollbarOptions={{ visible: wideDetailBodyScrollable }}>
									<DetailBody pullRequest={selectedPullRequest} contentWidth={rightContentWidth} bodyLines={wideDetailLines} bodyLineLimit={DETAIL_BODY_SCROLL_LIMIT} loadingIndicator={loadingIndicator} themeId={themeId} conversationItems={selectedConversationItems} conversationStatus={selectedConversationStatus} />
								</scrollbox>
							</>
						) : (
							<DetailPlaceholder content={detailPlaceholderContent} paneWidth={rightPaneWidth} />
						)}
					</box>
				</box>
			) : detailFullView && activeSurface === "issues" ? (
				<box flexGrow={1} flexDirection="column">
					<scrollbox ref={detailScrollRef} focused flexGrow={1} verticalScrollbarOptions={{ visible: narrowFullscreenIssueDetailScrollable }}>
						<IssueDetailsPane
							issue={selectedIssue}
							viewerUsername={username}
							contentWidth={fullscreenContentWidth}
							bodyLines={fullscreenBodyLines}
							bodyLineLimit={ISSUE_BODY_SCROLL_LIMIT}
							paneWidth={contentWidth}
							placeholderContent={detailPlaceholderContent}
							loadingIndicator={loadingIndicator}
							themeId={themeId}
						/>
					</scrollbox>
				</box>
			) : detailFullView && isAuxiliarySurface(activeSurface) ? (
				<box flexGrow={1} flexDirection="column">
					<scrollbox ref={detailScrollRef} focused flexGrow={1} verticalScrollbarOptions={{ visible: narrowFullscreenAuxiliaryDetailScrollable }}>
						<AuxiliaryDetailsPane
							item={selectedAuxiliaryItem}
							contentWidth={fullscreenContentWidth}
							bodyLines={fullscreenBodyLines}
							bodyLineLimit={AUXILIARY_BODY_SCROLL_LIMIT}
							paneWidth={contentWidth}
							placeholderContent={detailPlaceholderContent}
							themeId={themeId}
						/>
					</scrollbox>
				</box>
			) : detailFullView ? (
				<box flexGrow={1} flexDirection="column">
					<scrollbox ref={detailScrollRef} focused flexGrow={1} verticalScrollbarOptions={{ visible: narrowFullscreenDetailScrollable }}>
						<DetailsPane
							pullRequest={selectedPullRequest}
							viewerUsername={username}
							contentWidth={fullscreenContentWidth}
							bodyLines={fullscreenBodyLines}
							bodyLineLimit={DETAIL_BODY_SCROLL_LIMIT}
							paneWidth={contentWidth}
							placeholderContent={detailPlaceholderContent}
							loadingIndicator={loadingIndicator}
							themeId={themeId}
							conversationItems={selectedConversationItems}
							conversationStatus={selectedConversationStatus}
						/>
					</scrollbox>
				</box>
			) : (
				<box key="narrow-main" height={wideBodyHeight} flexDirection="column">
					{activeSurface === "issues" ? (
						<IssueDetailsPane issue={selectedIssue} viewerUsername={username} contentWidth={fullscreenContentWidth} paneWidth={contentWidth} placeholderContent={detailPlaceholderContent} loadingIndicator={loadingIndicator} themeId={themeId} />
					) : isAuxiliarySurface(activeSurface) ? (
						<AuxiliaryDetailsPane item={selectedAuxiliaryItem} contentWidth={fullscreenContentWidth} paneWidth={contentWidth} placeholderContent={detailPlaceholderContent} themeId={themeId} />
					) : (
						<DetailsPane pullRequest={selectedPullRequest} viewerUsername={username} contentWidth={fullscreenContentWidth} paneWidth={contentWidth} placeholderContent={detailPlaceholderContent} loadingIndicator={loadingIndicator} themeId={themeId} conversationItems={selectedConversationItems} conversationStatus={selectedConversationStatus} />
					)}
					<Divider width={contentWidth} />
					<box flexGrow={1} flexDirection="column">
						<scrollbox ref={prListScrollRef} focusable={false} flexGrow={1}>
							<box paddingLeft={sectionPadding} paddingRight={sectionPadding}>
								{activeSurface === "issues" ? (
									<IssueList key={`narrow-issues-${fullscreenContentWidth}`} {...issueListProps} contentWidth={fullscreenContentWidth} />
								) : isAuxiliarySurface(activeSurface) ? (
									<AuxiliaryList key={`narrow-aux-${activeSurface}-${fullscreenContentWidth}`} {...auxiliaryListProps} contentWidth={fullscreenContentWidth} />
								) : (
									<PullRequestList key={`narrow-pulls-${fullscreenContentWidth}`} {...prListProps} contentWidth={fullscreenContentWidth} />
								)}
							</box>
						</scrollbox>
					</box>
				</box>
			)}

			{isWideLayout && !detailFullView && !diffFullView && !isInitialLoading ? (
				<Divider width={contentWidth} junctionAt={dividerJunctionAt} junctionChar="┴" />
			) : (
				<Divider width={contentWidth} />
			)}
			<box width={contentWidth} height={1} paddingLeft={1} paddingRight={1} backgroundColor={colors.background}>
				{footerNotice ? (
					<PlainLine text={footerNotice} fg={colors.count} />
				) : (
					<FooterHints
						width={headerFooterWidth}
						surface={activeSurface}
						filterEditing={filterMode}
						showFilterClear={filterMode || filterQuery.length > 0}
						detailFullView={detailFullView}
						diffFullView={diffFullView}
						diffCommentMode={diffCommentMode}
						hasSelection={activeSurface === "issues" ? selectedIssue !== null : activeSurface === "pullRequests" ? selectedPullRequest !== null : selectedAuxiliaryItem !== null}
						canCloseSelection={activeSurface === "issues" ? selectedIssue?.state === "open" : activeSurface === "pullRequests" ? selectedPullRequest?.state === "open" : false}
						canReopenSelection={activeSurface === "issues" && selectedIssue?.state === "closed"}
						canCommentSelection={activeSurface === "issues" && selectedIssue?.state === "open"}
						canManageSelection={Boolean(selectedAuxiliaryItem?.action)}
						manageLabel={auxiliaryActionSpec(selectedAuxiliaryItem)?.footerLabel ?? null}
						hasError={activeStatus === "error"}
						isLoading={activeStatus === "loading" || (activeSurface === "issues" ? isRefreshingIssues || isHydratingIssueDetails : activeSurface === "pullRequests" ? isRefreshingPullRequests || isHydratingPullRequestDetails : isRefreshingAuxiliary) || closeModal.running || confirmActionModal.running || mergeModal.running || submitReviewModal.running}
						loadingIndicator={loadingIndicator}
						retryProgress={retryProgress}
					/>
				)}
			</box>
			{labelModalActive ? (
				<LabelModal
					state={labelModal}
					currentLabels={activeSurface === "issues" ? selectedIssue?.labels ?? [] : activeSurface === "pullRequests" ? selectedPullRequest?.labels ?? [] : []}
					modalWidth={labelModalWidth}
					modalHeight={labelModalHeight}
					offsetLeft={labelModalLeft}
					offsetTop={labelModalTop}
					loadingIndicator={loadingIndicator}
				/>
			) : null}
			{closeModalActive ? (
				<CloseModal
					state={closeModal}
					modalWidth={closeModalWidth}
					modalHeight={closeModalHeight}
					offsetLeft={closeModalLeft}
					offsetTop={closeModalTop}
					loadingIndicator={loadingIndicator}
				/>
			) : null}
			{confirmActionModalActive ? (
				<ConfirmActionModal
					state={confirmActionModal}
					modalWidth={confirmActionModalWidth}
					modalHeight={confirmActionModalHeight}
					offsetLeft={confirmActionModalLeft}
					offsetTop={confirmActionModalTop}
					loadingIndicator={loadingIndicator}
				/>
			) : null}
			{commentModalActive ? (
				<CommentModal
					state={commentModal}
					anchorLabel={activeCommentAnchorLabel}
					modalWidth={commentModalWidth}
					modalHeight={commentModalHeight}
					offsetLeft={commentModalLeft}
					offsetTop={commentModalTop}
				/>
			) : null}
			{commentThreadModalActive ? (
				<CommentThreadModal
					state={commentThreadModal}
					anchorLabel={commentAnchorLabel}
					comments={selectedDiffCommentThread}
					modalWidth={commentThreadModalWidth}
					modalHeight={commentThreadModalHeight}
					offsetLeft={commentThreadModalLeft}
					offsetTop={commentThreadModalTop}
				/>
			) : null}
			{changedFilesModalActive ? (
				<ChangedFilesModal
					state={changedFilesModal}
					results={changedFileResults}
					totalCount={readyDiffFiles.length}
					modalWidth={changedFilesModalWidth}
					modalHeight={changedFilesModalHeight}
					offsetLeft={changedFilesModalLeft}
					offsetTop={changedFilesModalTop}
				/>
			) : null}
			{submitReviewModalActive ? (
				<SubmitReviewModal
					state={submitReviewModal}
					modalWidth={submitReviewModalWidth}
					modalHeight={submitReviewModalHeight}
					offsetLeft={submitReviewModalLeft}
					offsetTop={submitReviewModalTop}
				/>
			) : null}
			{mergeModalActive ? (
				<MergeModal
					state={mergeModal}
					modalWidth={mergeModalWidth}
					modalHeight={mergeModalHeight}
					offsetLeft={mergeModalLeft}
					offsetTop={mergeModalTop}
					loadingIndicator={loadingIndicator}
				/>
			) : null}
			{themeModalActive ? (
				<ThemeModal
					state={themeModal}
					activeThemeId={themeId}
					modalWidth={themeModalWidth}
					modalHeight={themeModalHeight}
					offsetLeft={themeModalLeft}
					offsetTop={themeModalTop}
				/>
			) : null}
			{openRepositoryModalActive ? (
				<OpenRepositoryModal
					state={openRepositoryModal}
					modalWidth={openRepositoryModalWidth}
					modalHeight={openRepositoryModalHeight}
					offsetLeft={openRepositoryModalLeft}
					offsetTop={openRepositoryModalTop}
				/>
			) : null}
			{commandPaletteActive ? (
				<CommandPalette
					commands={commandPaletteCommands}
					query={commandPalette.query}
					selectedIndex={selectedCommandIndex}
					modalWidth={commandPaletteWidth}
					modalHeight={commandPaletteHeight}
					offsetLeft={commandPaletteLeft}
					offsetTop={commandPaletteTop}
					onSelectCommandIndex={(index) => setCommandPalette((current) => ({ ...current, selectedIndex: index }))}
					onRunCommand={(command) => runCommandByIdRef.current(command.id)}
				/>
			) : null}
		</box>
	)
}
