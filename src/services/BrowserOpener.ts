import { Context, Effect, Layer } from "effect"
import type { IssueItem, PullRequestItem } from "../domain.js"
import { CommandRunner, type CommandError } from "./CommandRunner.js"

export class BrowserOpener extends Context.Service<BrowserOpener, {
	readonly openPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<void, CommandError>
	readonly openIssue: (issue: IssueItem) => Effect.Effect<void, CommandError>
}>()("ghui/BrowserOpener") {
	static readonly layerNoDeps = Layer.effect(
		BrowserOpener,
		Effect.gen(function*() {
			const command = yield* CommandRunner

			const openPullRequest = Effect.fn("BrowserOpener.openPullRequest")(function*(pullRequest: PullRequestItem) {
				yield* command.run("gh", ["pr", "view", String(pullRequest.number), "--repo", pullRequest.repository, "--web"])
			})

			const openIssue = Effect.fn("BrowserOpener.openIssue")(function*(issue: IssueItem) {
				yield* command.run("gh", ["issue", "view", String(issue.number), "--repo", issue.repository, "--web"])
			})

			return BrowserOpener.of({ openPullRequest, openIssue })
		}),
	)

	static readonly layer = BrowserOpener.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))
}
