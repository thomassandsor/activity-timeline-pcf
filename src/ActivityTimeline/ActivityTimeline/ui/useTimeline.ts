import * as React from "react";
import { FeedPager, NewNote, TimelineDataSource } from "../data/dataSource";
import { Density, FeedSort, SortColumn, SortOrder, TimelineConfig } from "../model/config";
import { buildEntries } from "../model/feed";
import { Counts, emptyFilters, FeedEntry, PageResult, RecordContext, TimelineFilters, TimelineItem } from "../model/types";

export interface TimelineState {
    counts?: Counts;
    /** Feed entries in display order (single items and email conversations) */
    entries: FeedEntry[];
    hasMore: boolean;
    /** Open items still ahead, soonest first; shown above the feed when sorting by activity date */
    upcoming: FeedEntry[];
    upcomingHasMore: boolean;
    loading: "initial" | "more" | "refresh" | undefined;
    error?: string;
    filters: TimelineFilters;
    density: Density;
    sort: FeedSort;
    /** Key of the previewed entry: an item key, or a conversation key */
    selectedKey?: string;
    /** Message to expand when the previewed entry is a conversation */
    focusKey?: string;
    /** Items created after this instant (by someone else) are marked as new */
    lastSeen?: number;
}

export interface TimelineActions {
    setFilters: (update: Partial<TimelineFilters>) => void;
    clearFilters: () => void;
    loadMore: () => void;
    loadMoreUpcoming: () => void;
    refresh: () => void;
    select: (entryKey: string | undefined, focusKey?: string) => void;
    setDensity: (density: Density) => void;
    /** Sort column for activities and/or order, chosen by the user */
    setSort: (update: { activities?: SortColumn; order?: SortOrder }) => void;
    complete: (item: TimelineItem) => Promise<void>;
    createNote: (note: NewNote) => Promise<void>;
    createActivity: (entity: string) => Promise<void>;
}

interface Prefs {
    density?: Density;
    /** Only kept when the user picked a sort themselves; otherwise the maker's default applies */
    sortChosen?: boolean;
    sortBy?: SortColumn;
    sortOrder?: SortOrder;
    types?: string[];
    status?: TimelineFilters["status"];
    onlyMine?: boolean;
}

const PREFIX = "rsn-activitytimeline";

/**
 * Notes follow the user's choice when it's created on or last updated; with the maker's activity sort
 * (or a column notes don't have) they use the maker's notes setting, like the built-in timeline.
 * Sorted by activity date, notes are placed by created on (the data source handles that).
 */
export function feedSort(config: TimelineConfig, activities: SortColumn, order: SortOrder): FeedSort {
    const notes = activities !== config.sortBy && (activities === "createdon" || activities === "modifiedon") ? activities : config.notesSortBy;
    return { activities, notes, order };
}

function readJson<T>(key: string): T | undefined {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
        return undefined;
    }
}

function writeJson(key: string, value: unknown): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage can be unavailable (private mode, quotas); preferences just won't persist
    }
}

