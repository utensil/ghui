import { Data } from "effect"
import { formatShortDate, formatTimestamp } from "../date.js"
import type { PullRequestLabel, PullRequestMergeInfo, PullRequestReviewComment } from "../domain.js"
import { availableMergeActions } from "../mergeActions.js"
import { clampCursor, commentEditorLines, cursorLineIndexForLines } from "./commentEditor.js"
import { colors, filterThemeDefinitions, themeDefinitions, type ThemeId } from "./colors.js"
import { centerCell, Filler, fitCell, HintRow, PlainLine, StandardModal, standardModalDims, TextLine } from "./primitives.js"
import { labelColor, shortRepoName } from "./pullRequests.js"

export interface LabelModalState {
	readonly repository: string | null
	readonly query: string
	readonly selectedIndex: number
	readonly availableLabels: readonly PullRequestLabel[]
	readonly loading: boolean
}

export interface MergeModalState {
	readonly repository: string | null
	readonly number: number | null
	readonly selectedIndex: number
	readonly loading: boolean
	readonly running: boolean
	readonly info: PullRequestMergeInfo | null
	readonly error: string | null
}

export interface CloseModalState {
	readonly repository: string | null
	readonly number: number | null
	readonly title: string
	readonly url: string | null
	readonly kind: "pull request" | "issue"
	readonly action: "close" | "reopen"
	readonly running: boolean
	readonly error: string | null
}

export interface CommentModalState {
	readonly body: string
	readonly cursor: number
	readonly error: string | null
}

export interface CommentThreadModalState {
	readonly scrollOffset: number
}

export interface ThemeModalState {
	readonly query: string
	readonly filterMode: boolean
	readonly initialThemeId: ThemeId
}

export interface CommandPaletteState {
	readonly query: string
	readonly selectedIndex: number
}

export interface OpenRepositoryModalState {
	readonly query: string
	readonly error: string | null
}

export const filterLabels = (labels: readonly PullRequestLabel[], query: string) => {
	const normalized = query.trim().toLowerCase()
	if (normalized.length === 0) return labels
	return labels.filter((label) => label.name.toLowerCase().includes(normalized))
}

export const initialLabelModalState: LabelModalState = {
	repository: null,
	query: "",
	selectedIndex: 0,
	availableLabels: [],
	loading: false,
}

export const initialMergeModalState: MergeModalState = {
	repository: null,
	number: null,
	selectedIndex: 0,
	loading: false,
	running: false,
	info: null,
	error: null,
}

export const initialCloseModalState: CloseModalState = {
	repository: null,
	number: null,
	title: "",
	url: null,
	kind: "pull request",
	action: "close",
	running: false,
	error: null,
}

export const initialCommentModalState: CommentModalState = {
	body: "",
	cursor: 0,
	error: null,
}

export const initialCommentThreadModalState: CommentThreadModalState = {
	scrollOffset: 0,
}

export const initialThemeModalState: ThemeModalState = {
	query: "",
	filterMode: false,
	initialThemeId: "ghui",
}

export const initialCommandPaletteState: CommandPaletteState = {
	query: "",
	selectedIndex: 0,
}

export const initialOpenRepositoryModalState: OpenRepositoryModalState = {
	query: "",
	error: null,
}

export type Modal = Data.TaggedEnum<{
	None: {}
	Label: LabelModalState
	Close: CloseModalState
	Merge: MergeModalState
	Comment: CommentModalState
	CommentThread: CommentThreadModalState
	Theme: ThemeModalState
	CommandPalette: CommandPaletteState
	OpenRepository: OpenRepositoryModalState
}>

export const Modal = Data.taggedEnum<Modal>()
export const initialModal: Modal = Modal.None()

export type ModalTag = Modal["_tag"]
export type ModalState<Tag extends Exclude<ModalTag, "None">> = Omit<Extract<Modal, { _tag: Tag }>, "_tag">

export const modalInitialStates = {
	Label: initialLabelModalState,
	Close: initialCloseModalState,
	Merge: initialMergeModalState,
	Comment: initialCommentModalState,
	CommentThread: initialCommentThreadModalState,
	Theme: initialThemeModalState,
	CommandPalette: initialCommandPaletteState,
	OpenRepository: initialOpenRepositoryModalState,
} as const satisfies { [Tag in Exclude<ModalTag, "None">]: ModalState<Tag> }

