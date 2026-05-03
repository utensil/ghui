import type { CommandConfig } from "@ghui/keymap"

const MAX_COUNT_PREFIX = 99

const countSequence = (count: number, key: string) => `${String(count).split("").join(" ")} ${key}`

/**
 * Vim-style "count prefix" navigation: `2 k` moves by 2, `15 j` by 15, etc.
 * Generates bindings for `count` × {k, up, j, down} for count ∈ [1, 99].
 *
 * Each generated binding is anonymous (no meta) — they don't belong in the
 * palette. Only `moveBy` semantics matter.
 */
export const countedVerticalBindings = <C>(moveBy: (ctx: C, delta: number) => void): readonly CommandConfig<C>[] => {
	const out: CommandConfig<C>[] = []
	for (let count = 1; count <= MAX_COUNT_PREFIX; count++) {
		out.push({ keys: [countSequence(count, "k"), countSequence(count, "up")], run: (s) => moveBy(s, -count) })
		out.push({ keys: [countSequence(count, "j"), countSequence(count, "down")], run: (s) => moveBy(s, count) })
	}
	return out
}
