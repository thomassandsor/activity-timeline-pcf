/**
 * Date helpers. Dataverse returns UTC; users expect their Dataverse time zone, which can differ from the browser's.
 * A "wall" date is a Date whose UTC fields hold the user's local wall-clock time, so all formatting uses timeZone: "UTC".
 */

const MS_DAY = 24 * 60 * 60 * 1000;

export interface DateEnv {
    /** Culture of the user's Formats setting (Personal Options): how dates, times and numbers look, as in the rest of the app */
    locale: string;
    /** The user's language: words in a sentence, like "in 2 days" */
    language: string;
    /** The clock from the user's Formats setting */
    time: Intl.DateTimeFormatOptions;
    /** The week's first day in the culture of that setting, 0 = Sunday */
    firstDay: number;
    /** Offset of the user's Dataverse time zone in minutes for the given instant */
    offsetMinutes: (date: Date) => number;
    now: () => Date;
}

const LANGUAGE_LOCALES: Record<number, string> = {
    1030: "da-DK",
    1031: "de-DE",
    1033: "en-US",
    1035: "fi-FI",
    1036: "fr-FR",
    1043: "nl-NL",
    1044: "nb-NO",
    1053: "sv-SE",
    2057: "en-GB",
    2068: "nn-NO",
};

export function localeFromLanguageId(languageId: number | undefined): string {
    if (languageId && LANGUAGE_LOCALES[languageId]) {
        return LANGUAGE_LOCALES[languageId];
    }
    return typeof navigator !== "undefined" ? navigator.language : "en-US";
}

/** The culture to format with; a malformed name would make Intl throw and take the control down */
export function formatCulture(name: string | undefined, fallback: string): string {
    if (!name) return fallback;
    try {
        return Intl.DateTimeFormat.supportedLocalesOf(name).length > 0 ? name : fallback;
    } catch {
        return fallback;
    }
}

