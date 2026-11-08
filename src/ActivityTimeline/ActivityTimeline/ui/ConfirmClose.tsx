import * as React from "react";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, makeStyles } from "@fluentui/react-components";
import { useTimelineEnv } from "./TimelineContext";

const useStyles = makeStyles({
    surface: { maxWidth: "440px" },
    // Under the text across the whole width, so the buttons keep their words on one line
    actions: { gridColumnStart: 1, gridColumnEnd: -1, justifySelf: "end" },
    button: { whiteSpace: "nowrap" },
});

export interface CloseRequest {
    title: string;
    canceled: boolean;
    run: () => unknown;
    /** Where focus goes back to. By default, what had it when this asked. */
    returnTo?: HTMLElement | null;
}

/**
 * Closing work can't be undone from the timeline, so every way of doing it asks first.
 * Returns the dialog to render and the function that asks. `fallback` gets focus when what asked is gone.
 */
export function useConfirmClose(fallback?: React.RefObject<HTMLElement>): [React.ReactElement, (request: CloseRequest) => void] {
    const [request, setRequest] = React.useState<CloseRequest>();
    const ask = React.useCallback((r: CloseRequest) => setRequest({ ...r, returnTo: r.returnTo ?? (document.activeElement as HTMLElement | null) }), []);
    const done = () => {
        const back = request?.returnTo;
        setRequest(undefined);
        // The platform's Fluent doesn't give focus back, and without it Esc and the arrows stop reaching the panel
        window.setTimeout(() => {
            if (back?.isConnected) back.focus({ preventScroll: true });
            else fallback?.current?.focus({ preventScroll: true });
        }, 0);
    };
    return [<ConfirmCloseDialog key="confirm-close" request={request} onDone={done} />, ask];
}

const ConfirmCloseDialog: React.FC<{ request?: CloseRequest; onDone: () => void }> = ({ request, onDone }) => {
    const { t } = useTimelineEnv();
    const styles = useStyles();
    // Keep the words while the dialog animates closed
    const last = React.useRef<CloseRequest>();
    if (request) last.current = request;
    const shown = request ?? last.current;

    return (
        <Dialog open={!!request} modalType="alert" onOpenChange={(_, d) => !d.open && onDone()}>
            <DialogSurface
                className={styles.surface}
                onKeyDown={(e) => {
                    // Esc closes this and nothing behind it, like the preview this can sit on
                    if (e.key === "Escape") e.stopPropagation();
                }}
            >
                {shown && (
                    <DialogBody>
                        <DialogTitle>{shown.canceled ? t("confirmCancelTitle") : t("confirmCompleteTitle")}</DialogTitle>
                        {/* The same word as the card will show, whichever of the table's status reasons was picked */}
                        <DialogContent>{t("confirmCloseBody", shown.title, shown.canceled ? t("statusCanceled") : t("statusCompleted"))}</DialogContent>
                        <DialogActions className={styles.actions}>
                            <Button className={styles.button} appearance="secondary" onClick={onDone}>
                                {t("keepOpen")}
                            </Button>
                            <Button
                                className={styles.button}
                                appearance="primary"
                                onClick={() => {
                                    onDone();
                                    void shown.run();
                                }}
                            >
                                {shown.canceled ? t("confirmCancel") : t("confirmComplete")}
                            </Button>
                        </DialogActions>
                    </DialogBody>
                )}
            </DialogSurface>
        </Dialog>
    );
};
