import { canComplete, dateRule, eventDate } from "../model/activityTypes";
import { FeedSort, SortOrder, TimelineConfig } from "../model/config";
import { compareByDate, isOpenState } from "../model/feed";
import { looksLikeHtml, makeSnippet, noteHeading, threadKeyFor } from "../model/html";
import {
    ActivityTypeInfo, AttachmentRef, Counts, ItemDetails, PartyRef, RhythmRow, TimelineFilters, TimelineItem,
} from "../model/types";
import { FeedPagers, FileContent, MergedPager, NewNote, Stream, TimelineDataSource } from "./dataSource";

/**
 * In-memory data for the PCF test harness, which has no Dataverse connection.
 * Only used in development builds when the control has no record context.
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const ME: PartyRef = { id: "u-1", entity: "systemuser", name: "Kari Nordmann" };
const SUPPORT: PartyRef = { id: "q-1", entity: "queue", name: "Kundeservice", address: "support@example.com" };
const INGRID: PartyRef = { id: "c-1", entity: "contact", name: "Ingrid Haugen", address: "ingrid.haugen@fjordbil.example" };
const OLA: PartyRef = { id: "c-2", entity: "contact", name: "Ola Berg", address: "ola.berg@fjordbil.example" };
const MARTE: PartyRef = { id: "u-2", entity: "systemuser", name: "Marte Lie" };

const LABELS: Record<string, string> = {
    email: "E-post",
    phonecall: "Telefonsamtale",
    task: "Oppgave",
    appointment: "Avtale",
    annotation: "Notat",
    new_message: "Melding",
};

// A 1x1 PNG, used as a stand-in for attachment bodies
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYgN4t1G7ugAAAABJRU5ErkJggg==";

interface Seed {
    entity: string;
    title: string;
    ago: number;
    body?: string;
    state?: TimelineItem["state"];
    status?: string;
    due?: number;
    start?: number;
    priority?: TimelineItem["priority"];
    from?: PartyRef[];
    to?: PartyRef[];
    cc?: PartyRef[];
    attendees?: PartyRef[];
    direction?: TimelineItem["direction"];
    attachments?: number;
    file?: { name: string; mime: string; size: number };
    duration?: number;
    owner?: PartyRef;
}

function seeds(): Seed[] {
    return [
        {
            entity: "appointment", title: "Befaring hos Fjordbil Skøyen – låssylinder TX-400", ago: 20 * HOUR, start: -2 * DAY - 3 * HOUR, due: -2 * DAY - 2 * HOUR,
            state: "scheduled", status: "Planlagt", attendees: [INGRID, ME], body: "Gjennomgang av boksen på stedet. Ta med ny låssylinder og momentnøkkel.",
        },
        {
            entity: "task", title: "Send ny låssylinder til Fjordbil Skøyen (garanti)", ago: 3 * DAY, due: 1 * DAY, state: "open", status: "Ikke startet", priority: "high",
            body: "Kunden har fått bekreftet garanti. Send del nr. 7731-LS med ekspress, og legg sporingsnummer i saken.",
        },
        {
            entity: "email", title: "Re: Låssylinder henger seg | Case-01194", ago: 2 * HOUR, state: "completed", status: "Mottatt", direction: "in", from: [INGRID], to: [SUPPORT], cc: [OLA], attachments: 2,
            body: `<div>Hei Kari,</div><div><br></div><div>Takk for rask respons! Bildene av låsen er vedlagt. Boksen ble levert inn hos oss i går, og kunden ønsker den tilbake før helgen hvis mulig.</div><div><br></div><div>Mvh<br>Ingrid Haugen<br>Fjordbil Skøyen</div><div id="divRplyFwdMsg"><b>Fra:</b> Kundeservice<br><b>Sendt:</b> mandag<br><b>Emne:</b> Låssylinder henger seg</div><blockquote>Hei Ingrid, kan du sende bilder av låssylinderen?</blockquote>`,
        },
        {
            entity: "new_message", title: "Melding fra kundeportalen: Når kommer delen?", ago: 5 * HOUR, state: "open", status: "Åpen", from: [INGRID],
            body: "Hei! Vi lurer på når den nye låssylinderen kommer, kunden spør daglig. Takk!",
        },
        {
            entity: "phonecall", title: "Ingrid ringte om status på garantisaken", ago: 26 * HOUR, state: "completed", status: "Utført", direction: "in", from: [INGRID], to: [ME], duration: 12,
            body: "Avklart at garantien dekker låssylinder. Lovet tilbakemelding på leveringstid innen fredag.",
        },
        {
            entity: "annotation", title: "Bilder fra verkstedet", ago: 28 * HOUR, from: [MARTE], file: { name: "laassylinder-naerbilde.jpg", mime: "image/jpeg", size: 482113 },
            body: "Låssylinderen er tydelig slitt på innsiden. Ser ut som fukt har kommet inn via pakningen.",
        },
        {
            entity: "email", title: "Låssylinder henger seg | Case-01194", ago: 2 * DAY + 4 * HOUR, state: "completed", status: "Sendt", direction: "out", from: [SUPPORT], to: [INGRID],
            body: `<p>Hei Ingrid,</p><p>Takk for henvendelsen. Kan du sende bilder av låssylinderen og serienummeret på boksen?</p><p>Vennlig hilsen<br>Kundeservice</p>`,
        },
        {
            entity: "email", title: "Låssylinder henger seg – TX-400", ago: 2 * DAY + 6 * HOUR, state: "completed", status: "Mottatt", direction: "in", from: [INGRID], to: [SUPPORT], attachments: 1,
            body: `<p>Hei,</p><p>En kunde har levert inn en TX-400 der låssylinderen henger seg. Nøkkelen lar seg ikke vri helt rundt. Boksen er kjøpt i mars i år.</p><p>Mvh Ingrid Haugen</p>`,
        },
        {
            entity: "task", title: "Registrer serienummer og kjøpsdato", ago: 2 * DAY + 2 * HOUR, due: 2 * DAY - 2 * HOUR, state: "completed", status: "Fullført", priority: "normal",
            body: "Serienr. TX-2026-04411. Kjøpt 14. mars 2026 hos Fjordbil Skøyen.",
        },
        {
            entity: "annotation", title: "Intern vurdering", ago: 4 * DAY, from: [ME],
            body: "Tredje sak denne måneden med låssylinder på TX-400 fra samme batch. Bør meldes til produktansvarlig.",
        },
        {
            entity: "task", title: "Meld avvik til produktansvarlig (batch 2026-03)", ago: 4 * DAY, due: 6 * DAY - 4 * DAY, state: "open", status: "Pågår", priority: "normal", owner: MARTE,
        },
        {
            entity: "phonecall", title: "Ringe Ola Berg om alternativ boks", ago: 3 * HOUR, due: -1 * DAY, state: "open", status: "Åpen", direction: "out", from: [ME], to: [OLA],
        },
        { entity: "email", title: "Ordrebekreftelse 104231", ago: 21 * DAY, state: "completed", status: "Mottatt", direction: "in", from: [OLA], to: [SUPPORT], attachments: 1, body: "<p>Vedlagt ordrebekreftelse for 4 bokser.</p>" },
        { entity: "appointment", title: "Kvartalsmøte Fjordbil – forecast Q4", ago: 35 * DAY, start: 35 * DAY, due: 35 * DAY - HOUR, state: "completed", status: "Fullført", attendees: [OLA, INGRID, ME] },
        { entity: "phonecall", title: "Oppfølging etter levering", ago: 49 * DAY, state: "completed", status: "Utført", direction: "out", from: [ME], to: [OLA], duration: 6 },
        { entity: "task", title: "Oppdater kontaktinfo for Fjordbil Skøyen", ago: 63 * DAY, due: 60 * DAY, state: "completed", status: "Fullført" },
        { entity: "email", title: "Velkommen som forhandler", ago: 84 * DAY, state: "completed", status: "Sendt", direction: "out", from: [ME], to: [INGRID, OLA], body: "<p>Hei begge, og velkommen som forhandler!</p>" },
        { entity: "annotation", title: "Avtalevilkår", ago: 90 * DAY, from: [ME], file: { name: "forhandleravtale-2026.pdf", mime: "application/pdf", size: 1203342 } },
        { entity: "appointment", title: "Oppstartsmøte forhandleravtale", ago: 92 * DAY, start: 92 * DAY, due: 92 * DAY - HOUR, state: "completed", status: "Fullført", attendees: [OLA, ME] },
        { entity: "email", title: "Tilbud takbokser vinter 2026/27", ago: 120 * DAY, state: "completed", status: "Sendt", direction: "out", from: [ME], to: [OLA], attachments: 1 },
        { entity: "new_message", title: "Melding fra kundeportalen: Takk for besøket", ago: 125 * DAY, state: "completed", status: "Lukket", from: [OLA], body: "Takk for et godt møte i går." },
        { entity: "phonecall", title: "Første kontakt – interessert i forhandleravtale", ago: 140 * DAY, state: "completed", status: "Utført", direction: "in", from: [OLA], to: [ME], duration: 18 },
    ];
}

function build(seed: Seed, index: number, now: number): TimelineItem {
    const id = `sample-${index}`;
    const isHtml = looksLikeHtml(seed.body);
    const date = new Date(now - seed.ago);
    const scheduledEnd = seed.due !== undefined ? new Date(now - seed.due) : undefined;
    const state = seed.state ?? "completed";
    const isNote = seed.entity === "annotation";
    return {
        key: `${seed.entity}:${id}`,
        id,
        entity: seed.entity,
        kind: isNote ? "note" : "activity",
        typeLabel: LABELS[seed.entity] ?? seed.entity,
        title: seed.title,
        snippet: makeSnippet(seed.body, isHtml),
        body: seed.body,
        bodyIsHtml: isHtml,
        date,
        dateField: "createdon",
        createdOn: date,
        // Completed work was last touched when it was completed
        modifiedOn: state === "completed" ? new Date(date.getTime() + 2 * HOUR) : date,
        scheduledStart: seed.start !== undefined ? new Date(now - seed.start) : undefined,
        scheduledEnd,
        actualEnd: state === "completed" ? date : undefined,
        durationMinutes: seed.duration,
        state,
        statusLabel: seed.status,
        isOverdue: !isNote && seed.entity !== "email" && (state === "open" || state === "scheduled") && !!scheduledEnd && scheduledEnd.getTime() < now,
        priority: seed.priority,
        priorityLabel: seed.priority === "high" ? "Høy" : seed.priority === "low" ? "Lav" : seed.priority ? "Normal" : undefined,
        owner: seed.owner ?? ME,
        createdBy: seed.from?.[0] ?? ME,
        from: seed.from ?? [],
        to: seed.to ?? [],
        cc: seed.cc ?? [],
        attendees: seed.attendees ?? [],
        direction: seed.direction,
        attachmentCount: seed.attachments,
        file: seed.file ? { id, entity: "annotation", fileName: seed.file.name, mimeType: seed.file.mime, size: seed.file.size } : undefined,
        threadKey: seed.entity === "email" ? threadKeyFor(seed.title) : undefined,
    };
}

/** The item placed by the sort, falling back to created on like the Dataverse source */
function withSortDate(item: TimelineItem, column: string, config: TimelineConfig): TimelineItem {
    if (column === "eventdate") {
        const placed = item.kind === "note" ? { date: item.createdOn, field: "createdon" } : eventDate(item, dateRule(item.entity, config));
        return { ...item, date: placed.date, dateField: placed.field };
    }
    const values: Record<string, Date | undefined> = {
        createdon: item.createdOn,
        modifiedon: item.modifiedOn,
        actualend: item.actualEnd,
        scheduledend: item.scheduledEnd,
        scheduledstart: item.scheduledStart,
        senton: item.entity === "email" && item.direction === "out" ? item.createdOn : undefined,
    };
    const value = values[column];
    return { ...item, date: value ?? item.createdOn, dateField: value ? column : "createdon" };
}

