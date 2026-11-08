import * as React from "react";
import {
    Button, makeStyles, Menu, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, mergeClasses, SearchBox, shorthands,
    Spinner, ToggleButton, tokens,
} from "@fluentui/react-components";
import { CalendarLtrRegular, ChevronDownRegular, DismissRegular, FilterRegular, PersonRegular, SearchRegular } from "@fluentui/react-icons";
import { DateFilter, StatusFilter, TimelineFilters } from "../model/types";
import { TypeDot, useTimelineEnv } from "./TimelineContext";

const useStyles = makeStyles({
    panel: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalS,
        ...shorthands.padding("0", "0", tokens.spacingVerticalM),
        marginBottom: tokens.spacingVerticalS,
        ...shorthands.borderBottom(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke2),
        animationName: { from: { opacity: 0, transform: "translateY(-4px)" }, to: { opacity: 1, transform: "none" } },
        animationDuration: tokens.durationFast,
        animationTimingFunction: tokens.curveDecelerateMid,
        "@media (prefers-reduced-motion: reduce)": { animationDuration: "0s" },
    },
    searchRow: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
    search: { flexGrow: 1, minWidth: 0, maxWidth: "none" },
    chips: {
        display: "flex",
        columnGap: tokens.spacingHorizontalXS,
        overflowX: "auto",
        scrollbarWidth: "none",
        ...shorthands.padding("2px", "0"),
        "::-webkit-scrollbar": { display: "none" },
    },
    chip: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "6px",
        flexShrink: 0,
        height: "26px",
        ...shorthands.padding("0", "10px"),
        ...shorthands.border(tokens.strokeWidthThin, "solid", "transparent"),
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground2,
        fontFamily: tokens.fontFamilyBase,
        fontSize: tokens.fontSizeBase200,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ":hover": { backgroundColor: tokens.colorNeutralBackground3Hover, color: tokens.colorNeutralForeground1 },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2 },
    },
    chipOn: {
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.borderColor(tokens.colorNeutralStrokeAccessible),
        color: tokens.colorNeutralForeground1,
        fontWeight: tokens.fontWeightSemibold,
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    },
    count: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums", fontWeight: tokens.fontWeightRegular },
    row: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
    spacer: { flexGrow: 1 },
    active: { color: tokens.colorBrandForeground1 },

    strip: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        marginBottom: tokens.spacingVerticalS,
    },
    tag: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "4px",
        height: "24px",
        maxWidth: "100%",
        ...shorthands.padding("0", "4px", "0", "8px"),
        ...shorthands.border(0),
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: tokens.colorBrandBackground2,
        color: tokens.colorBrandForeground2,
        fontFamily: tokens.fontFamilyBase,
        fontSize: tokens.fontSizeBase200,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2 },
    },
    tagText: { overflow: "hidden", textOverflow: "ellipsis" },
    tagIcon: { fontSize: "12px", flexShrink: 0 },
    clear: {
        ...shorthands.border(0),
        backgroundColor: "transparent",
        color: tokens.colorNeutralForeground3,
        fontFamily: tokens.fontFamilyBase,
        fontSize: tokens.fontSizeBase200,
        cursor: "pointer",
        ...shorthands.padding("0", "4px"),
        ":hover": { color: tokens.colorNeutralForeground1, textDecorationLine: "underline" },
    },
});

export interface TypeCount {
    entity: string;
    label: string;
    count?: number;
}

/** A single letter would match nearly everything, at the full cost of a search */
const MIN_SEARCH_LENGTH = 2;

export function activeFilterCount(filters: TimelineFilters): number {
    return (filters.types.length > 0 ? 1 : 0) + (filters.status !== "all" ? 1 : 0) + (filters.date.kind !== "any" ? 1 : 0) +
        (filters.onlyMine ? 1 : 0) + (filters.search ? 1 : 0);
}

