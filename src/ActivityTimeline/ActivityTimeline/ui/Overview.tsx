import * as React from "react";
import { makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import { CircleRegular, WarningRegular } from "@fluentui/react-icons";
import { Counts, TimelineFilters } from "../model/types";
import { useTimelineEnv } from "./TimelineContext";

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
