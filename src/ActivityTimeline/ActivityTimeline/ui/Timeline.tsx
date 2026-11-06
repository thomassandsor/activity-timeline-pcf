import * as React from "react";
import {
    Button, CounterBadge, FluentProvider, makeStyles, Menu, MenuDivider, MenuGroup, MenuGroupHeader, MenuItem,
    MenuItemRadio, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarBody, MessageBarTitle, shorthands, Spinner,
    Theme, Toast, Toaster, ToastTitle, ToggleButton, tokens, Tooltip, useId, useToastController,
} from "@fluentui/react-components";
import { AddRegular, ArrowClockwiseRegular, FilterRegular, MoreHorizontalRegular, SaveRegular, SearchRegular } from "@fluentui/react-icons";
import { TimelineDataSource } from "../data/dataSource";
import { SORT_COLUMNS, SortColumn, TimelineConfig } from "../model/config";
import { DateEnv } from "../model/dates";
import { groupByDay, rhythmWindow } from "../model/feed";
import { FeedEntry, RecordContext, RhythmRow, TimelineItem } from "../model/types";
import { Feed, FeedSkeleton } from "./Feed";
import { ActiveFilters, activeFilterCount, FilterPanel, TypeCount } from "./FilterBar";
import { NoteComposer } from "./NoteComposer";
import { RHYTHM_WEEKS_AHEAD, SummaryLine } from "./Overview";
import { PreviewDrawer } from "./PreviewDrawer";
import { TimelineContext, TimelineEnv, Translate, useTimelineEnv, useTypeVisual } from "./TimelineContext";
import { useTimeline } from "./useTimeline";

const useStyles = makeStyles({
    provider: {
        backgroundColor: "transparent",
        width: "100%",
    },
    // Sits flush inside the form section, which already provides the card, padding and background
    root: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: tokens.fontFamilyBase,
        color: tokens.colorNeutralForeground1,
    },
    // Title row, filters and active-filter tags stay pinned while the page scrolls through the timeline
    top: {
        position: "sticky",
        top: 0,
        zIndex: 3,
        backgroundColor: tokens.colorNeutralBackground1,
    },
    // Takes the role of the section title, so the form section's own label can be hidden
    header: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        ...shorthands.padding("0", "0", tokens.spacingVerticalM),
    },
    heading: {
        margin: 0,
        fontSize: tokens.fontSizeBase300,
        fontWeight: tokens.fontWeightSemibold,
        lineHeight: tokens.lineHeightBase300,
    },
    spacer: { flexGrow: 1 },
    // Default: no scroll of its own; the timeline grows and the page scrolls, like the built-in timeline
    flow: {
        ...shorthands.padding("0", "0", tokens.spacingVerticalL),
    },
    // Fixed height (when a maker sets one): its own scroll, which hands over to the page at the top and bottom
    scroll: {
        flexGrow: 1,
        minHeight: 0,
        overflowY: "auto",
        ...shorthands.padding("0", tokens.spacingHorizontalXS, tokens.spacingVerticalL, "0"),
        scrollbarGutter: "stable",
    },
    message: { marginBottom: tokens.spacingVerticalS },
    empty: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        rowGap: tokens.spacingVerticalXS,
        ...shorthands.padding(tokens.spacingVerticalXXXL, tokens.spacingHorizontalL),
        color: tokens.colorNeutralForeground3,
    },
    emptyIcon: {
        fontSize: "28px",
        marginBottom: tokens.spacingVerticalS,
        color: tokens.colorNeutralForeground4,
    },
    emptyTitle: {
        fontSize: tokens.fontSizeBase400,
        fontWeight: tokens.fontWeightSemibold,
        color: tokens.colorNeutralForeground2,
    },
    menuIcon: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "20px",
        height: "20px",
        borderRadius: tokens.borderRadiusCircular,
        fontSize: "12px",
    },
    refreshing: {
        marginRight: tokens.spacingHorizontalXS,
    },
});

export interface TimelineProps {
    source: TimelineDataSource;
    config: TimelineConfig;
    record?: RecordContext;
    dates: DateEnv;
    t: Translate;
    theme?: Theme;
}

