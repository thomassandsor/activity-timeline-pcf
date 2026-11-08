import * as React from "react";
import {
    Button, Combobox, Input, makeStyles, Menu, MenuDivider, MenuGroup, MenuGroupHeader, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, mergeClasses, Option, Popover,
    PopoverSurface, PopoverTrigger, shorthands, tokens, Tooltip,
} from "@fluentui/react-components";
import {
    ArrowDownLeftRegular, ArrowUpRightRegular, CalendarAddRegular, CalendarLtrRegular, CheckmarkCircleRegular, ChevronDownRegular, ChevronLeftRegular, ChevronRightRegular,
    ClockRegular, DismissCircleRegular, FluentIcon, ImportantRegular,
} from "@fluentui/react-icons";
import { QuickEdit } from "../model/activityTypes";
import {
    DateEnv, DAY_MS, formatMedium, formatMediumSpan, formatRelative, formatWallDate, formatWallMonth, formatWallTime, formatWallWeekday, fromWall, parseWallDate,
    parseWallTime, toWall, wallDay,
} from "../model/dates";
import { isOpenState } from "../model/feed";
import { EditValues, ItemChanges, ItemState, StatusOption, TimelineItem } from "../model/types";
import { stateText, StatusPill } from "./CardParts";
import { Translate, useTimelineEnv } from "./TimelineContext";

const useStyles = makeStyles({
    // What can be changed has a border, like any field. What can't is plain text.
    field: {
        boxSizing: "border-box",
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke1),
        borderBottomColor: tokens.colorNeutralStrokeAccessible,
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground1,
        color: tokens.colorNeutralForeground1,
        fontFamily: tokens.fontFamilyBase,
        transitionProperty: "border-color, box-shadow",
        transitionDuration: tokens.durationFaster,
        ":hover:not(:focus)": {
            ...shorthands.borderColor(tokens.colorNeutralStroke1Hover),
            borderBottomColor: tokens.colorNeutralStrokeAccessibleHover,
        },
    },
    textField: {
        display: "block",
        width: "100%",
        ...shorthands.margin(0),
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        outlineStyle: "none",
        "::placeholder": { color: tokens.colorNeutralForeground4, fontWeight: tokens.fontWeightRegular, opacity: 1 },
        ":focus": {
            borderBottomColor: tokens.colorBrandStroke1,
            boxShadow: `inset 0 -1px 0 ${tokens.colorBrandStroke1}`,
        },
    },
    titleField: {
        ...shorthands.padding("4px", "8px"),
        fontSize: "inherit",
        fontWeight: "inherit",
        lineHeight: "inherit",
    },
    bodyField: {
        minHeight: "84px",
        ...shorthands.padding("6px", "8px"),
        fontSize: tokens.fontSizeBase300,
        lineHeight: tokens.lineHeightBase300,
    },
    // A menu or a picker, so it reads like a dropdown
    select: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "6px",
        height: "32px",
        maxWidth: "100%",
        ...shorthands.padding("0", "8px", "0", "8px"),
        fontSize: tokens.fontSizeBase300,
        lineHeight: tokens.lineHeightBase300,
        whiteSpace: "nowrap",
        cursor: "pointer",
        ":active": { ...shorthands.borderColor(tokens.colorNeutralStroke1Pressed) },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2, outlineOffset: "1px" },
    },
    selectStatus: { paddingLeft: "5px" },
    statusDetail: { minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: tokens.colorNeutralForeground3 },
    chevron: { fontSize: "12px", flexShrink: 0, marginLeft: "2px", color: tokens.colorNeutralForeground3 },
    // Read-only, the same height as a field, so a row of both lines up
    value: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "6px",
        minHeight: "32px",
        maxWidth: "100%",
        fontSize: tokens.fontSizeBase300,
        lineHeight: tokens.lineHeightBase300,
        color: tokens.colorNeutralForeground1,
        overflowWrap: "anywhere",
    },
    valueIcon: { fontSize: "16px", flexShrink: 0, color: tokens.colorNeutralForeground3 },
    quiet: { color: tokens.colorNeutralForeground3 },
    danger: { color: tokens.colorPaletteRedForeground1 },
    prop: { display: "flex", flexDirection: "column", alignItems: "flex-start", rowGap: "4px", minWidth: 0, maxWidth: "100%" },
    propWide: { alignItems: "stretch", width: "100%" },
    propLabel: { fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200, color: tokens.colorNeutralForeground3 },
    chip: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "5px",
        height: "24px",
        maxWidth: "100%",
        boxSizing: "border-box",
        ...shorthands.padding("0", "8px"),
        ...shorthands.border(0),
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground2,
        fontFamily: tokens.fontFamilyBase,
        fontSize: tokens.fontSizeBase200,
        lineHeight: tokens.lineHeightBase200,
        whiteSpace: "nowrap",
    },
    chipButton: {
        cursor: "pointer",
        transitionProperty: "background-color",
        transitionDuration: tokens.durationFaster,
        ":hover": { backgroundColor: tokens.colorNeutralBackground3Hover },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2 },
    },
    surface: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalS,
        width: "272px",
        ...shorthands.padding(tokens.spacingVerticalM),
    },
    caption: { fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, marginBottom: "2px" },
    dateRow: { display: "flex", columnGap: tokens.spacingHorizontalXS },
    dateInput: { flexGrow: 1, minWidth: 0, "& input": { minWidth: 0, width: "100%" } },
    timeInput: { width: "96px", minWidth: 0, flexShrink: 0, "& input": { width: "100%", minWidth: 0 } },
    timeList: { maxHeight: "200px", overflowY: "auto" },
    quick: { display: "flex", columnGap: tokens.spacingHorizontalXS },
    quickChip: { flexGrow: 1, justifyContent: "center" },
    error: { color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase200 },
    calendarHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    month: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
    grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: "2px" },
    weekday: { textAlign: "center", fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, ...shorthands.padding("2px", "0") },
    day: {
        height: "28px",
        ...shorthands.padding(0),
        ...shorthands.border(0),
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: "transparent",
        color: tokens.colorNeutralForeground1,
        fontFamily: tokens.fontFamilyBase,
        fontSize: tokens.fontSizeBase200,
        fontVariantNumeric: "tabular-nums",
        cursor: "pointer",
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2 },
    },
    dayOther: { color: tokens.colorNeutralForeground4 },
    dayToday: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightBold },
    daySelected: {
        backgroundColor: tokens.colorBrandBackground,
        color: tokens.colorNeutralForegroundOnBrand,
        fontWeight: tokens.fontWeightSemibold,
        ":hover": { backgroundColor: tokens.colorBrandBackgroundHover },
    },
    remove: { alignSelf: "flex-start" },
});

