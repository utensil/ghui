import { TextAttributes } from "@opentui/core"
import { formatRelativeDate } from "../date.js"
import type { DiffCommentSide } from "../domain.js"
import { colors } from "./colors.js"
import { fitCell, TextLine } from "./primitives.js"

export interface CommentSegment {
	readonly text: string
	readonly fg: string
	readonly bold?: boolean
}

export interface CommentDisplayLine {
	readonly key: string
	readonly segments: readonly CommentSegment[]
}

export interface CommentDisplayItem {
	readonly id: string
	readonly author: string
	readonly body: string
	readonly createdAt: Date | null
	readonly side?: DiffCommentSide | null
}

export const commentCountText = (count: number) => (count === 1 ? "1 comment" : `${count} comments`)

export const commentSideColor = (side: DiffCommentSide | null | undefined) => (side === "LEFT" ? colors.status.failing : side === "RIGHT" ? colors.status.passing : colors.count)

const commentTimestamp = (date: Date | null) => {
	if (!date) return ""
	const ageMs = Date.now() - date.getTime()
	const minuteMs = 60_000
	const hourMs = 60 * minuteMs
	if (ageMs < minuteMs) return "just now"
	if (ageMs < hourMs) return `${Math.max(1, Math.floor(ageMs / minuteMs))}m ago`
	if (ageMs < 24 * hourMs) return `${Math.max(1, Math.floor(ageMs / hourMs))}h ago`
	return formatRelativeDate(date)
}

const inlineCommentSegments = (text: string, fg = colors.text): readonly CommentSegment[] =>
	text
		.split(/(`[^`]+`)/g)
		.filter((part) => part.length > 0)
		.map((part) => (part.startsWith("`") && part.endsWith("`") ? { text: part.slice(1, -1), fg: colors.inlineCode } : { text: part, fg }))

const wrapCommentText = (body: string, width: number) => {
	const safeWidth = Math.max(1, width)
	const lines = body.trim().length === 0 ? ["(empty comment)"] : body.replace(/\r/g, "").trim().split("\n")
	return lines.flatMap((line) => {
		const trimmed = line.trim()
		if (trimmed.length === 0) return []
		const wrapped: string[] = []
		for (let index = 0; index < trimmed.length; index += safeWidth) {
			wrapped.push(trimmed.slice(index, index + safeWidth))
		}
		return wrapped
	})
}

const appendMetaGroup = (segments: CommentSegment[], group: readonly CommentSegment[]) => {
	if (group.length === 0) return
	segments.push({ text: " · ", fg: colors.muted }, ...group)
}

export const commentMetaSegments = ({
	item,
	markerLabel,
	groups = [],
}: {
	readonly item: CommentDisplayItem
	readonly markerLabel?: string | null | undefined
	readonly groups?: readonly (readonly CommentSegment[])[] | undefined
}): readonly CommentSegment[] => {
	const sideColor = commentSideColor(item.side)
	const timestamp = commentTimestamp(item.createdAt)
	const segments: CommentSegment[] = [
		{ text: "•", fg: colors.count, bold: true },
		...(markerLabel ? [{ text: ` ${markerLabel}`, fg: sideColor, bold: true }] : []),
		{ text: " ", fg: colors.muted },
		{ text: item.author, fg: colors.count, bold: true },
	]
	if (timestamp) appendMetaGroup(segments, [{ text: timestamp, fg: colors.muted }])
	for (const group of groups) appendMetaGroup(segments, group)
	return segments
}

export const commentBodyRows = ({ keyPrefix, body, width }: { readonly keyPrefix: string; readonly body: string; readonly width: number }): readonly CommentDisplayLine[] =>
	wrapCommentText(body, Math.max(1, width - 2)).map((line, index) => ({
		key: `${keyPrefix}:body:${index}`,
		segments: [{ text: "│ ", fg: colors.muted }, ...inlineCommentSegments(line)],
	}))

export const commentDisplayRows = ({
	item,
	width,
	markerLabel,
	groups,
}: {
	readonly item: CommentDisplayItem
	readonly width: number
	readonly markerLabel?: string | null | undefined
	readonly groups?: readonly (readonly CommentSegment[])[] | undefined
}): readonly CommentDisplayLine[] => [
	{ key: `${item.id}:meta`, segments: commentMetaSegments({ item, markerLabel, groups }) },
	...commentBodyRows({ keyPrefix: item.id, body: item.body, width }),
]

export const firstCommentBodyLine = (body: string) => {
	const text = body.trim().length > 0 ? body : "(empty comment)"
	const newlineIndex = text.indexOf("\n")
	return (newlineIndex >= 0 ? text.slice(0, newlineIndex) : text).trim() || "(empty comment)"
}

export const CommentSegmentsLine = ({ segments }: { segments: readonly CommentSegment[] }) => (
	<TextLine>
		{segments.map((segment, index) =>
			segment.bold ? (
				<span key={index} fg={segment.fg} attributes={TextAttributes.BOLD}>
					{segment.text}
				</span>
			) : (
				<span key={index} fg={segment.fg}>
					{segment.text}
				</span>
			),
		)}
	</TextLine>
)

export const CommentBodyLine = ({ body, width }: { body: string; width: number }) => (
	<CommentSegmentsLine
		segments={[
			{ text: "│ ", fg: colors.muted },
			{ text: fitCell(firstCommentBodyLine(body), Math.max(1, width - 2)), fg: colors.text },
		]}
	/>
)
