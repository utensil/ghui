import { Context, Effect, Layer } from "effect"
import type { AuxiliaryItem, CommitItem, IssueItem, PullRequestItem } from "../domain.js"
import { CommandRunner, type CommandError } from "./CommandRunner.js"

export class BrowserOpener extends Context.Service<BrowserOpener, {
	readonly openPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<void, CommandError>
	readonly openIssue: (issue: IssueItem) => Effect.Effect<void, CommandError>
	readonly openCommit: (commit: CommitItem) => Effect.Effect<void, CommandError>
	readonly openAuxiliaryItem: (item: AuxiliaryItem) => Effect.Effect<void, CommandError>
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

			const openCommit = Effect.fn("BrowserOpener.openCommit")(function*(commit: CommitItem) {
				const url = commit.url
				if (process.platform === "darwin") {
					yield* command.run("open", [url])
				} else if (process.platform === "win32") {
					yield* command.run("cmd", ["/c", "start", "", url])
				} else {
					yield* command.run("xdg-open", [url])
				}
			})

			const openAuxiliaryItem = Effect.fn("BrowserOpener.openAuxiliaryItem")(function*(item: AuxiliaryItem) {
				if (item.surface === "sharedRepos" || item.surface === "stars" || item.surface === "watchedRepos") {
					if (item.repository) {
						yield* command.run("gh", ["repo", "view", item.repository, "--web"])
						return
					}
				}

				const url = item.url ?? (item.repository ? `https://github.com/${item.repository}` : null)
				if (!url) return
				if (process.platform === "darwin") {
					yield* command.run("open", [url])
				} else if (process.platform === "win32") {
					yield* command.run("cmd", ["/c", "start", "", url])
				} else {
					yield* command.run("xdg-open", [url])
				}
			})

			return BrowserOpener.of({ openPullRequest, openIssue, openCommit, openAuxiliaryItem })
		}),
	)

	static readonly layer = BrowserOpener.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))
}
