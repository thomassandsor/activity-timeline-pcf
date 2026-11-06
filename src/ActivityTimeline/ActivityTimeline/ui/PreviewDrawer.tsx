import * as React from "react";
import {
    Avatar, Button, DrawerBody, DrawerFooter, DrawerHeader, makeStyles, mergeClasses, OverlayDrawer, shorthands, Spinner,
    tokens, Tooltip,
} from "@fluentui/react-components";
import {
    ArrowDownLeftRegular, ArrowDownloadRegular, ArrowRightRegular, ArrowUpRightRegular, AttachRegular, CalendarLtrRegular,
    CheckmarkCircleRegular, CheckmarkRegular, ChevronDownRegular, ChevronUpRegular, ClockRegular, DismissCircleRegular,
    DismissRegular, DocumentPdfRegular, DocumentRegular, EditRegular, FluentIcon, ImageRegular, LinkRegular, OpenRegular,
} from "@fluentui/react-icons";
import { canComplete, dateRule } from "../model/activityTypes";
import { DateEnv, formatDuration, formatFull, formatLong, formatRelative, formatShortDate, formatSpan } from "../model/dates";
import { isOpenState } from "../model/feed";
import { escapeHtml, stripReplyPrefixes } from "../model/html";
import { AttachmentRef, FeedEntry, ItemDetails, PartyRef, TimelineItem } from "../model/types";
import { HtmlFrame } from "./HtmlFrame";
import { Translate, useTimelineEnv, useTypeVisual } from "./TimelineContext";

