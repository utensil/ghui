import { describe, expect, test } from "bun:test"
import type { AuxiliaryItem } from "../src/domain.ts"
import { buildAuxiliaryListRows } from "../src/ui/AuxiliaryList.tsx"

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

describe("buildAuxiliaryListRows", () => {
	test("renders repository list surfaces as owner headers with repo rows underneath", () => {
		const rows = buildAuxiliaryListRows({
			surface: "myRepos",
			groups: [["owner", [repositoryItem("owner/repo-a"), repositoryItem("owner/repo-b")]]],
			status: "ready",
			error: null,
			filterText: "",
			showFilterBar: false,
		})

		expect(rows.map((row) => row._tag)).toEqual(["title", "owner", "item", "item"])
		expect(rows[1]).toEqual({ _tag: "owner", owner: "owner" })
	})
})
