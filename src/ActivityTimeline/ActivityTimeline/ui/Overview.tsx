import * as React from "react";
import { makeStyles, mergeClasses, shorthands, tokens, Tooltip } from "@fluentui/react-components";
import { CircleRegular, WarningRegular } from "@fluentui/react-icons";
import { formatWeekRange, isoWeek } from "../model/dates";
import { computeRhythm, RhythmWeek, weekRange } from "../model/feed";
import { Counts, RhythmRow, TimelineFilters } from "../model/types";
import { TypeDot, useTimelineEnv, useTypeVisual } from "./TimelineContext";

const useStyles = makeStyles({
    summary: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: "2px",
        rowGap: "2px",
        marginBottom: tokens.spacingVerticalS,
        fontSize: tokens.fontSizeBase200,
        lineHeight: tokens.lineHeightBase200,
        color: tokens.colorNeutralForeground3,
    },
    sep: {
        color: tokens.colorNeutralStroke1,
        ...shorthands.padding("0", "2px"),
    },
    item: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "4px",
        maxWidth: "100%",
        minHeight: "24px",
        ...shorthands.padding("0", "6px"),
        ...shorthands.border(0),
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: "transparent",
        color: tokens.colorNeutralForeground2,
        fontFamily: tokens.fontFamilyBase,
        fontSize: tokens.fontSizeBase200,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover, color: tokens.colorNeutralForeground1 },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2 },
    },
    itemActive: {
        backgroundColor: tokens.colorBrandBackground2,
        color: tokens.colorBrandForeground2,
        ":hover": { backgroundColor: tokens.colorBrandBackground2Hover, color: tokens.colorBrandForeground2 },
    },
    danger: {
        color: tokens.colorPaletteRedForeground1,
        ":hover": { color: tokens.colorPaletteRedForeground1 },
    },
    strong: { fontWeight: tokens.fontWeightSemibold },
    icon: { fontSize: "14px", flexShrink: 0 },
    ellipsis: { overflow: "hidden", textOverflow: "ellipsis" },

    rhythm: {
        display: "flex",
        flexDirection: "column",
        rowGap: "4px",
    },
    rhythmLabel: {
        fontSize: tokens.fontSizeBase100,
        color: tokens.colorNeutralForeground3,
    },
    bars: {
        position: "relative",
        display: "flex",
        alignItems: "flex-end",
        columnGap: "3px",
        height: "32px",
    },
    bar: {
        position: "relative",
        flexGrow: 1,
        flexBasis: 0,
        minWidth: "3px",
        height: "100%",
        display: "flex",
        flexDirection: "column-reverse",
        ...shorthands.padding(0),
        ...shorthands.border(0),
        backgroundColor: "transparent",
        cursor: "pointer",
        borderRadius: tokens.borderRadiusSmall,
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2 },
    },
    barEmpty: {
        cursor: "default",
        ":hover": { backgroundColor: "transparent" },
    },
    baseline: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "2px",
        borderRadius: "1px",
        backgroundColor: tokens.colorNeutralStroke2,
    },
    segment: { width: "100%", borderRadius: "2px" },
    future: { opacity: 0.45 },
    dimmed: { opacity: 0.25 },
    current: {
        "::after": {
            content: '""',
            position: "absolute",
            left: "50%",
            bottom: "-5px",
            width: "3px",
            height: "3px",
            marginLeft: "-1.5px",
            borderRadius: tokens.borderRadiusCircular,
            backgroundColor: tokens.colorBrandForeground1,
        },
    },
    nowLine: {
        width: "1px",
        alignSelf: "stretch",
        flexShrink: 0,
        backgroundImage: `linear-gradient(${tokens.colorNeutralStroke1} 50%, transparent 0)`,
        backgroundSize: "1px 4px",
    },
    tooltip: { display: "flex", flexDirection: "column", rowGap: "2px" },
    tooltipRow: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalXS },
});

interface SummaryProps {
    counts: Counts;
    filters: TimelineFilters;
    onFilter: (update: Partial<TimelineFilters>) => void;
}

/** One quiet line of what needs attention: overdue and open. Each part filters the feed. */
export const SummaryLine: React.FC<SummaryProps> = ({ counts, filters, onFilter }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const parts: React.ReactNode[] = [];

    if (counts.overdue > 0) {
        const on = filters.status === "overdue";
        parts.push(
            <button
                key="overdue"
                type="button"
                className={mergeClasses(styles.item, styles.danger, on && styles.itemActive)}
                aria-pressed={on}
                onClick={() => onFilter({ status: on ? "all" : "overdue" })}
            >
                <WarningRegular className={styles.icon} />
                <span className={styles.strong}>{t("overdueCount", counts.overdue)}</span>
            </button>,
        );
    }
    if (counts.open > 0) {
        const on = filters.status === "open";
        parts.push(
            <button
                key="open"
                type="button"
                className={mergeClasses(styles.item, on && styles.itemActive)}
                aria-pressed={on}
                onClick={() => onFilter({ status: on ? "all" : "open" })}
            >
                <CircleRegular className={styles.icon} />
                {t("openCount", counts.open)}
            </button>,
        );
    }
    if (parts.length === 0) return null;

    return (
        <div className={styles.summary}>
            {parts.map((p, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span className={styles.sep} aria-hidden>·</span>}
                    {p}
                </React.Fragment>
            ))}
        </div>
    );
};