export type Save = (changes: ItemChanges) => Promise<boolean>;

// --- text --------------------------------------------------------------------------------------------------------

/** A caption over a value or a field, so it's clear what each one is */
export const Prop: React.FC<{ label: string; wide?: boolean; children: React.ReactNode }> = ({ label, wide, children }) => {
    const styles = useStyles();
    return (
        <div className={mergeClasses(styles.prop, wide && styles.propWide)}>
            <span className={styles.propLabel}>{label}</span>
            {children}
        </div>
    );
};

interface InlineTextProps {
    value: string;
    label: string;
    placeholder: string;
    /** One line that wraps, and Enter saves */
    title?: boolean;
    first?: boolean;
    /** Until what's there to change has loaded */
    readOnly?: boolean;
    /** False keeps what's typed: nothing was saved */
    onCommit: (next: string) => Promise<boolean>;
}

/**
 * A text field that looks like one. Leaving it saves, Enter too in a title, Ctrl+Enter in a text.
 * Esc puts back what was there; with nothing changed, Esc closes the panel as anywhere else in it.
 */
export const InlineText: React.FC<InlineTextProps> = ({ value, label, placeholder, title, first, readOnly, onCommit }) => {
    const styles = useStyles();
    const [draft, setDraft] = React.useState<string>();
    const [focused, setFocused] = React.useState(false);
    const areaRef = React.useRef<HTMLTextAreaElement>(null);
    const text = draft ?? value;

    // Grows with the text, so nothing scrolls inside the panel
    React.useLayoutEffect(() => {
        const area = areaRef.current;
        if (!area) return;
        area.style.height = "auto";
        area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
    }, [text]);

    const commit = async () => {
        if (draft === undefined) return;
        if (draft === value || (await onCommit(draft))) setDraft(undefined);
    };

    return (
        <textarea
            ref={areaRef}
            className={mergeClasses(styles.field, styles.textField, title ? styles.titleField : styles.bodyField)}
            rows={1}
            value={text}
            placeholder={placeholder}
            aria-label={label}
            readOnly={readOnly}
            // Spelling marks only while typing, not on text that's just being read
            spellCheck={focused}
            data-first-edit={first ? true : undefined}
            onFocus={() => setFocused(true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                setFocused(false);
                void commit();
            }}
            onKeyDown={(e) => {
                if (e.key === "Escape" && draft !== undefined && draft !== value) {
                    e.stopPropagation();
                    e.preventDefault();
                    setDraft(undefined);
                } else if (e.key === "Enter" && (title || e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void commit();
                }
            }}
        />
    );
};

// --- status and priority -------------------------------------------------------------------------------------------

/**
 * The same as on the card: the status word, with the status reason beside it while the item is open. On open items it's
 * also a menu to change it, with the open reasons under the word they belong to, then one way each to complete and cancel.
 */
export const StatusChip: React.FC<{ item: TimelineItem; statuses?: StatusOption[]; onChange: (status: StatusOption, trigger: HTMLElement | null) => void }> = ({
    item,
    statuses,
    onChange,
}) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    if (item.kind === "note") return null;
    if (!statuses || statuses.length === 0 || !isOpenState(item.state)) {
        return (
            <Prop label={t("fieldStatus")}>
                <span className={styles.value}>
                    <StatusPill item={item} />
                    {item.statusDetail && <span className={styles.statusDetail}>{item.statusDetail}</span>}
                </span>
            </Prop>
        );
    }
    const groups = (
        [
            ["open", statuses.filter((s) => s.state === 0)],
            ["scheduled", statuses.filter((s) => s.state === 3)],
            ["completed", statuses.filter((s) => s.state === 1)],
            ["canceled", statuses.filter((s) => s.state === 2)],
        ] as [ItemState, StatusOption[]][]
    ).filter(([, options]) => options.length > 0);
    const detail = item.statusDetail;
    const radio = (s: StatusOption, label: string) => (
        <MenuItemRadio key={s.value} name="status" value={String(s.value)}>
            {label}
        </MenuItemRadio>
    );
    return (
        <Prop label={t("fieldStatus")}>
            <Menu
                checkedValues={{ status: item.statusCode !== undefined ? [String(item.statusCode)] : [] }}
                onCheckedValueChange={(_, d) => {
                    const next = statuses.find((s) => String(s.value) === d.checkedItems[0]);
                    if (next && next.value !== item.statusCode) onChange(next, triggerRef.current);
                }}
            >
                <MenuTrigger disableButtonEnhancement>
                    <button
                        ref={triggerRef}
                        type="button"
                        className={mergeClasses(styles.field, styles.select, styles.selectStatus)}
                        aria-label={`${t("changeStatus")}: ${[stateText(item.state, t), detail].filter(Boolean).join(", ")}`}
                    >
                        <StatusPill item={item} />
                        {detail && <span className={styles.statusDetail}>{detail}</span>}
                        <ChevronDownRegular className={styles.chevron} />
                    </button>
                </MenuTrigger>
                <MenuPopover>
                    <MenuList>
                        {groups.map(([state, options], i) => (
                            <React.Fragment key={state}>
                                {i > 0 && <MenuDivider />}
                                {options.length === 1 ? (
                                    radio(options[0], stateText(state, t))
                                ) : (
                                    <MenuGroup>
                                        <MenuGroupHeader>{stateText(state, t)}</MenuGroupHeader>
                                        {options.map((s) => radio(s, s.label))}
                                    </MenuGroup>
                                )}
                            </React.Fragment>
                        ))}
                    </MenuList>
                </MenuPopover>
            </Menu>
        </Prop>
    );
};

