import { Fragment, useMemo } from "react"
import { formatRelativeDate, formatShortDate, formatTimestamp } from "../date.js"
import type { IssueComment, IssueItem } from "../domain.js"
import { colors, type ThemeId } from "./colors.js"
import { issueStateColor, issueStateLabel } from "./issues.js"
import { labelColor, labelTextColor, shortRepoName } from "./pullRequests.js"
import { Divider, Filler, fitCell, PaddedRow, PlainLine, TextLine } from "./primitives.js"
import { DetailPlaceholder, type DetailPlaceholderContent } from "./DetailsPane.js"

export const ISSUE_BODY_SCROLL_LIMIT = 1_200
const ISSUE_BODY_PREVIEW_LINES = 8
const ISSUE_PLACEHOLDER_ROWS = 4

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

const bodyRows = (issue: IssueItem, width: number, limit: number) => {
	const body = issue.body.trim().length > 0 ? issue.body : "No description."
	const rows = wrapText(body, width).map((line, index) => ({
		key: `body:${index}`,
		text: line,
		fg: issue.body.trim().length > 0 ? colors.text : colors.muted,
		bold: false,
	}))
	return rows.slice(0, limit)
}

const formatCommentDate = (date: Date | null) => date ? `${formatShortDate(date)} ${formatTimestamp(date)}` : ""

const commentRows = (comments: readonly IssueComment[], width: number, limit: number) => {
	const rows = comments.flatMap((comment, commentIndex) => {
		const timestamp = formatCommentDate(comment.createdAt)
		const header = timestamp ? `${comment.author} commented ${timestamp}` : `${comment.author} commented`
		return [
			{ key: `${comment.id}:top`, text: "─".repeat(Math.max(1, width)), fg: colors.separator, bold: false },
			{ key: `${comment.id}:header`, text: header, fg: colors.count, bold: true },
			...wrapText(comment.body.trim().length > 0 ? comment.body : "No comment body.", width).map((line, lineIndex) => ({
				key: `${comment.id}:body:${lineIndex}`,
				text: line,
				fg: comment.body.trim().length > 0 ? colors.text : colors.muted,
				bold: false,
			})),
			...(commentIndex < comments.length - 1 ? [{ key: `${comment.id}:gap`, text: "", fg: colors.muted, bold: false }] : []),
		]
	})
	return rows.slice(0, limit)
}

const issueContentRows = (issue: IssueItem, width: number, limit: number) => {
	const body = bodyRows(issue, width, limit)
	const remaining = Math.max(0, limit - body.length)
	if (remaining === 0 || issue.timeline.length === 0) return body
	const comments = commentRows(issue.timeline, width, remaining)
	return [...body, ...comments]
}

export const getIssueDetailJunctionRows = (issue: IssueItem | null, paneWidth: number): readonly number[] => {
	if (!issue) return [ISSUE_PLACEHOLDER_ROWS]
	const titleLines = wrapText(issue.title, Math.max(1, paneWidth - 2)).length
	return [1 + titleLines + 2]
}

export const getIssueDetailHeaderHeight = (issue: IssueItem | null, paneWidth: number) => {
	if (!issue) return ISSUE_PLACEHOLDER_ROWS + 1
	const titleLines = wrapText(issue.title, Math.max(1, paneWidth - 2)).length
	const labelsHeight = issue.labels.length > 0 || issue.assignees.length > 0 ? 1 : 0
	return titleLines + 4 + labelsHeight
}

export const getIssueDetailBodyHeight = (issue: IssueItem | null, contentWidth: number, bodyLines = ISSUE_BODY_PREVIEW_LINES) => {
	if (!issue) return bodyLines
	const loadingRow = issue.comments > issue.timeline.length ? 1 : 0
	return issueContentRows(issue, contentWidth, bodyLines).length + loadingRow
}

export const getScrollableIssueBodyHeight = (issue: IssueItem | null, contentWidth: number) =>
	getIssueDetailBodyHeight(issue, contentWidth, ISSUE_BODY_SCROLL_LIMIT)

export const getIssueDetailsPaneHeight = ({
	issue,
	contentWidth,
	bodyLines = ISSUE_BODY_PREVIEW_LINES,
	paneWidth = contentWidth + 2,
}: {
	issue: IssueItem | null
	contentWidth: number
	bodyLines?: number
	paneWidth?: number
}) => issue
	? getIssueDetailHeaderHeight(issue, paneWidth) + getIssueDetailBodyHeight(issue, contentWidth, bodyLines)
	: bodyLines + ISSUE_PLACEHOLDER_ROWS + 1

