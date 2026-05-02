import type { IssueItem } from "../domain.js"
import { colors } from "./colors.js"

export const issueStateIcon = (issue: IssueItem) => issue.state === "open" ? "●" : "×"

export const issueStateLabel = (issue: IssueItem) => issue.state === "open" ? "open" : "closed"

export const issueStateColor = (issue: IssueItem) => issue.state === "open" ? colors.status.passing : colors.muted

export interface IssueRowDisplay {
	readonly indicatorFg: string
	readonly rowFg: string
	readonly numberFg: string
	readonly metaFg: string
	readonly metaText: string
}

export const issueRowDisplay = (issue: IssueItem, selected: boolean): IssueRowDisplay => {
	const isClosed = issue.state === "closed"
	const metaText = issue.comments > 0 ? `${issue.comments} comments` : issue.assignees.length > 0 ? `@${issue.assignees[0]}` : ""
	return {
		indicatorFg: issueStateColor(issue),
		rowFg: selected ? colors.selectedText : isClosed ? colors.muted : colors.text,
		numberFg: selected ? colors.accent : isClosed ? colors.muted : colors.count,
		metaFg: isClosed ? colors.muted : colors.status.pending,
		metaText,
	}
}
