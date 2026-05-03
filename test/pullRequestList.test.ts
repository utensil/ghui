import { describe, expect, test } from "bun:test"
import type { PullRequestItem } from "../src/domain.ts"
import { buildPullRequestListRows } from "../src/ui/PullRequestList.tsx"

const pullRequest = (overrides: Partial<PullRequestItem> = {}): PullRequestItem => ({
	repository: "owner/repo",
	author: "author",
	headRefOid: "abc123",
	number: 1,
	title: "Update pagination",
	body: "",
	labels: [],
	additions: 0,
	deletions: 0,
	changedFiles: 0,
	state: "open",
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: false,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/1",
	...overrides,
})

describe("buildPullRequestListRows", () => {
	test("renders owner headers above repository groups", () => {
		const rows = buildPullRequestListRows({
			groups: [
				["owner/repo-a", [pullRequest({ repository: "owner/repo-a", number: 1, url: "https://github.com/owner/repo-a/pull/1" })]],
				["owner/repo-b", [pullRequest({ repository: "owner/repo-b", number: 2, url: "https://github.com/owner/repo-b/pull/2" })]],
				["other/repo-c", [pullRequest({ repository: "other/repo-c", number: 3, url: "https://github.com/other/repo-c/pull/3" })]],
			],
			status: "ready",
			error: null,
			filterText: "",
			showFilterBar: false,
			loadedCount: 3,
			hasMore: false,
			isLoadingMore: false,
		})

		expect(rows.map((row) => row._tag)).toEqual(["title", "owner", "group", "pull-request", "group", "pull-request", "owner", "group", "pull-request"])
		expect(rows.filter((row) => row._tag === "owner").map((row) => row.owner)).toEqual(["owner", "other"])
	})

	test("shows a loaded-count footer when more pull requests are available", () => {
		const rows = buildPullRequestListRows({
			groups: [["owner/repo", [pullRequest()]]],
			status: "ready",
			error: null,
			filterText: "",
			showFilterBar: false,
			loadedCount: 50,
			hasMore: true,
			isLoadingMore: false,
		})

		expect(rows.at(-1)).toEqual({ _tag: "load-more", text: "- 50 loaded, more available" })
	})

	test("shows an in-progress footer while loading the next page", () => {
		const rows = buildPullRequestListRows({
			groups: [["owner/repo", [pullRequest()]]],
			status: "ready",
			error: null,
			filterText: "",
			showFilterBar: false,
			loadedCount: 50,
			hasMore: true,
			isLoadingMore: true,
			loadingIndicator: "⠋",
		})

		expect(rows.at(-1)).toEqual({ _tag: "load-more", text: "⠋ Loading more pull requests... (50 loaded)" })
	})
})
