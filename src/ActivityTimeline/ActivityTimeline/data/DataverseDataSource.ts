import { IInputs } from "../generated/ManifestTypes";
import { canComplete, canEdit, dateRule, eventDate, mapPriority, mapState, previewColumns, quickEdit, ruledTypes, withStatusDetails } from "../model/activityTypes";
import { allowsAllTypes, DateRule, FeedSort, SortColumn, SortOrder, TimelineConfig } from "../model/config";
import { DateEnv, formatFull } from "../model/dates";
import { applyChanges } from "../model/edit";
import { compareByDate, isOpenState } from "../model/feed";
import { looksLikeHtml, makeSnippet, noteHeading, threadKeyFor } from "../model/html";
import {
    ActivityTypeInfo, AttachmentRef, Counts, EditValues, ItemChanges, ItemDetails, ItemState, PartyRef, StatusOption, PreviewField, RecordContext,
    StateLabels, TimelineFilters, TimelineItem,
} from "../model/types";
import { FeedPagers, FileContent, HydratingPager, MergedPager, NewNote, SearchHits, SearchPager, Stream, StreamPage, TimelineDataSource } from "./dataSource";

type Row = Record<string, unknown>;

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
const LOOKUP_TYPE = "@Microsoft.Dynamics.CRM.lookuplogicalname";
/** Item ids per details query; keeps the URL well within limits */
const DETAILS_CHUNK = 25;
/** The real form opens at the width of the preview it replaces */
const PREVIEW_WIDTH = 560;

/** What the feed queries load: enough to place, sort and label an item. Bodies and participants follow for shown items only. */
const LIGHT_SELECT = [
    "activityid", "activitytypecode", "subject", "statecode", "statuscode", "prioritycode",
    "scheduledstart", "scheduledend", "actualend", "actualdurationminutes", "createdon", "modifiedon", "sortdate",
    "senton", "_ownerid_value", "_createdby_value",
].join(",");
const PARTY_EXPAND = "activitypointer_activity_parties($select=participationtypemask,_partyid_value,addressused)";
const NOTE_SELECT = "annotationid,subject,notetext,filename,filesize,mimetype,isdocument,createdon,modifiedon,_createdby_value,_ownerid_value";
/** When sorting by activity date, an activity can sit at any of these */
const EVENT_DATE_COLUMNS: SortColumn[] = ["createdon", "scheduledstart", "scheduledend", "actualend"];

// --- value helpers ----------------------------------------------------------------------------------------