export class SampleDataSource implements TimelineDataSource {
    public readonly currentUserId = ME.id ?? "";
    private items: TimelineItem[];

    constructor(private readonly config: TimelineConfig) {
        const now = Date.now();
        this.items = seeds().map((s, i) => build(s, i, now)).filter((i) => this.typeAllowed(i.entity));
    }

    private typeAllowed(entity: string): boolean {
        if (entity === "annotation") return this.config.includeNotes;
        // The harness shows every sample type, including the custom one, regardless of the configured list
        return true;
    }

    private delay<T>(value: T, ms = 250): Promise<T> {
        return new Promise((resolve) => setTimeout(() => resolve(value), ms));
    }

    public getCounts(): Promise<Counts> {
        const byType = new Map<string, { entity: string; label: string; count: number }>();
        for (const i of this.items) {
            const entry = byType.get(i.entity) ?? { entity: i.entity, label: i.typeLabel, count: 0 };
            entry.count++;
            byType.set(i.entity, entry);
        }
        return this.delay({
            total: this.items.length,
            byType: Array.from(byType.values()),
            open: this.items.filter((i) => i.kind === "activity" && isOpenState(i.state)).length,
            overdue: this.items.filter((i) => i.isOverdue).length,
        });
    }

    public getRhythm(sort: FeedSort, from: Date, to: Date): Promise<RhythmRow[]> {
        return this.delay(
            this.items
                .map((i) => withSortDate(i, i.kind === "note" ? (sort.activities === "eventdate" ? "createdon" : sort.notes) : sort.activities, this.config))
                .filter((i) => i.date >= from && i.date < to)
                .map((i) => ({ entity: i.entity, date: i.date })),
        );
    }

