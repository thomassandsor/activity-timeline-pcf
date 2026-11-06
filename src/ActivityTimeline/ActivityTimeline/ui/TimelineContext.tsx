import * as React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import {
    BoxRegular, CalendarLtrRegular, CalendarPersonRegular, CallRegular, ChatRegular, DocumentRegular, MailRegular,
    MegaphoneRegular, NoteRegular, PersonRegular, ReceiptRegular, ShieldCheckmarkRegular, StarRegular,
    ClipboardTaskRegular, WrenchRegular,
} from "@fluentui/react-icons";
import { TimelineDataSource } from "../data/dataSource";
import { typeStyle } from "../model/activityTypes";
import { TimelineConfig, TypeColor, TypeIconName } from "../model/config";
import { DateEnv } from "../model/dates";
import { StringKey } from "../model/strings";

export type Translate = (key: StringKey, ...args: (string | number)[]) => string;

export interface TimelineEnv {
    t: Translate;
    dates: DateEnv;
    config: TimelineConfig;
    source: TimelineDataSource;
    /** Display label per table, resolved from Dataverse metadata */
    typeLabel: (entity: string, fallback?: string) => string;
}

export const TimelineContext = React.createContext<TimelineEnv | undefined>(undefined);

export function useTimelineEnv(): TimelineEnv {
    const env = React.useContext(TimelineContext);
    if (!env) throw new Error("TimelineContext is missing");
    return env;
}

const ICONS: Record<TypeIconName, React.FC<{ className?: string }>> = {
    mail: MailRegular,
    call: CallRegular,
    task: ClipboardTaskRegular,
    calendar: CalendarLtrRegular,
    note: NoteRegular,
    service: CalendarPersonRegular,
    chat: ChatRegular,
    document: DocumentRegular,
    person: PersonRegular,
    megaphone: MegaphoneRegular,
    box: BoxRegular,
    wrench: WrenchRegular,
    star: StarRegular,
    receipt: ReceiptRegular,
    shield: ShieldCheckmarkRegular,
};

/** Fluent persona palette tokens per type colour. Background2/Foreground2/BorderActive exist for every palette colour. */
const PALETTE: Record<TypeColor, { bg: string; fg: string; strong: string }> = {
    blue: { bg: tokens.colorPaletteBlueBackground2, fg: tokens.colorPaletteBlueForeground2, strong: tokens.colorPaletteBlueBorderActive },
    green: { bg: tokens.colorPaletteGreenBackground2, fg: tokens.colorPaletteGreenForeground2, strong: tokens.colorPaletteGreenBorderActive },
    marigold: { bg: tokens.colorPaletteMarigoldBackground2, fg: tokens.colorPaletteMarigoldForeground2, strong: tokens.colorPaletteMarigoldBorderActive },
    grape: { bg: tokens.colorPaletteGrapeBackground2, fg: tokens.colorPaletteGrapeForeground2, strong: tokens.colorPaletteGrapeBorderActive },
    teal: { bg: tokens.colorPaletteTealBackground2, fg: tokens.colorPaletteTealForeground2, strong: tokens.colorPaletteTealBorderActive },
    cranberry: { bg: tokens.colorPaletteCranberryBackground2, fg: tokens.colorPaletteCranberryForeground2, strong: tokens.colorPaletteCranberryBorderActive },
    steel: { bg: tokens.colorPaletteSteelBackground2, fg: tokens.colorPaletteSteelForeground2, strong: tokens.colorPaletteSteelBorderActive },
    pumpkin: { bg: tokens.colorPalettePumpkinBackground2, fg: tokens.colorPalettePumpkinForeground2, strong: tokens.colorPalettePumpkinBorderActive },
    lavender: { bg: tokens.colorPaletteLavenderBackground2, fg: tokens.colorPaletteLavenderForeground2, strong: tokens.colorPaletteLavenderBorderActive },
    forest: { bg: tokens.colorPaletteForestBackground2, fg: tokens.colorPaletteForestForeground2, strong: tokens.colorPaletteForestBorderActive },
    cornflower: { bg: tokens.colorPaletteCornflowerBackground2, fg: tokens.colorPaletteCornflowerForeground2, strong: tokens.colorPaletteCornflowerBorderActive },
    brown: { bg: tokens.colorPaletteBrownBackground2, fg: tokens.colorPaletteBrownForeground2, strong: tokens.colorPaletteBrownBorderActive },
    pink: { bg: tokens.colorPalettePinkBackground2, fg: tokens.colorPalettePinkForeground2, strong: tokens.colorPalettePinkBorderActive },
    anchor: { bg: tokens.colorPaletteAnchorBackground2, fg: tokens.colorPaletteAnchorForeground2, strong: tokens.colorPaletteAnchorBorderActive },
};

export interface TypeVisual {
    Icon: React.FC<{ className?: string }>;
    bg: string;
    fg: string;
    strong: string;
}

export function useTypeVisual(entity: string): TypeVisual {
    const { config } = useTimelineEnv();
    return React.useMemo(() => {
        const s = typeStyle(entity, config);
        return { Icon: ICONS[s.icon] ?? ChatRegular, ...PALETTE[s.color] };
    }, [entity, config]);
}

const useDotStyles = makeStyles({
    dot: {
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: tokens.borderRadiusCircular,
        flexShrink: 0,
    },
});

export const TypeDot: React.FC<{ entity: string }> = ({ entity }) => {
    const v = useTypeVisual(entity);
    const styles = useDotStyles();
    return <span className={styles.dot} style={{ backgroundColor: v.strong }} aria-hidden />;
};