export const PriorityChip: React.FC<{ item: TimelineItem; values?: EditValues; editable: boolean; onSave: Save }> = ({ item, values, editable, onSave }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const current = values?.priority;
    const label = values?.priorities.find((p) => p.value === current)?.label ?? item.priorityLabel;
    if (!label) return null;
    const high = current === 2 || (current === undefined && item.priority === "high");
    const icon = high && <ImportantRegular className={mergeClasses(styles.valueIcon, styles.danger)} />;
    if (!editable || !values || values.priorities.length === 0) {
        return (
            <Prop label={t("fieldPriority")}>
                <span className={mergeClasses(styles.value, high && styles.danger)}>
                    {icon}
                    {label}
                </span>
            </Prop>
        );
    }
    return (
        <Prop label={t("fieldPriority")}>
            <Menu
                checkedValues={{ priority: current !== undefined ? [String(current)] : [] }}
                onCheckedValueChange={(_, d) => {
                    const next = Number(d.checkedItems[0]);
                    if (next !== current) void onSave({ priority: next });
                }}
            >
                <MenuTrigger disableButtonEnhancement>
                    <button type="button" className={mergeClasses(styles.field, styles.select, high && styles.danger)} aria-label={`${t("changePriority")}: ${label}`}>
                        {icon}
                        {label}
                        <ChevronDownRegular className={styles.chevron} />
                    </button>
                </MenuTrigger>
                <MenuPopover>
                    <MenuList>
                        {values.priorities.map((p) => (
                            <MenuItemRadio key={p.value} name="priority" value={String(p.value)}>
                                {p.label}
                            </MenuItemRadio>
                        ))}
                    </MenuList>
                </MenuPopover>
            </Menu>
        </Prop>
    );
};

