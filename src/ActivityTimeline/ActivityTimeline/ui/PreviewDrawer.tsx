import * as React from "react";
import {
    Avatar, Button, DrawerBody, DrawerFooter, DrawerHeader, makeStyles, mergeClasses, OverlayDrawer, shorthands, Spinner, tokens, Tooltip,
} from "@fluentui/react-components";
import {
    ArrowDownLeftRegular, ArrowDownloadRegular, ArrowUpRightRegular, AttachRegular, CheckmarkCircleFilled, CheckmarkRegular, ChevronDownRegular, ChevronUpRegular,
    DismissRegular, DocumentPdfRegular, DocumentRegular, EditRegular, ImageRegular, LinkRegular, OpenRegular,
} from "@fluentui/react-icons";
import { canComplete, canEdit, dateRule, quickEdit } from "../model/activityTypes";
import { formatDuration, formatFull, formatShortDate } from "../model/dates";
import { isOpenState } from "../model/feed";
import { escapeHtml, stripReplyPrefixes } from "../model/html";
import { AttachmentRef, EditValues, FeedEntry, ItemChanges, ItemDetails, StatusOption, TimelineItem } from "../model/types";
import { NODE, People, SectionHeader, TypeNode } from "./CardParts";
import { useConfirmClose } from "./ConfirmClose";
import { HtmlFrame } from "./HtmlFrame";
import { useTimelineEnv } from "./TimelineContext";
import { errorMessage } from "./useTimeline";
import { DateChip, DateText, InlineText, keyDate, PriorityChip, Prop, StatusChip } from "./WorkControls";

const GUTTER = tokens.spacingHorizontalM;

