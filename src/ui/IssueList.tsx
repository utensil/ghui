import { TextAttributes } from "@opentui/core"
import type { IssueItem, LoadStatus } from "../domain.js"
import { formatRelativeDate } from "../date.js"
import { colors } from "./colors.js"
import { issueRowDisplay, issueStateIcon } from "./issues.js"
import { labelColor, repoColor, repositoryOwner, shortRepoName } from "./pullRequests.js"
import { fitCell, PlainLine, SectionTitle, TextLine } from "./primitives.js"

export type IssueGroups = Array<[string, IssueItem[]]>

export type IssueListRow =
	| { readonly _tag: "title" }
	| { readonly _tag: "filter" }
	| { readonly _tag: "message"; readonly text: string; readonly color: string }
	| { readonly _tag: "owner"; readonly owner: string }
	| { readonly _tag: "group"; readonly repository: string; readonly issues: readonly IssueItem[] }
	| { readonly _tag: "issue"; readonly issue: IssueItem; readonly groupIssues: readonly IssueItem[] }
	| { readonly _tag: "load-more"; readonly text: string }

const GROUP_ICON = "◆"

const groupNumberWidth = (issues: readonly IssueItem[]) => {
	if (issues.length === 0) return 4
	const maxLen = Math.max(...issues.map((issue) => String(issue.number).length))
	return maxLen + 1
}

const MatchedCell = ({ text, width, query, align = "left" }: { text: string; width: number; query: string; align?: "left" | "right" }) => {
	const fitted = fitCell(text, width, align)
	const needle = query.trim().toLowerCase()
	const index = needle.length > 0 ? fitted.toLowerCase().indexOf(needle) : -1
	if (index < 0) return <span>{fitted}</span>

	const end = Math.min(fitted.length, index + needle.length)
	return (
		<>
			{index > 0 ? <span>{fitted.slice(0, index)}</span> : null}
			<span fg={colors.accent} attributes={TextAttributes.BOLD}>{fitted.slice(index, end)}</span>
			{end < fitted.length ? <span>{fitted.slice(end)}</span> : null}
		</>
	)
}

const GroupTitle = ({ label, color, filterText }: { label: string; color: string; filterText: string }) => (
	<TextLine>
		<span fg={color}>{GROUP_ICON} </span>
		<span fg={color} attributes={TextAttributes.BOLD}><MatchedCell text={label} width={label.length} query={filterText} /></span>
	</TextLine>
)

const RepositoryTitle = ({ repository, filterText }: { repository: string; filterText: string }) => {
	const label = shortRepoName(repository)
	return (
		<TextLine>
			<span fg={repoColor(repository)}>  * </span>
			<span fg={repoColor(repository)} attributes={TextAttributes.BOLD}><MatchedCell text={label} width={label.length} query={filterText} /></span>
		</TextLine>
	)
}

export const buildIssueListRows = ({
	groups,
	status,
	error,
	filterText,
	showFilterBar,
	loadedCount,
	hasMore,
	isLoadingMore,
}: {
	readonly groups: IssueGroups
	readonly status: LoadStatus
	readonly error: string | null
	readonly filterText: string
	readonly showFilterBar: boolean
	readonly loadedCount: number
	readonly hasMore: boolean
	readonly isLoadingMore: boolean
}): readonly IssueListRow[] => {
	const itemCount = groups.reduce((count, [, issues]) => count + issues.length, 0)
	const rows: IssueListRow[] = [{ _tag: "title" }]
	if (showFilterBar) rows.push({ _tag: "filter" })
	if (status === "loading" && itemCount === 0) rows.push({ _tag: "message", text: "- Loading issues...", color: colors.muted })
	if (status === "error") rows.push({ _tag: "message", text: `- ${error ?? "Could not load issues."}`, color: colors.error })
	if (status === "ready" && itemCount === 0) rows.push({ _tag: "message", text: filterText.length > 0 ? "- No matching issues." : "- No open issues.", color: colors.muted })
	let currentOwner: string | null = null
	for (const [repository, issues] of groups) {
		const owner = repositoryOwner(repository)
		if (owner !== currentOwner) {
			rows.push({ _tag: "owner", owner })
			currentOwner = owner
		}
		rows.push({ _tag: "group", repository, issues })
		for (const issue of issues) rows.push({ _tag: "issue", issue, groupIssues: issues })
	}
	if (status === "ready" && itemCount > 0 && (hasMore || isLoadingMore)) {
		rows.push({ _tag: "load-more", text: isLoadingMore ? `- Loading more issues... (${loadedCount} loaded)` : `- ${loadedCount} loaded, more available` })
	}
	return rows
}