    public openFeed(filters: TimelineFilters, sort: FeedSort): FeedPagers {
        const now = Date.now();
        const q = filters.search.trim().toLowerCase();
        const matching = this.items
            .filter((i) => filters.types.length === 0 || filters.types.includes(i.entity))
            .filter((i) => {
                if (filters.status === "all") return true;
                if (i.kind === "note") return false;
                if (filters.status === "open") return i.state === "open" || i.state === "scheduled";
                if (filters.status === "overdue") return i.isOverdue;
                return i.state === "completed";
            })
            .filter((i) => {
                const f = filters.date;
                if (f.kind === "last") return i.date.getTime() >= now - f.days * DAY;
                if (f.kind === "range") return i.date >= f.from && i.date < f.to;
                return true;
            })
            .filter((i) => !filters.onlyMine || i.owner?.id === ME.id)
            .filter((i) => !q || `${i.title} ${i.body ?? ""} ${i.file?.fileName ?? ""}`.toLowerCase().includes(q))
            .map((i) => withSortDate(i, i.kind === "note" ? (sort.activities === "eventdate" ? "createdon" : sort.notes) : sort.activities, this.config));

        // Like the Dataverse source: by activity date, newest first, open items still ahead get their own section
        const withUpcoming = sort.activities === "eventdate" && sort.order === "desc";
        const isUpcoming = (i: TimelineItem) =>
            withUpcoming && i.kind === "activity" && isOpenState(i.state) && (i.dateField === "scheduledstart" || i.dateField === "scheduledend") && i.date.getTime() > now;

        const pageSize = this.config.pageSize;
        const stream = (list: TimelineItem[], order: SortOrder): Stream => {
            const sorted = [...list].sort(compareByDate(order));
            return {
                fetch: (cursor: string | undefined) => {
                    const start = cursor ? parseInt(cursor, 10) : 0;
                    const end = start + pageSize;
                    return this.delay({ items: sorted.slice(start, end), next: end < sorted.length ? String(end) : undefined }, 300);
                },
            };
        };
        const history = matching.filter((i) => !isUpcoming(i));
        const upcoming = matching.filter(isUpcoming);
        return {
            history: new MergedPager([stream(history.filter((i) => i.kind === "activity"), sort.order), stream(history.filter((i) => i.kind === "note"), sort.order)], sort.order),
            upcoming: withUpcoming && filters.status !== "overdue" ? new MergedPager([stream(upcoming, "asc")], "asc") : undefined,
        };
    }

