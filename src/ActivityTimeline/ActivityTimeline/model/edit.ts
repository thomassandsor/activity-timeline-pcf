import { mapPriority, mapState } from "./activityTypes";
import { makeSnippet, noteHeading } from "./html";
import { EditValues, ItemChanges, TimelineItem } from "./types";

/** Brings a loaded item up to date after a save, so its card and preview are right without loading anything again. */
export function applyChanges(item: TimelineItem, before: EditValues, changes: ItemChanges, noteLabel: string, now: Date): void {
    if (changes.text !== undefined || changes.title !== undefined) {
        const text = changes.text ?? before.text;
        const snippet = makeSnippet(text, before.textIsRich);
        if (item.kind === "note") {
            item.noteSubject = changes.title ?? before.title;
            const heading = noteHeading(item.noteSubject, item.file?.fileName, snippet, noteLabel);
            item.title = heading.title;
            item.snippet = heading.snippet;
        } else {
            item.title = changes.title ?? item.title;
            item.snippet = snippet;
        }
        item.body = text || undefined;
    }
    if (changes.start !== undefined) item.scheduledStart = changes.start ?? undefined;
    if (changes.end !== undefined) {
        item.scheduledEnd = changes.end ?? undefined;
        item.isOverdue = !!changes.end && changes.end.getTime() < now.getTime();
    }
    if (changes.priority !== undefined) {
        item.priority = mapPriority(changes.priority);
        item.priorityLabel = before.priorities.find((p) => p.value === changes.priority)?.label;
    }
    if (changes.status) {
        item.state = mapState(changes.status.state);
        item.statusCode = changes.status.value;
        item.statusDetail = changes.status.detail;
        if (item.state === "completed" || item.state === "canceled") {
            item.isOverdue = false;
            item.actualEnd = now;
        }
    }
    item.modifiedOn = now;
}
