import * as React from "react";
import { Button, Input, makeStyles, mergeClasses, shorthands, Spinner, Textarea, tokens, Tooltip } from "@fluentui/react-components";
import { AttachRegular, DismissRegular, DocumentRegular } from "@fluentui/react-icons";
import { NewNote } from "../data/dataSource";
import { useTimelineEnv } from "./TimelineContext";

const useStyles = makeStyles({
    open: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalS,
        marginBottom: tokens.spacingVerticalM,
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke1),
        borderRadius: tokens.borderRadiusLarge,
        backgroundColor: tokens.colorNeutralBackground1,
        boxShadow: tokens.shadow4,
    },
    titleInput: {
        fontWeight: tokens.fontWeightSemibold,
    },
    footer: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
    },
    spacer: { flexGrow: 1 },
    file: {
        display: "inline-flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalXS,
        maxWidth: "60%",
        ...shorthands.padding("2px", "4px", "2px", tokens.spacingHorizontalS),
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground3,
        fontSize: tokens.fontSizeBase200,
    },
    fileName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    hint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
    error: { color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase200 },
    hiddenInput: { display: "none" },
});

interface NoteComposerProps {
    onSave: (note: NewNote) => Promise<void>;
    onClose: () => void;
}

/** Inline note editor, opened from the New menu. Closes after saving or cancelling. */
export const NoteComposer: React.FC<NoteComposerProps> = ({ onSave, onClose }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    const [title, setTitle] = React.useState("");
    const [text, setText] = React.useState("");
    const [file, setFile] = React.useState<File | undefined>();
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | undefined>();
    const fileRef = React.useRef<HTMLInputElement>(null);
    const textRef = React.useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        textRef.current?.focus();
    }, []);

    const reset = onClose;

    const canSave = (text.trim().length > 0 || !!file) && !saving;

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        setError(undefined);
        try {
            await onSave({ title: title.trim() || undefined, text: text.trim(), file });
            reset();
        } catch (e) {
            setError(`${t("noteFailed")} ${e instanceof Error ? e.message : ""}`.trim());
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className={styles.open}
            onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void save();
                }
                if (e.key === "Escape" && !text && !file) reset();
            }}
        >
            <Input
                className={styles.titleInput}
                appearance="underline"
                placeholder={t("noteTitle")}
                value={title}
                onChange={(_, d) => setTitle(d.value)}
            />
            <Textarea
                ref={textRef}
                resize="vertical"
                appearance="outline"
                placeholder={t("writeNote")}
                value={text}
                rows={3}
                onChange={(_, d) => setText(d.value)}
            />
            {error && <span className={styles.error}>{error}</span>}
            <div className={styles.footer}>
                <input
                    ref={fileRef}
                    type="file"
                    className={styles.hiddenInput}
                    onChange={(e) => {
                        setFile(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
                {file ? (
                    <span className={styles.file}>
                        <DocumentRegular />
                        <span className={styles.fileName}>{file.name}</span>
                        <Button size="small" appearance="transparent" icon={<DismissRegular />} aria-label={t("removeFile")} onClick={() => setFile(undefined)} />
                    </span>
                ) : (
                    <Tooltip content={t("attachFile")} relationship="label">
                        <Button size="small" appearance="subtle" icon={<AttachRegular />} onClick={() => fileRef.current?.click()} />
                    </Tooltip>
                )}
                <span className={mergeClasses(styles.spacer, styles.hint)}>Ctrl + Enter</span>
                <Button size="small" appearance="secondary" onClick={reset} disabled={saving}>
                    {t("cancel")}
                </Button>
                <Button size="small" appearance="primary" onClick={() => void save()} disabled={!canSave} icon={saving ? <Spinner size="extra-tiny" /> : undefined}>
                    {t("save")}
                </Button>
            </div>
        </div>
    );
};