const useStyles = makeStyles({
    drawer: {
        width: "560px",
        maxWidth: "100vw",
    },
    toolbar: {
        display: "flex",
        alignItems: "center",
        columnGap: "2px",
        width: "100%",
    },
    header: {
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM, "0"),
    },
    spacer: { flexGrow: 1 },
    counter: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
        fontVariantNumeric: "tabular-nums",
        marginLeft: tokens.spacingHorizontalXS,
    },
    body: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalL,
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalXL, tokens.spacingVerticalXL),
    },
    // The card, opened: its icon, title and who it's between, in the same places
    identity: {
        display: "grid",
        gridTemplateColumns: `${NODE}px minmax(0, 1fr)`,
        columnGap: GUTTER,
        alignItems: "start",
    },
    identityText: { minWidth: 0 },
    heading: {
        ...shorthands.margin(0),
        fontSize: "18px",
        fontWeight: tokens.fontWeightSemibold,
        lineHeight: "24px",
        color: tokens.colorNeutralForeground1,
        overflowWrap: "anywhere",
        // Focus lands here so screen readers start at the content; it isn't interactive, so no ring
        outlineStyle: "none",
        ":focus": { outlineStyle: "none" },
        ":focus-visible": { outlineStyle: "none" },
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
    },
    typeLabel: { fontWeight: tokens.fontWeightMedium, color: tokens.colorNeutralForeground2 },
    // Lines up with the title, past the icon, like the text on a card
    indented: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalL,
        paddingLeft: `calc(${NODE}px + ${GUTTER})`,
        minWidth: 0,
    },
    props: {
        display: "flex",
        alignItems: "flex-start",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    },
    text: {
        fontSize: tokens.fontSizeBase300,
        lineHeight: tokens.lineHeightBase400,
        color: tokens.colorNeutralForeground1,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
    },
    hint: {
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: tokens.spacingHorizontalS,
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
    section: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
    metaList: {
        display: "grid",
        gridTemplateColumns: "max-content minmax(0, 1fr)",
        columnGap: tokens.spacingHorizontalL,
        rowGap: "4px",
        margin: 0,
        paddingLeft: `calc(${NODE}px + ${GUTTER})`,
        fontSize: tokens.fontSizeBase200,
        lineHeight: tokens.lineHeightBase200,
    },
    metaLabel: { color: tokens.colorNeutralForeground3 },
    metaValue: { margin: 0, color: tokens.colorNeutralForeground2, overflowWrap: "anywhere" },
    attachments: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: tokens.spacingHorizontalS,
        paddingLeft: `calc(${NODE}px + ${GUTTER})`,
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
        height: "72px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground3,
        fontSize: "22px",
        overflow: "hidden",
    },
    thumbImg: { width: "100%", height: "100%", objectFit: "cover" },
    attachmentFooter: {
        display: "flex",
        alignItems: "center",
        columnGap: "4px",
        ...shorthands.padding("2px", "2px", "2px", tokens.spacingHorizontalS),
    },
    attachmentText: { display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 },
    attachmentName: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    attachmentSize: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
    imagePreview: {
        maxWidth: "100%",
        maxHeight: "320px",
        borderRadius: tokens.borderRadiusLarge,
        objectFit: "contain",
        alignSelf: "flex-start",
        backgroundColor: tokens.colorNeutralBackground3,
    },
    footer: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalXL, tokens.spacingVerticalM),
        ...shorthands.borderTop(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke2),
    },
    saveState: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: "4px",
        minWidth: 0,
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
    saved: { color: tokens.colorPaletteGreenForeground1 },
    saveError: { color: tokens.colorPaletteRedForeground1, overflowWrap: "anywhere" },
    actionButton: { flexShrink: 0, whiteSpace: "nowrap" },
    dirIn: { color: tokens.colorPaletteBlueForeground2 },
    dirOut: { color: tokens.colorPaletteGreenForeground2 },
    conversation: { display: "flex", flexDirection: "column", rowGap: "2px" },
    conversationBar: { display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "-6px" },
    message: {
        borderRadius: tokens.borderRadiusLarge,
        overflow: "hidden",
    },
    messageHead: {
        display: "flex",
        alignItems: "flex-start",
        columnGap: GUTTER,
        width: "100%",
        ...shorthands.padding(tokens.spacingVerticalS, "0"),
        ...shorthands.border(0),
        backgroundColor: "transparent",
        textAlign: "left",
        fontFamily: tokens.fontFamilyBase,
        color: tokens.colorNeutralForeground1,
        cursor: "pointer",
        borderRadius: tokens.borderRadiusMedium,
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
        ":focus-visible": { outlineWidth: tokens.strokeWidthThick, outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2, outlineOffset: "-2px" },
    },
    messageText: { display: "flex", flexDirection: "column", rowGap: "2px", minWidth: 0, flexGrow: 1 },
    messageTop: { display: "flex", alignItems: "center", columnGap: "6px", minWidth: 0 },
    messageFrom: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, lineHeight: tokens.lineHeightBase300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    messageDir: { fontSize: "13px", flexShrink: 0 },
    messageMeta: { display: "inline-flex", alignItems: "center", columnGap: "2px", flexShrink: 0, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
    messageSnippet: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    messageRecipients: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
    messageBody: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalS,
        ...shorthands.padding("0", "0", tokens.spacingVerticalM, `calc(${NODE}px + ${GUTTER})`),
    },
    messageActions: { display: "flex", columnGap: tokens.spacingHorizontalXS },
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
    onSaveEdit: (item: TimelineItem, before: EditValues, changes: ItemChanges) => Promise<void>;
    /** The real form, for what's too complex to work on here */
    onEditInForm: (item: TimelineItem) => void;
    onCopyLink: (item: TimelineItem) => void;
}

const MAX_THUMB_BYTES = 3 * 1024 * 1024;
/** Shown elsewhere in the panel already */
const HIDDEN_COLUMNS = new Set(["scheduledstart", "scheduledend", "actualdurationminutes", "actualend", "ownerid", "prioritycode", "statuscode"]);