const useStyles = makeStyles({
    drawer: {
        width: "640px",
        maxWidth: "100vw",
    },
    headerBar: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        width: "100%",
    },
    typeChip: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "6px",
        height: "24px",
        ...shorthands.padding("0", "10px", "0", "4px"),
        borderRadius: tokens.borderRadiusCircular,
        fontSize: tokens.fontSizeBase200,
        fontWeight: tokens.fontWeightSemibold,
    },
    typeIcon: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "18px",
        height: "18px",
        borderRadius: tokens.borderRadiusCircular,
        fontSize: "12px",
    },
    status: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
    statusOverdue: {
        color: tokens.colorPaletteRedForeground1,
        fontWeight: tokens.fontWeightSemibold,
    },
    spacer: { flexGrow: 1 },
    counter: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
        fontVariantNumeric: "tabular-nums",
        minWidth: "48px",
        textAlign: "center",
    },
    title: {
        marginTop: tokens.spacingVerticalL,
        marginBottom: 0,
        fontSize: tokens.fontSizeBase600,
        fontWeight: tokens.fontWeightSemibold,
        lineHeight: tokens.lineHeightBase600,
        color: tokens.colorNeutralForeground1,
        overflowWrap: "anywhere",
        // Focus lands here so screen readers start at the content; it isn't interactive, so no ring
        // (the app's own focus styles are more specific than a plain rule)
        outlineStyle: "none",
        ":focus": { outlineStyle: "none" },
        ":focus-visible": { outlineStyle: "none" },
    },
    when: {
        marginTop: "4px",
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
    // The one date that matters for this item, right under the title
    headline: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalXS,
        marginTop: tokens.spacingVerticalS,
    },
    keyDate: {
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: "6px",
        fontSize: tokens.fontSizeBase300,
        lineHeight: tokens.lineHeightBase300,
        fontWeight: tokens.fontWeightSemibold,
        color: tokens.colorNeutralForeground1,
    },
    keyDateDanger: { color: tokens.colorPaletteRedForeground1 },
    keyIcon: { fontSize: "16px", flexShrink: 0, color: tokens.colorNeutralForeground3 },
    keyIconDanger: { color: tokens.colorPaletteRedForeground1 },
    keyRelative: { fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
    keyNote: { paddingLeft: "22px", fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
    people: {
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "6px",
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground2,
    },
    person: { display: "inline-flex", alignItems: "center", columnGap: "4px", whiteSpace: "nowrap" },
    peopleArrow: { fontSize: "12px", color: tokens.colorNeutralForeground3 },
    peopleMore: { color: tokens.colorNeutralForeground3 },
    content: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalL,
        ...shorthands.padding(tokens.spacingVerticalS, "0", tokens.spacingVerticalL),
    },
    // Secondary facts, set apart and quieter than the content
    meta: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalS,
        ...shorthands.padding(tokens.spacingVerticalM, "0", tokens.spacingVerticalS),
        ...shorthands.borderTop(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke2),
    },
    metaList: {
        display: "grid",
        gridTemplateColumns: "max-content minmax(0, 1fr)",
        columnGap: tokens.spacingHorizontalL,
        rowGap: "6px",
        margin: 0,
        fontSize: tokens.fontSizeBase200,
        lineHeight: tokens.lineHeightBase200,
    },
    metaLabel: { color: tokens.colorNeutralForeground3 },
    metaValue: { margin: 0, color: tokens.colorNeutralForeground2, overflowWrap: "anywhere" },
    sectionTitle: {
        fontSize: tokens.fontSizeBase100,
        fontWeight: tokens.fontWeightSemibold,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: tokens.colorNeutralForeground3,
    },
    plainBody: {
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        fontSize: tokens.fontSizeBase400,
        lineHeight: "24px",
        color: tokens.colorNeutralForeground1,
    },
    empty: { color: tokens.colorNeutralForeground3, fontStyle: "italic", fontSize: tokens.fontSizeBase200 },
    attachments: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: tokens.spacingHorizontalS,
    },
    attachment: {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke2),
        borderRadius: tokens.borderRadiusLarge,
        overflow: "hidden",
        backgroundColor: tokens.colorNeutralBackground1,
    },
    thumb: {
        height: "96px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground3,
        fontSize: "28px",
        overflow: "hidden",
    },
    thumbImg: { width: "100%", height: "100%", objectFit: "cover" },
    attachmentFooter: {
        display: "flex",
        alignItems: "center",
        columnGap: "4px",
        ...shorthands.padding("4px", "4px", "4px", tokens.spacingHorizontalS),
    },
    attachmentText: { display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 },
    attachmentName: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    attachmentSize: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
    imagePreview: {
        maxWidth: "100%",
        maxHeight: "420px",
        borderRadius: tokens.borderRadiusLarge,
        objectFit: "contain",
        alignSelf: "flex-start",
        backgroundColor: tokens.colorNeutralBackground3,
    },
    footer: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        width: "100%",
    },
    hint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, marginLeft: "auto", textAlign: "right" },
    dirIn: { color: tokens.colorPaletteBlueForeground2 },
    dirOut: { color: tokens.colorPaletteGreenForeground2 },
    conversation: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS, ...shorthands.padding(tokens.spacingVerticalS, "0") },
    conversationBar: { display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "-4px" },
    message: {
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke2),
        borderRadius: tokens.borderRadiusLarge,
        backgroundColor: tokens.colorNeutralBackground1,
        overflow: "hidden",
    },
    messageOpen: { ...shorthands.borderColor(tokens.colorNeutralStroke1), boxShadow: tokens.shadow2 },
    messageHead: {
        display: "flex",
        alignItems: "flex-start",
        columnGap: tokens.spacingHorizontalM,
        width: "100%",
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
        ...shorthands.border(0),
        backgroundColor: "transparent",
        textAlign: "left",
        fontFamily: tokens.fontFamilyBase,
        color: tokens.colorNeutralForeground1,
        cursor: "pointer",
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2, outlineOffset: "-2px" },
    },
    messageText: { display: "flex", flexDirection: "column", rowGap: "2px", minWidth: 0, flexGrow: 1 },
    messageTop: { display: "flex", alignItems: "center", columnGap: "6px", minWidth: 0 },
    messageFrom: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    messageDir: { fontSize: "13px", flexShrink: 0 },
    messageMeta: { display: "inline-flex", alignItems: "center", columnGap: "2px", flexShrink: 0, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
    messageSnippet: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    messageRecipients: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
    messageBody: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalM,
        ...shorthands.padding("0", tokens.spacingHorizontalM, tokens.spacingVerticalM, `calc(28px + ${tokens.spacingHorizontalM} * 2)`),
    },
});

interface PreviewDrawerProps {
    /** A single item, or an email conversation */
    entry?: FeedEntry;
    /** Message to expand first when the entry is a conversation */
    focusKey?: string;
    index: number;
    count: number;
    onClose: () => void;
    onStep: (delta: number) => void;
    onOpen: (item: TimelineItem) => void;
    onComplete: (item: TimelineItem) => Promise<void>;
    onCopyLink: (item: TimelineItem) => void;
}

