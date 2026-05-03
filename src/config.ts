import { Config, Effect } from "effect"

const positiveIntOr = (fallback: number) => (value: number) => (Number.isFinite(value) && value > 0 ? value : fallback)

const pageSizeOr = (fallback: number) => (value: number) => Math.min(100, positiveIntOr(fallback)(value))

const appConfig = Config.all({
	prFetchLimit: Config.int("GHUI_PR_FETCH_LIMIT").pipe(Config.withDefault(200), Config.map(positiveIntOr(200))),
	prPageSize: Config.int("GHUI_PR_PAGE_SIZE").pipe(Config.withDefault(50), Config.map(pageSizeOr(50))),
})

export const config = Effect.runSync(
	Effect.gen(function* () {
		return yield* appConfig
	}),
)