interface LoadedDetails {
    details?: ItemDetails;
    files: Record<string, string>;
    loading: boolean;
}

/** Loads preview columns and attachments for an item, plus image previews, once `enabled` turns true. */
function useItemDetails(item: TimelineItem, enabled: boolean): LoadedDetails {
    const { source } = useTimelineEnv();
    const [state, setState] = React.useState<LoadedDetails>({ files: {}, loading: false });
    const loaded = React.useRef(new Set<string>());

    React.useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        // A refresh of the same item keeps what's on screen until the new values are there
        setState((s) => ({ ...s, loading: true }));

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
            d.attachments.filter((a) => a.mimeType?.startsWith("image/") && (a.size ?? 0) <= MAX_THUMB_BYTES && !loaded.current.has(a.id)).forEach((a) => {
                loaded.current.add(a.id);
                void loadImage(a);
            });
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

export const PreviewDrawer: React.FC<PreviewDrawerProps> = ({ entry, focusKey, index, count, onClose, onStep, onOpen, onComplete, onSaveEdit, onEditInForm, onCopyLink }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    // Keep the last entry while the drawer animates closed
    const lastEntry = React.useRef<FeedEntry>();
    if (entry) lastEntry.current = entry;
    const shown = entry ?? lastEntry.current;
    const lead = shown ? (shown.type === "item" ? shown.item : shown.items[0]) : undefined;
    const headingRef = React.useRef<HTMLHeadingElement>(null);
    const backFromForm = React.useRef(false);

    // Start on the title rather than the first button, so the reader lands on the content and no tooltip pops up
    const shownKey = entry?.key;
    React.useEffect(() => {
        if (!shownKey) return;
        const handle = window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 50);
        return () => window.clearTimeout(handle);
    }, [shownKey]);

    // A button that just did its job can be gone, like Mark complete. Focus falls out of the panel then, and keys wouldn't reach it.
    React.useEffect(() => {
        if (!shownKey) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && document.activeElement === document.body) onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [shownKey, onClose]);

    const toForm = (item: TimelineItem) => {
        backFromForm.current = true;
        onEditInForm(item);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        // Menus and dialogs opened from the panel sit outside it, and their keys are theirs
        if (!e.currentTarget.contains(e.target as Node)) return;
        const firstAfterForm = backFromForm.current;
        backFromForm.current = false;
        // When the app's own dialog has closed, it marks the next Esc as handled. Fluent respects that, so the first Esc after the form did nothing.
        if (e.key === "Escape" && firstAfterForm && e.isDefaultPrevented()) {
            onClose();
            return;
        }
        const target = e.target as HTMLElement;
        if (target.closest("input, textarea, [contenteditable='true'], [role='menu'], [role='grid'], [role='listbox']")) return;
        if (e.key === "ArrowDown" || e.key === "j") {
            e.preventDefault();
            onStep(1);
        } else if (e.key === "ArrowUp" || e.key === "k") {
            e.preventDefault();
            onStep(-1);
        } else if ((e.key === "o" || e.key === "O") && lead) {
            e.preventDefault();
            onOpen(lead);
        } else if ((e.key === "e" || e.key === "E") && lead && shown?.type === "item" && canEdit(lead)) {
            e.preventDefault();
            if (quickEdit(lead.entity)) e.currentTarget.querySelector<HTMLElement>("[data-first-edit]")?.focus();
            else toForm(lead);
        }
    };

    const ariaTitle = shown?.type === "thread" ? stripReplyPrefixes(shown.items[0].title) : lead?.title;

    return (
        <OverlayDrawer
            position="end"
            open={!!entry}
            onOpenChange={(_, d) => !d.open && onClose()}
            className={styles.drawer}
            aria-label={ariaTitle}
            onKeyDown={onKeyDown}
        >
            {shown && lead && (
                <>
                    <DrawerHeader className={styles.header}>
                        <div className={styles.toolbar}>
                            {count > 0 && (
                                <>
                                    <Tooltip content={`${t("previousItem")} (↑)`} relationship="label">
                                        <Button appearance="subtle" size="small" icon={<ChevronUpRegular />} disabled={index <= 0} onClick={() => onStep(-1)} />
                                    </Tooltip>
                                    <Tooltip content={`${t("nextItem")} (↓)`} relationship="label">
                                        <Button appearance="subtle" size="small" icon={<ChevronDownRegular />} disabled={index >= count - 1} onClick={() => onStep(1)} />
                                    </Tooltip>
                                    <span className={styles.counter}>{t("itemOfTotal", index + 1, count)}</span>
                                </>
                            )}
                            <span className={styles.spacer} />
                            <Tooltip content={`${shown.type === "thread" ? t("openLatest") : t("openRecord")} (O)`} relationship="label">
                                <Button appearance="subtle" size="small" icon={<OpenRegular />} onClick={() => onOpen(lead)} />
                            </Tooltip>
                            <Tooltip content={t("copyLink")} relationship="label">
                                <Button appearance="subtle" size="small" icon={<LinkRegular />} onClick={() => onCopyLink(lead)} />
                            </Tooltip>
                            <Tooltip content={`${t("close")} (Esc)`} relationship="label">
                                <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={onClose} />
                            </Tooltip>
                        </div>
                    </DrawerHeader>
                    {shown.type === "item" ? (
                        <ItemPanel key={shown.key} item={shown.item} headingRef={headingRef} onSaveEdit={onSaveEdit} onComplete={onComplete} onEditInForm={toForm} />
                    ) : (
                        <ConversationPanel
                            key={`${shown.key}|${focusKey ?? ""}`}
                            items={shown.items}
                            focusKey={focusKey}
                            headingRef={headingRef}
                            onOpen={onOpen}
                            onEditInForm={toForm}
                        />
                    )}
                </>
            )}
        </OverlayDrawer>
    );
};

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * One item, built like its card: same icon, same title, the status where it's easy to find.
 * Open work is worked on right here. Everything saves when it's changed, with no edit mode and nothing to press.
 */
