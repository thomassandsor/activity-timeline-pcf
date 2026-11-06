import { DateEnv, dayKey, weekStartWall, DAY_MS, toWall } from "./dates";
import { SortOrder } from "./config";
import { FeedEntry, ItemState, RhythmRow, TimelineItem } from "./types";

export interface DayGroup {
    key: string;
    date: Date;
    entries: FeedEntry[];
}

export function byDateDesc(a: { date: Date }, b: { date: Date }): number {
    return b.date.getTime() - a.date.getTime();
}

export function compareByDate(order: SortOrder): (a: { date: Date }, b: { date: Date }) => number {
    return order === "asc" ? (a, b) => a.date.getTime() - b.date.getTime() : byDateDesc;
}

/**
 * Groups emails that share a normalised subject into conversations, messages newest first.
 * A conversation sits at its newest message, or its oldest when the feed is oldest first.
 */
export function buildEntries(items: TimelineItem[], threadEmails: boolean, order: SortOrder = "desc"): FeedEntry[] {
    const sorted = [...items].sort(compareByDate(order));
    if (!threadEmails) {
        return sorted.map((item) => ({ type: "item", key: item.key, item }));
    }
    const threads = new Map<string, TimelineItem[]>();
    for (const item of [...items].sort(byDateDesc)) {
        if (item.entity === "email" && item.threadKey) {
            const list = threads.get(item.threadKey) ?? [];
            list.push(item);
            threads.set(item.threadKey, list);
        }
    }
    const entries: FeedEntry[] = [];
    const placed = new Set<string>();
    for (const item of sorted) {
        if (placed.has(item.key)) continue;
        const thread = item.entity === "email" && item.threadKey ? threads.get(item.threadKey) : undefined;
        if (thread && thread.length > 1) {
            thread.forEach((t) => placed.add(t.key));
            entries.push({ type: "thread", key: `thread:${item.threadKey ?? item.key}`, items: thread, date: item.date });
        } else {
            placed.add(item.key);
            entries.push({ type: "item", key: item.key, item });
        }
    }
    return entries;
}

export function entryDate(entry: FeedEntry): Date {
    return entry.type === "item" ? entry.item.date : entry.date;
}

export function groupByDay(env: DateEnv, entries: FeedEntry[]): DayGroup[] {
    const groups: DayGroup[] = [];
    let current: DayGroup | undefined;
    for (const entry of entries) {
        const date = entryDate(entry);
        const key = dayKey(env, date);
        if (!current || current.key !== key) {
            current = { key, date, entries: [] };
            groups.push(current);
        }
        current.entries.push(entry);
    }
    return groups;
}

/** Flat list of items in display order, used for keyboard navigation in the preview */
export function flattenEntries(entries: FeedEntry[]): TimelineItem[] {
    return entries.flatMap((e) => (e.type === "item" ? [e.item] : e.items));
}

export function isOpenState(state: ItemState): boolean {
    return state === "open" || state === "scheduled";
}

// --- Overview -------------------------------------------------------------------------------------------

export interface RhythmWeek {
    /** Wall-clock start of the week (Monday) */
    wallStart: number;
    total: number;
    byType: { entity: string; count: number }[];
    isFuture: boolean;
    isCurrent: boolean;
}

/** The real instants covered by the rhythm strip: `weeksBack` weeks up to this one, plus `weeksAhead` weeks ahead */
export function rhythmWindow(env: DateEnv, weeksBack: number, weeksAhead: number): { from: Date; to: Date } {
    const currentWeek = weekStartWall(env, env.now());
    return {
        from: weekRange(env, currentWeek - (weeksBack - 1) * 7 * DAY_MS).from,
        to: weekRange(env, currentWeek + weeksAhead * 7 * DAY_MS).to,
    };
}

/** Weekly counts for the rhythm strip; each item sits in the week of its feed date */
export function computeRhythm(env: DateEnv, rows: RhythmRow[], weeksBack: number, weeksAhead: number): RhythmWeek[] {
    const now = env.now();
    const currentWeek = weekStartWall(env, now);
    const first = currentWeek - (weeksBack - 1) * 7 * DAY_MS;
    const weeks: RhythmWeek[] = [];
    for (let i = 0; i < weeksBack + weeksAhead; i++) {
        const wallStart = first + i * 7 * DAY_MS;
        weeks.push({ wallStart, total: 0, byType: [], isFuture: wallStart > currentWeek, isCurrent: wallStart === currentWeek });
    }
    const index = (wallWeek: number) => Math.round((wallWeek - first) / (7 * DAY_MS));
    for (const row of rows) {
        const i = index(weekStartWall(env, row.date));
        if (i < 0 || i >= weeks.length) continue;
        const week = weeks[i];
        week.total++;
        const t = week.byType.find((b) => b.entity === row.entity);
        if (t) t.count++;
        else week.byType.push({ entity: row.entity, count: 1 });
    }
    return weeks;
}

/** Date range (real instants) covered by a rhythm week, for filtering */
export function weekRange(env: DateEnv, wallStart: number): { from: Date; to: Date } {
    const offset = env.offsetMinutes(new Date(wallStart)) * 60000;
    return { from: new Date(wallStart - offset), to: new Date(wallStart + 7 * DAY_MS - offset) };
}

export function wallYear(env: DateEnv, date: Date): number {
    return toWall(env, date).getUTCFullYear();
}
