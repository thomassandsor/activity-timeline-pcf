import { DateEnv, dayKey } from "./dates";
import { SortOrder } from "./config";
import { FeedEntry, ItemState, TimelineItem } from "./types";

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