function useLabels() {
    const { t } = useTimelineEnv();
    const status: Record<StatusFilter, string> = {
        all: t("statusAll"),
        open: t("statusOpen"),
        overdue: t("statusOverdue"),
        completed: t("statusCompleted"),
    };
    const dateOptions: { key: string; label: string; value: DateFilter }[] = [
        { key: "any", label: t("dateAny"), value: { kind: "any" } },
        { key: "7", label: t("dateLast7"), value: { kind: "last", days: 7 } },
        { key: "30", label: t("dateLast30"), value: { kind: "last", days: 30 } },
        { key: "90", label: t("dateLast90"), value: { kind: "last", days: 90 } },
    ];
    const dateLabel = (date: DateFilter) =>
        dateOptions.find((o) => o.key === (date.kind === "last" ? String(date.days) : "any"))?.label ?? t("dateAny");
    return { status, dateOptions, dateLabel };
}

interface FilterPanelProps {
    filters: TimelineFilters;
    types: TypeCount[];
    total?: number;
    /** A search is running */
    searching: boolean;
    onChange: (update: Partial<TimelineFilters>) => void;
    onClear: () => void;
    onClose: () => void;
    searchRef?: React.Ref<HTMLInputElement>;
}

/** Search, type, status, date and owner filters. Shown only while the user is filtering. */
export const FilterPanel: React.FC<FilterPanelProps> = ({ filters, types, total, searching, onChange, onClear, onClose, searchRef }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const labels = useLabels();
    const [search, setSearch] = React.useState(filters.search);

    // Keep the box in sync when filters are cleared elsewhere
    React.useEffect(() => setSearch(filters.search), [filters.search]);

    // Searching is expensive, so it only runs when asked for: the button or Enter, never while typing
    const term = search.trim();
    const canSearch = term.length >= MIN_SEARCH_LENGTH && term !== filters.search;
    const runSearch = () => {
        if (canSearch) onChange({ search: term });
    };

    const toggleType = (entity: string) => {
        const has = filters.types.includes(entity);
        onChange({ types: has ? filters.types.filter((x) => x !== entity) : [...filters.types, entity] });
    };
    const dateKey = filters.date.kind === "last" ? String(filters.date.days) : "any";

    return (
        <div
            className={styles.panel}
            role="search"
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    e.stopPropagation();
                    onClose();
                }
            }}
        >
            <div className={styles.searchRow}>
                <SearchBox
                    className={styles.search}
                    appearance="filled-darker"
                    placeholder={t("searchPlaceholder")}
                    aria-label={t("searchPlaceholder")}
                    value={search}
                    input={{ ref: searchRef }}
                    onChange={(_, d) => {
                        setSearch(d.value);
                        // Emptying the box ends the search; that only reloads the normal feed
                        if (!d.value && filters.search) onChange({ search: "" });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") runSearch();
                    }}
                />
                <Button appearance="primary" disabled={!canSearch} icon={searching ? <Spinner size="extra-tiny" /> : undefined} onClick={runSearch}>
                    {t("search")}
                </Button>
            </div>
            <div className={styles.chips} role="toolbar" aria-label={t("filterByType")}>
                <button
                    type="button"
                    className={mergeClasses(styles.chip, filters.types.length === 0 && styles.chipOn)}
                    aria-pressed={filters.types.length === 0}
                    onClick={() => onChange({ types: [] })}
                >
                    {t("all")}
                    {total !== undefined && <span className={styles.count}>{total}</span>}
                </button>
                {types.map((type) => {
                    const on = filters.types.includes(type.entity);
                    return (
                        <button
                            key={type.entity}
                            type="button"
                            className={mergeClasses(styles.chip, on && styles.chipOn)}
                            aria-pressed={on}
                            onClick={() => toggleType(type.entity)}
                        >
                            <TypeDot entity={type.entity} />
                            {type.label}
                            {type.count !== undefined && <span className={styles.count}>{type.count}</span>}
                        </button>
                    );
                })}
            </div>
            <div className={styles.row}>
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <Button size="small" appearance="subtle" icon={<FilterRegular />} className={mergeClasses(filters.status !== "all" && styles.active)}>
                            {labels.status[filters.status]}
                            <ChevronDownRegular style={{ marginLeft: 4, fontSize: 12 }} />
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList checkedValues={{ status: [filters.status] }} onCheckedValueChange={(_, d) => onChange({ status: d.checkedItems[0] as StatusFilter })}>
                            {(Object.keys(labels.status) as StatusFilter[]).map((s) => (
                                <MenuItemRadio key={s} name="status" value={s}>
                                    {labels.status[s]}
                                </MenuItemRadio>
                            ))}
                        </MenuList>
                    </MenuPopover>
                </Menu>
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <Button size="small" appearance="subtle" icon={<CalendarLtrRegular />} className={mergeClasses(filters.date.kind !== "any" && styles.active)}>
                            {labels.dateLabel(filters.date)}
                            <ChevronDownRegular style={{ marginLeft: 4, fontSize: 12 }} />
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList
                            checkedValues={{ date: [dateKey] }}
                            onCheckedValueChange={(_, d) => {
                                const option = labels.dateOptions.find((o) => o.key === d.checkedItems[0]);
                                if (option) onChange({ date: option.value });
                            }}
                        >
                            {labels.dateOptions.map((o) => (
                                <MenuItemRadio key={o.key} name="date" value={o.key}>
                                    {o.label}
                                </MenuItemRadio>
                            ))}
                        </MenuList>
                    </MenuPopover>
                </Menu>
                <ToggleButton
                    size="small"
                    appearance="subtle"
                    icon={<PersonRegular />}
                    checked={filters.onlyMine}
                    className={mergeClasses(filters.onlyMine && styles.active)}
                    onClick={() => onChange({ onlyMine: !filters.onlyMine })}
                >
                    {t("onlyMine")}
                </ToggleButton>
                <span className={styles.spacer} />
                {activeFilterCount(filters) > 0 && (
                    <Button size="small" appearance="transparent" icon={<DismissRegular />} onClick={onClear}>
                        {t("clearFilters")}
                    </Button>
                )}
            </div>
        </div>
    );
};

