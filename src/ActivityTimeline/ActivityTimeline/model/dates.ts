/**
 * Date helpers. Dataverse returns UTC; users expect their Dataverse time zone, which can differ from the browser's.
 * A "wall" date is a Date whose UTC fields hold the user's local wall-clock time, so all formatting uses timeZone: "UTC".
 */

const MS_DAY = 24 * 60 * 60 * 1000;

export interface DateEnv {
    locale: string;
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

export function toWall(env: DateEnv, date: Date): Date {
    return new Date(date.getTime() + env.offsetMinutes(date) * 60000);
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
    return fmt(env, date, { hour: "2-digit", minute: "2-digit" });
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

export function formatFull(env: DateEnv, date: Date): string {
    return capitalize(fmt(env, date, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }));
}

/** "Monday, November 2 at 09:00"; the year only when it isn't this year. Lowercase-safe for use inside a sentence. */
export function formatLong(env: DateEnv, date: Date): string {
    const sameYear = toWall(env, date).getUTCFullYear() === toWall(env, env.now()).getUTCFullYear();
    return fmt(env, date, { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit" });
}

/** A meeting's time: "Monday, November 9 · 10:00 – 11:00", or full dates at both ends when it spans days */
export function formatSpan(env: DateEnv, start: Date, end: Date | undefined): string {
    const sameYear = toWall(env, start).getUTCFullYear() === toWall(env, env.now()).getUTCFullYear();
    const day = capitalize(fmt(env, start, { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }));
    if (!end) return `${day} · ${formatTime(env, start)}`;
    if (dayKey(env, start) !== dayKey(env, end)) return `${capitalize(formatLong(env, start))} – ${formatLong(env, end)}`;
    return `${day} · ${formatTime(env, start)} – ${formatTime(env, end)}`;
}

/** "Thu 10:00", or "6 Nov 10:00" more than a week away */
export function formatUpcoming(env: DateEnv, date: Date): string {
    const diff = -daysAgo(env, date);
    if (diff >= 0 && diff < 7) {
        return capitalize(fmt(env, date, { weekday: "short", hour: "2-digit", minute: "2-digit" }));
    }
    return fmt(env, date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Relative time, e.g. "3 hours ago", "in 2 days", using the locale's own wording */
export function formatRelative(env: DateEnv, date: Date): string {
    const rtf = new Intl.RelativeTimeFormat(env.locale, { numeric: "auto" });
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

/** Monday 00:00 (user's zone, as a wall date) of the week containing date */
export function weekStartWall(env: DateEnv, date: Date): number {
    const w = toWall(env, date);
    const start = wallDayStart(w);
    const weekday = (w.getUTCDay() + 6) % 7;
    return start - weekday * MS_DAY;
}

/** Converts a wall-clock timestamp back to a real instant */
export function fromWall(env: DateEnv, wallMs: number): Date {
    const guess = new Date(wallMs);
    return new Date(wallMs - env.offsetMinutes(guess) * 60000);
}

export function isoWeek(wallMs: number): number {
    const d = new Date(wallMs);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / MS_DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function formatWeekRange(env: DateEnv, wallStart: number): string {
    const f = new Intl.DateTimeFormat(env.locale, { day: "numeric", month: "short", timeZone: "UTC" });
    return `${f.format(new Date(wallStart))} – ${f.format(new Date(wallStart + 6 * MS_DAY))}`;
}

export const DAY_MS = MS_DAY;

function capitalize(s: string): string {
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