export const IssueDetailHeader = ({
	issue,
	viewerUsername,
	contentWidth,
	paneWidth,
}: {
	issue: IssueItem
	viewerUsername: string | null
	contentWidth: number
	paneWidth: number
}) => {
	const wrappedTitle = wrapText(issue.title, Math.max(1, paneWidth - 2))
	const opened = formatRelativeDate(issue.createdAt)
	const repo = shortRepoName(issue.repository)
	const author = viewerUsername && issue.author !== viewerUsername ? ` by ${issue.author}` : ""
	const number = String(issue.number)
	const status = issueStateLabel(issue)
	const comments = issue.comments === 1 ? "1 comment" : `${issue.comments} comments`
	const rightSide = `${status}  ${comments}  ${opened}`
	const leftWidth = 1 + number.length + 1 + repo.length + author.length
	const gap = Math.max(2, contentWidth - leftWidth - rightSide.length)

	return (
		<>
			<PaddedRow>
				<TextLine>
					<span fg={colors.count}>#{number}</span>
					<span fg={colors.muted}> {repo}</span>
					{author ? <span fg={colors.muted}>{author}</span> : null}
					<span fg={colors.muted}>{" ".repeat(gap)}</span>
					<span fg={issueStateColor(issue)}>{status}</span>
					<span fg={colors.muted}>  {comments}  {opened}</span>
				</TextLine>
			</PaddedRow>
			<box height={wrappedTitle.length} flexDirection="column" paddingLeft={1} paddingRight={1}>
				{wrappedTitle.map((line, index) => (
					<PlainLine key={index} text={line} bold />
				))}
			</box>
			<PaddedRow>
				<TextLine>
					{issue.labels.length > 0 ? issue.labels.map((label, index) => (
						<Fragment key={label.name}>
							{index > 0 ? <span fg={colors.muted}> </span> : null}
							<span bg={labelColor(label)} fg={labelTextColor(labelColor(label))}> {label.name} </span>
						</Fragment>
					)) : <span fg={colors.muted}>no labels</span>}
				</TextLine>
			</PaddedRow>
			{issue.assignees.length > 0 ? (
				<PaddedRow>
					<TextLine>
						<span fg={colors.muted}>assigned </span>
						<span fg={colors.text}>{fitCell(issue.assignees.map((assignee) => `@${assignee}`).join(" "), contentWidth - 9)}</span>
					</TextLine>
				</PaddedRow>
			) : null}
			<box height={1}><Divider width={paneWidth} /></box>
		</>
	)
}

export const IssueDetailBody = ({
	issue,
	contentWidth,
	bodyLines = ISSUE_BODY_PREVIEW_LINES,
	bodyLineLimit = bodyLines,
	loadingIndicator,
	themeId,
}: {
	issue: IssueItem
	contentWidth: number
	bodyLines?: number
	bodyLineLimit?: number
	loadingIndicator: string
	themeId: ThemeId
}) => {
	const rows = useMemo(
		() => issueContentRows(issue, contentWidth, bodyLineLimit),
		[issue.body, issue.timeline, contentWidth, bodyLineLimit, themeId],
	)

	if (!issue.detailLoaded) {
		const topRows = Math.max(0, Math.floor((bodyLines - 1) / 2))
		const bottomRows = Math.max(0, bodyLines - topRows - 1)
		return (
			<box flexDirection="column" paddingLeft={1} paddingRight={1} height={bodyLines}>
				<Filler rows={topRows} prefix="top" />
				<PlainLine text={fitCell(`${loadingIndicator} Loading issue details`, contentWidth)} fg={colors.muted} />
				<Filler rows={bottomRows} prefix="bottom" />
			</box>
		)
	}

	const showCommentLoading = issue.comments > issue.timeline.length
	return (
		<box flexDirection="column" paddingLeft={1} paddingRight={1} height={rows.length + (showCommentLoading ? 1 : 0)}>
			{rows.map((row) => (
				<PlainLine key={row.key} text={fitCell(row.text, contentWidth)} fg={row.fg} bold={row.bold} />
			))}
			{showCommentLoading ? (
				<PlainLine text={fitCell(`${loadingIndicator} Loading comments...`, contentWidth)} fg={colors.muted} />
			) : null}
		</box>
	)
}

export const IssueDetailsPane = ({
	issue,
	viewerUsername,
	contentWidth,
	bodyLines = ISSUE_BODY_PREVIEW_LINES,
	bodyLineLimit = bodyLines,
	paneWidth = contentWidth + 2,
	placeholderContent,
	loadingIndicator,
	themeId,
}: {
	issue: IssueItem | null
	viewerUsername: string | null
	contentWidth: number
	bodyLines?: number
	bodyLineLimit?: number
	paneWidth?: number
	placeholderContent: DetailPlaceholderContent
	loadingIndicator: string
	themeId: ThemeId
}) => {
	const contentHeight = getIssueDetailsPaneHeight({ issue, contentWidth, bodyLines: bodyLineLimit, paneWidth })

	return (
		<box flexDirection="column" height={contentHeight}>
			{issue ? (
				<>
					<IssueDetailHeader issue={issue} viewerUsername={viewerUsername} contentWidth={contentWidth} paneWidth={paneWidth} />
					<IssueDetailBody issue={issue} contentWidth={contentWidth} bodyLines={bodyLines} bodyLineLimit={bodyLineLimit} loadingIndicator={loadingIndicator} themeId={themeId} />
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
