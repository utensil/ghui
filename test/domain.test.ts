import { describe, expect, test } from "bun:test"
import { issueQueueSearchQualifier, pullRequestQueueSearchQualifier } from "../src/domain.js"
import { viewCacheKey } from "../src/pullRequestViews.js"

describe("pullRequestQueueSearchQualifier", () => {
	test("repository mode with repository → repo: qualifier", () => {
		expect(pullRequestQueueSearchQualifier("repository", "kit", "owner/name")).toBe("repo:owner/name")
	})

	test("repository mode without repository falls back to author: qualifier", () => {
		expect(pullRequestQueueSearchQualifier("repository", "kit", null)).toBe("author:kit")
	})

	test("authored mode → author:", () => {
		expect(pullRequestQueueSearchQualifier("authored", "kit", null)).toBe("author:kit")
	})

	test("review mode → review-requested:@me regardless of repository", () => {
		expect(pullRequestQueueSearchQualifier("review", "kit", "owner/name")).toBe("review-requested:@me")
	})

	test("assigned mode → assignee:@me", () => {
		expect(pullRequestQueueSearchQualifier("assigned", "kit", null)).toBe("assignee:@me")
	})

	test("mentioned mode → mentions:@me", () => {
		expect(pullRequestQueueSearchQualifier("mentioned", "kit", null)).toBe("mentions:@me")
	})
})

describe("issueQueueSearchQualifier", () => {
	test("repository mode with repository -> repo: qualifier", () => {
		expect(issueQueueSearchQualifier("repository", "kit", "owner/name")).toBe("repo:owner/name")
	})

	test("repository mode without repository falls back to author: qualifier", () => {
		expect(issueQueueSearchQualifier("repository", "kit", null)).toBe("author:kit")
	})

	test("authored mode -> author:", () => {
		expect(issueQueueSearchQualifier("authored", "kit", null)).toBe("author:kit")
	})

	test("assigned mode -> assignee:@me", () => {
		expect(issueQueueSearchQualifier("assigned", "kit", null)).toBe("assignee:@me")
	})

	test("mentioned mode -> mentions:@me", () => {
		expect(issueQueueSearchQualifier("mentioned", "kit", null)).toBe("mentions:@me")
	})
})

describe("viewCacheKey", () => {
	test("repository view key includes repo path", () => {
		expect(viewCacheKey({ _tag: "Repository", repository: "owner/name" })).toBe("repository:owner/name")
	})

	test("queue view key is the mode literal", () => {
		expect(viewCacheKey({ _tag: "Queue", mode: "authored", repository: null })).toBe("authored")
		expect(viewCacheKey({ _tag: "Queue", mode: "review", repository: "owner/name" })).toBe("review")
	})
})
