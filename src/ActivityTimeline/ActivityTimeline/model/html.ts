/** Placeholder for removed quoted content; a private-use character can't occur in real text */
const QUOTE = `${String.fromCharCode(0xe000)}QUOTE${String.fromCharCode(0xe000)}`;

const HTML_HINT =/<\/?(p|div|br|span|table|html|body|b|i|u|strong|em|ul|ol|li|a|img|font|h[1-6])\b/i;

export function looksLikeHtml(text: string | undefined): boolean {
    return !!text && HTML_HINT.test(text);
}

/** Converts HTML to readable plain text with paragraph breaks preserved. */
export function htmlToText(html: string): string {
    if (typeof DOMParser === "undefined") {
        return html.replace(/<[^>]+>/g, " ");
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("style,script,head,title,meta,link").forEach((el) => el.remove());
    // Outlook marks the quoted part of a reply; drop it before extracting text
    doc.querySelectorAll("blockquote,#divRplyFwdMsg,#appendonsend,.gmail_quote,[id^='x_divRplyFwdMsg']").forEach((el) => {
        el.replaceWith(doc.createTextNode(`\n${QUOTE}\n`));
    });
    doc.querySelectorAll("br").forEach((el) => el.replaceWith(doc.createTextNode("\n")));
    doc.querySelectorAll("p,div,li,tr,h1,h2,h3,h4,h5,h6").forEach((el) => el.append(doc.createTextNode("\n")));
    return doc.body?.textContent ?? "";
}

/** Lines that start a quoted earlier message in common mail clients and languages */
const QUOTE_MARKERS = [
    /^-{2,}\s*(original message|opprinnelig melding|ursprungligt meddelande|oprindelig meddelelse|ursprüngliche nachricht)/i,
    /^_{5,}$/,
    /^(from|fra|från|von|de)\s*:\s.+/i,
    /^on .+ wrote:$/i,
    /^(den|på) .+ (skrev|skrev følgende).*:$/i,
    /^am .+ schrieb .+:$/i,
    /^>+/,
];

/**
 * Plain-text excerpt for cards. Removes quoted replies and signatures so the card shows what's new in this message.
 */
export function makeSnippet(body: string | undefined, isHtml: boolean, maxLength = 280): string | undefined {
    if (!body) return undefined;
    const text = isHtml ? htmlToText(body) : body;
    const lines = text.replace(/\r/g, "").split("\n");
    const kept: string[] = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (line === QUOTE || QUOTE_MARKERS.some((re) => re.test(line))) break;
        if (/^--\s*$/.test(line)) break; // signature delimiter
        kept.push(line);
    }
    const compact = kept.join(" ").replace(/\s+/g, " ").trim();
    if (compact.length === 0) {
        // Everything was quoted (e.g. a forward without comment): fall back to the start of the text
        const all = text.split(QUOTE).join(" ").replace(/\s+/g, " ").trim();
        return all.length > 0 ? truncate(all, maxLength) : undefined;
    }
    return truncate(compact, maxLength);
}

/**
 * Title and excerpt for a note. Notes often have no subject; then the start of the text becomes the title,
 * and the excerpt is only kept when there's more to read.
 */
export function noteHeading(subject: string | undefined, fileName: string | undefined, snippet: string | undefined, fallback: string): { title: string; snippet?: string } {
    if (subject) return { title: subject, snippet };
    if (fileName) return { title: fileName, snippet };
    if (!snippet) return { title: fallback };
    const max = 72;
    return snippet.length > max ? { title: truncate(snippet, max), snippet } : { title: snippet };
}

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Removes reply/forward prefixes and external-sender tags, e.g. "SV: Re: [EXT] Subject" → "Subject". */
export function stripReplyPrefixes(subject: string): string {
    let s = subject.trim();
    let previous = "";
    while (previous !== s) {
        previous = s;
        s = s
            .replace(/^\s*(re|sv|svar|vs|vb|fw|fwd|wg|aw|tr|antw|ref|r)\s*(\[\d+\])?\s*:\s*/i, "")
            .replace(/^\s*\[(ext|external|ekstern|extern)\]\s*/i, "")
            .trim();
    }
    return s;
}

