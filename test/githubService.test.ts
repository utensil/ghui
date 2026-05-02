import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { CommandError, CommandRunner } from "../src/services/CommandRunner.ts"
import { GitHubService } from "../src/services/GitHubService.ts"

describe("GitHubService repository surfaces", () => {
	test("loads starred repositories with bounded page requests", async () => {
		const calls: readonly string[][] = []
		const commandLayer = Layer.succeed(
			CommandRunner,
			CommandRunner.of({
				run: (command, args) => Effect.fail(new CommandError({ command, args: [...args], detail: "unexpected command", cause: args })),
				runSchema: (schema, _command, args) => {
					calls.push([...args])
					return Schema.decodeUnknownEffect(schema)([
						{
							full_name: "owner/star-one",
							description: "A starred repository.",
							html_url: "https://github.com/owner/star-one",
							private: false,
							fork: false,
							archived: false,
							language: "TypeScript",
							stargazers_count: 42,
							forks_count: 3,
							open_issues_count: 1,
							updated_at: "2026-01-01T00:00:00Z",
							pushed_at: "2026-01-02T00:00:00Z",
							has_discussions: true,
						},
					])
				},
			}),
		)

		const repositories = await Effect.runPromise(
			GitHubService.use((github) => github.listStarredRepositories()).pipe(
				Effect.provide(GitHubService.layerNoDeps.pipe(Layer.provide(commandLayer))),
			),
		)

		expect(repositories).toHaveLength(1)
		expect(repositories[0]?.repository).toBe("owner/star-one")
		expect(repositories[0]?.surface).toBe("stars")
		expect(calls).toHaveLength(1)
		expect(calls[0]).not.toContain("--paginate")
		expect(calls[0]).not.toContain("--slurp")
		expect(calls[0]).toContain("user/starred")
		expect(calls[0]).toContain("per_page=100")
		expect(calls[0]).toContain("page=1")
	})
})