function str(row: Row, key: string): string | undefined {
    const v = row[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(row: Row, key: string): number | undefined {
    const v = row[key];
    return typeof v === "number" ? v : undefined;
}

function date(row: Row, key: string): Date | undefined {
    const v = row[key];
    if (typeof v !== "string" || v.length === 0) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
}

function formatted(row: Row, key: string): string | undefined {
    return str(row, `${key}${FORMATTED}`);
}

function lookup(row: Row, attribute: string): PartyRef | undefined {
    const id = str(row, `_${attribute}_value`);
    if (!id) return undefined;
    return { id, entity: str(row, `_${attribute}_value${LOOKUP_TYPE}`), name: formatted(row, `_${attribute}_value`) ?? "" };
}

function normalizeId(id: string): string {
    return id.replace(/[{}]/g, "").toLowerCase();
}

function odataString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** A search term as an OData string: wildcard characters match literally, and it's encoded because options go into the URL as they are */
function searchLiteral(term: string): string {
    return encodeURIComponent(odataString(term.trim().replace(/[%_[]/g, "[$&]")));
}

function xmlValue(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const OPEN = "(statecode eq 0 or statecode eq 3)";
const CLOSED = "(statecode eq 1 or statecode eq 2)";

function anyOf(conditions: (string | undefined)[]): string | undefined {
    const list = conditions.filter((c): c is string => !!c);
    return list.length <= 1 ? list[0] : `(${list.join(" or ")})`;
}

function allOf(conditions: (string | undefined)[]): string | undefined {
    const list = conditions.filter((c): c is string => !!c);
    return list.length <= 1 ? list[0] : `(${list.join(" and ")})`;
}

function typeIn(types: string[]): string {
    return anyOf(types.map((t) => `activitytypecode eq ${odataString(t)}`)) ?? "false";
}

/** One query of the feed: some activity types in some states, ordered by one date column. */
interface Slice {
    column: SortColumn;
    condition?: string;
    /** States the slice can hold, so a status filter can leave it out */
    states: "open" | "closed" | "any";
    /** Types it can hold, so it's skipped when the record has none; undefined = any type */
    types?: string[];
}

/** Activity counts per type and state, plus notes. Also tells the feed which queries can be skipped. */
interface TypeStates {
    rows: { entity: string; label: string; open: boolean; count: number }[];
    notes: number;
    /** False when counting fell back to regarding only; such counts can't rule out participant activities */
    withParties: boolean;
    /** False when some counted type couldn't be named; then nothing is ruled out */
    complete: boolean;
}

/**
 * FetchXML returns activity types as object type codes. These are fixed for system tables;
 * custom activity tables get theirs from metadata.
 */
const SYSTEM_TYPE_CODES: Record<number, string> = {
    4201: "appointment", 4202: "email", 4204: "fax", 4206: "incidentresolution", 4207: "letter", 4208: "opportunityclose",
    4209: "orderclose", 4210: "phonecall", 4211: "quoteclose", 4212: "task", 4214: "serviceappointment", 4216: "socialactivity",
    4251: "recurringappointmentmaster", 4401: "campaignresponse", 4402: "campaignactivity", 4406: "bulkoperation",
};

const INTERNAL_PARTY_TYPES = new Set(["systemuser", "queue", "team"]);

interface MetadataAttribute {
    DisplayName?: string;
    /** Choice labels by value, in the user's language (model-driven apps) */
    OptionSet?: Record<string, { text?: string } | undefined>;
    AttributeType?: number | string;
    AttributeTypeName?: { value?: string };
    /** Status reasons with their states. Not in the public typings; without it the status can't be changed from here. */
    attributeDescriptor?: { OptionSet?: { Label?: string; Value?: number; State?: number; IsHidden?: boolean }[] };
}

interface MetadataLike {
    DisplayName?: string;
    EntitySetName?: string;
    Attributes?: { get?: (name: string) => MetadataAttribute | undefined };
}

/** Lookup-like attribute types: Customer = 1, Lookup = 6, Owner = 9 */
function isLookupAttribute(attr: MetadataAttribute | undefined): boolean {
    if (!attr) return false;
    const t = attr.AttributeType;
    if (t === 1 || t === 6 || t === 9 || t === "Lookup" || t === "Customer" || t === "Owner") return true;
    const name = attr.AttributeTypeName?.value;
    return name === "LookupType" || name === "CustomerType" || name === "OwnerType";
}

interface XrmWindow {
    Xrm?: { Navigation?: { navigateTo?: (page: Record<string, unknown>, options: Record<string, unknown>) => Promise<unknown> } };
}

export class DataverseDataSource implements TimelineDataSource {
    public readonly currentUserId: string;
    private readonly metadataCache = new Map<string, Promise<MetadataLike | undefined>>();
    /** Switched off if the environment rejects the participant query, so the timeline still loads by regarding */
    private useParties: boolean;

    constructor(
        private readonly context: ComponentFramework.Context<IInputs>,
        private readonly record: RecordContext,
        private readonly config: TimelineConfig,
        private readonly env: DateEnv,
        private readonly labels: { note: string; untitled: string },
    ) {
        this.currentUserId = normalizeId(context.userSettings.userId ?? "");
        this.useParties = config.includeParties;
    }

    // --- queries ------------------------------------------------------------------------------------------

    /** Runs an activity query; if the participant filter is rejected, retries once with regarding only. */
    private async queryActivities(build: () => string, pageSize: number): Promise<ComponentFramework.WebApi.RetrieveMultipleResponse> {
        try {
            return await this.context.webAPI.retrieveMultipleRecords("activitypointer", build(), pageSize);
        } catch (e) {
            if (!this.useParties) throw e;
            this.useParties = false;
            return this.context.webAPI.retrieveMultipleRecords("activitypointer", build(), pageSize);
        }
    }

    private scopeFilter(): string {
        const id = normalizeId(this.record.id);
        return this.useParties
            ? `(_regardingobjectid_value eq ${id} or activitypointer_activity_parties/any(p:p/_partyid_value eq ${id}))`
            : `_regardingobjectid_value eq ${id}`;
    }

    /** Activity types to query: configured types, narrowed by the user's type filter. Undefined = all types. */
    private activityTypes(filters?: TimelineFilters): string[] | undefined {
        const configured = allowsAllTypes(this.config) ? undefined : this.config.activityTypes;
        const chosen = filters?.types.filter((t) => t !== "annotation") ?? [];
        if (filters && filters.types.length > 0) {
            return configured ? chosen.filter((t) => configured.includes(t)) : chosen;
        }
        return configured;
    }

    private dateFilter(filters: TimelineFilters, column: string): string[] {
        const f = filters.date;
        if (f.kind === "last") {
            const now = this.env.now();
            return [`${column} ge ${new Date(now.getTime() - f.days * 86400000).toISOString()}`, `${column} le ${now.toISOString()}`];
        }
        return [];
    }

    private notesWanted(filters?: TimelineFilters): boolean {
        if (!this.config.includeNotes) return false;
        if (!filters) return true;
        if (filters.status !== "all") return false;
        return filters.types.length === 0 || filters.types.includes("annotation");
    }

    private statusCondition(filters: TimelineFilters): string | undefined {
        switch (filters.status) {
            case "open": return OPEN;
            case "completed": return "statecode eq 1";
            case "overdue": return allOf([OPEN, `scheduledend lt ${this.env.now().toISOString()}`, "activitytypecode ne 'email'"]);
            default: return undefined;
        }
    }

    // --- counts -------------------------------------------------------------------------------------------

    /** Record scope in FetchXML; "any" checks participants without multiplying rows, so counts stay exact */
    private fetchScope(withParties: boolean): string {
        const id = xmlValue(normalizeId(this.record.id));
        const regarding = `<condition attribute="regardingobjectid" operator="eq" value="${id}" />`;
        if (!withParties) return regarding;
        return `<filter type="or">${regarding}<link-entity name="activityparty" from="activityid" to="activityid" link-type="any">` +
            `<filter><condition attribute="partyid" operator="eq" value="${id}" /></filter></link-entity></filter>`;
    }

    /** Runs an aggregate over the record's activities; counts by regarding only if the participant filter is rejected. */
    private async aggregate(fetchXml: (scope: string) => string): Promise<{ rows: Row[]; withParties: boolean }> {
        const run = async (withParties: boolean) =>
            (await this.context.webAPI.retrieveMultipleRecords("activitypointer", `?fetchXml=${encodeURIComponent(fetchXml(this.fetchScope(withParties)))}`)).entities as Row[];
        if (this.config.includeParties) {
            try {
                return { rows: await run(true), withParties: true };
            } catch {
                // Fall through to regarding only
            }
        }
        return { rows: await run(false), withParties: false };
    }

    private typeCodesPromise?: Promise<Map<number, string>>;

    /** Object type code to logical name for every activity type the timeline can show */
    private typeCodes(): Promise<Map<number, string>> {
        this.typeCodesPromise ??= this.loadTypeCodes();
        return this.typeCodesPromise;
    }

    private async loadTypeCodes(): Promise<Map<number, string>> {
        const map = new Map(Object.entries(SYSTEM_TYPE_CODES).map(([code, name]) => [Number(code), name]));
        const known = new Set(map.values());
        if (allowsAllTypes(this.config)) {
            // Any custom activity table can show up; one metadata request names them all
            try {
                const response = await fetch("/api/data/v9.2/EntityDefinitions?$select=LogicalName,ObjectTypeCode&$filter=IsActivity eq true", {
                    headers: { Accept: "application/json" },
                    credentials: "same-origin",
                });
                const body = response.ok ? ((await response.json()) as { value?: { LogicalName?: string; ObjectTypeCode?: number }[] }) : {};
                body.value?.forEach((e) => {
                    if (e.LogicalName && typeof e.ObjectTypeCode === "number") map.set(e.ObjectTypeCode, e.LogicalName);
                });
            } catch {
                // Unnamed types are left out of the counts
            }
        } else {
            await Promise.all(
                this.config.activityTypes
                    .filter((t) => !known.has(t))
                    .map(async (t) => {
                        const code = ((await this.metadata(t, [])) as { ObjectTypeCode?: number } | undefined)?.ObjectTypeCode;
                        if (typeof code === "number") map.set(code, t);
                    }),
            );
        }
        return map;
    }

    private async countTypeStates(): Promise<TypeStates> {
        const allowed = this.activityTypes();
        const notesXml = `<fetch aggregate="true"><entity name="annotation"><attribute name="annotationid" alias="n" aggregate="count" />` +
            `<filter><condition attribute="objectid" operator="eq" value="${xmlValue(normalizeId(this.record.id))}" /></filter></entity></fetch>`;
        const [codes, activities, notes] = await Promise.all([
            this.typeCodes(),
            // Grouped by type and state; the types the timeline shows are picked out below
            this.aggregate((scope) =>
                `<fetch aggregate="true"><entity name="activitypointer"><attribute name="activityid" alias="n" aggregate="count" />` +
                `<attribute name="activitytypecode" alias="type" groupby="true" /><attribute name="statecode" alias="state" groupby="true" />` +
                `<filter type="and">${scope}</filter></entity></fetch>`),
            this.config.includeNotes
                ? this.context.webAPI.retrieveMultipleRecords("annotation", `?fetchXml=${encodeURIComponent(notesXml)}`).then((r) => num((r.entities as Row[])[0] ?? {}, "n") ?? 0)
                : Promise.resolve(0),
        ]);
        const rows: TypeStates["rows"] = [];
        // Complete when every type the timeline shows has a name; other unnamed types don't matter then
        const named = new Set(codes.values());
        let complete = allowed ? allowed.every((t) => named.has(t)) : true;
        for (const r of activities.rows) {
            const entity = codes.get(num(r, "type") ?? -1);
            if (!entity) {
                if (!allowed) complete = false;
                continue;
            }
            if (allowed && !allowed.includes(entity)) continue;
            const state = mapState(num(r, "state"));
            rows.push({ entity, label: formatted(r, "type") ?? entity, open: state === "open" || state === "scheduled", count: num(r, "n") ?? 0 });
        }
        return { rows, notes, withParties: activities.withParties, complete };
    }

    private typeStatesPromise?: Promise<TypeStates | undefined>;

    /** Counts per type and state; `fresh` counts again, otherwise the last result is reused */
    private typeStates(fresh: boolean): Promise<TypeStates | undefined> {
        if (fresh || !this.typeStatesPromise) {
            this.typeStatesPromise = this.countTypeStates().catch(() => undefined);
        }
        return this.typeStatesPromise;
    }

    private async countOverdue(): Promise<number> {
        const allowed = this.activityTypes();
        const now = xmlValue(this.env.now().toISOString());
        const [codes, result] = await Promise.all([
            this.typeCodes(),
            this.aggregate((scope) =>
                `<fetch aggregate="true"><entity name="activitypointer"><attribute name="activityid" alias="n" aggregate="count" />` +
                `<attribute name="activitytypecode" alias="type" groupby="true" /><filter type="and">${scope}` +
                `<condition attribute="statecode" operator="in"><value>0</value><value>3</value></condition>` +
                `<condition attribute="scheduledend" operator="lt" value="${now}" /></filter></entity></fetch>`),
        ]);
        return result.rows.reduce((sum, r) => {
            const entity = codes.get(num(r, "type") ?? -1);
            // Emails have no due date in the timeline's sense
            const counts = entity ? entity !== "email" && (!allowed || allowed.includes(entity)) : !allowed;
            return counts ? sum + (num(r, "n") ?? 0) : sum;
        }, 0);
    }

    public async getCounts(): Promise<Counts> {
        const [states, overdue] = await Promise.all([this.typeStates(true), this.countOverdue().catch(() => 0)]);
        if (!states) throw new Error("Couldn't count the timeline's items.");

        const byType = new Map<string, { entity: string; label: string; count: number }>();
        let total = 0;
        let open = 0;
        for (const r of states.rows) {
            const entry = byType.get(r.entity) ?? { entity: r.entity, label: r.label, count: 0 };
            entry.count += r.count;
            byType.set(r.entity, entry);
            total += r.count;
            if (r.open) open += r.count;
        }
        if (states.notes > 0) byType.set("annotation", { entity: "annotation", label: this.labels.note, count: states.notes });
        return { total: total + states.notes, byType: Array.from(byType.values()), open, overdue };
    }

    /** False only when the counts show the record has nothing the slice could return */
    private async sliceHasRows(slice: Slice): Promise<boolean> {
        const states = await this.typeStates(false);
        if (!states || !states.complete || (this.useParties && !states.withParties)) return true;
        return states.rows.some(
            (r) => r.count > 0 && (!slice.types || slice.types.includes(r.entity)) && (slice.states === "any" || (slice.states === "open") === r.open),
        );
    }

    // --- feed ---------------------------------------------------------------------------------------------

    /**
     * Splits the activities into one query per date column, so each can be paged by count and merged in date order.
     * Sorted by activity date, newest first, open items still ahead go to an upcoming section of their own.
     */
    private feedSlices(types: string[] | undefined, sort: FeedSort, withUpcoming: boolean): { history: Slice[]; upcoming: Slice[] } {
        if (sort.activities !== "eventdate") {
            return { history: [{ column: sort.activities, condition: types ? typeIn(types) : undefined, states: "any", types }], upcoming: [] };
        }
        const groups: Record<DateRule, string[]> = { created: [], start: [], due: [], completed: [] };
        const ruled = ruledTypes(this.config);
        if (types) types.forEach((t) => groups[dateRule(t, this.config)].push(t));
        else ruled.forEach((rule, entity) => groups[rule].push(entity));
        const { start, due, completed } = groups;
        const now = this.env.now().toISOString();

        // Placed by created on: types without a rule, plus ruled items that lack their date
        const createdTypes = types
            ? groups.created.length > 0 ? typeIn(groups.created) : undefined
            : ruled.size > 0 ? allOf(Array.from(ruled.keys()).map((t) => `activitytypecode ne ${odataString(t)}`)) : undefined;
        const created = anyOf([
            createdTypes,
            start.length > 0 ? allOf([typeIn(start), "scheduledstart eq null"]) : undefined,
            due.length > 0 ? allOf([typeIn(due), anyOf([allOf([OPEN, "scheduledend eq null"]), allOf([CLOSED, "actualend eq null"])])]) : undefined,
            completed.length > 0 ? allOf([typeIn(completed), anyOf([OPEN, "actualend eq null"])]) : undefined,
        ]);
        const history: Slice[] = [];
        if (!types || groups.created.length + start.length + due.length + completed.length > 0) {
            // With all types allowed and no rules at all, the created slice is simply every activity
            history.push({ column: "createdon", condition: created, states: "any", types });
        }
        if (start.length > 0) {
            history.push({
                column: "scheduledstart",
                condition: allOf([typeIn(start), "scheduledstart ne null", withUpcoming ? anyOf([CLOSED, `scheduledstart le ${now}`]) : undefined]),
                states: "any",
                types: start,
            });
        }
        if (due.length > 0) {
            history.push({
                column: "scheduledend",
                condition: allOf([typeIn(due), OPEN, "scheduledend ne null", withUpcoming ? `scheduledend le ${now}` : undefined]),
                states: "open",
                types: due,
            });
        }
        const closable = [...due, ...completed];
        if (closable.length > 0) {
            history.push({ column: "actualend", condition: allOf([typeIn(closable), CLOSED, "actualend ne null"]), states: "closed", types: closable });
        }

        const upcoming: Slice[] = [];
        if (withUpcoming && start.length > 0) {
            upcoming.push({ column: "scheduledstart", condition: allOf([typeIn(start), OPEN, `scheduledstart gt ${now}`]), states: "open", types: start });
        }
        if (withUpcoming && due.length > 0) {
            upcoming.push({ column: "scheduledend", condition: allOf([typeIn(due), OPEN, `scheduledend gt ${now}`]), states: "open", types: due });
        }
        return { history, upcoming };
    }

    private sliceAllowed(slice: Slice, filters: TimelineFilters): boolean {
        if (filters.status === "all") return true;
        if (filters.status === "completed") return slice.states !== "open";
        return slice.states !== "closed";
    }

    public openFeed(filters: TimelineFilters, sort: FeedSort): FeedPagers {
        const hydrate = (items: TimelineItem[]) => this.hydrate(items);
        if (filters.search.trim()) {
            return { history: new HydratingPager(new SearchPager(() => this.search(filters, sort)), hydrate) };
        }

        const types = this.activityTypes(filters);
        const withUpcoming = sort.activities === "eventdate" && sort.order === "desc";
        const slices = types && types.length === 0 ? { history: [], upcoming: [] } : this.feedSlices(types, sort, withUpcoming);
        const stream = (slice: Slice, order: SortOrder): Stream => ({ fetch: (cursor) => this.fetchSlice(filters, slice, sort, order, cursor) });

        const history = slices.history.filter((s) => this.sliceAllowed(s, filters)).map((s) => stream(s, sort.order));
        if (this.notesWanted(filters)) {
            // Notes are placed by created on when sorting by activity date
            const column = sort.activities === "eventdate" ? "createdon" : sort.notes;
            history.push({ fetch: (cursor) => this.fetchNotes(filters, column, sort.order, cursor) });
        }
        const pagers: FeedPagers = { history: new HydratingPager(new MergedPager(history, sort.order), hydrate) };

        const upcoming = filters.status === "overdue" ? [] : slices.upcoming.filter((s) => this.sliceAllowed(s, filters)).map((s) => stream(s, "asc"));
        if (upcoming.length > 0) pagers.upcoming = new HydratingPager(new MergedPager(upcoming, "asc"), hydrate);
        return pagers;
    }

    private async fetchSlice(filters: TimelineFilters, slice: Slice, sort: FeedSort, order: SortOrder, cursor: string | undefined): Promise<StreamPage> {
        if (!cursor && !(await this.sliceHasRows(slice))) return { items: [] };
        const build = () => {
            const conditions = [this.scopeFilter(), slice.condition, ...this.dateFilter(filters, slice.column), this.statusCondition(filters)];
            if (filters.onlyMine && this.currentUserId) conditions.push(`_ownerid_value eq ${this.currentUserId}`);
            // Like the built-in timeline: with a single sort column, activities without a value in it end up last
            return `?$select=${LIGHT_SELECT}&$filter=${conditions.filter(Boolean).join(" and ")}&$orderby=${slice.column} ${order},activityid ${order}`;
        };
        const result = cursor
            ? await this.context.webAPI.retrieveMultipleRecords("activitypointer", cursor, this.config.pageSize)
            : await this.queryActivities(build, this.config.pageSize);
        return { items: (result.entities as Row[]).map((r) => this.mapActivity(r, sort.activities)), next: nextOptions(result.nextLink) };
    }

    private notesQuery(filters: TimelineFilters, column: string, order: SortOrder, extra: string[] = []): string {
        const conditions = [`_objectid_value eq ${normalizeId(this.record.id)}`, ...this.dateFilter(filters, column), ...extra];
        if (filters.onlyMine && this.currentUserId) conditions.push(`_ownerid_value eq ${this.currentUserId}`);
        return `?$select=${NOTE_SELECT}&$filter=${conditions.join(" and ")}&$orderby=${column} ${order},annotationid ${order}`;
    }

    private async fetchNotes(filters: TimelineFilters, column: string, order: SortOrder, cursor: string | undefined): Promise<StreamPage> {
        let options = cursor;
        if (!options) {
            const states = await this.typeStates(false);
            if (states && states.notes === 0) return { items: [] };
            options = this.notesQuery(filters, column, order);
        }
        const result = await this.context.webAPI.retrieveMultipleRecords("annotation", options, this.config.pageSize);
        return { items: (result.entities as Row[]).map((r) => this.mapNote(r, column)), next: nextOptions(result.nextLink) };
    }

    // --- search -------------------------------------------------------------------------------------------

    /**
     * Searches titles and content with one query over activities and one over notes, however the feed is sorted:
     * wildcards on body text are the most expensive conditions the control uses. Only the newest activities are
     * looked through (searchLimit), and notes from the same period.
     */
    private async search(filters: TimelineFilters, sort: FeedSort): Promise<SearchHits> {
        const term = searchLiteral(filters.search);
        const limit = this.config.searchLimit;
        const types = this.activityTypes(filters);
        const event = sort.activities === "eventdate";
        const scope = () => allOf([
            this.scopeFilter(),
            types ? typeIn(types) : undefined,
            filters.date.kind === "any" ? undefined : anyOf((event ? EVENT_DATE_COLUMNS : [sort.activities]).map((c) => allOf(this.dateFilter(filters, c)))),
            this.statusCondition(filters),
            filters.onlyMine && this.currentUserId ? `_ownerid_value eq ${this.currentUserId}` : undefined,
        ]);

        const hasActivities = (!types || types.length > 0) && (await this.sliceHasRows({ column: "createdon", states: "any", types }));
        const from = hasActivities ? await this.searchStart(scope, limit) : undefined;
        const since = from ? `createdon ge ${from.toISOString()}` : undefined;

        const searchActivities = async () => {
            if (!hasActivities) return [];
            const build = () => `?$select=${LIGHT_SELECT}&$filter=${allOf([scope(), since, `(contains(subject,${term}) or contains(description,${term}))`])}&$orderby=createdon desc,activityid desc`;
            return ((await this.queryActivities(build, limit)).entities as Row[]).map((r) => this.mapActivity(r, sort.activities));
        };
        const searchNotes = async () => {
            if (!this.notesWanted(filters) || (await this.typeStates(false))?.notes === 0) return [];
            const column = event ? "createdon" : sort.notes;
            const contains = `(contains(subject,${term}) or contains(notetext,${term}) or contains(filename,${term}))`;
            const result = await this.context.webAPI.retrieveMultipleRecords("annotation", this.notesQuery(filters, column, "desc", since ? [contains, since] : [contains]), limit);
            return (result.entities as Row[]).map((r) => this.mapNote(r, column));
        };

        const [activities, notes] = await Promise.all([searchActivities(), searchNotes()]);
        // By activity date the query asked for any date in the window; keep the ones placed there
        const items = [...activities, ...notes].filter((i) => this.inDateFilter(filters, i.date)).sort(compareByDate(sort.order));
        return { items, limit: from ? { count: limit, from } : undefined };
    }

    /** Created-on date of the oldest activity a search reaches; undefined when they all fit within the limit */
    private async searchStart(scope: () => string | undefined, limit: number): Promise<Date | undefined> {
        const states = await this.typeStates(false);
        if (states?.complete && (!this.useParties || states.withParties) && states.rows.reduce((n, r) => n + r.count, 0) <= limit) return undefined;
        const result = await this.queryActivities(() => `?$select=createdon&$filter=${scope()}&$orderby=createdon desc`, limit);
        const last = result.entities[result.entities.length - 1] as Row | undefined;
        return result.nextLink && last ? date(last, "createdon") : undefined;
    }

    private inDateFilter(filters: TimelineFilters, value: Date): boolean {
        const f = filters.date;
        if (f.kind === "last") {
            const now = this.env.now().getTime();
            return value.getTime() >= now - f.days * 86400000 && value.getTime() <= now;
        }
        return true;
    }

    /** Bodies, participants and attachment counts for activities about to be shown: one query per 25 items */
    private async hydrate(items: TimelineItem[]): Promise<void> {
        const activities = items.filter((i) => i.kind === "activity");
        if (activities.length === 0) return;
        const byId = new Map(activities.map((i) => [i.id.toLowerCase(), i]));
        const chunks: TimelineItem[][] = [];
        for (let i = 0; i < activities.length; i += DETAILS_CHUNK) chunks.push(activities.slice(i, i + DETAILS_CHUNK));
        await Promise.all([
            ...chunks.map(async (chunk) => {
                const filter = chunk.map((i) => `activityid eq ${i.id}`).join(" or ");
                const result = await this.context.webAPI.retrieveMultipleRecords(
                    "activitypointer",
                    `?$select=activityid,description&$expand=${PARTY_EXPAND}&$filter=${filter}`,
                    chunk.length,
                );
                for (const r of result.entities as Row[]) {
                    const item = byId.get((str(r, "activityid") ?? "").toLowerCase());
                    if (item) this.applyDetails(item, r);
                }
            }),
            this.addAttachmentCounts(activities),
            this.addStatusDetails(activities),
        ]);
    }

    /** The status reason beside the word on open items, from their table's metadata, cached per table */
    private async addStatusDetails(items: TimelineItem[]): Promise<void> {
        const open = items.filter((i) => isOpenState(i.state) && i.statusCode !== undefined);
        if (open.length === 0) return;
        const words = await this.getStateLabels();
        const entities = Array.from(new Set(open.map((i) => i.entity)));
        const options = new Map<string, StatusOption[]>();
        await Promise.all(entities.map(async (e) => options.set(e, withStatusDetails(statusOptions(await this.metadata(e, ["statuscode"])), words))));
        for (const item of open) item.statusDetail = options.get(item.entity)?.find((s) => s.value === item.statusCode)?.detail;
    }

    /** Emails don't expose an attachment count on activitypointer, so count them in one query per page */
    private async addAttachmentCounts(items: TimelineItem[]): Promise<void> {
        const ids = items.filter((i) => i.entity === "email" || i.entity === "appointment").map((i) => i.id);
        if (ids.length === 0) return;
        try {
            const filter = ids.map((id) => `_objectid_value eq ${id}`).join(" or ");
            const result = await this.context.webAPI.retrieveMultipleRecords("activitymimeattachment", `?$select=_objectid_value&$filter=${filter}`, 5000);
            const counts = new Map<string, number>();
            for (const r of result.entities as Row[]) {
                const id = str(r, "_objectid_value")?.toLowerCase();
                if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
            }
            items.forEach((i) => {
                const c = counts.get(i.id.toLowerCase());
                if (c) i.attachmentCount = c;
            });
        } catch {
            // Counts are a nicety; the feed works without them
        }
    }

    // --- mapping ------------------------------------------------------------------------------------------

    /** An activity from a light row; `sort` decides which date places it. Bodies and participants come from applyDetails. */
    private mapActivity(r: Row, sort: SortColumn): TimelineItem {
        const entity = str(r, "activitytypecode") ?? "activitypointer";
        const id = str(r, "activityid") ?? "";
        const state = mapState(num(r, "statecode"));
        const scheduledEnd = date(r, "scheduledend");
        const subject = str(r, "subject");
        const createdOn = date(r, "createdon") ?? new Date(0);

        const item: TimelineItem = {
            key: `${entity}:${id}`,
            id,
            entity,
            kind: "activity",
            typeLabel: formatted(r, "activitytypecode") ?? entity,
            title: subject ?? this.labels.untitled,
            date: createdOn,
            dateField: "createdon",
            createdOn,
            modifiedOn: date(r, "modifiedon"),
            scheduledStart: date(r, "scheduledstart"),
            scheduledEnd,
            actualEnd: date(r, "actualend"),
            durationMinutes: num(r, "actualdurationminutes"),
            state,
            // activitypointer labels status values generically (task "Not Started" = 2 = "Completed" there),
            // so the label comes from the activity's own table once the item is shown
            statusCode: num(r, "statuscode"),
            isOverdue: isOverdue(entity, state, scheduledEnd, this.env.now()),
            priority: mapPriority(num(r, "prioritycode")),
            priorityLabel: formatted(r, "prioritycode"),
            owner: lookup(r, "ownerid"),
            createdBy: lookup(r, "createdby"),
            from: [], to: [], cc: [], attendees: [],
            threadKey: entity === "email" ? threadKeyFor(subject) : undefined,
        };

        if (sort === "eventdate") {
            const placed = eventDate(item, dateRule(entity, this.config));
            item.date = placed.date;
            item.dateField = placed.field;
        } else {
            const value = date(r, sort);
            if (value) {
                item.date = value;
                item.dateField = sort;
            }
        }
        if ("description" in r || "activitypointer_activity_parties" in r) this.applyDetails(item, r);
        return item;
    }

    /** Body and participants, from a details query (or a full row) */
    private applyDetails(item: TimelineItem, r: Row): void {
        const description = str(r, "description");
        const isHtml = item.entity === "email" || looksLikeHtml(description);
        item.snippet = makeSnippet(description, isHtml);
        item.body = description;
        item.bodyIsHtml = isHtml;

        const from: PartyRef[] = [];
        const to: PartyRef[] = [];
        const cc: PartyRef[] = [];
        const attendees: PartyRef[] = [];
        const parties = (r.activitypointer_activity_parties as Row[] | undefined) ?? [];
        for (const p of parties) {
            const party: PartyRef = {
                id: str(p, "_partyid_value"),
                entity: str(p, `_partyid_value${LOOKUP_TYPE}`),
                name: formatted(p, "_partyid_value") ?? str(p, "addressused") ?? "",
                address: str(p, "addressused"),
            };
            if (!party.name) continue;
            switch (num(p, "participationtypemask")) {
                case 1: case 7: from.push(party); break;
                case 2: to.push(party); break;
                case 3: cc.push(party); break;
                case 5: case 6: attendees.push(party); break;
                case 11: if (to.length === 0) to.push(party); break;
            }
        }
        Object.assign(item, { from, to, cc, attendees });
        if ((item.entity === "email" || item.entity === "phonecall") && from.length > 0) {
            item.direction = from[0].entity && INTERNAL_PARTY_TYPES.has(from[0].entity) ? "out" : "in";
        }
    }

    private mapNote(r: Row, sortColumn: string): TimelineItem {
        const id = str(r, "annotationid") ?? "";
        const text = str(r, "notetext");
        const isHtml = looksLikeHtml(text);
        const fileName = r.isdocument === true ? str(r, "filename") : undefined;
        const heading = noteHeading(str(r, "subject"), fileName, makeSnippet(text, isHtml), this.labels.note);
        const createdBy = lookup(r, "createdby");
        return {
            key: `annotation:${id}`,
            id,
            entity: "annotation",
            kind: "note",
            typeLabel: this.labels.note,
            title: heading.title,
            noteSubject: str(r, "subject"),
            snippet: heading.snippet,
            body: text,
            bodyIsHtml: isHtml,
            date: date(r, sortColumn) ?? date(r, "createdon") ?? new Date(0),
            dateField: date(r, sortColumn) ? sortColumn : "createdon",
            createdOn: date(r, "createdon") ?? new Date(0),
            modifiedOn: date(r, "modifiedon"),
            state: "completed",
            isOverdue: false,
            owner: lookup(r, "ownerid"),
            createdBy,
            from: createdBy ? [createdBy] : [],
            to: [], cc: [], attendees: [],
            file: fileName ? { id, entity: "annotation", fileName, mimeType: str(r, "mimetype"), size: num(r, "filesize") } : undefined,
        };
    }

    public async getItem(entity: string, id: string): Promise<TimelineItem | undefined> {
        if (entity === "annotation") {
            const row = (await this.context.webAPI.retrieveRecord("annotation", id, `?$select=${NOTE_SELECT}`)) as Row;
            return this.mapNote(row, "createdon");
        }
        const result = await this.context.webAPI.retrieveMultipleRecords(
            "activitypointer",
            `?$select=${LIGHT_SELECT},description&$expand=${PARTY_EXPAND}&$filter=activityid eq ${normalizeId(id)}`,
            1,
        );
        const row = (result.entities as Row[])[0];
        if (!row) return undefined;
        const item = this.mapActivity(row, "createdon");
        await this.addStatusDetails([item]);
        return item;
    }

    // --- details ------------------------------------------------------------------------------------------

    private metadata(entity: string, attributes: string[]): Promise<MetadataLike | undefined> {
        const key = `${entity}|${attributes.join(",")}`;
        let cached = this.metadataCache.get(key);
        if (!cached) {
            cached = this.context.utils.getEntityMetadata(entity, attributes)
                .then((m) => m as MetadataLike)
                .catch(() => undefined);
            this.metadataCache.set(key, cached);
        }
        return cached;
    }

    public async getDetails(item: TimelineItem): Promise<ItemDetails> {
        if (item.kind === "note") {
            const text = item.body ?? "";
            return {
                fields: [],
                attachments: item.file ? [item.file] : [],
                edit: { title: item.noteSubject ?? "", text, textIsRich: !!item.bodyIsHtml, allDay: false, priorities: [] },
            };
        }
        const attachmentsPromise = this.getAttachments(item.id);
        const columns = previewColumns(item.entity, this.config);
        const open = canEdit(item);
        // What the preview can change comes along in the same query, so being able to work on an item costs nothing extra
        const editing = open && quickEdit(item.entity) !== undefined;
        const editColumns = editing ? ["subject", "description", "scheduledstart", "scheduledend", "prioritycode", ...(item.entity === "appointment" ? ["isalldayevent"] : [])] : [];
        const asked = open ? Array.from(new Set([...columns, "prioritycode", "statuscode"])) : columns;
        const md = asked.length > 0 ? await this.metadata(item.entity, asked) : undefined;
        const valid = columns.filter((c) => !md?.Attributes?.get || md.Attributes.get(c) !== undefined);
        const names = valid.map((c) => (isLookupAttribute(md?.Attributes?.get?.(c)) ? `_${c}_value` : c));
        const select = Array.from(new Set([...names, ...editColumns]));
        const fields: PreviewField[] = [];
        let edit: EditValues | undefined;
        if (select.length > 0) {
            try {
                const row = (await this.context.webAPI.retrieveRecord(item.entity, item.id, `?$select=${select.join(",")}`)) as Row;
                valid.forEach((col, i) => {
                    const value = this.displayValue(row, names[i]);
                    if (value !== undefined) {
                        fields.push({ name: col, label: md?.Attributes?.get?.(col)?.DisplayName ?? col, value });
                    }
                });
                if (editing) edit = this.editValues(row, md);
            } catch {
                // A misconfigured column shouldn't break the preview; the rest still renders
            }
        }
        return { fields, attachments: await attachmentsPromise, edit, statuses: open ? withStatusDetails(statusOptions(md), await this.getStateLabels()) : undefined };
    }

    private editValues(row: Row, md: MetadataLike | undefined): EditValues {
        const options = md?.Attributes?.get?.("prioritycode")?.OptionSet ?? {};
        const text = str(row, "description") ?? "";
        return {
            title: str(row, "subject") ?? "",
            text,
            textIsRich: looksLikeHtml(text),
            start: date(row, "scheduledstart"),
            end: date(row, "scheduledend"),
            allDay: row.isalldayevent === true,
            priority: num(row, "prioritycode"),
            priorities: Object.keys(options).map((value) => ({ value: Number(value), label: options[value]?.text ?? value })),
        };
    }

    private displayValue(row: Row, key: string): string | undefined {
        const f = formatted(row, key);
        if (f !== undefined) return f;
        const v = row[key];
        if (v === null || v === undefined || v === "") return undefined;
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
            const d = new Date(v);
            return isNaN(d.getTime()) ? v : formatFull(this.env, d);
        }
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
        return undefined;
    }

    private async getAttachments(activityId: string): Promise<AttachmentRef[]> {
        try {
            const result = await this.context.webAPI.retrieveMultipleRecords(
                "activitymimeattachment",
                `?$select=activitymimeattachmentid,filename,filesize,mimetype,attachmentcontentid&$filter=_objectid_value eq ${activityId}`,
                100,
            );
            return (result.entities as Row[]).map((r) => ({
                id: str(r, "activitymimeattachmentid") ?? "",
                entity: "activitymimeattachment",
                fileName: str(r, "filename") ?? "file",
                mimeType: str(r, "mimetype"),
                size: num(r, "filesize"),
                contentId: str(r, "attachmentcontentid"),
            }));
        } catch {
            return [];
        }
    }

    public async getFileContent(file: AttachmentRef): Promise<FileContent> {
        const column = file.entity === "annotation" ? "documentbody" : "body";
        const row = (await this.context.webAPI.retrieveRecord(file.entity, file.id, `?$select=${column},mimetype,filename`)) as Row;
        return { base64: str(row, column) ?? "", mimeType: str(row, "mimetype") ?? file.mimeType, fileName: str(row, "filename") ?? file.fileName };
    }

    public async getTypeLabels(entities: string[]): Promise<ActivityTypeInfo[]> {
        return Promise.all(
            entities.map(async (entity) => {
                if (entity === "annotation") return { entity, label: this.labels.note };
                const md = await this.metadata(entity, []);
                return { entity, label: md?.DisplayName ?? entity };
            }),
        );
    }

    /** Every activity shares this one list, whatever its own status reasons are called, and Dataverse translates it */
    public async getStateLabels(): Promise<StateLabels> {
        const options = (await this.metadata("activitypointer", ["statecode"]))?.Attributes?.get?.("statecode")?.OptionSet;
        return { open: options?.["0"]?.text, completed: options?.["1"]?.text, canceled: options?.["2"]?.text, scheduled: options?.["3"]?.text };
    }

    // --- actions ------------------------------------------------------------------------------------------

    public async createNote(note: NewNote): Promise<void> {
        const md = await this.metadata(this.record.entity, []);
        const entitySet = md?.EntitySetName;
        if (!entitySet) throw new Error(`Couldn't find the entity set for ${this.record.entity}.`);
        const data: Row = {
            notetext: note.text,
            [`objectid_${this.record.entity}@odata.bind`]: `/${entitySet}(${normalizeId(this.record.id)})`,
        };
        if (note.title) data.subject = note.title;
        if (note.file) {
            data.filename = note.file.name;
            data.mimetype = note.file.type || "application/octet-stream";
            data.documentbody = await readAsBase64(note.file);
            data.isdocument = true;
        }
        await this.context.webAPI.createRecord("annotation", data);
    }

    public async completeActivity(item: TimelineItem): Promise<void> {
        if (!canComplete(item.entity)) return;
        // Without a status reason, Dataverse sets the table's default for the new state
        await this.context.webAPI.updateRecord(item.entity, item.id, { statecode: 1 });
    }

    public async updateItem(item: TimelineItem, before: EditValues, changes: ItemChanges): Promise<void> {
        const data: Row = {};
        if (changes.title !== undefined) data.subject = changes.title;
        if (changes.text !== undefined) data[item.kind === "note" ? "notetext" : "description"] = changes.text;
        if (changes.start !== undefined) data.scheduledstart = changes.start?.toISOString() ?? null;
        if (changes.end !== undefined) data.scheduledend = changes.end?.toISOString() ?? null;
        if (changes.priority !== undefined) data.prioritycode = changes.priority;
        if (changes.status) {
            data.statecode = changes.status.state;
            // Closing leaves the status reason to Dataverse, as completing does
            if (isOpenState(mapState(changes.status.state))) data.statuscode = changes.status.value;
        }
        await this.context.webAPI.updateRecord(item.entity, item.id, data);
        applyChanges(item, before, changes, this.labels.note, this.env.now());
    }

    public async openRecord(entity: string, id: string): Promise<void> {
        await this.context.navigation.openForm({ entityName: entity, entityId: id });
    }

    public async openRecordPanel(entity: string, id: string): Promise<void> {
        // The PCF API has no panel, so this is the app's own navigation. Other hosts don't have it and open the record instead.
        const navigation = (window as unknown as XrmWindow).Xrm?.Navigation;
        if (!navigation?.navigateTo) {
            await this.openRecord(entity, id);
            return;
        }
        await navigation.navigateTo(
            { pageType: "entityrecord", entityName: entity, entityId: id, formType: 2 },
            { target: 2, position: 2, width: { value: PREVIEW_WIDTH, unit: "px" } },
        );
    }

    public async createActivity(entity: string): Promise<boolean> {
        const result = await this.context.navigation.openForm({
            entityName: entity,
            useQuickCreateForm: entity !== "email",
            createFromEntity: { entityType: this.record.entity, id: normalizeId(this.record.id), name: this.record.name },
        });
        const saved = (result as { savedEntityReference?: unknown[] } | undefined)?.savedEntityReference;
        // Main forms resolve without a reference; refresh anyway in that case
        return !saved || saved.length > 0;
    }

    public recordUrl(entity: string, id: string): string | undefined {
        if (typeof window === "undefined") return undefined;
        const appId = new URLSearchParams(window.location.search).get("appid");
        return `${window.location.origin}/main.aspx?${appId ? `appid=${appId}&` : ""}pagetype=entityrecord&etn=${entity}&id=${id}`;
    }
}

/** Open work can be set to each of its status reasons. Closing is one choice per state, and Dataverse picks the reason when it's saved. */
function statusOptions(md: MetadataLike | undefined): StatusOption[] {
    const options = (md?.Attributes?.get?.("statuscode")?.attributeDescriptor?.OptionSet ?? []).flatMap((o) =>
        !o.IsHidden && o.Value !== undefined && o.State !== undefined ? [{ value: o.Value, state: o.State, label: o.Label ?? "" }] : [],
    );
    return options.filter((s, i) => isOpenState(mapState(s.state)) || options.findIndex((o) => o.state === s.state) === i);
}

function isOverdue(entity: string, state: ItemState, scheduledEnd: Date | undefined, now: Date): boolean {
    return entity !== "email" && (state === "open" || state === "scheduled") && !!scheduledEnd && scheduledEnd.getTime() < now.getTime();
}

/** Turns an absolute @odata.nextLink into the options string retrieveMultipleRecords expects */
function nextOptions(nextLink: string | undefined): string | undefined {
    if (!nextLink) return undefined;
    const q = nextLink.indexOf("?");
    return q >= 0 ? nextLink.substring(q) : undefined;
}

function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            resolve(result.substring(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file."));
        reader.readAsDataURL(file);
    });
}