export const Timeline: React.FC<TimelineProps> = (props) => {
    const styles = useStyles();
    const { source, config, dates, t, record } = props;
    const [typeLabels, setTypeLabels] = React.useState<Record<string, string>>({});

    // Display names for configured and creatable types (counts carry labels for everything else)
    React.useEffect(() => {
        if (!record) return;
        const entities = Array.from(new Set([...config.activityTypes, ...config.createTypes])).filter((e) => e !== "*");
        source
            .getTypeLabels(entities)
            .then((list) => setTypeLabels(Object.fromEntries(list.map((l) => [l.entity, l.label]))))
            .catch(() => undefined);
    }, [record, source, config]);

    const env = React.useMemo<TimelineEnv>(
        () => ({
            t,
            dates,
            config,
            source,
            typeLabel: (entity, fallback) => config.advanced.typeStyles?.[entity]?.label ?? typeLabels[entity] ?? fallback ?? entity,
        }),
        [t, dates, config, source, typeLabels],
    );
    return (
        <FluentProvider theme={props.theme} className={styles.provider}>
            <TimelineContext.Provider value={env}>
                <TimelineView record={props.record} />
            </TimelineContext.Provider>
        </FluentProvider>
    );
};

const TimelineView: React.FC<{ record?: RecordContext }> = ({ record }) => {
    const env = useTimelineEnv();
    const { t, dates, config, source, typeLabel } = env;
    const styles = useStyles();
    const [state, actions] = useTimeline(source, config, record);
    const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);
    const fixedHeight = config.height > 0;
    // Height of the pinned top block, so day headers pin just below it
    const [topEl, setTopEl] = React.useState<HTMLDivElement | null>(null);
    const [topHeight, setTopHeight] = React.useState(0);
    React.useEffect(() => {
        if (!topEl || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => setTopHeight(topEl.offsetHeight));
        observer.observe(topEl);
        return () => observer.disconnect();
    }, [topEl]);
    const composerRef = React.useRef<HTMLDivElement>(null);
    const [filtersOpen, setFiltersOpen] = React.useState(false);
    const [composing, setComposing] = React.useState(false);
    const searchRef = React.useRef<HTMLInputElement>(null);
    const toasterId = useId("toaster");
    const { dispatchToast } = useToastController(toasterId);

    const notify = React.useCallback(
        (title: string, intent: "success" | "error" = "success") =>
            dispatchToast(
                <Toast>
                    <ToastTitle>{title}</ToastTitle>
                </Toast>,
                { intent, timeout: 2500 },
            ),
        [dispatchToast],
    );

    const groups = React.useMemo(() => groupByDay(dates, state.entries), [dates, state.entries]);
    // Upcoming first, then the history: the order the preview steps through
    const allEntries = React.useMemo(() => [...state.upcoming, ...state.entries], [state.upcoming, state.entries]);

    // Filter chips: configured types, plus any type that appears on the record when all types are allowed
    const typeCounts = React.useMemo<TypeCount[]>(() => {
        const counts = new Map((state.counts?.byType ?? []).map((c) => [c.entity, c]));
        const configured = config.activityTypes.includes("*") ? [] : config.activityTypes;
        const entities = Array.from(new Set([...configured, ...counts.keys(), ...(config.includeNotes ? ["annotation"] : [])]));
        return entities
            .map((entity) => ({
                entity,
                label: typeLabel(entity, counts.get(entity)?.label),
                count: state.counts ? counts.get(entity)?.count ?? 0 : undefined,
            }))
            .filter((c) => c.count === undefined || c.count > 0 || state.filters.types.includes(c.entity))
            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    }, [state.counts, state.filters.types, config, typeLabel]);

    // Activity per week: only loaded while the filter panel is open
    const weeksBack = Math.min(52, Math.max(8, config.advanced.rhythmWeeks ?? 12));
    const [rhythm, setRhythm] = React.useState<RhythmRow[]>();
    React.useEffect(() => {
        if (!record || !filtersOpen || !config.showOverview) return;
        let current = true;
        const range = rhythmWindow(dates, weeksBack, RHYTHM_WEEKS_AHEAD);
        source
            .getRhythm(state.sort, range.from, range.to)
            .then((rows) => current && setRhythm(rows))
            .catch(() => current && setRhythm(undefined));
        return () => {
            current = false;
        };
        // Counts change on refresh, which is also when the chart should be counted again
    }, [record, filtersOpen, config.showOverview, source, dates, weeksBack, state.sort, state.counts]);

    // An item that isn't loaded in the feed (older, or filtered out)
    const [extraEntry, setExtraEntry] = React.useState<FeedEntry>();
    const selectedIndex = state.selectedKey ? allEntries.findIndex((e) => e.key === state.selectedKey) : -1;
    const selectedEntry = selectedIndex >= 0 ? allEntries[selectedIndex] : extraEntry?.key === state.selectedKey ? extraEntry : undefined;

    /** Previews an entry by its key, or the entry that contains an item key (a message inside a conversation). */
    const select = React.useCallback(
        (key: string | undefined) => {
            if (!key) {
                actions.select(undefined);
                return;
            }
            if (allEntries.some((e) => e.key === key)) {
                actions.select(key);
                return;
            }
            const thread = allEntries.find((e) => e.type === "thread" && e.items.some((i) => i.key === key));
            if (thread) {
                actions.select(thread.key, key);
                return;
            }
            actions.select(key);
            const split = key.indexOf(":");
            source
                .getItem(key.substring(0, split), key.substring(split + 1))
                .then((item) => setExtraEntry(item ? { type: "item", key: item.key, item } : undefined))
                .catch(() => notify(t("actionFailed"), "error"));
        },
        [allEntries, actions, source, notify, t],
    );

    const open = React.useCallback(
        (item: TimelineItem) => {
            source.openRecord(item.entity, item.id).catch(() => notify(t("actionFailed"), "error"));
        },
        [source, notify, t],
    );

    const complete = React.useCallback(
        async (item: TimelineItem) => {
            try {
                await actions.complete(item);
                notify(t("completedToast"));
            } catch (e) {
                notify(`${t("completeFailed")} ${e instanceof Error ? e.message : ""}`.trim(), "error");
            }
        },
        [actions, notify, t],
    );

    const copyLink = React.useCallback(
        (item: TimelineItem) => {
            const url = source.recordUrl(item.entity, item.id);
            if (!url) return;
            navigator.clipboard?.writeText(url).then(() => notify(t("linkCopied")), () => notify(t("actionFailed"), "error"));
        },
        [source, notify, t],
    );

    const openFilters = React.useCallback(() => {
        setFiltersOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 30);
    }, []);

    // "/" opens search, like most modern web apps
    const onKeyDown = (e: React.KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (e.key === "/" && !target.closest("input, textarea, [contenteditable='true']")) {
            e.preventDefault();
            openFilters();
        }
    };

    const total = state.counts?.total;
    const activeCount = activeFilterCount(state.filters);
    const canWriteNotes = config.includeNotes && !config.advanced.hideNoteComposer;
    const createTypes = config.createTypes.filter((c) => c !== "annotation" && c !== "note");
    const sortLabels: Record<SortColumn, string> = {
        eventdate: t("sortEvent"),
        createdon: t("sortCreated"),
        modifiedon: t("sortModified"),
        actualend: t("sortActualEnd"),
        scheduledend: t("sortDue"),
        scheduledstart: t("sortStart"),
        senton: t("sortSent"),
        sortdate: t("sortSortDate"),
    };
    // The maker's sort plus the three everyone understands
    const sortChoices = Array.from(new Set<SortColumn>([config.sortBy, "eventdate", "createdon", "modifiedon"]));

    return (
        <div
            className={styles.root}
            // Day headers pin below the top block when the page scrolls; inside a fixed-height box they pin at its top
            style={{ height: fixedHeight ? config.height : undefined, ["--rsn-tl-top" as string]: fixedHeight ? "0px" : `${topHeight}px` } as React.CSSProperties}
            onKeyDown={onKeyDown}
        >
            <div className={styles.top} ref={setTopEl}>
                <div className={styles.header}>
                    <h2 className={styles.heading}>{t("title")}</h2>
                    {total !== undefined && total > 0 && <CounterBadge count={total} overflowCount={9999} appearance="ghost" color="informative" size="small" />}
                    <span className={styles.spacer} />
                    {state.loading === "refresh" && <Spinner size="extra-tiny" className={styles.refreshing} />}
                    {record && (
                        <Tooltip content={`${t("filter")} ( / )`} relationship="label">
                            <ToggleButton
                                appearance="subtle"
                                size="small"
                                icon={<FilterRegular />}
                                checked={filtersOpen}
                                aria-expanded={filtersOpen}
                                onClick={() => (filtersOpen ? setFiltersOpen(false) : openFilters())}
                            >
                                {activeCount > 0 ? <CounterBadge count={activeCount} size="small" color="brand" /> : undefined}
                            </ToggleButton>
                        </Tooltip>
                    )}
                    {record && (createTypes.length > 0 || canWriteNotes) && (
                        <Menu>
                            <MenuTrigger disableButtonEnhancement>
                                <Button appearance="secondary" size="small" icon={<AddRegular />}>
                                    {t("newItem")}
                                </Button>
                            </MenuTrigger>
                            <MenuPopover>
                                <MenuList>
                                    {canWriteNotes && (
                                        <MenuItem
                                            icon={<MenuTypeIcon entity="annotation" />}
                                            onClick={() => {
                                                setComposing(true);
                                                window.setTimeout(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                                            }}
                                        >
                                            {t("note")}
                                        </MenuItem>
                                    )}
                                    {canWriteNotes && createTypes.length > 0 && <MenuDivider />}
                                    {createTypes.map((entity) => (
                                        <MenuItem
                                            key={entity}
                                            icon={<MenuTypeIcon entity={entity} />}
                                            onClick={() => {
                                                actions.createActivity(entity).catch(() => notify(t("actionFailed"), "error"));
                                            }}
                                        >
                                            {typeLabel(entity)}
                                        </MenuItem>
                                    ))}
                                </MenuList>
                            </MenuPopover>
                        </Menu>
                    )}
                    <Tooltip content={t("refresh")} relationship="label">
                        <Button appearance="subtle" size="small" icon={<ArrowClockwiseRegular />} onClick={actions.refresh} disabled={!record} />
                    </Tooltip>
                    <Menu
                        checkedValues={{ density: [state.density], sort: [state.sort.activities], order: [state.sort.order] }}
                        onCheckedValueChange={(_, d) => {
                            const value = d.checkedItems[0];
                            if (d.name === "density") actions.setDensity(value === "compact" ? "compact" : "comfortable");
                            if (d.name === "sort") actions.setSort({ activities: SORT_COLUMNS.find((c) => c === value) ?? "eventdate" });
                            if (d.name === "order") actions.setSort({ order: value === "asc" ? "asc" : "desc" });
                        }}
                    >
                        <MenuTrigger disableButtonEnhancement>
                            <Tooltip content={t("viewOptions")} relationship="label">
                                <Button appearance="subtle" size="small" icon={<MoreHorizontalRegular />} />
                            </Tooltip>
                        </MenuTrigger>
                        <MenuPopover>
                            <MenuList>
                                <MenuGroup>
                                    <MenuGroupHeader>{t("sortBy")}</MenuGroupHeader>
                                    {sortChoices.map((c) => (
                                        <MenuItemRadio key={c} name="sort" value={c}>
                                            {sortLabels[c]}
                                        </MenuItemRadio>
                                    ))}
                                </MenuGroup>
                                <MenuDivider />
                                <MenuGroup>
                                    <MenuItemRadio name="order" value="desc">
                                        {t("newestFirst")}
                                    </MenuItemRadio>
                                    <MenuItemRadio name="order" value="asc">
                                        {t("oldestFirst")}
                                    </MenuItemRadio>
                                </MenuGroup>
                                <MenuDivider />
                                <MenuGroup>
                                    <MenuGroupHeader>{t("viewOptions")}</MenuGroupHeader>
                                    <MenuItemRadio name="density" value="comfortable">
                                        {t("comfortable")}
                                    </MenuItemRadio>
                                    <MenuItemRadio name="density" value="compact">
                                        {t("compact")}
                                    </MenuItemRadio>
                                </MenuGroup>
                                <MenuDivider />
                                <MenuItem disabled>{t("keyboardHint")}</MenuItem>
                            </MenuList>
                        </MenuPopover>
                    </Menu>
                </div>

                {/* Filters stay pinned with the title row, so they're reachable wherever the user is in the feed */}
                {record && filtersOpen && (
                    <FilterPanel
                        filters={state.filters}
                        types={typeCounts}
                        total={total}
                        rhythm={config.showOverview && rhythm ? { rows: rhythm, weeksBack } : undefined}
                        onChange={actions.setFilters}
                        onClear={actions.clearFilters}
                        onClose={() => setFiltersOpen(false)}
                        searchRef={searchRef}
                    />
                )}
                {record && !filtersOpen && (
                    <ActiveFilters filters={state.filters} typeLabel={(e) => typeLabel(e)} onChange={actions.setFilters} onClear={actions.clearFilters} />
                )}
            </div>

            <div className={fixedHeight ? styles.scroll : styles.flow} ref={fixedHeight ? setScrollEl : undefined}>
                {!record ? (
                    <div className={styles.empty}>
                        <SaveRegular className={styles.emptyIcon} />
                        <span className={styles.emptyTitle}>{t("saveRecordFirst")}</span>
                    </div>
                ) : (
                    <>
                        {config.warnings.length > 0 && (
                            <MessageBar intent="warning" className={styles.message}>
                                <MessageBarBody>
                                    <MessageBarTitle>{t("configWarning")}</MessageBarTitle>
                                    {config.warnings.join(" ")}
                                </MessageBarBody>
                            </MessageBar>
                        )}
                        {config.showOverview && state.counts && !filtersOpen && (
                            <SummaryLine counts={state.counts} filters={state.filters} onFilter={actions.setFilters} />
                        )}
                        {composing && (
                            <div ref={composerRef} style={{ scrollMarginTop: topHeight + 8 }}>
                            <NoteComposer
                                onClose={() => setComposing(false)}
                                onSave={async (note) => {
                                    await actions.createNote(note);
                                    notify(t("noteSaved"));
                                }}
                            />
                            </div>
                        )}

                        {state.error && (
                            <MessageBar intent="error" className={styles.message}>
                                <MessageBarBody>
                                    <MessageBarTitle>{t("errorLoading")}</MessageBarTitle>
                                    {state.error}
                                </MessageBarBody>
                                <Button size="small" onClick={actions.refresh}>
                                    {t("retry")}
                                </Button>
                            </MessageBar>
                        )}

                        {state.loading === "initial" ? (
                            <FeedSkeleton />
                        ) : allEntries.length === 0 && !state.error ? (
                            <div className={styles.empty}>
                                <SearchRegular className={styles.emptyIcon} />
                                <span className={styles.emptyTitle}>{activeCount > 0 ? t("noMatches") : t("noActivityYet")}</span>
                                <span>{activeCount > 0 ? t("noMatchesHint") : t("noActivityHint")}</span>
                                {activeCount > 0 && (
                                    <Button appearance="secondary" size="small" onClick={actions.clearFilters} style={{ marginTop: tokens.spacingVerticalM }}>
                                        {t("clearFilters")}
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <Feed
                                groups={groups}
                                upcoming={{ entries: state.upcoming, hasMore: state.upcomingHasMore, onLoadMore: actions.loadMoreUpcoming }}
                                eventDates={state.sort.activities === "eventdate"}
                                total={allEntries.length}
                                density={state.density}
                                selectedKey={state.selectedKey}
                                lastSeen={state.lastSeen}
                                currentUserId={source.currentUserId}
                                hasMore={state.hasMore}
                                loadingMore={state.loading === "more"}
                                scrollRoot={fixedHeight ? scrollEl : null}
                                onSelect={select}
                                onOpen={open}
                                onComplete={(item) => void complete(item)}
                                onLoadMore={actions.loadMore}
                            />
                        )}
                    </>
                )}
            </div>

            <PreviewDrawer
                entry={selectedEntry}
                focusKey={state.focusKey}
                index={selectedIndex}
                count={selectedIndex >= 0 ? allEntries.length : 0}
                onClose={() => actions.select(undefined)}
                onStep={(delta) => {
                    const next = allEntries[selectedIndex + delta];
                    if (next) actions.select(next.key);
                    if (delta > 0 && selectedIndex + delta >= allEntries.length - 2 && state.hasMore) actions.loadMore();
                }}
                onOpen={open}
                onComplete={complete}
                onCopyLink={copyLink}
            />
            <Toaster toasterId={toasterId} position="bottom-end" />
        </div>
    );
};

const MenuTypeIcon: React.FC<{ entity: string }> = ({ entity }) => {
    const styles = useStyles();
    const v = useTypeVisual(entity);
    return (
        <span className={styles.menuIcon} style={{ backgroundColor: v.bg, color: v.fg }}>
            <v.Icon />
        </span>
    );
};
