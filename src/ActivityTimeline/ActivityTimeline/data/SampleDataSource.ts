import { canComplete, canEdit, dateRule, eventDate, quickEdit, withStatusDetails } from "../model/activityTypes";
import { FeedSort, SortOrder, TimelineConfig } from "../model/config";
import { applyChanges } from "../model/edit";
import { compareByDate, isOpenState } from "../model/feed";
import { looksLikeHtml, makeSnippet, noteHeading, threadKeyFor } from "../model/html";
import {
    ActivityTypeInfo, AttachmentRef, Counts, EditValues, ItemChanges, ItemDetails, PartyRef, StatusOption, StateLabels, TimelineFilters, TimelineItem,
} from "../model/types";
import { FeedPagers, FileContent, MergedPager, NewNote, SearchPager, Stream, TimelineDataSource } from "./dataSource";

/**
 * In-memory data for the PCF test harness, which has no Dataverse connection.
 * Only used in development builds when the control has no record context.
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const ME: PartyRef = { id: "u-1", entity: "systemuser", name: "Alex Morgan" };
const SUPPORT: PartyRef = { id: "q-1", entity: "queue", name: "Customer Support", address: "support@example.com" };
const EMMA: PartyRef = { id: "c-1", entity: "contact", name: "Emma Clarke", address: "emma.clarke@harbormotors.example" };
const OLIVER: PartyRef = { id: "c-2", entity: "contact", name: "Oliver Reed", address: "oliver.reed@harbormotors.example" };
const SAM: PartyRef = { id: "u-2", entity: "systemuser", name: "Sam Patel" };

const LABELS: Record<string, string> = {
    email: "Email",
    phonecall: "Phone Call",
    task: "Task",
    appointment: "Appointment",
    annotation: "Note",
    new_message: "Message",
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
            entity: "appointment", title: "Site visit at Harbor Motors: TX-400 lock cylinder", ago: 20 * HOUR, start: -2 * DAY - 3 * HOUR, due: -2 * DAY - 4 * HOUR,
            state: "scheduled", status: "Scheduled", attendees: [EMMA, ME], body: "Go through the roof box on site. Bring a new lock cylinder and a torque wrench.",
        },
        {
            entity: "task", title: "Send new lock cylinder to Harbor Motors (warranty)", ago: 3 * DAY, due: 1 * DAY, state: "open", status: "Not Started", priority: "high",
            body: "Warranty is confirmed. Ship part 7731-LS by express and add the tracking number to the case.",
        },
        {
            entity: "email", title: "Re: Lock cylinder sticking | Case-01194", ago: 2 * HOUR, state: "completed", status: "Received", direction: "in", from: [EMMA], to: [SUPPORT], cc: [OLIVER], attachments: 2,
            body: `<div>Hi Alex,</div><div><br></div><div>Thanks for the quick reply! The inspection report and the warranty form are attached. The box was handed in to us yesterday, and the customer would like it back before the weekend if possible.</div><div><br></div><div>Best regards<br>Emma Clarke<br>Harbor Motors</div><div id="divRplyFwdMsg"><b>From:</b> Customer Support<br><b>Sent:</b> Monday<br><b>Subject:</b> Lock cylinder sticking</div><blockquote>Hi Emma, could you send us an inspection report and the warranty form?</blockquote>`,
        },
        {
            entity: "new_message", title: "Message from the customer portal: When will the part arrive?", ago: 5 * HOUR, state: "open", status: "Open", from: [EMMA],
            body: "Hi! When will the new lock cylinder arrive? The customer asks every day. Thanks!",
        },
        {
            entity: "phonecall", title: "Emma called about the warranty case", ago: 26 * HOUR, state: "completed", status: "Received", direction: "in", from: [EMMA], to: [ME], duration: 12,
            body: "Confirmed that the warranty covers the lock cylinder. Promised an update on delivery time by Friday.",
        },
        { entity: "task", title: "Order a spare part from the old supplier", ago: 27 * HOUR, state: "canceled", status: "Canceled" },
        {
            entity: "annotation", title: "Photos from the workshop", ago: 28 * HOUR, from: [SAM], file: { name: "lock-cylinder-closeup.jpg", mime: "image/jpeg", size: 482113 },
            body: "The cylinder is clearly worn on the inside. It looks like moisture got in through the seal.",
        },
        {
            entity: "email", title: "Lock cylinder sticking | Case-01194", ago: 2 * DAY + 4 * HOUR, state: "completed", status: "Sent", direction: "out", from: [SUPPORT], to: [EMMA],
            body: `<p>Hi Emma,</p><p>Thanks for getting in touch. Could you send us an inspection report and the warranty form?</p><p>Kind regards<br>Customer Support</p>`,
        },
        {
            entity: "email", title: "Lock cylinder sticking", ago: 2 * DAY + 6 * HOUR, state: "completed", status: "Received", direction: "in", from: [EMMA], to: [SUPPORT], attachments: 1,
            body: `<p>Hi,</p><p>A customer has handed in a TX-400 where the lock cylinder sticks. The key won't turn all the way. The box was bought in March this year.</p><p>Best regards, Emma Clarke</p>`,
        },
        {
            entity: "task", title: "Register serial number and purchase date", ago: 2 * DAY + 2 * HOUR, due: 2 * DAY - 2 * HOUR, state: "completed", status: "Completed", priority: "normal",
            body: "Serial no. TX-2026-04411. Bought March 14, 2026 at Harbor Motors.",
        },
        {
            entity: "annotation", title: "Internal assessment", ago: 4 * DAY, from: [ME],
            body: "Third case this month with the lock cylinder on TX-400 from the same batch. Should be reported to the product manager.",
        },
        {
            entity: "task", title: "Report the defect to the product manager (batch 2026-03)", ago: 4 * DAY, due: 6 * DAY - 4 * DAY, state: "open", status: "In Progress", priority: "normal", owner: SAM,
        },
        {
            entity: "phonecall", title: "Call Oliver Reed about a replacement box", ago: 3 * HOUR, due: -1 * DAY, state: "open", status: "Open", direction: "out", from: [ME], to: [OLIVER],
        },
        { entity: "email", title: "Order confirmation 104231", ago: 21 * DAY, state: "completed", status: "Received", direction: "in", from: [OLIVER], to: [SUPPORT], attachments: 1, body: "<p>Attached is the order confirmation for 4 boxes.</p>" },
        { entity: "appointment", title: "Quarterly meeting with Harbor Motors: Q4 forecast", ago: 35 * DAY, start: 35 * DAY, due: 35 * DAY - HOUR, state: "completed", status: "Completed", attendees: [OLIVER, EMMA, ME] },
        { entity: "phonecall", title: "Follow-up after delivery", ago: 49 * DAY, state: "completed", status: "Made", direction: "out", from: [ME], to: [OLIVER], duration: 6 },
        { entity: "task", title: "Update contact details for Harbor Motors", ago: 63 * DAY, due: 60 * DAY, state: "completed", status: "Completed" },
        { entity: "email", title: "Welcome as a dealer", ago: 84 * DAY, state: "completed", status: "Sent", direction: "out", from: [ME], to: [EMMA, OLIVER], body: "<p>Hi both, and welcome as a dealer!</p>" },
        { entity: "annotation", title: "Agreement terms", ago: 90 * DAY, from: [ME], file: { name: "dealer-agreement-2026.pdf", mime: "application/pdf", size: 1203342 } },
        { entity: "appointment", title: "Kickoff meeting for the dealer agreement", ago: 92 * DAY, start: 92 * DAY, due: 92 * DAY - HOUR, state: "completed", status: "Completed", attendees: [OLIVER, ME] },
        { entity: "email", title: "Quote for roof boxes, winter 2026/27", ago: 120 * DAY, state: "completed", status: "Sent", direction: "out", from: [ME], to: [OLIVER], attachments: 1 },
        { entity: "new_message", title: "Message from the customer portal: Thanks for the visit", ago: 125 * DAY, state: "completed", status: "Closed", from: [OLIVER], body: "Thanks for a good meeting yesterday." },
        { entity: "phonecall", title: "First contact: interested in a dealer agreement", ago: 140 * DAY, state: "completed", status: "Received", direction: "in", from: [OLIVER], to: [ME], duration: 18 },
    ];
}

function sampleStatuses(entity: string): StatusOption[] {
    const open = entity === "task"
        ? [{ value: 2, label: "Not Started", state: 0 }, { value: 3, label: "In Progress", state: 0 }, { value: 4, label: "Waiting on someone else", state: 0 }, { value: 7, label: "Deferred", state: 0 }]
        : [{ value: 1, label: "Open", state: 0 }];
    const done = { value: entity === "task" ? 5 : 2, label: "Completed", state: 1 };
    return withStatusDetails([...open, done, { value: 90, label: "Canceled", state: 2 }], {});
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
        noteSubject: isNote ? seed.title : undefined,
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
        statusCode: sampleStatuses(seed.entity).find((s) => s.label === seed.status)?.value,
        statusDetail: sampleStatuses(seed.entity).find((s) => s.label === seed.status)?.detail,
        isOverdue: !isNote && seed.entity !== "email" && (state === "open" || state === "scheduled") && !!scheduledEnd && scheduledEnd.getTime() < now,
        priority: seed.priority,
        priorityLabel: seed.priority === "high" ? "High" : seed.priority === "low" ? "Low" : seed.priority ? "Normal" : undefined,
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
                return true;
            })
            .filter((i) => !filters.onlyMine || i.owner?.id === ME.id)
            .map((i) => withSortDate(i, i.kind === "note" ? (sort.activities === "eventdate" ? "createdon" : sort.notes) : sort.activities, this.config));

        // Like the Dataverse source: only the newest items are looked through, and hits come back once
        if (q) {
            const limit = this.config.searchLimit;
            const newest = [...matching].sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime());
            const searched = newest.slice(0, limit);
            const items = searched.filter((i) => `${i.title} ${i.body ?? ""} ${i.file?.fileName ?? ""}`.toLowerCase().includes(q)).sort(compareByDate(sort.order));
            return { history: new SearchPager(() => this.delay({ items, limit: newest.length > limit ? { count: limit, from: searched[limit - 1].createdOn } : undefined }, 300)) };
        }

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
        if (item.scheduledStart) fields.push({ name: "scheduledstart", label: "Start Time", value: item.scheduledStart.toLocaleString("en-US") });
        if (item.scheduledEnd) fields.push({ name: "scheduledend", label: item.entity === "appointment" ? "End Time" : "Due Date", value: item.scheduledEnd.toLocaleString("en-US") });
        if (item.priorityLabel) fields.push({ name: "prioritycode", label: "Priority", value: item.priorityLabel });
        if (item.entity === "appointment") fields.push({ name: "location", label: "Location", value: "Harbor Motors, 1 Main Street" });
        if (item.entity === "phonecall") fields.push({ name: "phonenumber", label: "Phone Number", value: "+1 555 0100" });
        if (item.owner) fields.push({ name: "ownerid", label: "Owner", value: item.owner.name });

        const attachments: AttachmentRef[] = item.file
            ? [item.file]
            : Array.from({ length: item.attachmentCount ?? 0 }, (_, n) => ({
                id: `${item.id}-att-${n}`,
                entity: "activitymimeattachment" as const,
                fileName: n === 0 ? "inspection-report.pdf" : "warranty-form.pdf",
                mimeType: "application/pdf",
                size: 180000 + n * 90000,
            }));
        const editing = canEdit(item) && quickEdit(item.entity) !== undefined;
        const text = item.body ?? "";
        const edit: EditValues | undefined = editing
            ? {
                title: item.kind === "note" ? item.noteSubject ?? "" : item.title,
                text,
                textIsRich: looksLikeHtml(text),
                start: item.scheduledStart,
                end: item.scheduledEnd,
                allDay: false,
                priority: item.kind === "note" ? undefined : item.priority === "high" ? 2 : item.priority === "low" ? 0 : 1,
                priorities: item.kind === "note" ? [] : [{ value: 0, label: "Low" }, { value: 1, label: "Normal" }, { value: 2, label: "High" }],
            }
            : undefined;
        const statuses = item.kind === "activity" && canEdit(item) ? sampleStatuses(item.entity) : undefined;
        return this.delay({ fields, attachments, edit, statuses }, 350);
    }

    public getFileContent(file: AttachmentRef): Promise<FileContent> {
        return this.delay({ base64: PIXEL, mimeType: "image/png", fileName: file.fileName });
    }

    public getTypeLabels(entities: string[]): Promise<ActivityTypeInfo[]> {
        return Promise.resolve(entities.map((entity) => ({ entity, label: LABELS[entity] ?? entity })));
    }

    public getStateLabels(): Promise<StateLabels> {
        return Promise.resolve({});
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
                target.statusDetail = undefined;
                target.isOverdue = false;
                target.actualEnd = new Date();
            }
        }
        return this.delay(undefined, 300);
    }

    public updateItem(item: TimelineItem, before: EditValues, changes: ItemChanges): Promise<void> {
        console.info("[sample] update", item.key, changes);
        applyChanges(item, before, changes, LABELS.annotation, new Date());
        const stored = this.items.find((i) => i.key === item.key);
        if (stored && stored !== item) applyChanges(stored, before, changes, LABELS.annotation, new Date());
        return this.delay(undefined, 400);
    }

    public openRecord(entity: string, id: string): Promise<void> {
        console.info(`[sample] open ${entity} ${id}`);
        return Promise.resolve();
    }

    public openRecordPanel(entity: string, id: string): Promise<void> {
        console.info(`[sample] panel ${entity} ${id}`);
        return this.delay(undefined, 1500);
    }

    public createActivity(entity: string): Promise<boolean> {
        console.info(`[sample] create ${entity}`);
        return Promise.resolve(false);
    }

    public recordUrl(entity: string, id: string): string {
        return `https://example.crm4.dynamics.com/main.aspx?pagetype=entityrecord&etn=${entity}&id=${id}`;
    }
}