/** Weeks of scheduled items shown after the current week */
export const RHYTHM_WEEKS_AHEAD = 4;

interface RhythmProps {
    rows: RhythmRow[];
    weeksBack: number;
    filters: TimelineFilters;
    onFilter: (update: Partial<TimelineFilters>) => void;
}

/** Activity per week; selecting a week filters the feed to it. Lives in the filter panel. */
export const RhythmChart: React.FC<RhythmProps> = ({ rows, weeksBack, filters, onFilter }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const weeks = React.useMemo(() => computeRhythm(dates, rows, weeksBack, RHYTHM_WEEKS_AHEAD), [dates, rows, weeksBack]);
    const max = Math.max(1, ...weeks.map((w) => w.total));
    const historyCount = weeks.filter((w) => !w.isFuture).length;
    const range = filters.date.kind === "range" ? filters.date : undefined;
    const selectedWeek = range ? weeks.find((w) => weekRange(dates, w.wallStart).from.getTime() === range.from.getTime()) : undefined;

    // Not worth the space when everything happened in a week or two
    if (weeks.filter((w) => w.total > 0).length < 3) return null;

    const toggle = (w: RhythmWeek) => {
        if (w.total === 0) return;
        if (selectedWeek === w) {
            onFilter({ date: { kind: "any" } });
        } else {
            const r = weekRange(dates, w.wallStart);
            onFilter({ date: { kind: "range", from: r.from, to: r.to, label: t("weekFilter", isoWeek(w.wallStart)) } });
        }
    };

    return (
        <div className={styles.rhythm}>
            <span className={styles.rhythmLabel}>{t("rhythmLabel")}</span>
            <div className={styles.bars} role="group" aria-label={`${t("rhythmLabel")}. ${t("rhythmHint")}`}>
                {weeks.map((w, i) => (
                    <React.Fragment key={w.wallStart}>
                        {i === historyCount && <span className={styles.nowLine} aria-hidden />}
                        <WeekBar week={w} max={max} selected={selectedWeek === w} dimmed={!!selectedWeek && selectedWeek !== w} onClick={() => toggle(w)} />
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

const WeekBar: React.FC<{ week: RhythmWeek; max: number; selected: boolean; dimmed: boolean; onClick: () => void }> = ({ week, max, selected, dimmed, onClick }) => {
    const { t, dates, typeLabel } = useTimelineEnv();
    const styles = useStyles();
    const label = `${t("rhythmWeek", isoWeek(week.wallStart))} · ${formatWeekRange(dates, week.wallStart)}`;
    const sorted = [...week.byType].sort((a, b) => b.count - a.count);
    const tooltip = (
        <div className={styles.tooltip}>
            <strong>{label}</strong>
            {sorted.length === 0 && <span>{t("noActivityThisWeek")}</span>}
            {sorted.map((b) => (
                <span key={b.entity} className={styles.tooltipRow}>
                    <TypeDot entity={b.entity} />
                    {b.count} · {typeLabel(b.entity)}
                </span>
            ))}
        </div>
    );
    // Square-root scale: a quiet week with one item stays visible next to a busy one
    const heightPct = week.total > 0 ? Math.max(20, Math.sqrt(week.total / max) * 100) : 0;
    return (
        <Tooltip content={tooltip} relationship="description" withArrow positioning="above">
            <button
                type="button"
                className={mergeClasses(styles.bar, week.total === 0 && styles.barEmpty, week.isCurrent && styles.current)}
                aria-label={`${label}: ${week.total}`}
                aria-pressed={selected}
                aria-disabled={week.total === 0}
                onClick={onClick}
            >
                <span className={styles.baseline} aria-hidden />
                <span style={{ display: "flex", flexDirection: "column-reverse", rowGap: "1px", height: `${heightPct}%`, width: "100%" }}>
                    {sorted.map((b) => (
                        <Segment key={b.entity} entity={b.entity} share={b.count / week.total} future={week.isFuture} dimmed={dimmed} />
                    ))}
                </span>
            </button>
        </Tooltip>
    );
};

const Segment: React.FC<{ entity: string; share: number; future: boolean; dimmed: boolean }> = ({ entity, share, future, dimmed }) => {
    const styles = useStyles();
    const v = useTypeVisual(entity);
    return (
        <span
            className={mergeClasses(styles.segment, future && styles.future, dimmed && styles.dimmed)}
            style={{ flexGrow: share, flexBasis: 0, minHeight: "3px", backgroundColor: v.strong }}
        />
    );
};
