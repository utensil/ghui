import { useBindings } from "@opentui/keymap/react"
import { useRef } from "react"

export type ScopedBindingAction = (() => void) | string

export interface ScopedBindingsOptions {
	readonly when: boolean
	readonly bindings: Readonly<Record<string, ScopedBindingAction>>
}

/**
 * Wraps `@opentui/keymap/react`'s `useBindings` so callers don't have to write
 * the ref dance themselves. The layer registers exactly once (deps=[]); the
 * `when` flag and the action callbacks read latest values via refs, so the
 * binding-shape is captured at first render but closures stay fresh.
 *
 * Don't change which keys you bind across renders — only what they do.
 */
export const useScopedBindings = ({ when, bindings }: ScopedBindingsOptions): void => {
	const activeRef = useRef(false)
	activeRef.current = when

	const actionsRef = useRef(bindings)
	actionsRef.current = bindings

	useBindings(() => ({
		enabled: () => activeRef.current,
		bindings: Object.entries(bindings).map(([key, action]) => ({
			key,
			cmd: typeof action === "string" ? action : () => {
				const current = actionsRef.current[key]
				if (typeof current === "function") current()
			},
		})),
	}), [])
}

/**
 * Vim-style scroll bindings: j/k/up/down for line scroll, ctrl-u/d/v + pageup/down
 * for half-page scroll. When `scrollTo` is given, also adds home/end and gg/G to
 * jump to start/end.
 */
export const scrollBindings = (
	scrollBy: (delta: number) => void,
	halfPage: number,
	scrollTo?: (y: number) => void,
): Record<string, ScopedBindingAction> => {
	const bindings: Record<string, ScopedBindingAction> = {
		up: () => scrollBy(-1),
		k: () => scrollBy(-1),
		down: () => scrollBy(1),
		j: () => scrollBy(1),
		pageup: () => scrollBy(-halfPage),
		pagedown: () => scrollBy(halfPage),
		"ctrl+u": () => scrollBy(-halfPage),
		"ctrl+d": () => scrollBy(halfPage),
		"ctrl+v": () => scrollBy(halfPage),
	}
	if (scrollTo) {
		bindings.home = () => scrollTo(0)
		bindings.end = () => scrollTo(Number.MAX_SAFE_INTEGER)
		bindings["g g"] = () => scrollTo(0)
		bindings["shift+g"] = () => scrollTo(Number.MAX_SAFE_INTEGER)
	}
	return bindings
}
