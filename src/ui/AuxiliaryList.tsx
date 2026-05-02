import { TextAttributes } from "@opentui/core"
import type { AuxiliaryItem, AuxiliarySurface, LoadStatus } from "../domain.js"
import { surfaceShortLabels } from "../domain.js"
import { formatRelativeDate } from "../date.js"
import { colors } from "./colors.js"
import { repoColor } from "./pullRequests.js"
import { fitCell, PlainLine, SectionTitle, TextLine } from "./primitives.js"

export type AuxiliaryGroups = Array<[string, AuxiliaryItem[]]>

export type AuxiliaryListRow =
	| { readonly _tag: "title" }
	| { readonly _tag: "filter" }
	| { readonly _tag: "message"; readonly text: string; readonly color: string }
	| { readonly _tag: "group"; readonly label: string; readonly items: readonly AuxiliaryItem[] }
	| { readonly _tag: "item"; readonly item: AuxiliaryItem }

const surfaceTitle = (surface: AuxiliarySurface) => surfaceShortLabels[surface].toUpperCase()

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

const GroupTitle = ({ label, filterText }: { label: string; filterText: string }) => (
	<TextLine>
		<span fg={repoColor(label)}>* </span>
		<span fg={repoColor(label)} attributes={TextAttributes.BOLD}><MatchedCell text={label} width={label.length} query={filterText} /></span>
	</TextLine>
)

export const buildAuxiliaryListRows = ({
	surface,
	groups,
	status,
	error,
	filterText,
	showFilterBar,
}: {
	readonly surface: AuxiliarySurface
	readonly groups: AuxiliaryGroups
	readonly status: LoadStatus
	readonly error: string | null
	readonly filterText: string
	readonly showFilterBar: boolean
}): readonly AuxiliaryListRow[] => {
	const itemCount = groups.reduce((count, [, items]) => count + items.length, 0)
	const label = surfaceShortLabels[surface]
	const rows: AuxiliaryListRow[] = [{ _tag: "title" }]
	if (showFilterBar) rows.push({ _tag: "filter" })
	if (status === "loading" && itemCount === 0) rows.push({ _tag: "message", text: `- Loading ${label}...`, color: colors.muted })
	if (status === "error") rows.push({ _tag: "message", text: `- ${error ?? `Could not load ${label}.`}`, color: colors.error })
	if (status === "ready" && itemCount === 0) rows.push({ _tag: "message", text: filterText.length > 0 ? `- No matching ${label}.` : `- No ${label}.`, color: colors.muted })
	for (const [group, items] of groups) {
		rows.push({ _tag: "group", label: group, items })
		for (const item of items) rows.push({ _tag: "item", item })
	}
	return rows
}

export const auxiliaryListRowIndex = (rows: readonly AuxiliaryListRow[], id: string | null) => {
	if (!id) return null
	const index = rows.findIndex((row) => row._tag === "item" && row.item.id === id)
	return index >= 0 ? index : null
}

const itemIndicator = (item: AuxiliaryItem) => {
	if (item.surface === "notifications") return item.state === "unread" ? "!" : "o"
	if (item.surface === "discussions") return "#"
	if (item.surface === "stars") return "*"
	if (item.surface === "watchedRepos") return "w"
	return "+"
}

const indicatorColor = (item: AuxiliaryItem) => {
	if (item.surface === "notifications" && item.state === "unread") return colors.status.pending
	if (item.surface === "stars") return colors.status.pending
	if (item.surface === "watchedRepos") return colors.status.passing
	if (item.surface === "sharedRepos") return colors.accent
	return colors.count
}

const AuxiliaryRow = ({
	item,
	selected,
	contentWidth,
	filterText,
	onSelect,
}: {
	item: AuxiliaryItem
	selected: boolean
	contentWidth: number
	filterText: string
	onSelect: () => void
}) => {
	const updatedText = item.updatedAt ? formatRelativeDate(item.updatedAt) : ""
	const updatedWidth = updatedText.length > 0 ? Math.min(14, Math.max(5, updatedText.length + 1)) : 0
	const typeText = item.state ?? item.itemType
	const typeWidth = Math.min(16, Math.max(0, typeText.length + 1))
	const fixedWidth = 2 + typeWidth + updatedWidth
	const titleWidth = Math.max(8, contentWidth - fixedWidth)
	const rowFg = selected ? colors.selectedText : colors.text

	return (
		<box width={contentWidth} height={1} onMouseDown={onSelect}>
			<TextLine width={contentWidth} fg={rowFg} bg={selected ? colors.selectedBg : undefined}>
				<span fg={indicatorColor(item)}>{itemIndicator(item)}</span>
				<span> </span>
				<span><MatchedCell text={item.title} width={titleWidth} query={filterText} /></span>
				{typeWidth > 0 ? <span fg={colors.count}>{fitCell(typeText, typeWidth, "right")}</span> : null}
				{updatedWidth > 0 ? <span fg={colors.muted}>{fitCell(updatedText, updatedWidth, "right")}</span> : null}
			</TextLine>
		</box>
	)
}

export const AuxiliaryList = ({
	surface,
	groups,
	selectedId,
	status,
	error,
	contentWidth,
	filterText,
	showFilterBar,
	isFilterEditing,
	onSelectItem,
}: {
	surface: AuxiliarySurface
	groups: AuxiliaryGroups
	selectedId: string | null
	status: LoadStatus
	error: string | null
	contentWidth: number
	filterText: string
	showFilterBar: boolean
	isFilterEditing: boolean
	onSelectItem: (id: string) => void
}) => {
	const rows = buildAuxiliaryListRows({ surface, groups, status, error, filterText, showFilterBar })

	return (
		<box width={contentWidth} flexDirection="column">
			{rows.map((row, index) => {
				if (row._tag === "title") return <SectionTitle key="title" title={surfaceTitle(surface)} />
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
				if (row._tag === "group") return <GroupTitle key={`group-${row.label}`} label={row.label} filterText={filterText} />
				return (
					<AuxiliaryRow
						key={row.item.id}
						item={row.item}
						selected={row.item.id === selectedId}
						contentWidth={contentWidth}
						filterText={filterText}
						onSelect={() => onSelectItem(row.item.id)}
					/>
				)
			})}
		</box>
	)
}