export const OpenRepositoryModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: OpenRepositoryModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth } = standardModalDims(modalWidth, modalHeight)
	const inputText = state.query.length > 0 ? state.query : "owner/name or GitHub URL"

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Open Repository"
			headerRight={{ text: "owner/name" }}
			subtitle={
				<TextLine>
					<span fg={colors.count}>› </span>
					<span fg={state.query.length > 0 ? colors.text : colors.muted}>{fitCell(inputText, Math.max(1, contentWidth - 2))}</span>
				</TextLine>
			}
			bodyPadding={1}
			footer={<HintRow items={[{ key: "enter", label: "open" }, { key: "ctrl-u", label: "clear" }, { key: "ctrl-w", label: "word" }, { key: "esc", label: "cancel" }]} />}
		>
			{state.error ? (
				<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
			) : (
				<PlainLine text={fitCell("Switches to the selected repository view.", contentWidth)} fg={colors.muted} />
			)}
		</StandardModal>
	)
}

const mergeUnavailableReason = (info: PullRequestMergeInfo | null) => {
	if (!info) return "Loading merge status from GitHub."
	if (info.state !== "open") return "This pull request is not open."
	if (info.isDraft) return "Draft pull requests cannot be merged."
	if (info.mergeable === "conflicting") return "This branch has merge conflicts."
	return "No merge actions are currently available."
}

export const LabelModal = ({
	state,
	currentLabels,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: LabelModalState
	currentLabels: readonly PullRequestLabel[]
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight: maxVisible, rowWidth } = standardModalDims(modalWidth, modalHeight)
	const currentNames = new Set(currentLabels.map((l) => l.name.toLowerCase()))
	const filtered = filterLabels(state.availableLabels, state.query)
	const labelMessageTopRows = Math.max(0, Math.floor((maxVisible - 1) / 2))
	const labelMessageBottomRows = Math.max(0, maxVisible - labelMessageTopRows - 1)
	const selectedIndex = filtered.length === 0 ? 0 : Math.max(0, Math.min(state.selectedIndex, filtered.length - 1))
	const scrollStart = Math.min(
		Math.max(0, filtered.length - maxVisible),
		Math.max(0, selectedIndex - maxVisible + 1),
	)
	const visibleLabels = filtered.slice(scrollStart, scrollStart + maxVisible)
	const title = state.repository ? `Labels  ${shortRepoName(state.repository)}` : "Labels"
	const countText = state.loading ? "loading" : `${filtered.length}/${state.availableLabels.length}`
	const queryText = state.query.length > 0 ? state.query : "type to filter labels"
	const queryPrefix = "/ "
	const queryWidth = Math.max(1, contentWidth - queryPrefix.length)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			headerRight={{ text: countText }}
			subtitle={
				<TextLine>
					<span fg={colors.count}>{queryPrefix}</span>
					<span fg={state.query.length > 0 ? colors.text : colors.muted}>{fitCell(queryText, queryWidth)}</span>
				</TextLine>
			}
			footer={
				<TextLine>
					<span fg={colors.count}>↑↓</span>
					<span fg={colors.muted}> move  </span>
					<span fg={colors.count}>esc</span>
					<span fg={colors.muted}> close</span>
					{filtered.length > maxVisible ? <span fg={colors.muted}>  {selectedIndex + 1}/{filtered.length}</span> : null}
				</TextLine>
			}
		>
			{state.loading ? (
				<>
					<Filler rows={labelMessageTopRows} prefix="top" />
					<PlainLine text={centerCell(`${loadingIndicator} Loading labels`, rowWidth)} fg={colors.muted} />
					<Filler rows={labelMessageBottomRows} prefix="bottom" />
				</>
			) : visibleLabels.length === 0 ? (
				<>
					<Filler rows={labelMessageTopRows} prefix="top" />
					<PlainLine text={centerCell(state.query.length > 0 ? "No matching labels" : "No labels found", rowWidth)} fg={colors.muted} />
					<Filler rows={labelMessageBottomRows} prefix="bottom" />
				</>
			) : (
				visibleLabels.map((label, index) => {
					const actualIndex = scrollStart + index
					const isActive = currentNames.has(label.name.toLowerCase())
					const isSelected = actualIndex === selectedIndex
					const marker = isActive ? "✓" : " "
					const nameWidth = Math.max(1, rowWidth - 5)
					return (
						<box key={label.name} height={1}>
							<TextLine bg={isSelected ? colors.selectedBg : undefined} fg={isSelected ? colors.selectedText : colors.text}>
								<span fg={isActive ? colors.status.passing : colors.muted}>{marker}</span>
								<span> </span>
								<span bg={labelColor(label)}>  </span>
								<span> {fitCell(label.name, nameWidth)}</span>
							</TextLine>
						</box>
					)
				})
			)}
		</StandardModal>
	)
}