const ItemPanel: React.FC<{
    item: TimelineItem;
    headingRef: React.RefObject<HTMLHeadingElement>;
    onSaveEdit: PreviewDrawerProps["onSaveEdit"];
    onComplete: PreviewDrawerProps["onComplete"];
    onEditInForm: (item: TimelineItem) => void;
}> = ({ item, headingRef, onSaveEdit, onComplete, onEditInForm }) => {
    const { t, dates, config } = useTimelineEnv();
    const styles = useStyles();
    const { details, files } = useItemDetails(item, true);
    const download = useDownload();
    const inlineImages = React.useMemo(() => inlineImageMap(details, files), [details, files]);

    const [values, setValues] = React.useState<EditValues>();
    const valuesRef = React.useRef<EditValues>();
    React.useEffect(() => {
        if (!details?.edit) return;
        valuesRef.current = details.edit;
        setValues(details.edit);
    }, [details?.edit]);

    const [saveState, setSaveState] = React.useState<SaveState>({ kind: "idle" });
    const savedTimer = React.useRef<number>();
    React.useEffect(() => () => window.clearTimeout(savedTimer.current), []);

    const save = async (changes: ItemChanges): Promise<boolean> => {
        const before = valuesRef.current ?? { title: item.title, text: item.body ?? "", textIsRich: !!item.bodyIsHtml, allDay: false, priorities: [] };
        window.clearTimeout(savedTimer.current);
        setSaveState({ kind: "saving" });
        try {
            await onSaveEdit(item, before, changes);
            const next: EditValues = {
                ...before,
                title: changes.title ?? before.title,
                text: changes.text ?? before.text,
                start: changes.start === undefined ? before.start : changes.start ?? undefined,
                end: changes.end === undefined ? before.end : changes.end ?? undefined,
                priority: changes.priority ?? before.priority,
            };
            valuesRef.current = next;
            setValues(next);
            setSaveState({ kind: "saved" });
            // Closing work removes the buttons that did it; carry on from the title, so the arrows and Esc keep working
            if (changes.status && changes.status.state !== 0 && changes.status.state !== 3) headingRef.current?.focus({ preventScroll: true });
            savedTimer.current = window.setTimeout(() => setSaveState({ kind: "idle" }), 2500);
            return true;
        } catch (e) {
            setSaveState({ kind: "error", message: `${t("saveFailed")} ${errorMessage(e)}` });
            return false;
        }
    };

    const refuse = (message: string) => {
        setSaveState({ kind: "error", message });
        return Promise.resolve(false);
    };

    const commitTitle = (next: string) => {
        const title = next.trim();
        if (title === (valuesRef.current?.title ?? "").trim()) return Promise.resolve(true);
        if (item.kind === "activity" && !title) return refuse(t("editTitleRequired"));
        if (item.kind === "note" && !title && !(valuesRef.current?.text ?? "").trim() && !item.file) return refuse(t("editNoteEmpty"));
        return save({ title });
    };

    const commitText = (next: string) => {
        if (next === valuesRef.current?.text) return Promise.resolve(true);
        if (item.kind === "note" && !next.trim() && !(valuesRef.current?.title ?? "").trim() && !item.file) return refuse(t("editNoteEmpty"));
        return save({ text: next });
    };

    const open = canEdit(item);
    const quick = open ? quickEdit(item.entity) : undefined;
    const workable = !!quick && !!values;
    const isImageNote = !!item.file?.mimeType?.startsWith("image/");
    // A note's own image is shown large; listing it again as an attachment adds nothing
    const attachments = (details?.attachments ?? []).filter((a) => !(isImageNote && a.id === item.file?.id && files[a.id]));
    // The date shown is the one that can be changed, whatever the feed is sorted by
    const date = keyDate(item, quick === "due" ? "due" : quick === "span" ? "start" : dateRule(item.entity, config), t, dates);
    const datesEditable = workable && quick !== "text" && !values?.allDay;
    // The fields are there from the start, so nothing moves when what's in them has loaded
    const textEditable = !!quick && !item.bodyIsHtml && !values?.textIsRich;
    const textLabel = item.kind === "note" ? t("fieldText") : t("fieldDescription");
    const closeStatus = details?.statuses?.find((s) => s.state === 1);
    const showComplete = item.kind === "activity" && isOpenState(item.state) && canComplete(item.entity);
    const formOnly = item.kind === "activity" && open && !quick;

    const [confirmDialog, confirmClose] = useConfirmClose(headingRef);
    // A note without a title goes by its text
    const current = valuesRef.current;
    const title = current?.title.trim() ? current.title : item.title;
    const changeStatus = (next: StatusOption, trigger: HTMLElement | null) => {
        if (next.state !== 1 && next.state !== 2) void save({ status: next });
        else confirmClose({ title, canceled: next.state === 2, run: () => save({ status: next }), returnTo: trigger });
    };
    const complete = () => confirmClose({ title, canceled: false, run: () => (closeStatus ? save({ status: closeStatus }) : onComplete(item)) });

    return (
        <>
            <DrawerBody className={styles.body}>
                <div className={styles.identity}>
                    <TypeNode item={item} />
                    <div className={styles.identityText}>
                        <h2 className={styles.heading} ref={headingRef} tabIndex={-1}>
                            {quick ? (
                                <InlineText
                                    first
                                    title
                                    value={values?.title ?? item.title}
                                    readOnly={!values}
                                    label={t("changeTitle")}
                                    placeholder={t("addTitle")}
                                    onCommit={commitTitle}
                                />
                            ) : (
                                item.title
                            )}
                        </h2>
                        <div className={styles.meta}>
                            <span className={styles.typeLabel}>{item.typeLabel}</span>
                            <People item={item} max={3} />
                        </div>
                    </div>
                </div>

                <div className={styles.indented}>
                    <div className={styles.props}>
                        {item.kind === "activity" && <StatusChip item={item} statuses={quick ? details?.statuses : undefined} onChange={changeStatus} />}
                        {datesEditable && values && quick ? <DateChip date={date} kind={quick} values={values} onSave={save} /> : <DateText date={date} />}
                        {item.kind === "activity" && <PriorityChip item={item} values={values} editable={workable} onSave={save} />}
                    </div>
                    {workable && values?.allDay && (
                        <div className={styles.hint}>
                            <span>{t("editAllDay")}</span>
                            <Button size="small" appearance="transparent" onClick={() => onEditInForm(item)}>
                                {t("editInForm")}
                            </Button>
                        </div>
                    )}
                    {textEditable ? (
                        <Prop wide label={textLabel}>
                            <InlineText
                                value={values?.text ?? item.body ?? ""}
                                readOnly={!values}
                                label={t("changeText")}
                                placeholder={item.kind === "note" ? t("addText") : t("addDescription")}
                                onCommit={commitText}
                            />
                        </Prop>
                    ) : (
                        !!item.body &&
                        (item.entity === "email" ? (
                            <Body item={item} inlineImages={inlineImages} />
                        ) : (
                            <Prop wide label={textLabel}>
                                <Body item={item} inlineImages={inlineImages} />
                            </Prop>
                        ))
                    )}
                    {workable && values?.textIsRich && item.kind === "activity" && (
                        <div className={styles.hint}>
                            <span>{t("editRichText")}</span>
                            <Button size="small" appearance="transparent" onClick={() => onEditInForm(item)}>
                                {t("editInForm")}
                            </Button>
                        </div>
                    )}
                    {isImageNote && item.file && files[item.file.id] && <img className={styles.imagePreview} src={files[item.file.id]} alt={item.file.fileName} />}
                </div>

                {attachments.length > 0 && (
                    <div className={styles.section}>
                        <SectionHeader label={t("attachments")} count={attachments.length} />
                        <div className={styles.attachments}>
                            {attachments.map((a) => (
                                <AttachmentTile key={a.id} file={a} preview={files[a.id]} onDownload={() => void download(a)} />
                            ))}
                        </div>
                    </div>
                )}
                <Details item={item} details={details} />
            </DrawerBody>
            {(showComplete || formOnly || saveState.kind !== "idle") && (
                <DrawerFooter className={styles.footer}>
                    <span className={styles.saveState} role="status">
                        {saveState.kind === "saving" && (
                            <>
                                <Spinner size="extra-tiny" />
                                {t("saving")}
                            </>
                        )}
                        {saveState.kind === "saved" && (
                            <>
                                <CheckmarkCircleFilled className={styles.saved} />
                                {t("saved")}
                            </>
                        )}
                        {saveState.kind === "error" && <span className={styles.saveError}>{saveState.message}</span>}
                    </span>
                    <span className={styles.spacer} />
                    {formOnly && (
                        <Button className={styles.actionButton} appearance={showComplete ? "secondary" : "primary"} icon={<EditRegular />} onClick={() => onEditInForm(item)}>
                            {t("editInForm")}
                        </Button>
                    )}
                    {showComplete && (
                        <Button
                            className={styles.actionButton}
                            appearance="primary"
                            icon={saveState.kind === "saving" ? <Spinner size="extra-tiny" /> : <CheckmarkRegular />}
                            disabled={saveState.kind === "saving"}
                            onClick={complete}
                        >
                            {t("markComplete")}
                        </Button>
                    )}
                </DrawerFooter>
            )}
            {confirmDialog}
        </>
    );
};