// --- dates ---------------------------------------------------------------------------------------------------------

interface KeyDate {
    Icon: FluentIcon;
    /** What the date is: due, held, done, sent */
    caption: string;
    text: string;
    relative?: string;
    danger?: boolean;
    /** There's no date, and the text says so */
    empty?: boolean;
}

/** The date that matters for this item: when a meeting is held, when work is due or was done, when an email went. */
export function keyDate(item: TimelineItem, rule: string, t: Translate, dates: DateEnv): KeyDate {
    const at = (d: Date) => ({ text: formatMedium(dates, d), relative: formatRelative(dates, d) });
    // Not a pencil: that would say it can be changed
    const created = { Icon: CalendarAddRegular, caption: t("detailCreated"), ...at(item.createdOn) };
    if (item.kind === "note") return created;
    // A draft has been neither sent nor received
    if (item.entity === "email" && !isOpenState(item.state)) {
        const out = item.direction === "out";
        return { Icon: out ? ArrowUpRightRegular : ArrowDownLeftRegular, caption: t(out ? "fieldSent" : "fieldReceived"), ...at(item.createdOn) };
    }
    if (rule === "start" && item.scheduledStart) {
        return {
            Icon: CalendarLtrRegular,
            caption: t("fieldWhen"),
            text: formatMediumSpan(dates, item.scheduledStart, item.scheduledEnd),
            relative: formatRelative(dates, item.scheduledStart),
        };
    }
    if (rule !== "created" && !isOpenState(item.state)) {
        const when = item.actualEnd ?? item.modifiedOn ?? item.createdOn;
        if (item.state === "canceled") return { Icon: DismissCircleRegular, caption: t("statusCanceled"), ...at(when) };
        return { Icon: CheckmarkCircleRegular, caption: t("statusCompleted"), ...at(when) };
    }
    if (rule !== "created" && item.scheduledEnd) return { Icon: ClockRegular, caption: t("dueLabel"), ...at(item.scheduledEnd), danger: item.isOverdue };
    if (rule === "due") return { Icon: ClockRegular, caption: t("dueLabel"), text: t("noDueDate"), empty: true };
    return created;
}

