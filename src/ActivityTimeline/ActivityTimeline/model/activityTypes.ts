import { DateRule, TimelineConfig, TypeColor, TypeIconName, TypeStyle } from "./config";
import { ItemState } from "./types";

interface KnownType {
    color: TypeColor;
    icon: TypeIconName;
    /** Columns shown in the preview panel when the maker hasn't configured any */
    previewColumns: string[];
    /** statuscode to set when the user marks the activity complete; undefined = platform default */
    completedStatus?: number;
    canComplete: boolean;
    /** Date that places it on the timeline when sorting by activity date; default created */
    dateRule?: DateRule;
}

const KNOWN: Record<string, KnownType> = {
    email: { color: "blue", icon: "mail", previewColumns: [], canComplete: false },
    // Due dates, start/end times and duration are shown by the preview's schedule section, so they aren't listed here
    phonecall: { color: "green", icon: "call", previewColumns: ["phonenumber", "prioritycode", "ownerid"], completedStatus: 2, canComplete: true, dateRule: "due" },
    task: { color: "pumpkin", icon: "task", previewColumns: ["prioritycode", "percentcomplete", "ownerid"], completedStatus: 5, canComplete: true, dateRule: "due" },
    appointment: { color: "grape", icon: "calendar", previewColumns: ["location", "isalldayevent", "ownerid"], completedStatus: 3, canComplete: true, dateRule: "start" },
    serviceappointment: { color: "teal", icon: "service", previewColumns: ["location", "ownerid"], canComplete: false, dateRule: "start" },
    recurringappointmentmaster: { color: "grape", icon: "calendar", previewColumns: ["location", "ownerid"], canComplete: false, dateRule: "start" },
    letter: { color: "brown", icon: "document", previewColumns: ["address", "ownerid"], completedStatus: 4, canComplete: true, dateRule: "due" },
    fax: { color: "anchor", icon: "document", previewColumns: ["faxnumber", "ownerid"], completedStatus: 3, canComplete: true, dateRule: "due" },
    socialactivity: { color: "cornflower", icon: "megaphone", previewColumns: ["community", "ownerid"], canComplete: false },
    campaignactivity: { color: "pink", icon: "megaphone", previewColumns: ["ownerid"], canComplete: false },
    campaignresponse: { color: "pink", icon: "megaphone", previewColumns: ["responsecode", "receivedon", "ownerid"], canComplete: false },
    incidentresolution: { color: "forest", icon: "shield", previewColumns: ["timespent", "ownerid"], canComplete: false },
    opportunityclose: { color: "forest", icon: "receipt", previewColumns: ["actualrevenue", "actualend", "ownerid"], canComplete: false },
    quoteclose: { color: "forest", icon: "receipt", previewColumns: ["ownerid"], canComplete: false },
    orderclose: { color: "forest", icon: "receipt", previewColumns: ["ownerid"], canComplete: false },
    annotation: { color: "marigold", icon: "note", previewColumns: [], canComplete: false },
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

export function completedStatus(entity: string): number | undefined {
    return KNOWN[entity]?.completedStatus;
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
