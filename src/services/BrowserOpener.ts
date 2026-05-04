import { Context, Effect, Layer } from "effect"
import type { AuxiliaryItem, CommitItem, IssueItem, PullRequestItem } from "../domain.js"
import { CommandRunner, type CommandError } from "./CommandRunner.js"

// `open` ships on macOS; `xdg-open` is the Linux/BSD convention; `start` is the
// Windows shell built-in and requires a dummy title argument before the URL.
const platformOpener = (): { readonly command: string; readonly prefix: readonly string[] } => {
	if (process.platform === "darwin") return { command: "open", prefix: [] }
	if (process.platform === "win32") return { command: "cmd", prefix: ["/c", "start", ""] }
	return { command: "xdg-open", prefix: [] }
}

export class BrowserOpener extends Context.Service<
	BrowserOpener,
	{
		readonly openPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<void, CommandError>
		readonly openIssue: (issue: IssueItem) => Effect.Effect<void, CommandError>
		readonly openCommit: (commit: CommitItem) => Effect.Effect<void, CommandError>
		readonly openAuxiliaryItem: (item: AuxiliaryItem) => Effect.Effect<void, CommandError>
		readonly openUrl: (url: string) => Effect.Effect<void, CommandError>
	}
>()("ghui/BrowserOpener") {
	static readonly layerNoDeps = Layer.effect(
		BrowserOpener,
		Effect.gen(function*() {
			const command = yield* CommandRunner
			const opener = platformOpener()

			const openPullRequest = Effect.fn("BrowserOpener.openPullRequest")(function*(pullRequest: PullRequestItem) {
				yield* command.run("gh", ["pr", "view", String(pullRequest.number), "--repo", pullRequest.repository, "--web"])
			})

			const openIssue = Effect.fn("BrowserOpener.openIssue")(function*(issue: IssueItem) {
				yield* command.run("gh", ["issue", "view", String(issue.number), "--repo", issue.repository, "--web"])
			})

			const openCommit = Effect.fn("BrowserOpener.openCommit")(function*(commit: CommitItem) {
				yield* command.run(opener.command, [...opener.prefix, commit.url])
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
				yield* command.run(opener.command, [...opener.prefix, url])
			})

			const openUrl = Effect.fn("BrowserOpener.openUrl")(function* (url: string) {
				yield* command.run(opener.command, [...opener.prefix, url])
			})

			return BrowserOpener.of({ openPullRequest, openIssue, openCommit, openAuxiliaryItem, openUrl })
		}),
	)

	static readonly layer = BrowserOpener.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))
}
