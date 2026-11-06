import { FeedSort, SortOrder } from "../model/config";
import { ActivityTypeInfo, AttachmentRef, Counts, ItemDetails, PageResult, RhythmRow, TimelineFilters, TimelineItem } from "../model/types";

export interface NewNote {
    title?: string;
    text: string;
    file?: File;
}

export interface FeedPager {
    /** Loads at least `count` more items (when available) and returns everything loaded so far, in feed order. */
    loadMore(count: number): Promise<PageResult>;
}

export interface FeedPagers {
    /** The timeline, newest or oldest first. Without an upcoming section it holds everything. */
    history: FeedPager;
    /** Open activities still ahead, soonest first. Only when sorting by activity date, newest first. */
    upcoming?: FeedPager;
}

export interface FileContent {
    base64: string;
    mimeType?: string;
    fileName: string;
}

/** Everything the UI needs from Dataverse. The sample implementation backs the local test harness. */
export interface TimelineDataSource {
    readonly currentUserId: string;
    /** Totals per type, open and overdue, counted by Dataverse */
    getCounts(): Promise<Counts>;
    /** Items between two instants for the activity-per-week chart, placed like the feed places them */
    getRhythm(sort: FeedSort, from: Date, to: Date): Promise<RhythmRow[]>;
    openFeed(filters: TimelineFilters, sort: FeedSort): FeedPagers;
    /** Loads one item, e.g. when the overview points at something that isn't loaded in the feed */
    getItem(entity: string, id: string): Promise<TimelineItem | undefined>;
    getDetails(item: TimelineItem): Promise<ItemDetails>;
    getFileContent(file: AttachmentRef): Promise<FileContent>;
    getTypeLabels(entities: string[]): Promise<ActivityTypeInfo[]>;
    createNote(note: NewNote): Promise<void>;
    completeActivity(item: TimelineItem): Promise<void>;
    openRecord(entity: string, id: string): Promise<void>;
    /** Opens a create form with the current record as regarding. Resolves true when the user saved. */
    createActivity(entity: string): Promise<boolean>;
    recordUrl(entity: string, id: string): string | undefined;
}

export interface StreamPage {
    items: TimelineItem[];
    next?: string;
}

export interface Stream {
    fetch(cursor: string | undefined): Promise<StreamPage>;
}

interface StreamState {
    stream: Stream;
    buffer: TimelineItem[];
    cursor?: string;
    started: boolean;
    done: boolean;
}

/**
 * Merges several independently paged streams (activities, notes) into one chronological feed.
 * An item is only shown once no unfinished stream could still return something that belongs before it.
 */
export class MergedPager implements FeedPager {
    private readonly states: StreamState[];
    /** 1 when newest first, -1 when oldest first; a higher rank means earlier in the feed */
    private readonly sign: number;

    constructor(streams: Stream[], order: SortOrder = "desc") {
        this.states = streams.map((stream) => ({ stream, buffer: [], started: false, done: false }));
        this.sign = order === "asc" ? -1 : 1;
    }

    public async loadMore(count: number): Promise<PageResult> {
        const target = this.visible().length + count;
        for (let guard = 0; guard < 50; guard++) {
            const pending = this.states.filter((s) => !s.started);
            if (pending.length > 0) {
                await Promise.all(pending.map((s) => this.fetch(s)));
                continue;
            }
            const visible = this.visible();
            const limiting = this.limitingStream();
            if (visible.length >= target || !limiting) {
                return { items: visible, hasMore: this.states.some((s) => !s.done) || visible.length < this.all().length };
            }
            await this.fetch(limiting);
        }
        const visible = this.visible();
        return { items: visible, hasMore: true };
    }

    private rank(item: TimelineItem): number {
        return this.sign * item.date.getTime();
    }

    private async fetch(state: StreamState): Promise<void> {
        const page = await state.stream.fetch(state.cursor);
        state.started = true;
        state.buffer.push(...page.items);
        state.cursor = page.next;
        state.done = !page.next;
    }

    private all(): TimelineItem[] {
        return this.states.flatMap((s) => s.buffer).sort((a, b) => this.rank(b) - this.rank(a));
    }

    /** The unfinished stream whose last loaded item ranks highest; its next page decides what can be shown next. */
    private limitingStream(): StreamState | undefined {
        let best: StreamState | undefined;
        let bestRank = -Infinity;
        for (const s of this.states) {
            if (s.done) continue;
            const last = s.buffer.length > 0 ? this.rank(s.buffer[s.buffer.length - 1]) : Infinity;
            if (last > bestRank) {
                best = s;
                bestRank = last;
            }
        }
        return best;
    }

    private visible(): TimelineItem[] {
        const limiting = this.limitingStream();
        const all = this.all();
        if (!limiting) return all;
        const cutoff = limiting.buffer.length > 0 ? this.rank(limiting.buffer[limiting.buffer.length - 1]) : Infinity;
        return all.filter((i) => this.rank(i) >= cutoff);
    }
}

/**
 * Lets streams load light rows (dates, state, subject) and fetches the heavier parts (bodies, participants,
 * attachment counts) once, only for the items that are about to be shown.
 */
export class HydratingPager implements FeedPager {
    private readonly hydrated = new Set<string>();

    constructor(private readonly inner: FeedPager, private readonly hydrate: (items: TimelineItem[]) => Promise<void>) {}

    public async loadMore(count: number): Promise<PageResult> {
        const result = await this.inner.loadMore(count);
        const fresh = result.items.filter((i) => !this.hydrated.has(i.key));
        try {
            await this.hydrate(fresh);
        } catch {
            // Without details the cards still show subject, type, status and date
        }
        fresh.forEach((i) => this.hydrated.add(i.key));
        return result;
    }
}
