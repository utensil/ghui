import { describe, expect, test } from "bun:test"
import type { PullRequestConversationItem, PullRequestItem } from "../src/domain.ts"
import { getDetailJunctionRows, getScrollableDetailBodyHeight, truncateConversationPath } from "../src/ui/DetailsPane.tsx"

const pullRequest = (body: string): PullRequestItem => ({
	repository: "owner/repo",
	author: "kitlangton",
	headRefOid: "abc123",
	number: 1,
	title: "Title",
	body,
	labels: [],
	additions: 1,
	deletions: 1,
	changedFiles: 1,
	state: "open",
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/1",
})

describe("truncateConversationPath", () => {
	test("preserves package and repository segments plus the filename", () => {
		expect(truncateConversationPath("packages/opencode/src/project/bootstrap-service.ts", 45)).toBe("packages/opencode/…/bootstrap-service.ts")
	})

	test("keeps useful trailing directories when they fit", () => {
		expect(truncateConversationPath("packages/opencode/src/project/bootstrap-service.ts", 48)).toBe("packages/opencode/…/project/bootstrap-service.ts")
	})

	test("keeps narrow paths inside the target width", () => {
		const truncated = truncateConversationPath("very-long-top-level-directory/src/file.ts", 12)
		expect(truncated).toHaveLength(12)
		expect(truncated).toBe("…src/file.ts")
	})
})

const conversation: readonly PullRequestConversationItem[] = [
	{
		_tag: "comment",
		id: "comment-1",
		author: "kitlangton",
		body: "hello",
		createdAt: new Date("2026-01-01T01:00:00Z"),
		url: null,
	},
]

describe("detail pane junction rows", () => {
	test("keeps the conversation connector aligned with the scrolled body divider", () => {
		const pr = pullRequest("Line A\nLine B\nLine C")
		const headerDividerRow = 3
		const conversationDividerAtTop = 7
		const conversationDividerAfterScroll = 5

		expect(
			getDetailJunctionRows({
				pullRequest: pr,
				paneWidth: 60,
				contentWidth: 58,
				conversationItems: conversation,
				conversationStatus: "ready",
				bodyScrollTop: 0,
				bodyViewportHeight: 10,
			}),
		).toEqual([headerDividerRow, conversationDividerAtTop])
		expect(
			getDetailJunctionRows({
				pullRequest: pr,
				paneWidth: 60,
				contentWidth: 58,
				conversationItems: conversation,
				conversationStatus: "ready",
				bodyScrollTop: 2,
				bodyViewportHeight: 10,
			}),
		).toEqual([headerDividerRow, conversationDividerAfterScroll])
	})

	test("hides the conversation connector when the divider is outside the body viewport", () => {
		const pr = pullRequest("Line A\nLine B\nLine C")
		const headerDividerRow = 3

		expect(
			getDetailJunctionRows({
				pullRequest: pr,
				paneWidth: 60,
				contentWidth: 58,
				conversationItems: conversation,
				conversationStatus: "ready",
				bodyScrollTop: 4,
				bodyViewportHeight: 10,
			}),
		).toEqual([headerDividerRow])
		expect(
			getDetailJunctionRows({
				pullRequest: pr,
				paneWidth: 60,
				contentWidth: 58,
				conversationItems: conversation,
				conversationStatus: "ready",
				bodyScrollTop: 0,
				bodyViewportHeight: 2,
			}),
		).toEqual([headerDividerRow])
	})

	test("does not reserve conversation space while loading or empty", () => {
		const pr = pullRequest("Line A\nLine B")
		const baseJunctionRows = getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, contentWidth: 58 })
		const baseBodyHeight = getScrollableDetailBodyHeight(pr, 58)

		expect(getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, contentWidth: 58, conversationItems: [], conversationStatus: "loading" })).toEqual(baseJunctionRows)
		expect(getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, contentWidth: 58, conversationItems: [], conversationStatus: "ready" })).toEqual(baseJunctionRows)
		expect(getScrollableDetailBodyHeight(pr, 58, [], "loading")).toBe(baseBodyHeight)
		expect(getScrollableDetailBodyHeight(pr, 58, [], "ready")).toBe(baseBodyHeight)
	})
})