export const issueListRowIndex = (rows: readonly IssueListRow[], url: string | null) => {
	if (!url) return null
	const index = rows.findIndex((row) => row._tag === "issue" && row.issue.url === url)
	return index >= 0 ? index : null
}

const labelSummary = (issue: IssueItem, width: number) => {
	if (issue.labels.length === 0 || width <= 0) return null
	const names = issue.labels.slice(0, 3).map((label) => label.name).join(" ")
	return fitCell(names, width)
}

const IssueRow = ({
	issue,
	selected,
	contentWidth,
	numWidth,
	filterText,
	onSelect,
}: {
	issue: IssueItem
	selected: boolean
	contentWidth: number
	numWidth: number
	filterText: string
	onSelect: () => void
}) => {
	const display = issueRowDisplay(issue, selected)
	const indicatorWidth = 1
	const metaWidth = Math.min(14, Math.max(0, display.metaText.length))
	const updatedText = formatRelativeDate(issue.updatedAt)
	const updatedWidth = Math.min(14, Math.max(5, updatedText.length + 1))
	const fixedWidth = indicatorWidth + 1 + numWidth + 1 + metaWidth + updatedWidth
	const titleWidth = Math.max(8, contentWidth - fixedWidth)
	const labelWidth = Math.max(0, Math.min(20, titleWidth - issue.title.length - 2))
	const labels = labelSummary(issue, labelWidth)
	const fillerWidth = Math.max(0, contentWidth - fixedWidth - titleWidth)

	return (
		<box width={contentWidth} height={1} onMouseDown={onSelect}>
			<TextLine width={contentWidth} fg={display.rowFg} bg={selected ? colors.selectedBg : undefined}>
				<span fg={display.indicatorFg}>{fitCell(issueStateIcon(issue), indicatorWidth)}</span>
				<span> </span>
				<span fg={display.numberFg}><MatchedCell text={`#${issue.number}`} width={numWidth} query={filterText} align="right" /></span>
				<span> </span>
				<span><MatchedCell text={issue.title} width={labels ? Math.max(8, titleWidth - labelWidth - 1) : titleWidth} query={filterText} /></span>
				{labels ? (
					<>
						<span> </span>
						<span fg={labelColor(issue.labels[0]!)}>{labels}</span>
					</>
				) : null}
				{metaWidth > 0 ? <span fg={display.metaFg}>{fitCell(display.metaText, metaWidth, "right")}</span> : null}
				<span fg={colors.muted}>{fitCell(updatedText, updatedWidth, "right")}</span>
				{fillerWidth > 0 ? <span>{" ".repeat(fillerWidth)}</span> : null}
			</TextLine>
		</box>
	)
}

export const IssueList = ({
	groups,
	selectedUrl,
	status,
	error,
	contentWidth,
	filterText,
	showFilterBar,
	isFilterEditing,
	loadedCount,
	hasMore,
	isLoadingMore,
	onSelectIssue,
}: {
	groups: IssueGroups
	selectedUrl: string | null
	status: LoadStatus
	error: string | null
	contentWidth: number
	filterText: string
	showFilterBar: boolean
	isFilterEditing: boolean
	loadedCount: number
	hasMore: boolean
	isLoadingMore: boolean
	onSelectIssue: (url: string) => void
}) => {
	const rows = buildIssueListRows({ groups, status, error, filterText, showFilterBar, loadedCount, hasMore, isLoadingMore })

	return (
		<box width={contentWidth} flexDirection="column">
			{rows.map((row, index) => {
				if (row._tag === "title") return <SectionTitle key="title" title="ISSUES" />
				if (row._tag === "filter") {
					return (
						<TextLine key="filter">
							<span fg={colors.count}>/</span>
							<span fg={colors.muted}> </span>
							<span fg={isFilterEditing ? colors.text : colors.count}>{filterText.length > 0 ? filterText : "type to filter..."}</span>
						</TextLine>
					)
				}
				if (row._tag === "message") return <PlainLine key={`message-${index}`} text={row.text} fg={row.color} />
				if (row._tag === "load-more") return <PlainLine key="load-more" text={row.text} fg={colors.muted} />
				if (row._tag === "owner") return <GroupTitle key={`owner-${row.owner}`} label={row.owner} color={repoColor(row.owner)} filterText={filterText} />
				if (row._tag === "group") return <RepositoryTitle key={`group-${row.repository}`} repository={row.repository} filterText={filterText} />

				const numWidth = groupNumberWidth(row.groupIssues)
				return (
					<IssueRow
						key={row.issue.url}
						issue={row.issue}
						selected={row.issue.url === selectedUrl}
						contentWidth={contentWidth}
						numWidth={numWidth}
						filterText={filterText}
						onSelect={() => onSelectIssue(row.issue.url)}
					/>
				)
			})}
		</box>
	)
}
