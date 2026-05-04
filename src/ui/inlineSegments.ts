import type { CommentSegment } from "./comments.js"

export interface InlinePalette {
	readonly text: string
	readonly inlineCode: string
	readonly link: string
	readonly count: string
}

// Single-pass tokenizer over rich inline text. Each match in this regex is
// dispatched to the right segment kind below; everything outside matches
// becomes plain text. Order in the alternation is the order matches are
// produced: code spans first so URLs inside backticks stay raw, then
// `[label](url)`, then bare URLs, then `#NNN` refs.
const INLINE_TOKEN = /(`(?:\\.|[^`])+`)|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()[\]"'`]+)|(#\d+)/g

// Punctuation we should slice off the END of a bare URL — e.g. so "see
// https://example.com." doesn't treat the period as part of the link.
const TRAILING_URL_PUNCTUATION = /[.,;:!?)>\]}"'`]+$/

export const inlineSegments = (text: string, fg: string, bold: boolean, palette: InlinePalette): readonly CommentSegment[] => {
	if (text.length === 0) return []
	const segments: CommentSegment[] = []
	const push = (segment: CommentSegment) => {
		if (segment.text.length > 0) segments.push(segment)
	}

	let cursor = 0
	for (const match of text.matchAll(INLINE_TOKEN)) {
		const start = match.index
		if (start > cursor) push({ text: text.slice(cursor, start), fg, bold })

		if (match[1] !== undefined) {
			push({ text: match[1].slice(1, -1), fg: palette.inlineCode, bold })
		} else if (match[2] !== undefined && match[3] !== undefined) {
			push({ text: match[2], fg: palette.link, bold, underline: true, url: match[3] })
		} else if (match[4] !== undefined) {
			const raw = match[4]
			const trail = raw.match(TRAILING_URL_PUNCTUATION)?.[0] ?? ""
			const url = trail.length > 0 ? raw.slice(0, raw.length - trail.length) : raw
			if (url.length > 0) push({ text: url, fg: palette.link, bold, underline: true, url })
			if (trail.length > 0) push({ text: trail, fg, bold })
		} else if (match[5] !== undefined) {
			push({ text: match[5], fg: palette.count, bold })
		}

		cursor = start + match[0].length
	}

	if (cursor < text.length) push({ text: text.slice(cursor), fg, bold })
	return segments
}

export interface UrlPosition {
	readonly url: string
	readonly lineIndex: number
	readonly startCol: number
	readonly endCol: number
}

export const collectUrlPositions = (lines: readonly { readonly segments: readonly CommentSegment[] }[]): readonly UrlPosition[] => {
	const positions: UrlPosition[] = []
	lines.forEach((line, lineIndex) => {
		let col = 0
		for (const segment of line.segments) {
			if (segment.url !== undefined) {
				positions.push({ url: segment.url, lineIndex, startCol: col, endCol: col + segment.text.length })
			}
			col += segment.text.length
		}
	})
	return positions
}

export const findUrlAt = (positions: readonly UrlPosition[], lineIndex: number, col: number): string | null => {
	for (const position of positions) {
		if (position.lineIndex === lineIndex && col >= position.startCol && col < position.endCol) return position.url
	}
	return null
}