/** An email conversation, newest first. The newest (or focused) message is open; the rest expand on click. */
const ConversationPanel: React.FC<{
    items: TimelineItem[];
    focusKey?: string;
    headingRef: React.RefObject<HTMLHeadingElement>;
    onOpen: (item: TimelineItem) => void;
    onEditInForm: (item: TimelineItem) => void;
}> = ({ items, focusKey, headingRef, onOpen, onEditInForm }) => {
    const { t, dates } = useTimelineEnv();
    const styles = useStyles();
    const initial = focusKey && items.some((i) => i.key === focusKey) ? focusKey : items[0].key;
    const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set([initial]));
    const allOpen = expanded.size === items.length;
    const oldest = items[items.length - 1];

    const toggle = (key: string) =>
        setExpanded((s) => {
            const next = new Set(s);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <DrawerBody className={styles.body}>
            <div className={styles.identity}>
                <TypeNode item={items[0]} badge={items.length} />
                <div>
                    <h2 className={styles.heading} ref={headingRef} tabIndex={-1}>
                        {stripReplyPrefixes(items[0].title)}
                    </h2>
                    <div className={styles.meta}>
                        <span className={styles.typeLabel}>{items[0].typeLabel}</span>
                        <span>{t("messages", items.length)}</span>
                        <span>· {formatShortDate(dates, oldest.date)} – {formatShortDate(dates, items[0].date)}</span>
                    </div>
                </div>
            </div>
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
                    <MessagePanel key={m.key} item={m} expanded={expanded.has(m.key)} onToggle={() => toggle(m.key)} onOpen={onOpen} onEditInForm={onEditInForm} />
                ))}
            </div>
        </DrawerBody>
    );
};

