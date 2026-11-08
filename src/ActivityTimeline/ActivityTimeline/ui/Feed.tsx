import * as React from "react";
import {
    Button, makeStyles, mergeClasses, shorthands, Skeleton, SkeletonItem, Spinner, tokens, Tooltip, useId,
} from "@fluentui/react-components";
import {
    ArrowDownLeftRegular, ArrowUpRightRegular, AttachRegular, CheckmarkRegular, ChevronDownRegular, ChevronUpRegular, ClockRegular,
    DocumentRegular, ImageRegular, ImportantRegular, OpenRegular, TimerRegular,
} from "@fluentui/react-icons";
import { canComplete } from "../model/activityTypes";
import { Density } from "../model/config";
import { DateEnv, daysAgo, formatDayHeader, formatDuration, formatFull, formatShortDate, formatTime, formatUpcoming } from "../model/dates";
import { DayGroup, isOpenState } from "../model/feed";
import { stripReplyPrefixes } from "../model/html";
import { FeedEntry, TimelineItem } from "../model/types";
import { CardStatus, NODE, People, SectionHeader, TypeNode } from "./CardParts";
import { useTimelineEnv } from "./TimelineContext";

/** Upcoming items shown before "Show more" */
const UPCOMING_COLLAPSED = 3;

const useStyles = makeStyles({
    feed: {
        display: "flex",
        flexDirection: "column",
        ":focus": { outlineStyle: "none" },
    },
    dayHeader: {
        position: "sticky",
        top: "var(--rsn-tl-top, 0px)",
        zIndex: 2,
        ...shorthands.padding(tokens.spacingVerticalS, "0", tokens.spacingVerticalXS),
        backgroundColor: tokens.colorNeutralBackground1,
    },
    // Lines up with the cards, past the type icons
    upcomingActions: {
        display: "flex",
        flexWrap: "wrap",
        columnGap: tokens.spacingHorizontalS,
        paddingLeft: `calc(${NODE}px + ${tokens.spacingHorizontalM})`,
    },
    dayBody: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        rowGap: "2px",
        ...shorthands.padding("2px", "0", tokens.spacingVerticalM),
    },
    row: {
        position: "relative",
        display: "grid",
        gridTemplateColumns: `${NODE}px minmax(0, 1fr)`,
        columnGap: tokens.spacingHorizontalM,
        alignItems: "start",
    },
    node: { marginTop: "6px" },
    card: {
        position: "relative",
        minWidth: 0,
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
        borderRadius: tokens.borderRadiusLarge,
        cursor: "pointer",
        outlineStyle: "none",
        transitionProperty: "background-color, box-shadow",
        transitionDuration: tokens.durationFaster,
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
        ":focus-visible": { boxShadow: `inset 0 0 0 2px ${tokens.colorStrokeFocus2}` },
        "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0s" },
    },
    cardCompact: {
        ...shorthands.padding("6px", tokens.spacingHorizontalM),
    },
    selected: {
        backgroundColor: tokens.colorBrandBackground2,
        boxShadow: `inset 3px 0 0 ${tokens.colorBrandStroke1}`,
        ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
    },
    head: {
        display: "flex",
        alignItems: "baseline",
        columnGap: tokens.spacingHorizontalS,
    },
    title: {
        flexGrow: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: tokens.colorNeutralForeground1,
        fontSize: tokens.fontSizeBase300,
        fontWeight: tokens.fontWeightSemibold,
        lineHeight: tokens.lineHeightBase300,
    },
    newDot: {
        display: "inline-block",
        width: "7px",
        height: "7px",
        marginRight: "6px",
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: tokens.colorBrandForeground1,
        verticalAlign: "middle",
    },
    timeVerb: {
        color: tokens.colorNeutralForeground3,
        fontSize: tokens.fontSizeBase100,
        textTransform: "lowercase",
    },
    stampTip: { display: "flex", flexDirection: "column", rowGap: "2px" },
    timeOverdue: {
        color: tokens.colorPaletteRedForeground1,
        fontWeight: tokens.fontWeightSemibold,
    },
    typeLabel: { fontWeight: tokens.fontWeightMedium, color: tokens.colorNeutralForeground2 },
    time: {
        flexShrink: 0,
        color: tokens.colorNeutralForeground3,
        fontSize: tokens.fontSizeBase200,
        fontVariantNumeric: "tabular-nums",
    },
    meta: {
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: "6px",
        rowGap: "2px",
        marginTop: "2px",
        color: tokens.colorNeutralForeground3,
        fontSize: tokens.fontSizeBase200,
        lineHeight: tokens.lineHeightBase200,
        minWidth: 0,
    },
    people: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "4px",
        minWidth: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        color: tokens.colorNeutralForeground2,
    },
    dirIcon: { fontSize: "13px", flexShrink: 0 },
    dirIn: { color: tokens.colorPaletteBlueForeground2 },
    dirOut: { color: tokens.colorPaletteGreenForeground2 },
    // Everything under the title on the left; the status sits in the bottom right corner
    lower: {
        display: "flex",
        alignItems: "flex-end",
        columnGap: tokens.spacingHorizontalM,
    },
    lowerMain: { flexGrow: 1, minWidth: 0 },
    snippet: {
        marginTop: "4px",
        color: tokens.colorNeutralForeground2,
        fontSize: tokens.fontSizeBase300,
        lineHeight: tokens.lineHeightBase300,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        overflowWrap: "anywhere",
    },
    facts: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        marginTop: "6px",
    },
    fact: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "4px",
        height: "22px",
        maxWidth: "100%",
        ...shorthands.padding("0", "8px"),
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground2,
        fontSize: tokens.fontSizeBase200,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    factDanger: {
        backgroundColor: tokens.colorPaletteRedBackground1,
        color: tokens.colorPaletteRedForeground1,
    },
    factIcon: { fontSize: "14px", flexShrink: 0 },
    actions: {
        position: "absolute",
        top: "4px",
        right: "4px",
        display: "flex",
        columnGap: "2px",
        ...shorthands.padding("2px"),
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground1,
        boxShadow: tokens.shadow4,
        opacity: 0,
        pointerEvents: "none",
        transitionProperty: "opacity",
        transitionDuration: tokens.durationFaster,
    },
    actionsVisible: {
        opacity: 1,
        pointerEvents: "auto",
    },
    latestFrom: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
    srOnly: {
        position: "absolute",
        width: "1px",
        height: "1px",
        ...shorthands.margin("-1px"),
        ...shorthands.padding(0),
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
        ...shorthands.border(0),
    },
    more: {
        display: "flex",
        justifyContent: "center",
        ...shorthands.padding(tokens.spacingVerticalM),
    },
    skeletonRow: {
        display: "grid",
        gridTemplateColumns: `${NODE}px 1fr`,
        columnGap: tokens.spacingHorizontalM,
        alignItems: "start",
        ...shorthands.padding(tokens.spacingVerticalS, "0"),
    },
    skeletonLines: { display: "flex", flexDirection: "column", rowGap: "8px", paddingTop: "8px" },
});

