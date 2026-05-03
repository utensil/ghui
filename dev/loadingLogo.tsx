#!/usr/bin/env bun

import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useEffect, useState } from "react"
import { LoadingLogoPane } from "../src/ui/LoadingLogo.js"
import { colors } from "../src/ui/colors.js"
import { centerCell, PlainLine } from "../src/ui/primitives.js"

process.env.OTUI_USE_ALTERNATE_SCREEN = "true"

const renderer = await createCliRenderer({
	exitOnCtrlC: true,
	screenMode: "alternate-screen",
	onDestroy: () => {
		process.exit(0)
	},
})

const STATES = [
	{ title: "Loading pull requests", hint: "Fetching latest open PRs" },
	{ title: "Loading pull requests", hint: "Hydrating review checks" },
	{ title: "Loading diff", hint: "Fetching patch from GitHub" },
	{ title: "Loading pull request details", hint: "Expanding summary and checks" },
] as const

const LoadingLogoPlayground = () => {
	const { width, height } = useTerminalDimensions()
	const [frame, setFrame] = useState(0)
	const [stateIndex, setStateIndex] = useState(0)
	const state = STATES[stateIndex]!

	useEffect(() => {
		const timer = setInterval(() => setFrame((current) => current + 1), 120)
		return () => clearInterval(timer)
	}, [])

	useKeyboard((key) => {
		if ((key.ctrl && key.name === "c") || key.name === "q") {
			renderer.destroy()
			return
		}

		if (key.name === "space" || key.name === "tab") {
			setStateIndex((current) => (current + 1) % STATES.length)
		}
	})

	return (
		<box width={width} height={height} flexDirection="column" backgroundColor={colors.background}>
			<PlainLine text={centerCell("GHUI loading logo playground", width)} fg={colors.muted} bold />
			<LoadingLogoPane content={state} width={width} height={Math.max(1, height - 2)} frame={frame} />
			<PlainLine text={centerCell("space/tab state  q quit  bun --watch hot reloads", width)} fg={colors.muted} />
		</box>
	)
}

createRoot(renderer).render(<LoadingLogoPlayground />)