const DateValue: React.FC<{ date: KeyDate }> = ({ date }) => {
    const styles = useStyles();
    return (
        <>
            <date.Icon className={mergeClasses(styles.valueIcon, date.danger && styles.danger)} />
            <span className={date.empty ? styles.quiet : undefined}>{date.text}</span>
            {date.relative && <span className={date.danger ? undefined : styles.quiet}>· {date.relative}</span>}
        </>
    );
};

export const DateText: React.FC<{ date: KeyDate }> = ({ date }) => {
    const styles = useStyles();
    return (
        <Prop label={date.caption}>
            <span className={mergeClasses(styles.value, date.danger && styles.danger)}>
                <DateValue date={date} />
            </span>
        </Prop>
    );
};

/** A month to pick a day from: the week starts where the user's Formats say, and the names are theirs. */
const MiniCalendar: React.FC<{ value?: number; onPick: (day: number) => void }> = ({ value, onPick }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const today = wallDay(dates, dates.now());
    const monthOf = (day: number) => {
        const d = new Date(day);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    };
    const [month, setMonth] = React.useState(() => monthOf(value ?? today));
    const [cursor, setCursor] = React.useState(value ?? today);
    const gridRef = React.useRef<HTMLDivElement>(null);
    const movedByKey = React.useRef(false);

    // A date typed in the box above brings its month along
    React.useEffect(() => {
        if (value === undefined) return;
        setMonth(monthOf(value));
        setCursor(value);
    }, [value]);

    React.useEffect(() => {
        if (!movedByKey.current) return;
        movedByKey.current = false;
        gridRef.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus();
    }, [cursor]);

    const shiftMonth = (delta: number) => {
        const d = new Date(month);
        setMonth(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
    };
    const first = month - ((new Date(month).getUTCDay() - dates.firstDay + 7) % 7) * DAY_MS;
    const days = Array.from({ length: 42 }, (_, i) => first + i * DAY_MS);
    const inMonth = (day: number) => new Date(day).getUTCMonth() === new Date(month).getUTCMonth();

    const onKeyDown = (e: React.KeyboardEvent) => {
        const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (!(e.key in step)) return;
        e.preventDefault();
        e.stopPropagation();
        const next = cursor + step[e.key] * DAY_MS;
        movedByKey.current = true;
        setCursor(next);
        setMonth(monthOf(next));
    };

    return (
        <div>
            <div className={styles.calendarHead}>
                <Tooltip content={t("previousMonth")} relationship="label">
                    <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={() => shiftMonth(-1)} />
                </Tooltip>
                <span className={styles.month} aria-live="polite">{formatWallMonth(dates, month)}</span>
                <Tooltip content={t("nextMonth")} relationship="label">
                    <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={() => shiftMonth(1)} />
                </Tooltip>
            </div>
            <div ref={gridRef} className={styles.grid} role="grid" onKeyDown={onKeyDown}>
                {days.slice(0, 7).map((day) => (
                    <span key={`w${day}`} className={styles.weekday} aria-hidden>
                        {formatWallWeekday(dates, day)}
                    </span>
                ))}
                {days.map((day) => (
                    <button
                        key={day}
                        type="button"
                        role="gridcell"
                        data-day={day}
                        tabIndex={day === cursor ? 0 : -1}
                        aria-selected={day === value}
                        aria-label={formatWallDate(dates, day)}
                        className={mergeClasses(styles.day, !inMonth(day) && styles.dayOther, day === today && styles.dayToday, day === value && styles.daySelected)}
                        onClick={() => onPick(day)}
                    >
                        {new Date(day).getUTCDate()}
                    </button>
                ))}
            </div>
        </div>
    );
};

const MINUTES_PER_CHOICE = 30;
/** A date without a time gets the one the app's own date fields start at */
const DEFAULT_TIME = 8 * 60;

interface DateTimeText {
    date: string;
    time: string;
}

const EMPTY: DateTimeText = { date: "", time: "" };

function toText(dates: DateEnv, value: Date | undefined): DateTimeText {
    if (!value) return EMPTY;
    const wall = toWall(dates, value).getTime();
    const day = wall - (wall % DAY_MS);
    return { date: formatWallDate(dates, day), time: formatWallTime(dates, Math.floor((wall - day) / 60000)) };
}

/** Undefined when both boxes are empty, null when they can't be read */
function readText(dates: DateEnv, text: DateTimeText): Date | null | undefined {
    if (!text.date.trim() && !text.time.trim()) return undefined;
    const day = parseWallDate(dates, text.date);
    const minutes = text.time.trim() ? parseWallTime(dates, text.time) : DEFAULT_TIME;
    return day === undefined || minutes === undefined ? null : fromWall(dates, day + minutes * 60000);
}

const DateTimeBoxes: React.FC<{ label?: string; value: DateTimeText; onChange: (value: DateTimeText) => void }> = ({ label, value, onChange }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const typedTime = React.useRef(false);
    const times = React.useMemo(
        () => Array.from({ length: (24 * 60) / MINUTES_PER_CHOICE }, (_, i) => formatWallTime(dates, i * MINUTES_PER_CHOICE)),
        [dates],
    );
    const day = parseWallDate(dates, value.date);
    /** Typed "745" reads as a time, and shows as one */
    const tidyTime = () => {
        const minutes = value.time.trim() ? parseWallTime(dates, value.time) : undefined;
        if (minutes !== undefined && value.time !== formatWallTime(dates, minutes)) onChange({ ...value, time: formatWallTime(dates, minutes) });
    };
    return (
        <div>
            {label && <div className={styles.caption}>{label}</div>}
            <div className={styles.dateRow}>
                <Input
                    className={styles.dateInput}
                    size="small"
                    aria-label={label ?? t("editDate")}
                    value={value.date}
                    onChange={(_, d) => onChange({ date: d.value, time: value.time || (parseWallDate(dates, d.value) !== undefined ? formatWallTime(dates, DEFAULT_TIME) : "") })}
                    // Typed "8.11" reads as a whole date, and shows as one
                    onBlur={() => day !== undefined && value.date !== formatWallDate(dates, day) && onChange({ ...value, date: formatWallDate(dates, day) })}
                />
                <Combobox
                    className={styles.timeInput}
                    size="small"
                    listbox={{ className: styles.timeList }}
                    // Otherwise the list is sized to fill the window, whatever its own limit
                    positioning={{ autoSize: false }}
                    freeform
                    aria-label={t("editTime")}
                    value={value.time}
                    selectedOptions={times.includes(value.time) ? [value.time] : []}
                    onChange={(e) => {
                        typedTime.current = true;
                        onChange({ ...value, time: e.target.value });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") typedTime.current = false;
                    }}
                    onOptionSelect={(e, d) => {
                        // Tab and Enter select the highlighted option, which is the first one when what's typed isn't in the list. What's typed wins.
                        if (e.type === "keydown" && typedTime.current) tidyTime();
                        else if (d.optionText) onChange({ ...value, time: d.optionText });
                        typedTime.current = false;
                    }}
                    onBlur={tidyTime}
                >
                    {times.map((time) => (
                        <Option key={time} text={time}>
                            {time}
                        </Option>
                    ))}
                </Combobox>
            </div>
        </div>
    );
};

/**
 * The item's date, and how it gets moved: a click opens one-click days, a calendar and the time. Closing it saves, Esc doesn't.
 * Moving a date reloads the feed, so this writes once, when the user is done, and not on every click.
 */
export const DateChip: React.FC<{ date: KeyDate; kind: QuickEdit; values: EditValues; onSave: Save }> = ({ date, kind, values, onSave }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const [open, setOpen] = React.useState(false);
    const [start, setStart] = React.useState<DateTimeText>(EMPTY);
    const [end, setEnd] = React.useState<DateTimeText>(EMPTY);
    const [error, setError] = React.useState<string>();
    const span = kind === "span";
    const today = wallDay(dates, dates.now());

    const was = (value: Date | undefined) => readText(dates, toText(dates, value))?.getTime();

    /** What changed, or undefined when something can't be saved; then the reason shows */
    const collect = (nextEnd = end): ItemChanges | undefined => {
        const newStart = span ? readText(dates, start) : undefined;
        const newEnd = readText(dates, nextEnd);
        if (newEnd === null || newStart === null || (span && (!newStart || !newEnd))) {
            setError(t("editInvalidDate"));
            return undefined;
        }
        if (span && newStart && newEnd && newEnd.getTime() < newStart.getTime()) {
            setError(t("editEndBeforeStart"));
            return undefined;
        }
        const changes: ItemChanges = {};
        if (newEnd?.getTime() !== was(values.end)) changes.end = newEnd ?? null;
        if (span && newStart?.getTime() !== was(values.start)) changes.start = newStart ?? null;
        return changes;
    };

    const finish = (changes: ItemChanges) => {
        setOpen(false);
        if (Object.keys(changes).length > 0) void onSave(changes);
    };

    /** Like a calendar: moving the start moves the end with it, so the meeting keeps its length. */
    const changeStart = (next: DateTimeText) => {
        const from = readText(dates, start);
        const to = readText(dates, next);
        const oldEnd = readText(dates, end);
        if (from && to && oldEnd) setEnd(toText(dates, new Date(oldEnd.getTime() + to.getTime() - from.getTime())));
        setStart(next);
    };

    const pick = (day: number) => {
        setError(undefined);
        const text = formatWallDate(dates, day);
        if (span) changeStart({ date: text, time: start.time || formatWallTime(dates, DEFAULT_TIME) });
        else setEnd({ date: text, time: end.time || formatWallTime(dates, DEFAULT_TIME) });
    };

    /** One click, and it's moved */
    const moveTo = (day: number) => {
        const next = { date: formatWallDate(dates, day), time: end.time || formatWallTime(dates, DEFAULT_TIME) };
        setEnd(next);
        const changes = collect(next);
        if (changes) finish(changes);
    };

    const picked = parseWallDate(dates, span ? start.date : end.date);

    return (
        <Prop label={date.caption}>
            <Popover
                open={open}
                positioning="below-start"
                trapFocus
                onOpenChange={(e, d) => {
                    if (d.open) {
                        setStart(toText(dates, values.start));
                        setEnd(toText(dates, values.end));
                        setError(undefined);
                        setOpen(true);
                        return;
                    }
                    if ((e as React.KeyboardEvent).key === "Escape") {
                        setOpen(false);
                        return;
                    }
                    const changes = collect();
                    if (changes) finish(changes);
                }}
            >
                <PopoverTrigger disableButtonEnhancement>
                    <button type="button" className={mergeClasses(styles.field, styles.select, date.danger && styles.danger)} aria-label={`${t("changeDate")}: ${date.caption} ${date.text}`}>
                        <DateValue date={date} />
                        <ChevronDownRegular className={styles.chevron} />
                    </button>
                </PopoverTrigger>
                <PopoverSurface
                    className={styles.surface}
                    onKeyDown={(e) => {
                        // Esc closes this and nothing behind it
                        if (e.key === "Escape") e.stopPropagation();
                    }}
                >
                    {span ? (
                        <>
                            <DateTimeBoxes label={t("editStart")} value={start} onChange={changeStart} />
                            <DateTimeBoxes label={t("editEnd")} value={end} onChange={setEnd} />
                        </>
                    ) : (
                        <>
                            <DateTimeBoxes value={end} onChange={setEnd} />
                            <div className={styles.quick}>
                                <button type="button" className={mergeClasses(styles.chip, styles.chipButton, styles.quickChip)} onClick={() => moveTo(today)}>{t("today")}</button>
                                <button type="button" className={mergeClasses(styles.chip, styles.chipButton, styles.quickChip)} onClick={() => moveTo(today + DAY_MS)}>{t("tomorrow")}</button>
                                <button type="button" className={mergeClasses(styles.chip, styles.chipButton, styles.quickChip)} onClick={() => moveTo(today + 7 * DAY_MS)}>{t("inAWeek")}</button>
                            </div>
                        </>
                    )}
                    {error && <span className={styles.error} role="alert">{error}</span>}
                    <MiniCalendar value={picked} onPick={pick} />
                    {!span && values.end && (
                        <Button className={styles.remove} size="small" appearance="subtle" onClick={() => finish({ end: null })}>
                            {t("clearDate")}
                        </Button>
                    )}
                </PopoverSurface>
            </Popover>
        </Prop>
    );
};
