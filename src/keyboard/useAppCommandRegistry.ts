import { useBindings } from "@opentui/keymap/react"
import type { RefObject } from "react"
import { useRef } from "react"
import type { AppCommand } from "../commands.js"

/**
 * Registers each AppCommand under its ID as a named keymap command, so
 * bindings can reference them by ID (`cmd: "pull.refresh"`) and the keymap's
 * introspection (queryCommands, useActiveKeys) sees our commands.
 *
 * The set of IDs is captured at first render — adding to the static list
 * later in the session would not be picked up.
 */
export const useAppCommandRegistry = (
	appCommands: readonly AppCommand[],
	runCommandByIdRef: RefObject<(id: string, options?: { readonly notifyDisabled?: boolean }) => boolean>,
) => {
	const idsRef = useRef(appCommands.map((command) => command.id))

	useBindings(() => ({
		commands: idsRef.current.map((id) => ({
			name: id,
			run: () => {
				runCommandByIdRef.current(id)
				return true
			},
		})),
		bindings: [],
	}), [])
}
