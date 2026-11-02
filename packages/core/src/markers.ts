// The language markers, from the language's markers.yaml (bundled in at build): the marker ID of
// every card the language brings, and the table's own markers (#157).
import file from "../../../language/markers.yaml";

/**
 * A card the language gives a marker: its notation, with `{}` where its handwriting goes
 * (`[set{}to]`, `[num{}]`), or as printed (`[repeat]`, `[color(gold)]`), and its length in U.
 */
export interface LanguageMarker {
  card: string;
  length: number;
}

/** Marker ID → the card it names. The table reader's loaded shape. */
export type LanguageMarkers = ReadonlyMap<number, LanguageMarker>;

/** The table's own markers: never on a card. */
export interface TableMarkers {
  /** Projected during calibration's first step. */
  calibration: readonly number[];
  /** The ruler page's two markers, and how far apart their centres are printed, in mm. */
  ruler: { markers: readonly [number, number]; distanceMm: number };
}

interface MarkerFile {
  cards: Record<string, LanguageMarker>;
  table: { calibration: number[]; ruler: { markers: [number, number]; distance_mm: number } };
}

const { cards, table } = file as MarkerFile;

/** The language cards' markers. */
export const languageMarkers: LanguageMarkers = new Map(
  Object.entries(cards).map(([id, { card, length }]) => [Number(id), { card, length }]),
);

/** The table's own markers. */
export const tableMarkers: TableMarkers = {
  calibration: table.calibration,
  ruler: { markers: table.ruler.markers, distanceMm: table.ruler.distance_mm },
};