const MAX_THUMB_BYTES = 3 * 1024 * 1024;
/** Shown by the date line and details already */
const SCHEDULE_COLUMNS = new Set(["scheduledstart", "scheduledend", "actualdurationminutes", "actualend"]);

interface LoadedDetails {
    details?: ItemDetails;
    files: Record<string, string>;
    loading: boolean;
}

/** Loads preview columns and attachments for an item, plus image previews, once `enabled` turns true. */
function useItemDetails(item: TimelineItem, enabled: boolean): LoadedDetails {
    const { source } = useTimelineEnv();
    const [state, setState] = React.useState<LoadedDetails>({ files: {}, loading: false });

    React.useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setState({ files: {}, loading: true });

        const loadImage = async (a: AttachmentRef) => {
            try {
                const c = await source.getFileContent(a);
                if (!cancelled) {
                    setState((s) => ({ ...s, files: { ...s.files, [a.id]: `data:${c.mimeType ?? a.mimeType ?? "image/png"};base64,${c.base64}` } }));
                }
            } catch {
                // The tile falls back to an icon
            }
        };
        const load = async () => {
            let d: ItemDetails;
            try {
                d = await source.getDetails(item);
            } catch {
                d = { fields: [], attachments: [] };
            }
            if (cancelled) return;
            setState((s) => ({ ...s, details: d, loading: false }));
            // Image previews and inline email images load up front; other files load on download
            d.attachments.filter((a) => a.mimeType?.startsWith("image/") && (a.size ?? 0) <= MAX_THUMB_BYTES).forEach((a) => void loadImage(a));
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [item, enabled, source]);

    return state;
}

