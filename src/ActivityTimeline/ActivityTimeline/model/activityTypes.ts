import { DateRule, TimelineConfig, TypeColor, TypeIconName, TypeStyle } from "./config";
import { ItemState, StateLabels, StatusOption, TimelineItem } from "./types";

/** Which dates can be changed right in the preview: a due date, a start and end, or none */
export type QuickEdit = "due" | "span" | "text";

interface KnownType {
    color: TypeColor;
    icon: TypeIconName;
    /** Columns shown in the preview panel when the maker hasn't configured any */
    previewColumns: string[];
    canComplete: boolean;
    /** Date that places it on the timeline when sorting by activity date; default created */
    dateRule?: DateRule;
    /** Simple enough to edit in the preview; everything else opens its form */
    quickEdit?: QuickEdit;
}

const KNOWN: Record<string, KnownType> = {
    email: { color: "blue", icon: "mail", previewColumns: [], canComplete: false },
    // Due dates, start/end times and duration are shown by the preview's schedule section, so they aren't listed here
    phonecall: { color: "green", icon: "call", previewColumns: ["phonenumber", "prioritycode", "ownerid"], canComplete: true, dateRule: "due", quickEdit: "due" },
    task: { color: "pumpkin", icon: "task", previewColumns: ["prioritycode", "percentcomplete", "ownerid"], canComplete: true, dateRule: "due", quickEdit: "due" },
    appointment: { color: "grape", icon: "calendar", previewColumns: ["location", "isalldayevent", "ownerid"], canComplete: true, dateRule: "start", quickEdit: "span" },
    serviceappointment: { color: "teal", icon: "service", previewColumns: ["location", "ownerid"], canComplete: false, dateRule: "start" },
    recurringappointmentmaster: { color: "grape", icon: "calendar", previewColumns: ["location", "ownerid"], canComplete: false, dateRule: "start" },
    letter: { color: "brown", icon: "document", previewColumns: ["address", "ownerid"], canComplete: true, dateRule: "due" },
    fax: { color: "anchor", icon: "document", previewColumns: ["faxnumber", "ownerid"], canComplete: true, dateRule: "due" },
    socialactivity: { color: "cornflower", icon: "megaphone", previewColumns: ["community", "ownerid"], canComplete: false },
    campaignactivity: { color: "pink", icon: "megaphone", previewColumns: ["ownerid"], canComplete: false },
    campaignresponse: { color: "pink", icon: "megaphone", previewColumns: ["responsecode", "receivedon", "ownerid"], canComplete: false },
    incidentresolution: { color: "forest", icon: "shield", previewColumns: ["timespent", "ownerid"], canComplete: false },
    opportunityclose: { color: "forest", icon: "receipt", previewColumns: ["actualrevenue", "actualend", "ownerid"], canComplete: false },
    quoteclose: { color: "forest", icon: "receipt", previewColumns: ["ownerid"], canComplete: false },
    orderclose: { color: "forest", icon: "receipt", previewColumns: ["ownerid"], canComplete: false },
    annotation: { color: "marigold", icon: "note", previewColumns: [], canComplete: false, quickEdit: "text" },
};

/** Colours handed out to custom activity types, in order of a stable hash of the logical name */
const CUSTOM_COLORS: TypeColor[] = ["teal", "cranberry", "cornflower", "lavender", "steel", "forest", "brown", "pink"];

const DEFAULT_CUSTOM_PREVIEW = ["ownerid", "prioritycode"];

function hash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = (h * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

export interface ResolvedTypeStyle {
    color: TypeColor;
    icon: TypeIconName;
    label?: string;
}

export function typeStyle(entity: string, config: TimelineConfig): ResolvedTypeStyle {
    const custom: TypeStyle | undefined = config.advanced.typeStyles?.[entity];
    const known = KNOWN[entity];
    return {
        color: custom?.color ?? known?.color ?? CUSTOM_COLORS[hash(entity) % CUSTOM_COLORS.length],
        icon: custom?.icon ?? known?.icon ?? "chat",
        label: custom?.label,
    };
}

export function previewColumns(entity: string, config: TimelineConfig): string[] {
    const configured = config.advanced.previewColumns?.[entity];
    if (configured && configured.length > 0) return configured.map((c) => c.toLowerCase());
    return KNOWN[entity]?.previewColumns ?? DEFAULT_CUSTOM_PREVIEW;
}

export function canComplete(entity: string): boolean {
    // Custom activity types can be completed; emails and system activities can't from here
    return KNOWN[entity]?.canComplete ?? true;
}

export function mapState(statecode: number | undefined): ItemState {
    switch (statecode) {
        case 1: return "completed";
        case 2: return "canceled";
        case 3: return "scheduled";
        default: return "open";
    }
}

/**
 * Adds what shows beside the status word. Only open work has one, only where its state has several reasons to tell
 * apart (a task in progress or waiting), and not when the reason just repeats the word.
 */
export function withStatusDetails(statuses: StatusOption[], words: StateLabels): StatusOption[] {
    return statuses.map((s) => {
        const state = mapState(s.state);
        const open = state === "open" || state === "scheduled";
        const several = statuses.filter((o) => o.state === s.state).length > 1;
        return { ...s, detail: open && several && s.label.toLowerCase() !== words[state]?.toLowerCase() ? s.label : undefined };
    });
}

export function mapPriority(code: number | undefined): TimelineItem["priority"] {
    if (code === 0) return "low";
    if (code === 2) return "high";
    if (code === 1) return "normal";
    return undefined;
}

export function quickEdit(entity: string): QuickEdit | undefined {
    return KNOWN[entity]?.quickEdit;
}

/** Closed activities are read-only in Dataverse, so they can't be edited anywhere. Notes have no state and always can. */
export function canEdit(item: Pick<TimelineItem, "kind" | "state">): boolean {
    return item.kind === "note" || item.state === "open" || item.state === "scheduled";
}

/** The date rule for a table: the maker's choice, the built-in default, or created on */
export function dateRule(entity: string, config: TimelineConfig): DateRule {
    return config.advanced.dateRules?.[entity] ?? KNOWN[entity]?.dateRule ?? "created";
}

/** Every table with a rule other than created, so timelines showing all types can split their queries by rule */
export function ruledTypes(config: TimelineConfig): Map<string, DateRule> {
    const map = new Map<string, DateRule>();
    for (const [entity, known] of Object.entries(KNOWN)) {
        if (known.dateRule) map.set(entity, known.dateRule);
    }
    for (const [entity, rule] of Object.entries(config.advanced.dateRules ?? {})) {
        if (rule === "created") map.delete(entity);
        else map.set(entity, rule);
    }
    return map;
}

interface DatedFields {
    state: ItemState;
    createdOn: Date;
    scheduledStart?: Date;
    scheduledEnd?: Date;
    actualEnd?: Date;
}

/**
 * The date an activity sits at when sorting by activity date, and the column it came from.
 * Matches how DataverseDataSource splits its queries: a missing date falls back to created on.
 */
export function eventDate(item: DatedFields, rule: DateRule): { date: Date; field: string } {
    const closed = item.state === "completed" || item.state === "canceled";
    if (rule === "start" && item.scheduledStart) return { date: item.scheduledStart, field: "scheduledstart" };
    if (rule === "due" && !closed && item.scheduledEnd) return { date: item.scheduledEnd, field: "scheduledend" };
    if ((rule === "due" || rule === "completed") && closed && item.actualEnd) return { date: item.actualEnd, field: "actualend" };
    return { date: item.createdOn, field: "createdon" };
}