/** The first day of the week in a culture. 0 = Sunday; Monday where the browser can't tell. */
export function cultureFirstDay(locale: string): number {
    try {
        const info = new Intl.Locale(locale) as Intl.Locale & { weekInfo?: { firstDay: number }; getWeekInfo?: () => { firstDay: number } };
        return ((info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1) % 7;
    } catch {
        return 1;
    }
}

/** Intl options for a time pattern like "h:mm tt" or "HH:mm". h23, not hour12: false, which shows midnight as 24:00 in some browsers */
export function timeOptions(pattern: string | undefined): Intl.DateTimeFormatOptions {
    if (!pattern) return { hour: "2-digit", minute: "2-digit" };
    return { hour: /HH|hh/.test(pattern) ? "2-digit" : "numeric", minute: "2-digit", hourCycle: pattern.includes("H") ? "h23" : "h12" };
}

export function toWall(env: DateEnv, date: Date): Date {
    return new Date(date.getTime() + env.offsetMinutes(date) * 60000);
}

// Date and time fields show the user's format too. Always Western digits and the Gregorian calendar, or they can't be read back.
const FIELD: Intl.DateTimeFormatOptions = { calendar: "gregory", numberingSystem: "latn", timeZone: "UTC" };
const FIELD_DATE: Intl.DateTimeFormatOptions = { ...FIELD, year: "numeric", month: "2-digit", day: "2-digit" };

/** Month and year over a calendar, e.g. "December 2026" */
export function formatWallMonth(env: DateEnv, wall: number): string {
    return capitalize(new Intl.DateTimeFormat(env.locale, { ...FIELD, month: "long", year: "numeric" }).format(new Date(wall)));
}

/** Weekday heading in a calendar: two letters, no full stop */
export function formatWallWeekday(env: DateEnv, wall: number): string {
    return new Intl.DateTimeFormat(env.locale, { ...FIELD, weekday: "short" }).format(new Date(wall)).replace(".", "").substring(0, 2);
}

/** Midnight of the user's day, as a wall time */
export function wallDay(env: DateEnv, date: Date): number {
    const wall = toWall(env, date);
    return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
}

export function formatWallDate(env: DateEnv, wall: number): string {
    return new Intl.DateTimeFormat(env.locale, FIELD_DATE).format(new Date(wall));
}

export function formatWallTime(env: DateEnv, minutes: number): string {
    return new Intl.DateTimeFormat(env.locale, { ...FIELD, ...env.time }).format(new Date(minutes * 60000));
}

/** Midnight of a typed date as a wall time, in the order the user's format has them. Without a year it's this year. */
export function parseWallDate(env: DateEnv, text: string): number | undefined {
    const numbers = (text.match(/\d+/g) ?? []).map(Number);
    const order = new Intl.DateTimeFormat(env.locale, FIELD_DATE).formatToParts(0).map((p) => p.type as string).filter((t) => t !== "literal");
    const used = numbers.length === 2 ? order.filter((t) => t !== "year") : order;
    if (numbers.length !== used.length) return undefined;
    const at = (type: string) => numbers[used.indexOf(type)];
    const typedYear = used.includes("year") ? at("year") : toWall(env, env.now()).getUTCFullYear();
    const year = typedYear < 100 ? 2000 + typedYear : typedYear;
    const wall = Date.UTC(year, at("month") - 1, at("day"));
    const check = new Date(wall);
    // Dataverse holds dates from 1753
    return year >= 1753 && year <= 9999 && check.getUTCMonth() === at("month") - 1 && check.getUTCDate() === at("day") ? wall : undefined;
}

/** Minutes after midnight of a typed time: "14:30", "14.30", "1430", "2:30 PM", "2pm" */
export function parseWallTime(env: DateEnv, text: string): number | undefined {
    const lower = text.trim().toLowerCase();
    const digits = lower.match(/\d+/g) ?? [];
    if (digits.length < 1 || digits.length > 2) return undefined;
    const compact = digits.length === 1 && digits[0].length > 2;
    let hour = Number(compact ? digits[0].slice(0, -2) : digits[0]);
    const minute = Number(compact ? digits[0].slice(-2) : digits[1] ?? 0);
    const period = (h: number) =>
        new Intl.DateTimeFormat(env.locale, { ...FIELD, hour: "numeric", hourCycle: "h12" }).formatToParts(h * 3600000).find((p) => p.type === "dayPeriod")?.value.toLowerCase();
    const marked = (h: number, letter: string) => lower.includes(period(h) ?? letter) || new RegExp(`\\d\\s*${letter}`).test(lower);
    if (marked(13, "p") && hour < 12) hour += 12;
    else if (marked(1, "a") && hour === 12) hour = 0;
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : undefined;
}

function wallDayStart(wall: Date): number {
    return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
}

/** Whole calendar days between date and today in the user's zone. 0 = today, 1 = yesterday, -1 = tomorrow. */
export function daysAgo(env: DateEnv, date: Date): number {
    const today = wallDayStart(toWall(env, env.now()));
    const day = wallDayStart(toWall(env, date));
    return Math.round((today - day) / MS_DAY);
}

/** Stable key for grouping by the user's calendar day */
export function dayKey(env: DateEnv, date: Date): string {
    const w = toWall(env, date);
    return `${w.getUTCFullYear()}-${w.getUTCMonth() + 1}-${w.getUTCDate()}`;
}

function fmt(env: DateEnv, date: Date, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(env.locale, { ...options, timeZone: "UTC" }).format(toWall(env, date));
}

export function formatTime(env: DateEnv, date: Date): string {
    return fmt(env, date, env.time);
}

export function formatDayHeader(env: DateEnv, date: Date, labels: { today: string; yesterday: string; tomorrow: string }): string {
    const diff = daysAgo(env, date);
    if (diff === 0) return labels.today;
    if (diff === 1) return labels.yesterday;
    if (diff === -1) return labels.tomorrow;
    const sameYear = toWall(env, date).getUTCFullYear() === toWall(env, env.now()).getUTCFullYear();
    if (diff > 1 && diff < 7) {
        return capitalize(fmt(env, date, { weekday: "long", day: "numeric", month: "long" }));
    }
    return capitalize(
        fmt(env, date, sameYear ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" })
    );
}

export function formatShortDate(env: DateEnv, date: Date): string {
    const sameYear = toWall(env, date).getUTCFullYear() === toWall(env, env.now()).getUTCFullYear();
    return fmt(env, date, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** "2 Dec, 08:00", with the year when it isn't this year */
export function formatMedium(env: DateEnv, date: Date): string {
    const sameYear = toWall(env, date).getUTCFullYear() === toWall(env, env.now()).getUTCFullYear();
    return fmt(env, date, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), ...env.time });
}

/** "2 Dec, 10:00 – 11:00", or both dates when it runs over several days */
export function formatMediumSpan(env: DateEnv, start: Date, end: Date | undefined): string {
    if (!end) return formatMedium(env, start);
    return `${formatMedium(env, start)} – ${dayKey(env, start) === dayKey(env, end) ? formatTime(env, end) : formatMedium(env, end)}`;
}

export function formatFull(env: DateEnv, date: Date): string {
    return capitalize(fmt(env, date, { weekday: "long", day: "numeric", month: "long", year: "numeric", ...env.time }));
}

/** "Monday, November 2 at 09:00"; the year only when it isn't this year. Lowercase-safe for use inside a sentence. */
export function formatLong(env: DateEnv, date: Date): string {
    const sameYear = toWall(env, date).getUTCFullYear() === toWall(env, env.now()).getUTCFullYear();
    return fmt(env, date, { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), ...env.time });
}

/** "Thu 10:00", or "6 Nov 10:00" more than a week away */
export function formatUpcoming(env: DateEnv, date: Date): string {
    const diff = -daysAgo(env, date);
    if (diff >= 0 && diff < 7) {
        return capitalize(fmt(env, date, { weekday: "short", ...env.time }));
    }
    return fmt(env, date, { day: "numeric", month: "short", ...env.time });
}

/** Relative time, e.g. "3 hours ago", "in 2 days", in the user's language */
export function formatRelative(env: DateEnv, date: Date): string {
    const rtf = new Intl.RelativeTimeFormat(env.language, { numeric: "auto" });
    const diffMs = date.getTime() - env.now().getTime();
    const minutes = Math.round(diffMs / 60000);
    if (Math.abs(minutes) < 1) return rtf.format(0, "minute");
    if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    const days = -daysAgo(env, date);
    if (Math.abs(days) < 7) return rtf.format(days, "day");
    const weeks = Math.round(days / 7);
    if (Math.abs(weeks) < 5) return rtf.format(weeks, "week");
    const months = Math.round(days / 30);
    if (Math.abs(months) < 12) return rtf.format(months, "month");
    return rtf.format(Math.round(days / 365), "year");
}

export function formatDuration(minutes: number, locale: string): string {
    if (minutes < 60) {
        return new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "short" }).format(minutes);
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const hours = new Intl.NumberFormat(locale, { style: "unit", unit: "hour", unitDisplay: "narrow" }).format(h);
    return m === 0 ? hours : `${hours} ${new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "narrow" }).format(m)}`;
}

/** Converts a wall-clock timestamp back to a real instant. Asked twice, as the offset can differ on either side of a daylight saving change. */
export function fromWall(env: DateEnv, wallMs: number): Date {
    const guess = new Date(wallMs - env.offsetMinutes(new Date(wallMs)) * 60000);
    return new Date(wallMs - env.offsetMinutes(guess) * 60000);
}

export const DAY_MS = MS_DAY;

function capitalize(s: string): string {
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