interface ActiveFiltersProps {
    filters: TimelineFilters;
    typeLabel: (entity: string) => string;
    onChange: (update: Partial<TimelineFilters>) => void;
    onClear: () => void;
}

/** What's filtered while the panel is closed; each tag removes its filter. */
export const ActiveFilters: React.FC<ActiveFiltersProps> = ({ filters, typeLabel, onChange, onClear }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const labels = useLabels();
    if (activeFilterCount(filters) === 0) return null;

    const tag = (key: string, content: React.ReactNode, remove: () => void) => (
        <button key={key} type="button" className={styles.tag} onClick={remove} aria-label={`${t("clearFilters")}: ${key}`}>
            <span className={styles.tagText}>{content}</span>
            <DismissRegular className={styles.tagIcon} />
        </button>
    );

    return (
        <div className={styles.strip}>
            {filters.search &&
                tag(filters.search, (
                    <>
                        <SearchRegular className={styles.tagIcon} /> “{filters.search}”
                    </>
                ), () => onChange({ search: "" }))}
            {filters.types.map((entity) =>
                tag(entity, (
                    <>
                        <TypeDot entity={entity} /> {typeLabel(entity)}
                    </>
                ), () => onChange({ types: filters.types.filter((x) => x !== entity) })),
            )}
            {filters.status !== "all" && tag(labels.status[filters.status], labels.status[filters.status], () => onChange({ status: "all" }))}
            {filters.date.kind !== "any" && tag(labels.dateLabel(filters.date), labels.dateLabel(filters.date), () => onChange({ date: { kind: "any" } }))}
            {filters.onlyMine && tag(t("onlyMine"), t("onlyMine"), () => onChange({ onlyMine: false }))}
            <button type="button" className={styles.clear} onClick={onClear}>
                {t("clearFilters")}
            </button>
        </div>
    );
};