const MessagePanel: React.FC<{
    item: TimelineItem;
    expanded: boolean;
    onToggle: () => void;
    onOpen: (item: TimelineItem) => void;
    onEditInForm: (item: TimelineItem) => void;
}> = ({ item, expanded, onToggle, onOpen, onEditInForm }) => {
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
        <div className={styles.message}>
            <button type="button" className={styles.messageHead} aria-expanded={expanded} onClick={onToggle}>
                <Avatar name={sender?.name ?? item.typeLabel} size={32} color="colorful" />
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
                        <div className={styles.attachments} style={{ paddingLeft: 0 }}>
                            {details.attachments.map((a) => (
                                <AttachmentTile key={a.id} file={a} preview={files[a.id]} onDownload={() => void download(a)} />
                            ))}
                        </div>
                    )}
                    <div className={styles.messageActions}>
                        <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpen(item)}>
                            {t("openRecord")}
                        </Button>
                        {/* A draft in the conversation */}
                        {canEdit(item) && (
                            <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => onEditInForm(item)}>
                                {t("editInForm")}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
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
    // Owner, schedule, status and priority are already covered above
    details?.fields.filter((f) => !HIDDEN_COLUMNS.has(f.name)).forEach((f) => rows.push({ label: f.label, value: f.value }));
    const created = formatFull(dates, item.createdOn);
    rows.push({ label: t("detailCreated"), value: item.createdBy?.name ? t("byPerson", created, item.createdBy.name) : created });
    if (item.modifiedOn && Math.abs(item.modifiedOn.getTime() - item.createdOn.getTime()) > 60000) {
        rows.push({ label: t("detailUpdated"), value: formatFull(dates, item.modifiedOn) });
    }

    return (
        <div className={styles.section}>
            <SectionHeader label={t("details")} />
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
    const styles = useStyles();
    if (!item.body) return null;
    if (item.bodyIsHtml) return <HtmlFrame html={item.body} inlineImages={inlineImages} title={item.title} collapseQuoted={collapseQuoted} />;
    if (/^https?:\/\//.test(item.body.trim())) {
        return <HtmlFrame html={`<a href="${escapeHtml(item.body.trim())}">${escapeHtml(item.body.trim())}</a>`} title={item.title} />;
    }
    return <div className={styles.text}>{item.body}</div>;
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