/** Normalises an email subject so replies and forwards group into one conversation. */
export function threadKeyFor(subject: string | undefined): string | undefined {
    if (!subject) return undefined;
    const s = stripReplyPrefixes(subject);
    return s.length > 0 ? s.toLowerCase() : undefined;
}

export interface EmailDocumentOptions {
    allowRemoteImages: boolean;
    /** Replaces cid: references with data URLs from attachments */
    inlineImages?: Record<string, string>;
    textColor: string;
    linkColor: string;
    fontFamily: string;
    /** Hide parts marked by markQuotedReply */
    hideQuoted?: boolean;
}

/**
 * Wraps an HTML body in a standalone document for a sandboxed iframe.
 * The iframe has no allow-scripts, and the CSP blocks every external load except images when allowed.
 */
export function buildEmailDocument(html: string, opts: EmailDocumentOptions): string {
    let body = html;
    if (opts.inlineImages) {
        body = body.replace(/src=(["'])cid:([^"']+)\1/gi, (match: string, quote: string, cid: string) => {
            const url = opts.inlineImages?.[cid] ?? opts.inlineImages?.[cid.split("@")[0]];
            return url ? `src=${quote}${url}${quote}` : match;
        });
    }
    const imgSrc = opts.allowRemoteImages ? "data: https:" : "data:";
    const csp = `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
html,body{margin:0;padding:0;background:transparent;}
body{font-family:${opts.fontFamily};font-size:14px;line-height:1.5;color:${opts.textColor};overflow-wrap:anywhere;}
a{color:${opts.linkColor};}
img{max-width:100%;height:auto;}
table{max-width:100%;}
blockquote{margin:8px 0;padding-left:12px;border-left:3px solid rgba(128,128,128,.35);color:inherit;opacity:.85;}
pre{white-space:pre-wrap;}
${opts.hideQuoted ? `.${QUOTED_CLASS}{display:none !important;}` : ""}
</style></head><body>${body}</body></html>`;
}

/** Where common mail clients start the quoted earlier message in a reply */
const QUOTE_START_SELECTORS = [
    ".gmail_quote",
    "#divRplyFwdMsg",
    "[id^='x_divRplyFwdMsg']",
    "#appendonsend",
    "div[style*='border-top:solid #E1E1E1']",
    "div[style*='border-top: solid #E1E1E1']",
    "blockquote[type='cite']",
    "blockquote",
];

const QUOTED_CLASS = "rsn-quoted";

/**
 * Marks the quoted part of a reply (from the first quote marker to the end of its container) so it can be hidden.
 * Returns the original HTML when there's nothing to mark.
 */
export function markQuotedReply(html: string): { html: string; hasQuote: boolean } {
    if (typeof DOMParser === "undefined") return { html, hasQuote: false };
    const doc = new DOMParser().parseFromString(html, "text/html");
    let start: Element | null = null;
    for (const selector of QUOTE_START_SELECTORS) {
        start = doc.body.querySelector(selector);
        if (start) break;
    }
    if (!start) return { html, hasQuote: false };
    // A plain-text "On … wrote:" line often sits just before the quote; include it
    const previous = start.previousElementSibling;
    if (previous && /(wrote|skrev|schrieb|écrit)\s*:\s*$/i.test(previous.textContent ?? "")) start = previous;
    for (let el: Element | null = start; el; el = el.nextElementSibling) {
        el.classList.add(QUOTED_CLASS);
    }
    return { html: doc.body.innerHTML, hasQuote: true };
}

/** Escapes plain text for safe use inside generated HTML */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function hasRemoteImages(html: string): boolean {
    return /<img[^>]+src=["']https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
}