export interface UpcomingFeed {
    entries: FeedEntry[];
    hasMore: boolean;
    onLoadMore: () => void;
}

export interface FeedProps {
    groups: DayGroup[];
    /** Open items still ahead, above the history; only when sorting by activity date, newest first */
    upcoming?: UpcomingFeed;
    /** Sorted by activity date: each card's time is its own kind of date, so only deadlines get a word */
    eventDates: boolean;
    total: number;
    density: Density;
    selectedKey?: string;
    lastSeen?: number;
    currentUserId: string;
    hasMore: boolean;
    loadingMore: boolean;
    scrollRoot: HTMLElement | null;
    onSelect: (key: string) => void;
    onOpen: (item: TimelineItem) => void;
    onComplete: (item: TimelineItem) => void;
    onLoadMore: () => void;
}

export const Feed: React.FC<FeedProps> = (props) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const sentinelRef = React.useRef<HTMLDivElement>(null);
    const feedRef = React.useRef<HTMLDivElement>(null);
    const { hasMore, loadingMore, onLoadMore, scrollRoot } = props;

    // Infinite scroll inside the timeline's own scroll area
    React.useEffect(() => {
        const node = sentinelRef.current;
        if (!node || !hasMore || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting) && !loadingMore) onLoadMore();
            },
            // Without its own scroll (the default) the page scrolls; a null root watches the viewport
            { root: scrollRoot, rootMargin: "400px" },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, onLoadMore, scrollRoot]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const cards = Array.from(feedRef.current?.querySelectorAll<HTMLElement>("[data-card]") ?? []);
        const index = cards.findIndex((c) => c === document.activeElement);
        const next = cards[index + (e.key === "ArrowDown" ? 1 : -1)];
        if (next) {
            e.preventDefault();
            next.focus();
        }
    };

    const upcoming = props.upcoming && props.upcoming.entries.length > 0 ? props.upcoming : undefined;
    let position = upcoming?.entries.length ?? 0;
    return (
        <div ref={feedRef} className={styles.feed} role="feed" aria-busy={loadingMore} aria-label={t("title")} onKeyDown={onKeyDown}>
            {upcoming && <UpcomingSection {...props} upcoming={upcoming} />}
            {props.groups.map((group) => {
                const headerId = `day-${group.key}`;
                const count = group.entries.reduce((n, e) => n + (e.type === "item" ? 1 : e.items.length), 0);
                return (
                    <section key={group.key} aria-labelledby={headerId}>
                        <SectionHeader
                            className={styles.dayHeader}
                            id={headerId}
                            heading
                            label={formatDayHeader(dates, group.date, { today: t("today"), yesterday: t("yesterday"), tomorrow: t("tomorrow") })}
                            count={count}
                        />
                        <div className={styles.dayBody}>
                            {group.entries.map((entry) => {
                                position++;
                                return entry.type === "item" ? (
                                    <ItemCard key={entry.key} item={entry.item} position={position} {...props} />
                                ) : (
                                    <ThreadCard key={entry.key} entryKey={entry.key} items={entry.items} position={position} {...props} />
                                );
                            })}
                        </div>
                    </section>
                );
            })}
            {hasMore && (
                <div ref={sentinelRef} className={styles.more}>
                    {loadingMore ? (
                        <Spinner size="tiny" />
                    ) : (
                        <Button appearance="subtle" onClick={onLoadMore}>
                            {t("loadMore")}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

/** Open meetings, tasks and calls still ahead, soonest first. Three show; the rest are a click away. */
const UpcomingSection: React.FC<FeedProps & { upcoming: UpcomingFeed }> = (props) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const headerId = useId("upcoming");
    const [expanded, setExpanded] = React.useState(false);
    const { entries, hasMore, onLoadMore } = props.upcoming;
    const shown = expanded ? entries : entries.slice(0, UPCOMING_COLLAPSED);
    const hidden = entries.length - shown.length;

    return (
        <section aria-labelledby={headerId}>
            <SectionHeader className={styles.dayHeader} id={headerId} heading label={t("upcoming")} count={hasMore ? `${entries.length}+` : entries.length} />
            <div className={styles.dayBody}>
                {shown.map((entry, i) =>
                    entry.type === "item" ? (
                        <ItemCard key={entry.key} item={entry.item} position={i + 1} withDay {...props} />
                    ) : (
                        <ThreadCard key={entry.key} entryKey={entry.key} items={entry.items} position={i + 1} {...props} />
                    ),
                )}
                {(hidden > 0 || expanded) && (
                    <div className={styles.upcomingActions}>
                        {hidden > 0 && (
                            <Button appearance="transparent" size="small" icon={<ChevronDownRegular />} onClick={() => setExpanded(true)}>
                                {t("moreUpcoming", hasMore ? `${hidden}+` : hidden)}
                            </Button>
                        )}
                        {expanded && hasMore && (
                            <Button appearance="transparent" size="small" onClick={onLoadMore}>
                                {t("loadMore")}
                            </Button>
                        )}
                        {expanded && entries.length > UPCOMING_COLLAPSED && (
                            <Button appearance="transparent" size="small" icon={<ChevronUpRegular />} onClick={() => setExpanded(false)}>
                                {t("showFewerMessages")}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};

// --- shared pieces ----------------------------------------------------------------------------------------------

function isNew(item: TimelineItem, lastSeen: number | undefined, me: string): boolean {
    if (!lastSeen) return false;
    const author = item.createdBy?.id?.toLowerCase();
    return item.createdOn.getTime() > lastSeen && author !== me;
}

const Facts: React.FC<{ item: TimelineItem }> = ({ item }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const facts: React.ReactNode[] = [];
    const open = isOpenState(item.state);

    if (open && item.entity !== "email") {
        const start = item.entity === "appointment" || item.entity === "serviceappointment" ? item.scheduledStart : undefined;
        if (start) {
            if (item.dateField !== "scheduledstart") facts.push(
                <span key="start" className={styles.fact}>
                    <ClockRegular className={styles.factIcon} />
                    {t("startsAt", formatUpcoming(dates, start))}
                </span>,
            );
        } else if (item.scheduledEnd && item.dateField !== "scheduledend") {
            facts.push(
                <span key="due" className={mergeClasses(styles.fact, item.isOverdue && styles.factDanger)}>
                    <ClockRegular className={styles.factIcon} />
                    {t("dueOn", formatShortDate(dates, item.scheduledEnd))}
                </span>,
            );
        }
    }
    if (item.priority === "high") {
        facts.push(
            <span key="prio" className={mergeClasses(styles.fact, styles.factDanger)}>
                <ImportantRegular className={styles.factIcon} />
                {t("priorityHigh")}
            </span>,
        );
    }
    if (item.durationMinutes && item.entity === "phonecall") {
        facts.push(
            <span key="dur" className={styles.fact}>
                <TimerRegular className={styles.factIcon} />
                {formatDuration(item.durationMinutes, dates.locale)}
            </span>,
        );
    }
    if (item.file) {
        const isImage = item.file.mimeType?.startsWith("image/");
        const FileIcon = isImage ? ImageRegular : DocumentRegular;
        facts.push(
            <span key="file" className={styles.fact} title={item.file.fileName}>
                <FileIcon className={styles.factIcon} />
                {item.file.fileName}
            </span>,
        );
    }
    if (item.attachmentCount) {
        facts.push(
            <span key="att" className={styles.fact}>
                <AttachRegular className={styles.factIcon} />
                {item.attachmentCount}
            </span>,
        );
    }
    return facts.length > 0 ? <div className={styles.facts}>{facts}</div> : null;
};

interface CardProps extends FeedProps {
    position: number;
    /** Show the day with the time: upcoming items have no day header above them */
    withDay?: boolean;
}

function lowerFirst(text: string): string {
    return text.charAt(0).toLocaleLowerCase() + text.slice(1);
}

/** "Today 14:00", "Tomorrow 09:30", "Thu 10:00" or "12 Nov 10:00" */
function dayAndTime(dates: DateEnv, date: Date, labels: { today: string; tomorrow: string }, midSentence: boolean): string {
    const ahead = -daysAgo(dates, date);
    const word = ahead === 0 ? labels.today : ahead === 1 ? labels.tomorrow : undefined;
    if (!word) return formatUpcoming(dates, date);
    return `${midSentence ? lowerFirst(word) : word} ${formatTime(dates, date)}`;
}

/**
 * The card's time. A small word says which date it is when that isn't obvious ("updated 10:14", "due 16:00");
 * the tooltip lists created, last updated and completed.
 */
const DateStamp: React.FC<{ item: TimelineItem; eventDates: boolean; withDay?: boolean }> = ({ item, eventDates, withDay }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const verbs: Record<string, string> = {
        modifiedon: t("verbUpdated"),
        actualend: t("verbCompleted"),
        scheduledend: item.isOverdue ? t("verbOverdue") : t("verbDue"),
        scheduledstart: t("verbStarts"),
        senton: t("verbSent"),
    };
    // By activity date a meeting's time is when it's held and a call's when it happened; only a deadline needs saying
    const verb = eventDates ? (item.dateField === "scheduledend" ? verbs.scheduledend : undefined) : verbs[item.dateField];
    const lines = [t("createdAt", formatFull(dates, item.createdOn))];
    if (item.modifiedOn && Math.abs(item.modifiedOn.getTime() - item.createdOn.getTime()) > 60000) lines.push(t("updatedAt", formatFull(dates, item.modifiedOn)));
    if (item.actualEnd && item.state === "completed") lines.push(t("completedAt", formatFull(dates, item.actualEnd)));
    return (
        <Tooltip
            content={<div className={styles.stampTip}>{lines.map((l) => <span key={l}>{l}</span>)}</div>}
            relationship="description"
        >
            <time className={mergeClasses(styles.time, item.isOverdue && styles.timeOverdue)} dateTime={item.date.toISOString()}>
                {verb && <span className={item.isOverdue ? undefined : styles.timeVerb}>{verb} </span>}
                {withDay ? dayAndTime(dates, item.date, { today: t("today"), tomorrow: t("tomorrow") }, !!verb) : formatTime(dates, item.date)}
            </time>
        </Tooltip>
    );
};

function cardKeyDown(e: React.KeyboardEvent, item: TimelineItem, onSelect: (key: string) => void, onOpen: (i: TimelineItem) => void) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(item.key);
    } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        onOpen(item);
    }
}

const ItemCard: React.FC<CardProps & { item: TimelineItem }> = ({ item, position, withDay, eventDates, total, density, selectedKey, lastSeen, currentUserId, onSelect, onOpen, onComplete }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const [hover, setHover] = React.useState(false);
    const compact = density === "compact";
    const titleId = `title-${item.key}`;
    const selected = selectedKey === item.key;
    const showComplete = item.kind === "activity" && isOpenState(item.state) && canComplete(item.entity);

    return (
        <div className={styles.row}>
            <TypeNode item={item} compact={compact} className={styles.node} />
            <article
                data-card
                tabIndex={0}
                aria-labelledby={titleId}
                aria-posinset={position}
                aria-setsize={total}
                aria-current={selected || undefined}
                className={mergeClasses(styles.card, compact && styles.cardCompact, selected && styles.selected)}
                onClick={() => onSelect(item.key)}
                onKeyDown={(e) => cardKeyDown(e, item, onSelect, onOpen)}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onFocus={() => setHover(true)}
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false);
                }}
            >
                <div className={styles.head}>
                    <span id={titleId} className={styles.title}>
                        {isNew(item, lastSeen, currentUserId) && <span className={styles.newDot} role="img" aria-label={t("newBadge")} />}
                        {item.title}
                    </span>
                    <DateStamp item={item} eventDates={eventDates} withDay={withDay} />
                </div>
                <div className={styles.lower}>
                    <div className={styles.lowerMain}>
                        <div className={styles.meta}>
                            <span className={styles.typeLabel}>{item.typeLabel}</span>
                            <People item={item} />
                        </div>
                        {!compact && item.snippet && <div className={styles.snippet}>{item.snippet}</div>}
                        {!compact && <Facts item={item} />}
                    </div>
                    <CardStatus item={item} />
                </div>
                <div className={mergeClasses(styles.actions, hover && styles.actionsVisible)}>
                    {showComplete && (
                        <Tooltip content={t("markComplete")} relationship="label">
                            <Button
                                size="small"
                                appearance="subtle"
                                icon={<CheckmarkRegular />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onComplete(item);
                                }}
                            />
                        </Tooltip>
                    )}
                    <Tooltip content={t("openRecord")} relationship="label">
                        <Button
                            size="small"
                            appearance="subtle"
                            icon={<OpenRegular />}
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpen(item);
                            }}
                        />
                    </Tooltip>
                </div>
            </article>
        </div>
    );
};

