import { StatusFilter } from "./types";

/**
 * What the timeline is sorted by. "eventdate" places each activity by the date that matters for its type
 * (see DateRule); the others are single activitypointer columns, like in the built-in timeline.
 */
export type SortColumn = "eventdate" | "createdon" | "modifiedon" | "actualend" | "scheduledend" | "scheduledstart" | "senton" | "sortdate";
export type NoteSortColumn = "createdon" | "modifiedon";
export type SortOrder = "desc" | "asc";

export const SORT_COLUMNS: SortColumn[] = ["eventdate", "createdon", "modifiedon", "actualend", "scheduledend", "scheduledstart", "senton", "sortdate"];

/**
 * Which date places an activity on the timeline when sorting by activity date:
 * created = created on; start = scheduled start (meetings);
 * due = due date while open, completion date once closed (tasks, calls);
 * completed = created on while open, completion date once closed.
 */
export type DateRule = "created" | "start" | "due" | "completed";
export const DATE_RULES: DateRule[] = ["created", "start", "due", "completed"];

/** How the feed is ordered: activities and notes can use different date columns, as in the built-in timeline. */
export interface FeedSort {
    activities: SortColumn;
    notes: NoteSortColumn;
    order: SortOrder;
}
export type Density = "comfortable" | "compact";

export type TypeColor =
    | "blue" | "green" | "marigold" | "grape" | "teal" | "cranberry" | "steel"
    | "pumpkin" | "lavender" | "forest" | "cornflower" | "brown" | "pink" | "anchor";

export type TypeIconName =
    | "mail" | "call" | "task" | "calendar" | "note" | "service" | "chat" | "document"
    | "person" | "megaphone" | "box" | "wrench" | "star" | "receipt" | "shield";

export interface TypeStyle {
    color?: TypeColor;
    icon?: TypeIconName;
    /** Overrides the table display name */
    label?: string;
}

/** Shape of the optional JSON in the "Advanced configuration" property. */
export interface AdvancedConfig {
    /** Columns shown in the preview panel, per table. Example: { "task": ["scheduledend", "prioritycode", "ownerid"] } */
    previewColumns?: Record<string, string[]>;
    /** Colour, icon and label per table. Example: { "new_message": { "color": "teal", "icon": "chat" } } */
    typeStyles?: Record<string, TypeStyle>;
    /** Date rule per table when sorting by activity date. Example: { "new_servicevisit": "start" } */
    dateRules?: Record<string, DateRule>;
    /** Filters applied when the timeline opens */
    defaultFilters?: { types?: string[]; status?: StatusFilter; onlyMine?: boolean };
    /** Number of weeks of history in the activity rhythm (8–52). Default 12. */
    rhythmWeeks?: number;
    /** Hide the inline note composer even when notes are shown */
    hideNoteComposer?: boolean;
    /** Show remote images in email bodies without asking. Default false. */
    loadRemoteImages?: boolean;
}

export interface TimelineConfig {
    /** Activity logical names, or ["*"] for every activity type */
    activityTypes: string[];
    includeNotes: boolean;
    includeParties: boolean;
    sortBy: SortColumn;
    notesSortBy: NoteSortColumn;
    sortOrder: SortOrder;
    createTypes: string[];
    pageSize: number;
    /** Fixed height in px with its own scroll; 0 = grow with the content */
    height: number;
    density: Density;
    showOverview: boolean;
    threadEmails: boolean;
    advanced: AdvancedConfig;
    /** Problems found while reading the configuration, shown to makers */
    warnings: string[];
}

const DEFAULT_TYPES = ["email", "phonecall", "task", "appointment"];

export interface RawConfig {
    activityTypes?: string | null;
    includeNotes?: string | null;
    relatedScope?: string | null;
    sortBy?: string | null;
    notesSortBy?: string | null;
    sortOrder?: string | null;
    createTypes?: string | null;
    pageSize?: number | null;
    height?: number | null;
    density?: string | null;
    showOverview?: string | null;
    threadEmails?: string | null;
    advancedConfig?: string | null;
}

function parseList(value: string | null | undefined, fallback: string[]): string[] {
    if (value === null || value === undefined || value.trim() === "") {
        return fallback;
    }
    const list = value
        .split(/[,;\s]+/)
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 0);
    return list.length > 0 ? Array.from(new Set(list)) : fallback;
}

function flag(value: string | null | undefined, fallback: boolean): boolean {
    if (value === "1" || value === "yes" || value === "true") return true;
    if (value === "0" || value === "no" || value === "false") return false;
    return fallback;
}

function clamp(value: number | null | undefined, min: number, max: number, fallback: number): number {
    if (value === null || value === undefined || isNaN(value) || value <= 0) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(value)));
}

export function parseConfig(raw: RawConfig): TimelineConfig {
    const warnings: string[] = [];

    let advanced: AdvancedConfig = {};
    const json = raw.advancedConfig?.trim();
    // The test harness fills empty inputs with the placeholder "val"
    if (json && json !== "val") {
        try {
            const parsed = JSON.parse(json) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                advanced = parsed as AdvancedConfig;
            } else {
                warnings.push("Advanced configuration must be a JSON object.");
            }
        } catch (e) {
            warnings.push(`Advanced configuration isn't valid JSON: ${(e as Error).message}`);
        }
    }

    const sortBy = SORT_COLUMNS.find((c) => c === raw.sortBy) ?? "eventdate";

    for (const [entity, rule] of Object.entries(advanced.dateRules ?? {})) {
        if (!DATE_RULES.includes(rule)) {
            warnings.push(`Unknown date rule "${String(rule)}" for ${entity}. Use one of: ${DATE_RULES.join(", ")}.`);
            delete advanced.dateRules?.[entity];
        }
    }

    return {
        activityTypes: parseList(raw.activityTypes === "val" ? null : raw.activityTypes, DEFAULT_TYPES),
        includeNotes: flag(raw.includeNotes, true),
        includeParties: raw.relatedScope !== "regarding",
        sortBy,
        // The built-in timeline sorts notes by modified on unless told otherwise
        notesSortBy: raw.notesSortBy === "createdon" ? "createdon" : "modifiedon",
        sortOrder: raw.sortOrder === "asc" ? "asc" : "desc",
        createTypes: parseList(raw.createTypes === "val" ? null : raw.createTypes, DEFAULT_TYPES),
        pageSize: clamp(raw.pageSize, 5, 100, 20),
        // 0 or empty: grow with the content and let the page scroll, like the built-in timeline
        height: raw.height && raw.height > 0 ? clamp(raw.height, 240, 4000, 760) : 0,
        density: raw.density === "compact" ? "compact" : "comfortable",
        showOverview: flag(raw.showOverview, true),
        threadEmails: flag(raw.threadEmails, true),
        advanced,
        warnings,
    };
}

export function allowsAllTypes(config: TimelineConfig): boolean {
    return config.activityTypes.includes("*");
}
