export type ItemKind = "activity" | "note";

/** Normalised lifecycle state. Dataverse statecodes differ per activity type, so everything is mapped to these. */
export type ItemState = "open" | "scheduled" | "completed" | "canceled";

export type Direction = "in" | "out";

export interface PartyRef {
    id?: string;
    entity?: string;
    name: string;
    address?: string;
}

export interface AttachmentRef {
    id: string;
    /** Logical name of the table that holds the file body: activitymimeattachment or annotation. */
    entity: "activitymimeattachment" | "annotation";
    fileName: string;
    mimeType?: string;
    size?: number;
    contentId?: string;
}

export interface TimelineItem {
    /** Unique across tables: `${entity}:${id}` */
    key: string;
    id: string;
    /** Logical name, e.g. email, task, annotation, new_message */
    entity: string;
    kind: ItemKind;
    /** Localised table name from Dataverse, e.g. "E-post" */
    typeLabel: string;
    title: string;
    /** Plain-text excerpt with quoted replies removed */
    snippet?: string;
    /** Raw description / note text. HTML for emails and rich text notes. */
    body?: string;
    bodyIsHtml?: boolean;

    /** The date the timeline is sorted and grouped by */
    date: Date;
    /** Column the date came from, e.g. scheduledstart or modifiedon; createdon when that column was empty */
    dateField: string;
    createdOn: Date;
    modifiedOn?: Date;
    scheduledStart?: Date;
    scheduledEnd?: Date;
    actualEnd?: Date;
    durationMinutes?: number;

    state: ItemState;
    /** Status reason value; its label depends on the activity's own table */
    statusCode?: number;
    statusLabel?: string;
    isOverdue: boolean;
    priority?: "low" | "normal" | "high";
    priorityLabel?: string;

    owner?: PartyRef;
    createdBy?: PartyRef;
    from: PartyRef[];
    to: PartyRef[];
    cc: PartyRef[];
    attendees: PartyRef[];
    direction?: Direction;

    attachmentCount?: number;
    /** Notes carry their file directly */
    file?: AttachmentRef;

    /** Normalised subject used to group emails into conversations */
    threadKey?: string;
}

/** A feed entry is either a single item or an email conversation. */
export type FeedEntry =
    | { type: "item"; key: string; item: TimelineItem }
    | { type: "thread"; key: string; items: TimelineItem[]; /** Where the conversation sits: its newest message, or oldest when sorted oldest first */ date: Date };

export type StatusFilter = "all" | "open" | "overdue" | "completed";
export type DateFilter =
    | { kind: "any" }
    | { kind: "last"; days: number }
    | { kind: "range"; from: Date; to: Date; label: string };

export interface TimelineFilters {
    /** Empty = all configured types */
    types: string[];
    status: StatusFilter;
    date: DateFilter;
    search: string;
    onlyMine: boolean;
}

export const emptyFilters: TimelineFilters = {
    types: [],
    status: "all",
    date: { kind: "any" },
    search: "",
    onlyMine: false,
};

/** Totals for the whole record, counted by Dataverse without loading the items */
export interface Counts {
    total: number;
    byType: { entity: string; label: string; count: number }[];
    open: number;
    overdue: number;
}

/** One item in the activity-per-week chart: its type and the date it sits at in the feed */
export interface RhythmRow {
    entity: string;
    date: Date;
}

export interface PreviewField {
    name: string;
    label: string;
    value: string;
}

export interface ItemDetails {
    fields: PreviewField[];
    attachments: AttachmentRef[];
    /** Full body, when the list query didn't return it */
    body?: string;
    bodyIsHtml?: boolean;
}

export interface PageResult {
    items: TimelineItem[];
    hasMore: boolean;
}

export interface RecordContext {
    entity: string;
    id: string;
    name: string;
}

export interface ActivityTypeInfo {
    entity: string;
    label: string;
}
