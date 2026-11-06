import * as React from "react";
import { Theme, webLightTheme } from "@fluentui/react-components";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { TimelineDataSource } from "./data/dataSource";
import { DataverseDataSource } from "./data/DataverseDataSource";
import { parseConfig, RawConfig, TimelineConfig } from "./model/config";
import { DateEnv, localeFromLanguageId } from "./model/dates";
import { defaultStrings, StringKey } from "./model/strings";
import { RecordContext } from "./model/types";
import { Timeline } from "./ui/Timeline";
import { Translate } from "./ui/TimelineContext";

/** Not in the public typings, but provided by model-driven apps for controls on a form */
interface ContextInfo {
    entityId?: string;
    entityTypeName?: string;
    entityRecordName?: string;
}

declare const process: { env: { NODE_ENV?: string } };

const SAMPLE_RECORD: RecordContext = { entity: "incident", id: "sample", name: "Lock cylinder sticking on TX-400" };
declare const require: (id: string) => unknown;

/** Sample data for the test harness. The require sits in a branch webpack removes from production builds. */
function createSampleSource(config: TimelineConfig): TimelineDataSource | undefined {
    if (process.env.NODE_ENV !== "production") {
        const sample = require("./data/SampleDataSource") as typeof import("./data/SampleDataSource");
        return new sample.SampleDataSource(config);
    }
    return undefined;
}

export class ActivityTimeline implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private t!: Translate;
    private dates!: DateEnv;
    private config?: TimelineConfig;
    private configKey?: string;
    private source?: TimelineDataSource;
    private sourceKey?: string;
    private record?: RecordContext;

    public init(context: ComponentFramework.Context<IInputs>): void {
        this.t = (key: StringKey, ...args: (string | number)[]) => {
            let text = context.resources.getString(key);
            if (!text || text === key) text = defaultStrings[key];
            return args.reduce<string>((s, a, i) => s.split(`{${i}}`).join(String(a)), text);
        };
        this.dates = {
            locale: localeFromLanguageId(context.userSettings.languageId),
            offsetMinutes: (date) => {
                try {
                    return context.userSettings.getTimeZoneOffsetMinutes(date);
                } catch {
                    return -date.getTimezoneOffset();
                }
            },
            now: () => new Date(),
        };
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const p = context.parameters;
        const raw: RawConfig = {
            activityTypes: p.activityTypes?.raw,
            includeNotes: p.includeNotes?.raw,
            relatedScope: p.relatedScope?.raw,
            sortBy: p.sortBy?.raw,
            notesSortBy: p.notesSortBy?.raw,
            sortOrder: p.sortOrder?.raw,
            createTypes: p.createTypes?.raw,
            pageSize: p.pageSize?.raw,
            height: p.height?.raw,
            density: p.density?.raw,
            showOverview: p.showOverview?.raw,
            threadEmails: p.threadEmails?.raw,
            advancedConfig: p.advancedConfig?.raw,
        };
        const configKey = JSON.stringify(raw);
        if (!this.config || configKey !== this.configKey) {
            this.config = parseConfig(raw);
            this.configKey = configKey;
        }
        const config = this.config;

        const info = (context.mode as unknown as { contextInfo?: ContextInfo }).contextInfo;
        let record: RecordContext | undefined =
            info?.entityId && info.entityTypeName ? { entity: info.entityTypeName, id: info.entityId, name: info.entityRecordName ?? "" } : undefined;
        // The platform calls updateView several times while the form loads, and the record name can arrive late.
        // The same record must stay the same object, or the timeline would load everything again each time.
        if (record && this.record && record.entity === this.record.entity && record.id === this.record.id) {
            this.record.name = record.name;
            record = this.record;
        }
        this.record = record;

        // The test harness has no record or Dataverse; development builds show sample data there
        const sample = record ? undefined : createSampleSource(config);
        if (sample) record = SAMPLE_RECORD;

        const sourceKey = `${sample ? "sample" : "dv"}|${record?.entity ?? ""}|${record?.id ?? ""}|${configKey}`;
        if (!this.source || sourceKey !== this.sourceKey) {
            this.source =
                sample ??
                new DataverseDataSource(context, record ?? { entity: "", id: "", name: "" }, config, this.dates, {
                    note: this.t("note"),
                    untitled: this.t("untitled"),
                });
            this.sourceKey = sourceKey;
        }

        return React.createElement(Timeline, {
            // A new key resets all state when the record changes, e.g. after a new record is first saved
            key: sourceKey,
            source: this.source,
            config,
            record,
            dates: this.dates,
            t: this.t,
            // Process the platform theme on every update; it changes with the app theme and display density
            theme: (context.fluentDesignLanguage?.tokenTheme as Theme | undefined) ?? webLightTheme,
        });
    }

    public getOutputs(): IOutputs {
        // The anchor column is never changed
        return {};
    }

    public destroy(): void {
        // React unmounts the tree; nothing else to clean up
    }
}