export const MergeModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: MergeModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight: optionAreaHeight, rowWidth } = standardModalDims(modalWidth, modalHeight)
	const options = availableMergeActions(state.info)
	const selectedIndex = options.length === 0 ? 0 : Math.max(0, Math.min(state.selectedIndex, options.length - 1))
	const title = state.info ? `Merge  #${state.info.number}` : state.number ? `Merge  #${state.number}` : "Merge"
	const rightText = state.running ? `${loadingIndicator} running` : state.loading ? `${loadingIndicator} loading` : state.info?.autoMergeEnabled ? "auto on" : "manual"
	const repo = state.info?.repository ?? state.repository
	const statusLine = state.info
		? `${shortRepoName(state.info.repository)}  ${state.info.mergeable}  ${state.info.reviewStatus}  ${state.info.checkSummary ?? state.info.checkStatus}`
		: repo ? shortRepoName(repo) : ""
	const optionRows = Math.max(1, Math.floor(optionAreaHeight / 2))
	const visibleOptions = options.slice(0, optionRows)
	const loadingTopRows = Math.max(0, Math.floor((optionAreaHeight - 1) / 2))
	const loadingBottomRows = Math.max(0, optionAreaHeight - loadingTopRows - 1)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			headerRight={{ text: rightText, pending: state.running || state.loading }}
			subtitle={<PlainLine text={fitCell(statusLine, contentWidth)} fg={colors.muted} />}
			footer={<HintRow items={[{ key: "↑↓", label: "move" }, { key: "enter", label: "confirm" }, { key: "esc", label: "close" }]} />}
		>
			{state.loading ? (
				<>
					<Filler rows={loadingTopRows} prefix="top" />
					<PlainLine text={centerCell(`${loadingIndicator} Loading merge status`, rowWidth)} fg={colors.muted} />
					<Filler rows={loadingBottomRows} prefix="bottom" />
				</>
			) : state.error ? (
				<PlainLine text={centerCell(state.error, rowWidth)} fg={colors.error} />
			) : visibleOptions.length === 0 ? (
				<PlainLine text={centerCell(mergeUnavailableReason(state.info), rowWidth)} fg={colors.muted} />
			) : (
				visibleOptions.map((option, index) => {
					const isSelected = index === selectedIndex
					const titleColor = option.danger ? colors.error : isSelected ? colors.selectedText : colors.text
					const titleWidth = Math.max(1, rowWidth - 1)
					const descriptionWidth = Math.max(1, rowWidth - 1)

					return (
						<box key={option.action} height={2} flexDirection="column">
							<TextLine bg={isSelected ? colors.selectedBg : undefined}>
								<span fg={titleColor}> {fitCell(option.title, titleWidth)}</span>
							</TextLine>
							<TextLine bg={isSelected ? colors.selectedBg : undefined}>
								<span fg={colors.muted}> {fitCell(option.description, descriptionWidth)}</span>
							</TextLine>
						</box>
					)
				})
			)}
		</StandardModal>
	)
}

