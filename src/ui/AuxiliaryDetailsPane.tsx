import { useMemo } from "react"
import type { AuxiliaryItem } from "../domain.js"
import { formatRelativeDate } from "../date.js"
import { colors, type ThemeId } from "./colors.js"
import { Divider, Filler, fitCell, PaddedRow, PlainLine, TextLine } from "./primitives.js"
import { DetailPlaceholder, type DetailPlaceholderContent } from "./DetailsPane.js"

export const AUXILIARY_BODY_SCROLL_LIMIT = 1_200
const AUXILIARY_BODY_PREVIEW_LINES = 8
const AUXILIARY_PLACEHOLDER_ROWS = 4

const wrapText = (text: string, width: number): string[] => {
	if (width <= 0) return [""]
	if (text.length === 0) return [""]
	const lines: string[] = []
	for (const rawLine of text.replace(/\r/g, "").split("\n")) {
		if (rawLine.length === 0) {
			lines.push("")
			continue
		}
		let current = rawLine
		while (current.length > width) {
			lines.push(current.slice(0, width))
			current = current.slice(width)
		}
		lines.push(current)
	}
	return lines
}

const itemContentRows = (item: AuxiliaryItem, width: number, limit: number) => {
	const body = item.body.trim().length > 0 ? item.body : "No description."
	const rows = [
		...wrapText(body, width).map((line, index) => ({
			key: `body:${index}`,
			text: line,
			fg: item.body.trim().length > 0 ? colors.text : colors.muted,
			bold: false,
		})),
		...(item.meta.length > 0 ? [
			{ key: "meta-gap", text: "", fg: colors.muted, bold: false },
			{ key: "meta-title", text: "Details", fg: colors.count, bold: true },
			...item.meta.map((entry, index) => ({ key: `meta:${index}`, text: entry, fg: colors.muted, bold: false })),
		] : []),
	]
	return rows.slice(0, limit)
}

export const getAuxiliaryDetailJunctionRows = (item: AuxiliaryItem | null, paneWidth: number): readonly number[] => {
	if (!item) return [AUXILIARY_PLACEHOLDER_ROWS]
	const titleLines = wrapText(item.title, Math.max(1, paneWidth - 2)).length
	return [1 + titleLines + 2]
}

export const getAuxiliaryDetailHeaderHeight = (item: AuxiliaryItem | null, paneWidth: number) => {
	if (!item) return AUXILIARY_PLACEHOLDER_ROWS + 1
	const titleLines = wrapText(item.title, Math.max(1, paneWidth - 2)).length
	return titleLines + 4
}

export const getAuxiliaryDetailBodyHeight = (item: AuxiliaryItem | null, contentWidth: number, bodyLines = AUXILIARY_BODY_PREVIEW_LINES) =>
	item ? itemContentRows(item, contentWidth, bodyLines).length : bodyLines

export const getScrollableAuxiliaryBodyHeight = (item: AuxiliaryItem | null, contentWidth: number) =>
	getAuxiliaryDetailBodyHeight(item, contentWidth, AUXILIARY_BODY_SCROLL_LIMIT)

export const getAuxiliaryDetailsPaneHeight = ({
	item,
	contentWidth,
	bodyLines = AUXILIARY_BODY_PREVIEW_LINES,
	paneWidth = contentWidth + 2,
}: {
	item: AuxiliaryItem | null
	contentWidth: number
	bodyLines?: number
	paneWidth?: number
}) => item
	? getAuxiliaryDetailHeaderHeight(item, paneWidth) + getAuxiliaryDetailBodyHeight(item, contentWidth, bodyLines)
	: bodyLines + AUXILIARY_PLACEHOLDER_ROWS + 1

export const AuxiliaryDetailHeader = ({
	item,
	contentWidth,
	paneWidth,
}: {
	item: AuxiliaryItem
	contentWidth: number
	paneWidth: number
}) => {
	const wrappedTitle = wrapText(item.title, Math.max(1, paneWidth - 2))
	const repository = item.repository ?? "GitHub"
	const number = item.number ? `#${item.number}` : item.itemType
	const state = item.state ?? item.itemType
	const updated = item.updatedAt ? formatRelativeDate(item.updatedAt) : ""
	const rightSide = [state, updated].filter(Boolean).join("  ")
	const leftText = `${number} ${repository}`
	const gap = Math.max(2, contentWidth - leftText.length - rightSide.length)

	return (
		<>
			<PaddedRow>
				<TextLine>
					<span fg={colors.count}>{number}</span>
					<span fg={colors.muted}> {repository}</span>
					<span fg={colors.muted}>{" ".repeat(gap)}</span>
					<span fg={colors.accent}>{state}</span>
					{updated ? <span fg={colors.muted}>  {updated}</span> : null}
				</TextLine>
			</PaddedRow>
			<box height={wrappedTitle.length} flexDirection="column" paddingLeft={1} paddingRight={1}>
				{wrappedTitle.map((line, index) => (
					<PlainLine key={index} text={line} bold />
				))}
			</box>
			<PaddedRow>
				<TextLine>
					<span fg={colors.muted}>{fitCell(item.subtitle ?? item.itemType, contentWidth)}</span>
				</TextLine>
			</PaddedRow>
			<box height={1}><Divider width={paneWidth} /></box>
		</>
	)
}

export const AuxiliaryDetailBody = ({
	item,
	contentWidth,
	bodyLines = AUXILIARY_BODY_PREVIEW_LINES,
	bodyLineLimit = bodyLines,
	themeId,
}: {
	item: AuxiliaryItem
	contentWidth: number
	bodyLines?: number
	bodyLineLimit?: number
	themeId: ThemeId
}) => {
	const rows = useMemo(
		() => itemContentRows(item, contentWidth, bodyLineLimit),
		[item.id, item.body, item.meta, contentWidth, bodyLineLimit, themeId],
	)

	return (
		<box flexDirection="column" paddingLeft={1} paddingRight={1} height={rows.length}>
			{rows.map((row) => (
				<PlainLine key={row.key} text={fitCell(row.text, contentWidth)} fg={row.fg} bold={row.bold} />
			))}
		</box>
	)
}

export const AuxiliaryDetailsPane = ({
	item,
	contentWidth,
	bodyLines = AUXILIARY_BODY_PREVIEW_LINES,
	bodyLineLimit = bodyLines,
	paneWidth = contentWidth + 2,
	placeholderContent,
	themeId,
}: {
	item: AuxiliaryItem | null
	contentWidth: number
	bodyLines?: number
	bodyLineLimit?: number
	paneWidth?: number
	placeholderContent: DetailPlaceholderContent
	themeId: ThemeId
}) => {
	const contentHeight = getAuxiliaryDetailsPaneHeight({ item, contentWidth, bodyLines: bodyLineLimit, paneWidth })

	return (
		<box flexDirection="column" height={contentHeight}>
			{item ? (
				<>
					<AuxiliaryDetailHeader item={item} contentWidth={contentWidth} paneWidth={paneWidth} />
					<AuxiliaryDetailBody item={item} contentWidth={contentWidth} bodyLines={bodyLines} bodyLineLimit={bodyLineLimit} themeId={themeId} />
				</>
			) : (
				<>
					<DetailPlaceholder content={placeholderContent} paneWidth={paneWidth} />
					<box flexDirection="column" paddingLeft={1} paddingRight={1}>
						<Filler rows={bodyLines} prefix="empty" />
					</box>
				</>
			)}
		</box>
	)
}