export function useTimeline(source: TimelineDataSource, config: TimelineConfig, record: RecordContext | undefined): [TimelineState, TimelineActions] {
    const prefsKey = `${PREFIX}:prefs:${record?.entity ?? "none"}`;
    const seenKey = record ? `${PREFIX}:seen:${record.entity}:${record.id}:${source.currentUserId}` : undefined;

    const initial = React.useMemo<TimelineState>(() => {
        const prefs = readJson<Prefs>(prefsKey) ?? {};
        const defaults = config.advanced.defaultFilters ?? {};
        const chosen = prefs.sortChosen ? prefs : {};
        return {
            entries: [],
            hasMore: false,
            upcoming: [],
            upcomingHasMore: false,
            loading: "initial",
            density: prefs.density ?? config.density,
            sort: feedSort(config, chosen.sortBy ?? config.sortBy, chosen.sortOrder ?? config.sortOrder),
            filters: {
                ...emptyFilters,
                types: prefs.types ?? defaults.types ?? [],
                status: prefs.status ?? defaults.status ?? "all",
                onlyMine: prefs.onlyMine ?? defaults.onlyMine ?? false,
            },
            lastSeen: seenKey ? readJson<number>(seenKey) : undefined,
        };
    }, []); // once per mount

    const [state, setState] = React.useState<TimelineState>(initial);
    const pagerRef = React.useRef<FeedPager>();
    const upcomingRef = React.useRef<FeedPager>();
    const requestRef = React.useRef(0);
    const sortChosenRef = React.useRef(!!readJson<Prefs>(prefsKey)?.sortChosen);
    const filtersRef = React.useRef(state.filters);
    const densityRef = React.useRef(state.density);
    const sortRef = React.useRef(state.sort);

    // Remember the visit; the badge threshold for this session stays what it was when the timeline opened
    React.useEffect(() => {
        if (seenKey) writeJson(seenKey, Date.now());
    }, [seenKey]);

    const applyPage = React.useCallback(
        (request: number, page: PageResult, upcoming?: PageResult) => {
            if (request !== requestRef.current) return;
            const entries = buildEntries(page.items, config.threadEmails, sortRef.current.order);
            setState((s) => ({
                ...s,
                entries,
                hasMore: page.hasMore,
                ...(upcoming ? { upcoming: buildEntries(upcoming.items, false, "asc"), upcomingHasMore: upcoming.hasMore } : {}),
                loading: undefined,
                error: undefined,
            }));
        },
        [config.threadEmails],
    );

    const applyUpcoming = React.useCallback((request: number, upcoming: PageResult) => {
        if (request !== requestRef.current) return;
        setState((s) => ({ ...s, upcoming: buildEntries(upcoming.items, false, "asc"), upcomingHasMore: upcoming.hasMore }));
    }, []);

    const fail = React.useCallback((request: number, e: unknown) => {
        if (request !== requestRef.current) return;
        const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
        setState((s) => ({ ...s, loading: undefined, error: message }));
    }, []);

    const reload = React.useCallback(
        (filters: TimelineFilters, mode: "initial" | "refresh", withCounts: boolean) => {
            if (!record) return;
            const request = ++requestRef.current;
            setState((s) => ({ ...s, loading: mode, error: undefined }));
            // Counts first: the feed uses them to skip queries for kinds of activity the record doesn't have
            if (withCounts) {
                source.getCounts()
                    .then((counts) => setState((s) => ({ ...s, counts })))
                    .catch(() => setState((s) => ({ ...s, counts: undefined })));
            }
            const feed = source.openFeed(filters, sortRef.current);
            pagerRef.current = feed.history;
            upcomingRef.current = feed.upcoming;
            // History and upcoming appear together, so nothing jumps when the second one arrives
            const upcoming = feed.upcoming?.loadMore(config.pageSize).catch(() => undefined) ?? Promise.resolve(undefined);
            Promise.all([feed.history.loadMore(config.pageSize), upcoming])
                .then(([page, next]) => applyPage(request, page, next ?? { items: [], hasMore: false }))
                .catch((e) => fail(request, e));
        },
        [record, source, config.pageSize, applyPage, fail],
    );

    React.useEffect(() => {
        reload(filtersRef.current, "initial", true);
    }, [reload]);

    const savePrefs = React.useCallback(
        (filters: TimelineFilters, density: Density) => {
            const sort = sortRef.current;
            writeJson(prefsKey, {
                density,
                types: filters.types,
                status: filters.status,
                onlyMine: filters.onlyMine,
                ...(sortChosenRef.current ? { sortChosen: true, sortBy: sort.activities, sortOrder: sort.order } : {}),
            } satisfies Prefs);
        },
        [prefsKey],
    );

    const actions = React.useMemo<TimelineActions>(() => {
        const setFilters = (update: Partial<TimelineFilters>) => {
            const filters = { ...filtersRef.current, ...update };
            filtersRef.current = filters;
            setState((s) => ({ ...s, filters }));
            savePrefs(filters, densityRef.current);
            reload(filters, "refresh", false);
        };
        return {
            setFilters,
            clearFilters: () => setFilters({ ...emptyFilters }),
            loadMore: () => {
                const pager = pagerRef.current;
                if (!pager) return;
                const request = requestRef.current;
                setState((s) => (s.loading ? s : { ...s, loading: "more" }));
                pager.loadMore(config.pageSize).then((r) => applyPage(request, r)).catch((e) => fail(request, e));
            },
            loadMoreUpcoming: () => {
                const pager = upcomingRef.current;
                if (!pager) return;
                const request = requestRef.current;
                pager.loadMore(config.pageSize).then((r) => applyUpcoming(request, r)).catch((e) => fail(request, e));
            },
            refresh: () => reload(filtersRef.current, "refresh", true),
            select: (entryKey, focusKey) => setState((s) => ({ ...s, selectedKey: entryKey, focusKey })),
            setDensity: (density) => {
                densityRef.current = density;
                setState((s) => ({ ...s, density }));
                savePrefs(filtersRef.current, density);
            },
            setSort: (update) => {
                const current = sortRef.current;
                const sort = feedSort(config, update.activities ?? current.activities, update.order ?? current.order);
                sortRef.current = sort;
                sortChosenRef.current = true;
                setState((s) => ({ ...s, sort }));
                savePrefs(filtersRef.current, densityRef.current);
                reload(filtersRef.current, "refresh", false);
            },
            complete: async (item) => {
                await source.completeActivity(item);
                reload(filtersRef.current, "refresh", true);
            },
            createNote: async (note) => {
                await source.createNote(note);
                reload(filtersRef.current, "refresh", true);
            },
            createActivity: async (entity) => {
                const saved = await source.createActivity(entity);
                if (saved) reload(filtersRef.current, "refresh", true);
            },
        };
    }, [source, config, reload, applyPage, applyUpcoming, fail, savePrefs]);

    return [state, actions];
}