function useDownload(): (file: AttachmentRef) => Promise<void> {
    const { source } = useTimelineEnv();
    return React.useCallback(
        async (file: AttachmentRef) => {
            const content = await source.getFileContent(file);
            const bytes = Uint8Array.from(atob(content.base64), (c) => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: content.mimeType ?? "application/octet-stream" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = content.fileName;
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        [source],
    );
}

function inlineImageMap(details: ItemDetails | undefined, files: Record<string, string>): Record<string, string> {
    const map: Record<string, string> = {};
    details?.attachments.forEach((a) => {
        if (a.contentId && files[a.id]) map[a.contentId] = files[a.id];
    });
    return map;
}

export const PreviewDrawer: React.FC<PreviewDrawerProps> = ({ entry, focusKey, index, count, onClose, onStep, onOpen, onComplete, onCopyLink }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const [completing, setCompleting] = React.useState(false);
    // Keep the last entry while the drawer animates closed
    const lastEntry = React.useRef<FeedEntry>();
    if (entry) lastEntry.current = entry;
    const shown = entry ?? lastEntry.current;
    const lead = shown ? (shown.type === "item" ? shown.item : shown.items[0]) : undefined;
    const titleRef = React.useRef<HTMLHeadingElement>(null);

    // Start on the title rather than the first button, so the reader lands on the content and no tooltip pops up
    React.useEffect(() => {
        if (!entry) return;
        const handle = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 50);
        return () => window.clearTimeout(handle);
    }, [entry]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest("input, textarea, [contenteditable='true']")) return;
        if (e.key === "ArrowDown" || e.key === "j") {
            e.preventDefault();
            onStep(1);
        } else if (e.key === "ArrowUp" || e.key === "k") {
            e.preventDefault();
            onStep(-1);
        } else if ((e.key === "o" || e.key === "O") && lead) {
            e.preventDefault();
            onOpen(lead);
        }
    };

    const showComplete = shown?.type === "item" && shown.item.kind === "activity" && isOpenState(shown.item.state) && canComplete(shown.item.entity);

    let title = "";
    let subtitle = "";
    if (shown?.type === "item") {
        title = shown.item.title;
    } else if (shown?.type === "thread") {
        const oldest = shown.items[shown.items.length - 1];
        title = stripReplyPrefixes(shown.items[0].title);
        subtitle = `${t("messages", shown.items.length)} · ${formatShortDate(dates, oldest.date)} – ${formatShortDate(dates, shown.items[0].date)}`;
    }

    return (
        <OverlayDrawer
            position="end"
            open={!!entry}
            onOpenChange={(_, d) => !d.open && onClose()}
            className={styles.drawer}
            aria-label={title}
            onKeyDown={onKeyDown}
        >
            {shown && lead && (
                <>
                    <DrawerHeader>
                        <div className={styles.headerBar}>
                            <TypeChip item={lead} />
                            {shown.type === "item" ? <StatusText item={lead} /> : <span className={styles.status}>{t("conversation")}</span>}
                            <span className={styles.spacer} />
                            {count > 0 && (
                                <>
                                    <Tooltip content={t("previousItem")} relationship="label">
                                        <Button appearance="subtle" size="small" icon={<ChevronUpRegular />} disabled={index <= 0} onClick={() => onStep(-1)} />
                                    </Tooltip>
                                    <span className={styles.counter}>{t("itemOfTotal", index + 1, count)}</span>
                                    <Tooltip content={t("nextItem")} relationship="label">
                                        <Button appearance="subtle" size="small" icon={<ChevronDownRegular />} disabled={index >= count - 1} onClick={() => onStep(1)} />
                                    </Tooltip>
                                </>
                            )}
                            <Tooltip content={t("close")} relationship="label">
                                <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} />
                            </Tooltip>
                        </div>
                        <h2 className={styles.title} ref={titleRef} tabIndex={-1}>
                            {title}
                        </h2>
                        {shown.type === "item" ? <Headline item={shown.item} /> : <div className={styles.when}>{subtitle}</div>}
                    </DrawerHeader>
                    <DrawerBody>
                        {shown.type === "item" ? (
                            <ItemPreview key={shown.key} item={shown.item} />
                        ) : (
                            <ConversationPreview key={`${shown.key}|${focusKey ?? ""}`} items={shown.items} focusKey={focusKey} onOpen={onOpen} />
                        )}
                    </DrawerBody>
                    <DrawerFooter>
                        <div className={styles.footer}>
                            <Button appearance="primary" icon={<OpenRegular />} onClick={() => onOpen(lead)}>
                                {shown.type === "thread" ? t("openLatest") : t("openRecord")}
                            </Button>
                            {showComplete && (
                                <Button
                                    icon={completing ? <Spinner size="extra-tiny" /> : <CheckmarkRegular />}
                                    disabled={completing}
                                    onClick={() => {
                                        setCompleting(true);
                                        void (async () => {
                                            try {
                                                await onComplete(lead);
                                            } finally {
                                                setCompleting(false);
                                            }
                                        })();
                                    }}
                                >
                                    {t("markComplete")}
                                </Button>
                            )}
                            <Tooltip content={t("copyLink")} relationship="label">
                                <Button appearance="subtle" icon={<LinkRegular />} onClick={() => onCopyLink(lead)} />
                            </Tooltip>
                            <span className={styles.hint}>{t("previewKeyboardHint")}</span>
                        </div>
                    </DrawerFooter>
                </>
            )}
        </OverlayDrawer>
    );
};

/**
 * One item: the description and files first, as that's what people open a preview for.
 * Owner, priority, configured columns and record dates follow as quieter details.
 */
const ItemPreview: React.FC<{ item: TimelineItem }> = ({ item }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const { details, files, loading } = useItemDetails(item, true);
    const download = useDownload();
    const inlineImages = React.useMemo(() => inlineImageMap(details, files), [details, files]);
    const isImageNote = !!item.file?.mimeType?.startsWith("image/");
    // A note's own image is shown large; listing it again as an attachment adds nothing
    const attachments = (details?.attachments ?? []).filter((a) => !(isImageNote && a.id === item.file?.id && files[a.id]));

    return (
        <>
            <div className={styles.content}>
                {/* A file note without text just shows its file */}
                {(!!item.body || !item.file) && <Body item={item} inlineImages={inlineImages} />}
                {isImageNote && item.file && files[item.file.id] && <img className={styles.imagePreview} src={files[item.file.id]} alt={item.file.fileName} />}
                {attachments.length > 0 && (
                    <div className={styles.attachments}>
                        {attachments.map((a) => (
                            <AttachmentTile key={a.id} file={a} preview={files[a.id]} onDownload={() => void download(a)} />
                        ))}
                    </div>
                )}
                {loading && !details && <Spinner size="tiny" label={t("loadingPreview")} />}
            </div>
            <Details item={item} details={details} />
        </>
    );
};