    public getItem(entity: string, id: string): Promise<TimelineItem | undefined> {
        return this.delay(this.items.find((i) => i.entity === entity && i.id === id));
    }

    public getDetails(item: TimelineItem): Promise<ItemDetails> {
        const fields = [];
        if (item.scheduledStart) fields.push({ name: "scheduledstart", label: "Starttid", value: item.scheduledStart.toLocaleString("nb-NO") });
        if (item.scheduledEnd) fields.push({ name: "scheduledend", label: item.entity === "appointment" ? "Sluttid" : "Forfallsdato", value: item.scheduledEnd.toLocaleString("nb-NO") });
        if (item.priorityLabel) fields.push({ name: "prioritycode", label: "Prioritet", value: item.priorityLabel });
        if (item.entity === "appointment") fields.push({ name: "location", label: "Sted", value: "Fjordbil Skøyen, Storgata 1" });
        if (item.entity === "phonecall") fields.push({ name: "phonenumber", label: "Telefonnummer", value: "+47 22 51 30 00" });
        if (item.owner) fields.push({ name: "ownerid", label: "Eier", value: item.owner.name });

        const attachments: AttachmentRef[] = item.file
            ? [item.file]
            : Array.from({ length: item.attachmentCount ?? 0 }, (_, n) => ({
                id: `${item.id}-att-${n}`,
                entity: "activitymimeattachment" as const,
                fileName: n === 0 ? "laas-bilde-1.jpg" : `vedlegg-${n + 1}.pdf`,
                mimeType: n === 0 ? "image/jpeg" : "application/pdf",
                size: 180000 + n * 90000,
            }));
        return this.delay({ fields, attachments }, 350);
    }