export const CloseModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: CloseModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const verb = state.action === "reopen" ? "Reopen" : "Close"
	const title = state.number ? `${verb}  #${state.number}` : `${verb} ${state.kind}`
	const rightText = state.running ? `${loadingIndicator} ${state.action === "reopen" ? "reopening" : "closing"}` : "confirm"
	const repo = state.repository ? shortRepoName(state.repository) : ""
	const titleLines = [fitCell(repo, contentWidth), fitCell(state.title, contentWidth)]
	const topRows = Math.max(0, Math.floor((bodyHeight - titleLines.length - 2) / 2))
	const bottomRows = Math.max(0, bodyHeight - topRows - titleLines.length - 2)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			titleFg={state.action === "reopen" ? colors.status.passing : colors.error}
			headerRight={{ text: rightText, pending: state.running }}
			subtitle={<PlainLine text={fitCell(`This will ${state.action} the ${state.kind}.`, contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={<HintRow items={[{ key: "enter", label: state.action }, { key: "esc", label: "cancel" }]} />}
		>
			{state.error ? (
				<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
			) : (
				<>
					<Filler rows={topRows} prefix="top" />
					<PlainLine text={titleLines[0]!} fg={colors.muted} />
					<PlainLine text={titleLines[1]!} fg={colors.text} bold />
					<Filler rows={bottomRows} prefix="bottom" />
				</>
			)}
		</StandardModal>
	)
}

export const CommentModal = ({
	state,
	anchorLabel,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: CommentModalState
	anchorLabel: string
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const title = "Comment"
	const editorHeight = Math.max(1, bodyHeight - (state.error ? 1 : 0))
	const lineRanges = commentEditorLines(state.body)
	const cursor = clampCursor(state.body, state.cursor)
	const cursorLineIndex = cursorLineIndexForLines(lineRanges, cursor)
	const visibleStart = Math.min(
		Math.max(0, lineRanges.length - editorHeight),
		Math.max(0, cursorLineIndex - editorHeight + 1),
	)
	const visibleLines = lineRanges.slice(visibleStart, visibleStart + editorHeight)
	const renderEditorLine = (line: { readonly text: string; readonly start: number; readonly end: number }, index: number) => {
		const lineIndex = visibleStart + index
		const isCursorLine = lineIndex === cursorLineIndex
		const cursorColumn = Math.max(0, Math.min(cursor - line.start, line.text.length))
		const viewStart = isCursorLine ? Math.max(0, cursorColumn - contentWidth + 1) : 0
		const visibleText = line.text.slice(viewStart, viewStart + contentWidth)

		if (!isCursorLine) {
			return <PlainLine key={lineIndex} text={fitCell(visibleText, contentWidth)} fg={state.body.length > 0 ? colors.text : colors.muted} />
		}

		const cursorInView = cursorColumn - viewStart
		const before = visibleText.slice(0, cursorInView)
		const placeholder = state.body.length === 0 ? "Write a comment..." : ""
		const cursorChar = placeholder ? placeholder[0] ?? " " : visibleText[cursorInView] ?? " "
		const after = placeholder ? placeholder.slice(1) : visibleText.slice(cursorInView + 1)

		return (
			<TextLine key={lineIndex}>
				{before ? <span fg={colors.text}>{before}</span> : null}
				<span bg={colors.accent} fg={colors.background}>{cursorChar}</span>
				{after ? <span fg={placeholder ? colors.muted : colors.text}>{after}</span> : null}
			</TextLine>
		)
	}

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			headerRight={{ text: "enter save" }}
			subtitle={<PlainLine text={fitCell(anchorLabel, contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={<HintRow items={[{ key: "enter", label: "save" }, { key: "shift-enter", label: "newline" }, { key: "esc", label: "cancel" }]} />}
		>
			{state.error ? <PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} /> : null}
			{visibleLines.map(renderEditorLine)}
		</StandardModal>
	)
}

type CommentThreadRow = {
	readonly key: string
	readonly text: string
	readonly fg: string
	readonly bold?: boolean
}

const wrapCommentBody = (body: string, width: number) => {
	const lines = body.length === 0 ? [""] : body.split("\n")
	return lines.flatMap((line) => {
		if (line.length === 0) return [""]
		const wrapped: string[] = []
		for (let index = 0; index < line.length; index += width) {
			wrapped.push(line.slice(index, index + width))
		}
		return wrapped
	})
}

const formatCommentDate = (date: Date | null) => date ? `${formatShortDate(date)} ${formatTimestamp(date)}` : ""

const commentThreadRows = (comments: readonly PullRequestReviewComment[], width: number): readonly CommentThreadRow[] =>
	comments.flatMap((comment, commentIndex) => {
		const timestamp = formatCommentDate(comment.createdAt)
		const header = timestamp ? `${comment.author}  ${timestamp}` : comment.author
		return [
			{ key: `${comment.id}:header`, text: header, fg: colors.count, bold: true },
			...wrapCommentBody(comment.body, width).map((line, lineIndex) => ({
				key: `${comment.id}:body:${lineIndex}`,
				text: line,
				fg: colors.text,
			})),
			...(commentIndex < comments.length - 1 ? [{ key: `${comment.id}:gap`, text: "", fg: colors.muted }] : []),
		]
	})

export const CommentThreadModal = ({
	state,
	anchorLabel,
	comments,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: CommentThreadModalState
	anchorLabel: string
	comments: readonly PullRequestReviewComment[]
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const title = "Thread"
	const countText = comments.length === 1 ? "1 comment" : `${comments.length} comments`
	const rows = commentThreadRows(comments, contentWidth)
	const maxScroll = Math.max(0, rows.length - bodyHeight)
	const scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxScroll))
	const visibleRows = rows.slice(scrollOffset, scrollOffset + bodyHeight)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			headerRight={{ text: countText }}
			subtitle={<PlainLine text={fitCell(anchorLabel, contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={<HintRow items={[{ key: "↑↓", label: "scroll" }, { key: "a", label: "comment" }, { key: "esc", label: "close" }]} />}
		>
			{visibleRows.length === 0 ? (
				<PlainLine text={fitCell("No comments on this line.", contentWidth)} fg={colors.muted} />
			) : visibleRows.map((row) => (
				<PlainLine key={row.key} text={fitCell(row.text, contentWidth)} fg={row.fg} bold={row.bold ?? false} />
			))}
		</StandardModal>
	)
}

export const ThemeModal = ({
	state,
	activeThemeId,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: ThemeModalState
	activeThemeId: ThemeId
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth, bodyHeight: maxVisible, rowWidth } = standardModalDims(modalWidth, modalHeight)
	const filteredThemes = filterThemeDefinitions(state.query)
	const activeIndex = filteredThemes.findIndex((theme) => theme.id === activeThemeId)
	const selectedIndex = Math.max(0, activeIndex)
	const selectedTheme = filteredThemes[selectedIndex] ?? themeDefinitions.find((theme) => theme.id === activeThemeId) ?? themeDefinitions[0]!
	const scrollStart = Math.min(
		Math.max(0, filteredThemes.length - maxVisible),
		Math.max(0, selectedIndex - maxVisible + 1),
	)
	const visibleThemes = filteredThemes.slice(scrollStart, scrollStart + maxVisible)
	const countText = `${filteredThemes.length === 0 ? 0 : selectedIndex + 1}/${filteredThemes.length}`
	const subtitleText = state.filterMode ? (state.query.length > 0 ? state.query : "type to filter themes") : selectedTheme.description
	const queryPrefix = "/ "
	const subtitleWidth = Math.max(1, contentWidth - (state.filterMode ? queryPrefix.length : 0))
	const messageTopRows = Math.max(0, Math.floor((maxVisible - 1) / 2))
	const messageBottomRows = Math.max(0, maxVisible - messageTopRows - 1)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Themes"
			headerRight={{ text: countText }}
			subtitle={state.filterMode ? (
				<TextLine>
					<span fg={colors.count}>{queryPrefix}</span>
					<span fg={state.query.length > 0 ? colors.text : colors.muted}>{fitCell(subtitleText, subtitleWidth)}</span>
				</TextLine>
			) : (
				<PlainLine text={fitCell(subtitleText, subtitleWidth)} fg={colors.muted} />
			)}
			footer={<HintRow items={[{ key: "↑↓", label: "preview" }, { key: "/", label: "filter" }, { key: "enter", label: "select" }, { key: "esc", label: "cancel" }]} />}
		>
			{visibleThemes.length === 0 ? (
				<>
					<Filler rows={messageTopRows} prefix="top" />
					<PlainLine text={centerCell("No matching themes", rowWidth)} fg={colors.muted} />
					<Filler rows={messageBottomRows} prefix="bottom" />
				</>
			) : visibleThemes.map((theme, index) => {
				const actualIndex = scrollStart + index
				const isSelected = actualIndex === selectedIndex
				const isActive = theme.id === activeThemeId
				const marker = isActive ? "✓" : " "
				const swatchWidth = 6
				const nameWidth = Math.max(1, rowWidth - swatchWidth - 3)

				return (
					<TextLine key={theme.id} bg={isSelected ? colors.selectedBg : undefined} fg={isSelected ? colors.selectedText : colors.text}>
						<span fg={isActive ? colors.status.passing : colors.muted}>{marker}</span>
						<span> </span>
						<span>{fitCell(theme.name, nameWidth)}</span>
						<span bg={theme.colors.background}> </span>
						<span bg={theme.colors.modalBackground}> </span>
						<span bg={theme.colors.accent}> </span>
						<span bg={theme.colors.status.passing}> </span>
						<span bg={theme.colors.status.failing}> </span>
						<span bg={theme.colors.status.review}> </span>
					</TextLine>
				)
			})}
		</StandardModal>
	)
}