/** An email conversation, newest first. The newest (or focused) message is open; the rest expand on click. */
const ConversationPreview: React.FC<{ items: TimelineItem[]; focusKey?: string; onOpen: (item: TimelineItem) => void }> = ({ items, focusKey, onOpen }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const initial = focusKey && items.some((i) => i.key === focusKey) ? focusKey : items[0].key;
    const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set([initial]));
    const allOpen = expanded.size === items.length;

    const toggle = (key: string) =>
        setExpanded((s) => {
            const next = new Set(s);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <div className={styles.conversation}>
            <div className={styles.conversationBar}>
                <Button
                    size="small"
                    appearance="transparent"
                    icon={allOpen ? <ChevronUpRegular /> : <ChevronDownRegular />}
                    onClick={() => setExpanded(allOpen ? new Set([items[0].key]) : new Set(items.map((i) => i.key)))}
                >
                    {allOpen ? t("collapseAll") : t("expandAll")}
                </Button>
            </div>
            {items.map((m) => (
                <MessagePanel key={m.key} item={m} expanded={expanded.has(m.key)} onToggle={() => toggle(m.key)} onOpen={onOpen} />
            ))}
        </div>
    );
};

const MessagePanel: React.FC<{ item: TimelineItem; expanded: boolean; onToggle: () => void; onOpen: (item: TimelineItem) => void }> = ({ item, expanded, onToggle, onOpen }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const { details, files, loading } = useItemDetails(item, expanded);
    const download = useDownload();
    const inlineImages = React.useMemo(() => inlineImageMap(details, files), [details, files]);
    const sender = item.from[0];
    const DirIcon = item.direction === "out" ? ArrowUpRightRegular : ArrowDownLeftRegular;
    const recipients = [
        item.to.length > 0 ? `${t("to")}: ${item.to.map((p) => p.name).join(", ")}` : "",
        item.cc.length > 0 ? `${t("cc")}: ${item.cc.map((p) => p.name).join(", ")}` : "",
    ].filter(Boolean).join(" · ");

    return (
        <div className={mergeClasses(styles.message, expanded && styles.messageOpen)}>
            <button type="button" className={styles.messageHead} aria-expanded={expanded} onClick={onToggle}>
                <Avatar name={sender?.name ?? item.typeLabel} size={28} color="colorful" />
                <span className={styles.messageText}>
                    <span className={styles.messageTop}>
                        <span className={styles.messageFrom}>{sender?.name ?? item.typeLabel}</span>
                        {item.direction && <DirIcon className={mergeClasses(styles.messageDir, item.direction === "out" ? styles.dirOut : styles.dirIn)} />}
                        <span className={styles.spacer} />
                        {!!item.attachmentCount && (
                            <span className={styles.messageMeta}>
                                <AttachRegular /> {item.attachmentCount}
                            </span>
                        )}
                        <span className={styles.messageMeta}>{expanded ? formatFull(dates, item.date) : formatShortDate(dates, item.date)}</span>
                    </span>
                    <span className={expanded ? styles.messageRecipients : styles.messageSnippet}>{expanded ? recipients : item.snippet ?? ""}</span>
                </span>
            </button>
            {expanded && (
                <div className={styles.messageBody}>
                    <Body item={item} inlineImages={inlineImages} collapseQuoted />
                    {loading && !details && <Spinner size="tiny" />}
                    {details && details.attachments.length > 0 && (
                        <div className={styles.attachments}>
                            {details.attachments.map((a) => (
                                <AttachmentTile key={a.id} file={a} preview={files[a.id]} onDownload={() => void download(a)} />
                            ))}
                        </div>
                    )}
                    <div>
                        <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpen(item)}>
                            {t("openRecord")}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

const TypeChip: React.FC<{ item: TimelineItem }> = ({ item }) => {
    const styles = useStyles();
    const v = useTypeVisual(item.entity);
    return (
        <span className={styles.typeChip} style={{ backgroundColor: v.bg, color: v.fg }}>
            <span className={styles.typeIcon} style={{ backgroundColor: v.strong, color: tokens.colorNeutralForegroundInverted }}>
                <v.Icon />
            </span>
            {item.typeLabel}
        </span>
    );
};

/** Shown next to the type while work is unfinished; once closed, the date line says how it ended */
const StatusText: React.FC<{ item: TimelineItem }> = ({ item }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    if (item.kind === "note") return null;
    if (item.isOverdue) return <span className={mergeClasses(styles.status, styles.statusOverdue)}>{t("statusOverdue")}</span>;
    if (!isOpenState(item.state)) return null;
    return <span className={styles.status}>{item.statusLabel ?? t("statusOpen")}</span>;
};

interface KeyDate {
    Icon: FluentIcon;
    text: string;
    relative?: string;
    note?: string;
    danger?: boolean;
}

/**
 * The date that matters for this item, in words: when a meeting is held, when work is due or was done,
 * when an email was sent or received, when a note was written.
 */
function keyDate(item: TimelineItem, rule: string, t: Translate, dates: DateEnv): KeyDate {
    const at = (d: Date) => ({ relative: formatRelative(dates, d) });
    if (item.kind === "note") return { Icon: EditRegular, text: t("createdAt", formatLong(dates, item.createdOn)), ...at(item.createdOn) };
    if (item.entity === "email") {
        const out = item.direction === "out";
        return { Icon: out ? ArrowUpRightRegular : ArrowDownLeftRegular, text: t(out ? "sentAt" : "receivedAt", formatLong(dates, item.createdOn)), ...at(item.createdOn) };
    }
    if (rule === "start" && item.scheduledStart) {
        return { Icon: CalendarLtrRegular, text: formatSpan(dates, item.scheduledStart, item.scheduledEnd), ...at(item.scheduledStart) };
    }
    if (rule !== "created" && !isOpenState(item.state)) {
        const when = item.actualEnd ?? item.modifiedOn ?? item.createdOn;
        if (item.state === "canceled") return { Icon: DismissCircleRegular, text: t("canceledAt", formatLong(dates, when)), ...at(when) };
        const late = item.scheduledEnd && item.actualEnd && item.actualEnd.getTime() - item.scheduledEnd.getTime() > 60000;
        return {
            Icon: CheckmarkCircleRegular,
            text: t("completedAt", formatLong(dates, when)),
            ...at(when),
            note: late && item.scheduledEnd ? t("wasDue", formatShortDate(dates, item.scheduledEnd)) : undefined,
        };
    }
    if (rule !== "created" && item.scheduledEnd) {
        const due = formatLong(dates, item.scheduledEnd);
        return { Icon: ClockRegular, text: item.isOverdue ? t("overdueSince", due) : t("dueOn", due), ...at(item.scheduledEnd), danger: item.isOverdue };
    }
    return { Icon: EditRegular, text: t("createdAt", formatLong(dates, item.createdOn)), ...at(item.createdOn) };
}

const Headline: React.FC<{ item: TimelineItem }> = ({ item }) => {
    const { t, dates, config } = useTimelineEnv();
    const styles = useStyles();
    const key = keyDate(item, dateRule(item.entity, config), t, dates);
    return (
        <div className={styles.headline}>
            <div className={mergeClasses(styles.keyDate, key.danger && styles.keyDateDanger)}>
                <key.Icon className={mergeClasses(styles.keyIcon, key.danger && styles.keyIconDanger)} aria-hidden />
                <span>{key.text}</span>
                {key.relative && <span className={styles.keyRelative}>· {key.relative}</span>}
            </div>
            {key.note && <div className={styles.keyNote}>{key.note}</div>}
            <PeopleLine item={item} />
        </div>
    );
};

const Names: React.FC<{ parties: PartyRef[] }> = ({ parties }) => {
    const styles = useStyles();
    const shown = parties.slice(0, 3);
    return (
        <>
            {shown.map((p, i) => (
                <span key={`${p.id ?? p.name}-${i}`} className={styles.person} title={p.address ?? p.name}>
                    <Avatar name={p.name} size={20} color="colorful" />
                    {p.name}
                </span>
            ))}
            {parties.length > shown.length && <span className={styles.peopleMore}>+{parties.length - shown.length}</span>}
        </>
    );
};

/** Who it's between, for emails, calls and meetings. Tasks and notes have no people line; their owner is a detail. */
const PeopleLine: React.FC<{ item: TimelineItem }> = ({ item }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    if (item.kind === "note") return null;
    if (item.from.length > 0 && item.to.length > 0) {
        return (
            <div className={styles.people}>
                <Names parties={item.from} />
                <ArrowRightRegular className={styles.peopleArrow} aria-label={t("to")} />
                <Names parties={item.to} />
            </div>
        );
    }
    if (item.attendees.length > 0) {
        return (
            <div className={styles.people}>
                <span className={styles.peopleMore}>{t("with")}</span>
                <Names parties={item.attendees} />
            </div>
        );
    }
    return null;
};

/** Facts that can matter but aren't the point: owner, configured columns, Cc, record dates. Small and last. */
const Details: React.FC<{ item: TimelineItem; details?: ItemDetails }> = ({ item, details }) => {
    const { t, dates, config } = useTimelineEnv();
    const styles = useStyles();
    // A meeting's date line already shows its start, end and length
    const meeting = dateRule(item.entity, config) === "start" && !!item.scheduledStart;
    const rows: { label: string; value: string }[] = [];
    if (item.owner?.name && item.kind === "activity") rows.push({ label: t("owner"), value: item.owner.name });
    if (item.cc.length > 0) rows.push({ label: t("cc"), value: item.cc.map((p) => p.name).join(", ") });
    // Closed work shows its completion up top; the due date it had is a detail
    if (item.scheduledEnd && !isOpenState(item.state) && item.entity !== "email" && !meeting) {
        rows.push({ label: t("dueLabel"), value: formatFull(dates, item.scheduledEnd) });
    }
    if (item.durationMinutes && !meeting) rows.push({ label: t("duration"), value: formatDuration(item.durationMinutes, dates.locale) });
    // Owner and schedule are already covered above
    details?.fields.filter((f) => !SCHEDULE_COLUMNS.has(f.name) && f.name !== "ownerid").forEach((f) => rows.push({ label: f.label, value: f.value }));
    const created = formatFull(dates, item.createdOn);
    rows.push({ label: t("detailCreated"), value: item.createdBy?.name ? t("byPerson", created, item.createdBy.name) : created });
    if (item.modifiedOn && Math.abs(item.modifiedOn.getTime() - item.createdOn.getTime()) > 60000) {
        rows.push({ label: t("detailUpdated"), value: formatFull(dates, item.modifiedOn) });
    }

    return (
        <div className={styles.meta}>
            <span className={styles.sectionTitle}>{t("details")}</span>
            <dl className={styles.metaList}>
                {rows.map((r) => (
                    <React.Fragment key={r.label}>
                        <dt className={styles.metaLabel}>{r.label}</dt>
                        <dd className={styles.metaValue}>{r.value}</dd>
                    </React.Fragment>
                ))}
            </dl>
        </div>
    );
};

const Body: React.FC<{ item: TimelineItem; inlineImages: Record<string, string>; collapseQuoted?: boolean }> = ({ item, inlineImages, collapseQuoted }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    if (!item.body) return <span className={styles.empty}>{t("noContent")}</span>;
    if (item.bodyIsHtml) return <HtmlFrame html={item.body} inlineImages={inlineImages} title={item.title} collapseQuoted={collapseQuoted} />;
    if (/^https?:\/\//.test(item.body.trim())) {
        return <HtmlFrame html={`<a href="${escapeHtml(item.body.trim())}">${escapeHtml(item.body.trim())}</a>`} title={item.title} />;
    }
    return <div className={styles.plainBody}>{item.body}</div>;
};

function formatSize(bytes: number | undefined, locale: string): string {
    if (!bytes) return "";
    const units = ["byte", "kilobyte", "megabyte", "gigabyte"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return new Intl.NumberFormat(locale, { style: "unit", unit: units[unit], unitDisplay: "short", maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
}

const AttachmentTile: React.FC<{ file: AttachmentRef; preview?: string; onDownload: () => void }> = ({ file, preview, onDownload }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const isImage = file.mimeType?.startsWith("image/");
    const Icon = isImage ? ImageRegular : file.mimeType === "application/pdf" ? DocumentPdfRegular : DocumentRegular;
    return (
        <div className={styles.attachment}>
            <div className={styles.thumb}>{preview ? <img className={styles.thumbImg} src={preview} alt="" /> : <Icon />}</div>
            <div className={styles.attachmentFooter}>
                <span className={styles.attachmentText}>
                    <span className={styles.attachmentName} title={file.fileName}>
                        {file.fileName}
                    </span>
                    <span className={styles.attachmentSize}>{formatSize(file.size, dates.locale)}</span>
                </span>
                <Tooltip content={t("download")} relationship="label">
                    <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} onClick={onDownload} />
                </Tooltip>
            </div>
        </div>
    );
};