    public getFileContent(file: AttachmentRef): Promise<FileContent> {
        return this.delay({ base64: PIXEL, mimeType: "image/png", fileName: file.fileName });
    }

    public getTypeLabels(entities: string[]): Promise<ActivityTypeInfo[]> {
        return Promise.resolve(entities.map((entity) => ({ entity, label: LABELS[entity] ?? entity })));
    }

    public createNote(note: NewNote): Promise<void> {
        const now = Date.now();
        const id = `sample-new-${now}`;
        const heading = noteHeading(note.title, note.file?.name, makeSnippet(note.text, false), LABELS.annotation);
        this.items.unshift({
            key: `annotation:${id}`, id, entity: "annotation", kind: "note", typeLabel: LABELS.annotation,
            title: heading.title, snippet: heading.snippet, body: note.text, bodyIsHtml: false,
            date: new Date(now), dateField: "createdon", createdOn: new Date(now), state: "completed", isOverdue: false, owner: ME, createdBy: ME,
            from: [ME], to: [], cc: [], attendees: [],
            file: note.file ? { id, entity: "annotation", fileName: note.file.name, mimeType: note.file.type, size: note.file.size } : undefined,
        });
        return this.delay(undefined, 400);
    }

    public completeActivity(item: TimelineItem): Promise<void> {
        if (canComplete(item.entity)) {
            const target = this.items.find((i) => i.key === item.key);
            if (target) {
                target.state = "completed";
                target.statusLabel = "Fullført";
                target.isOverdue = false;
                target.actualEnd = new Date();
            }
        }
        return this.delay(undefined, 300);
    }

    public openRecord(entity: string, id: string): Promise<void> {
        console.info(`[sample] open ${entity} ${id}`);
        return Promise.resolve();
    }

    public createActivity(entity: string): Promise<boolean> {
        console.info(`[sample] create ${entity}`);
        return Promise.resolve(false);
    }

    public recordUrl(entity: string, id: string): string {
        return `https://example.crm4.dynamics.com/main.aspx?pagetype=entityrecord&etn=${entity}&id=${id}`;
    }
}
