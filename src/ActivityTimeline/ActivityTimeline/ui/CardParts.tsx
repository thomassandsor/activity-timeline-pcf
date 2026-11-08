import * as React from "react";
import {
    AvatarGroup, AvatarGroupItem, AvatarGroupPopover, makeStyles, mergeClasses, partitionAvatarGroupItems, shorthands, tokens, Tooltip,
} from "@fluentui/react-components";
import { ArrowDownLeftRegular, ArrowUpRightRegular, CallInboundRegular, CallOutboundRegular } from "@fluentui/react-icons";
import { ItemState, PartyRef, TimelineItem } from "../model/types";
import { useTimelineEnv, useTypeVisual } from "./TimelineContext";

export const NODE = 32;

const useStyles = makeStyles({
    node: {
        position: "relative",
        zIndex: 1,
        flexShrink: 0,
        width: `${NODE}px`,
        height: `${NODE}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: tokens.borderRadiusCircular,
        boxShadow: `0 0 0 3px ${tokens.colorNeutralBackground1}`,
        fontSize: "16px",
        boxSizing: "border-box",
    },
    nodeCompact: {
        width: "24px",
        height: "24px",
        marginLeft: "4px",
        fontSize: "13px",
    },
    nodeBadge: {
        position: "absolute",
        right: "-4px",
        bottom: "-4px",
        minWidth: "16px",
        height: "16px",
        ...shorthands.padding("0", "4px"),
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: tokens.colorNeutralForeground1,
        color: tokens.colorNeutralForegroundInverted,
        fontSize: "10px",
        fontWeight: tokens.fontWeightSemibold,
        boxShadow: `0 0 0 2px ${tokens.colorNeutralBackground1}`,
    },
    nodeBadgeDanger: {
        backgroundColor: tokens.colorPaletteRedBackground3,
        color: tokens.colorNeutralForegroundOnBrand,
    },
    // Smaller on the compact icon, so the icon stays visible
    nodeBadgeCompact: {
        right: "-3px",
        bottom: "-3px",
        minWidth: "12px",
        height: "12px",
        ...shorthands.padding("0", "2px"),
        fontSize: "9px",
    },
    section: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        color: tokens.colorNeutralForeground2,
        fontSize: tokens.fontSizeBase200,
        fontWeight: tokens.fontWeightSemibold,
        lineHeight: tokens.lineHeightBase200,
    },
    rule: {
        flexGrow: 1,
        height: "1px",
        backgroundColor: tokens.colorNeutralStroke2,
    },
    count: {
        color: tokens.colorNeutralForeground3,
        fontWeight: tokens.fontWeightRegular,
        fontVariantNumeric: "tabular-nums",
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
    status: { display: "inline-flex", alignItems: "center", columnGap: "6px", flexShrink: 0 },
    statusDetail: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: "20px", whiteSpace: "nowrap" },
    pill: {
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        height: "20px",
        ...shorthands.padding("0", "8px"),
        borderRadius: tokens.borderRadiusCircular,
        fontSize: "11px",
        fontWeight: tokens.fontWeightSemibold,
        lineHeight: "20px",
        whiteSpace: "nowrap",
    },
    open: {
        backgroundColor: tokens.colorBrandBackground2,
        color: tokens.colorBrandForeground2,
    },
    done: {
        backgroundColor: tokens.colorPaletteGreenBackground1,
        color: tokens.colorPaletteGreenForeground1,
    },
    canceled: {
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground3,
    },
});

/** The type icon. It looks the same whatever the state: the status pill says how far the work has come. */
export const TypeNode: React.FC<{ item: TimelineItem; compact?: boolean; badge?: number; className?: string }> = ({ item, compact, badge, className }) => {
    const styles = useStyles();
    const v = useTypeVisual(item.entity);
    // Calls show which way they went
    let Icon = v.Icon;
    if (item.entity === "phonecall" && item.direction) Icon = item.direction === "in" ? CallInboundRegular : CallOutboundRegular;
    return (
        <span className={mergeClasses(styles.node, compact && styles.nodeCompact, className)} style={{ backgroundColor: v.bg, color: v.fg }} aria-hidden>
            <Icon />
            {badge !== undefined && <span className={mergeClasses(styles.nodeBadge, compact && styles.nodeBadgeCompact)}>{badge}</span>}
            {badge === undefined && item.isOverdue && <span className={mergeClasses(styles.nodeBadge, styles.nodeBadgeDanger, compact && styles.nodeBadgeCompact)}>!</span>}
        </span>
    );
};

/** A label, a hairline and a count: the timeline's day header, and every section in the preview */
export const SectionHeader: React.FC<{ label: string; count?: React.ReactNode; id?: string; heading?: boolean; className?: string }> = ({ label, count, id, heading, className }) => {
    const styles = useStyles();
    return (
        <div className={mergeClasses(styles.section, className)} id={id} {...(heading ? { role: "heading", "aria-level": 3 } : {})}>
            <span>{label}</span>
            <span className={styles.rule} aria-hidden />
            {count !== undefined && <span className={styles.count}>{count}</span>}
        </div>
    );
};

function names(parties: PartyRef[], max: number): string {
    const list = parties.slice(0, max).map((p) => p.name).join(", ");
    return parties.length > max ? `${list} +${parties.length - max}` : list;
}

/** Who it's between. A note shows its writer, and work without participants shows its owner. */
export const People: React.FC<{ item: TimelineItem; max?: number }> = ({ item, max = 1 }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    if (item.kind === "note") {
        return item.createdBy?.name ? <span className={styles.people}>{item.createdBy.name}</span> : null;
    }
    if (item.attendees.length > 0) {
        const { inlineItems, overflowItems } = partitionAvatarGroupItems({ items: item.attendees, maxInlineItems: 3 });
        return (
            <span className={styles.people}>
                <AvatarGroup size={16} layout="stack">
                    {inlineItems.map((p, i) => (
                        <AvatarGroupItem key={`${p.name}-${i}`} name={p.name} />
                    ))}
                    {overflowItems && (
                        <AvatarGroupPopover>
                            {overflowItems.map((p, i) => (
                                <AvatarGroupItem key={`${p.name}-${i}`} name={p.name} />
                            ))}
                        </AvatarGroupPopover>
                    )}
                </AvatarGroup>
                {names(item.attendees, Math.max(max, 2))}
            </span>
        );
    }
    if (item.from.length > 0 || item.to.length > 0) {
        const DirIcon = item.direction === "out" ? ArrowUpRightRegular : ArrowDownLeftRegular;
        return (
            <span className={styles.people}>
                {item.direction && (
                    <Tooltip content={item.direction === "out" ? t("outgoing") : t("incoming")} relationship="label">
                        <DirIcon className={mergeClasses(styles.dirIcon, item.direction === "out" ? styles.dirOut : styles.dirIn)} />
                    </Tooltip>
                )}
                {names(item.from, max)}
                {item.to.length > 0 && <span aria-hidden>→</span>}
                {item.to.length > 0 && names(item.to.concat(item.cc), max)}
            </span>
        );
    }
    return item.owner?.name ? <span className={styles.people}>{item.owner.name}</span> : null;
};

/** How the pill for a state looks */
export function useStatusTone(state: ItemState): string {
    const styles = useStyles();
    if (state === "completed") return styles.done;
    return state === "canceled" ? styles.canceled : styles.open;
}

const STATE_WORDS = { open: "statusOpen", scheduled: "statusScheduled", completed: "statusCompleted", canceled: "statusCanceled" } as const;

/**
 * The same words for every type, from the state list all activities share. Each table's own status reasons
 * say the same thing in different words (a call is "Made", a task "Completed"), which reads as if they meant different things.
 */
export function stateText(state: ItemState, t: ReturnType<typeof useTimelineEnv>["t"]): string {
    return t(STATE_WORDS[state]);
}

export const StatusPill: React.FC<{ item: TimelineItem }> = ({ item }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const tone = useStatusTone(item.state);
    if (item.kind === "note") return null;
    return <span className={mergeClasses(styles.pill, tone)}>{stateText(item.state, t)}</span>;
};

/** A card's corner: the pills line up, and the status reason sits quietly to the left of its pill */
export const CardStatus: React.FC<{ item: TimelineItem }> = ({ item }) => {
    const styles = useStyles();
    return (
        <span className={styles.status}>
            {item.statusDetail && <span className={styles.statusDetail}>{item.statusDetail}</span>}
            <StatusPill item={item} />
        </span>
    );
};