/**
 * An email conversation is one card: subject, message count and the newest message.
 * Opening it shows the whole conversation in the preview, newest message first.
 */
const ThreadCard: React.FC<CardProps & { entryKey: string; items: TimelineItem[] }> = ({ entryKey, items, position, withDay, eventDates, total, density, selectedKey, lastSeen, currentUserId, onSelect, onOpen }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const latest = items[0];
    const compact = density === "compact";
    const titleId = `title-${entryKey}`;
    const participants = Array.from(new Set(items.flatMap((i) => i.from.map((p) => p.name)).filter(Boolean)));
    const anyNew = items.some((i) => isNew(i, lastSeen, currentUserId));
    const totalAttachments = items.reduce((n, i) => n + (i.attachmentCount ?? 0), 0);
    const DirIcon = latest.direction === "out" ? ArrowUpRightRegular : ArrowDownLeftRegular;

    return (
        <div className={styles.row}>
            <TypeNode item={latest} compact={compact} badge={items.length} className={styles.node} />
            <article
                data-card
                tabIndex={0}
                aria-labelledby={titleId}
                aria-posinset={position}
                aria-setsize={total}
                aria-current={selectedKey === entryKey || undefined}
                className={mergeClasses(styles.card, compact && styles.cardCompact, selectedKey === entryKey && styles.selected)}
                onClick={() => onSelect(entryKey)}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(entryKey);
                    } else if (e.key === "o" || e.key === "O") {
                        e.preventDefault();
                        onOpen(latest);
                    }
                }}
            >
                <div className={styles.head}>
                    <span id={titleId} className={styles.title}>
                        {anyNew && <span className={styles.newDot} role="img" aria-label={t("newBadge")} />}
                        {stripReplyPrefixes(latest.title)}
                    </span>
                    <DateStamp item={latest} eventDates={eventDates} withDay={withDay} />
                </div>
                <div className={styles.lower}>
                    <div className={styles.lowerMain}>
                    <div className={styles.meta}>
                        <span className={styles.typeLabel}>{latest.typeLabel}</span>
                        <span>{t("messages", items.length)}</span>
                        <span className={styles.people}>{participants.slice(0, 3).join(", ")}</span>
                        {totalAttachments > 0 && (
                            <span className={styles.people}>
                                <AttachRegular className={styles.dirIcon} />
                                {totalAttachments}
                            </span>
                        )}
                    </div>
                    {!compact && (!!latest.snippet || latest.from.length > 0) && (
                        <div className={styles.snippet}>
                            {latest.direction && <DirIcon className={mergeClasses(styles.dirIcon, latest.direction === "out" ? styles.dirOut : styles.dirIn)} />}{" "}
                            {latest.from[0] && <span className={styles.latestFrom}>{latest.from[0].name}: </span>}
                            {latest.snippet ?? ""}
                        </div>
                    )}
                    </div>
                    <CardStatus item={latest} />
                </div>
            </article>
        </div>
    );
};

export const FeedSkeleton: React.FC = () => {
    const styles = useStyles();
    return (
        <Skeleton aria-busy>
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonRow}>
                    <SkeletonItem shape="circle" size={32} />
                    <div className={styles.skeletonLines}>
                        <SkeletonItem size={16} style={{ width: `${70 - i * 8}%` }} />
                        <SkeletonItem size={12} style={{ width: "45%" }} />
                        <SkeletonItem size={12} style={{ width: `${85 - i * 5}%` }} />
                    </div>
                </div>
            ))}
        </Skeleton>
    );
};


