import * as React from "react";
import { Button, makeStyles, shorthands, tokens } from "@fluentui/react-components";
import { ImageOffRegular, MoreHorizontalRegular } from "@fluentui/react-icons";
import { buildEmailDocument, hasRemoteImages, markQuotedReply } from "../model/html";
import { useTimelineEnv } from "./TimelineContext";

const useStyles = makeStyles({
    frame: {
        display: "block",
        width: "100%",
        minHeight: "60px",
        ...shorthands.border(0),
        backgroundColor: "transparent",
    },
    notice: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        marginBottom: tokens.spacingVerticalS,
        ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalS),
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground2,
        fontSize: tokens.fontSizeBase200,
    },
    noticeText: { flexGrow: 1 },
    quoteToggle: { alignSelf: "flex-start", marginTop: tokens.spacingVerticalXS },
});

interface HtmlFrameProps {
    html: string;
    inlineImages?: Record<string, string>;
    title: string;
    /** Hide the quoted earlier messages of a reply behind "Show quoted text" (used in conversations) */
    collapseQuoted?: boolean;
}

/**
 * Renders untrusted HTML (email bodies, rich text notes) in a sandboxed iframe.
 * No allow-scripts: nothing in the content can run. allow-same-origin only lets us measure the height.
 */
export const HtmlFrame: React.FC<HtmlFrameProps> = ({ html, inlineImages, title, collapseQuoted }) => {
    const { t, config } = useTimelineEnv();
    const styles = useStyles();
    const ref = React.useRef<HTMLIFrameElement>(null);
    const hostRef = React.useRef<HTMLDivElement>(null);
    const [allowRemote, setAllowRemote] = React.useState(!!config.advanced.loadRemoteImages);
    const [height, setHeight] = React.useState(120);
    const [colors, setColors] = React.useState<{ text: string; link: string; font: string }>();
    const remote = React.useMemo(() => hasRemoteImages(html), [html]);
    const marked = React.useMemo(() => (collapseQuoted ? markQuotedReply(html) : { html, hasQuote: false }), [html, collapseQuoted]);
    const [showQuoted, setShowQuoted] = React.useState(false);

    // Theme tokens are CSS variables, which don't reach into the iframe; resolve them on the host element
    React.useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const style = window.getComputedStyle(host);
        setColors({
            text: style.color || "#242424",
            link: style.getPropertyValue("--colorBrandForegroundLink").trim() || "#115ea3",
            font: style.fontFamily || "'Segoe UI', sans-serif",
        });
    }, []);

    const doc = React.useMemo(
        () =>
            colors &&
            buildEmailDocument(marked.html, {
                allowRemoteImages: allowRemote,
                hideQuoted: marked.hasQuote && !showQuoted,
                inlineImages,
                textColor: colors.text,
                linkColor: colors.link,
                fontFamily: colors.font,
            }),
        [marked, showQuoted, inlineImages, allowRemote, colors],
    );

    const measure = React.useCallback(() => {
        const body = ref.current?.contentDocument?.body;
        if (body) setHeight(Math.max(60, body.scrollHeight + 8));
    }, []);

    React.useEffect(() => {
        const frame = ref.current;
        if (!frame) return;
        const onLoad = () => {
            measure();
            // Images change the height after load
            frame.contentDocument?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
        };
        frame.addEventListener("load", onLoad);
        return () => frame.removeEventListener("load", onLoad);
    }, [measure, doc]);

    return (
        <div ref={hostRef}>
            {remote && !allowRemote && (
                <div className={styles.notice}>
                    <ImageOffRegular />
                    <span className={styles.noticeText}>{t("remoteImagesBlocked")}</span>
                    <Button size="small" appearance="transparent" onClick={() => setAllowRemote(true)}>
                        {t("showImages")}
                    </Button>
                </div>
            )}
            {doc && (
                <iframe
                    ref={ref}
                    className={styles.frame}
                    title={title}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                    srcDoc={doc}
                    style={{ height }}
                />
            )}
            {marked.hasQuote && (
                <Button
                    className={styles.quoteToggle}
                    size="small"
                    appearance="subtle"
                    icon={<MoreHorizontalRegular />}
                    aria-expanded={showQuoted}
                    onClick={() => setShowQuoted(!showQuoted)}
                >
                    {showQuoted ? t("hideQuoted") : t("showQuoted")}
                </Button>
            )}
        </div>
    );
};
