// The table reader's inputs and outputs.

/** One handwritten card's reading, as the vision service sends it. */
export interface Handwriting {
  state: "not read yet" | "reading" | "blank" | "read error" | "connection error" | "read";
  text?: string;
}

/** One track in a table state: `x` and `y` are the marker's centre in table mm, `angle` in degrees. */
export interface TableCard {
  track: number;
  marker: number;
  x: number;
  y: number;
  angle: number;
  hw?: Handwriting;
}

/** A table state from the vision service. */
export interface TableState {
  type: "state";
  seq: number;
  t: number;
  mm_per_projector_height: number;
  cards: TableCard[];
}

/** A rectangle in table mm, from its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A corner: a quarter circle about a table corner at (x, y), in table mm. */
export interface Corner {
  name: string;
  x: number;
  y: number;
  radius: number;
}

/** The windows and corners, in table mm. */
export interface Layout {
  codingSpace: Rect;
  canvasSpace: Rect;
  corners: Corner[];
}

/**
 * A card the language version gives a marker: its notation, with `{}` where its handwriting goes
 * (`[set{}to]`, `[num{}]`), or as printed (`[repeat]`, `[color(gold)]`), and its length in U.
 */
export interface LanguageMarker {
  card: string;
  length: number;
}

/** Marker ID → the card it names, from the language version. */
export type LanguageMarkers = ReadonlyMap<number, LanguageMarker>;

/** A library card in the lockfile, such as `1293 = call snapscript-p5.circle`, with its length in U. */
export interface LibraryCardEntry {
  kind: "library";
  card: string;
  package: string;
  name: string;
  length: number;
}

/** A textbook page in the lockfile, such as `1900 = page snapscript-p5-getting-started/confetti 3`. */
export interface PageEntry {
  kind: "page";
  textbook: string;
  volume: string;
  page: number;
}

/**
 * Marker ID → library card or page, from the project's lockfile. This is the loaded shape: the file
 * format belongs to #157, and a loader fills this later.
 */
export type Lockfile = ReadonlyMap<number, LibraryCardEntry | PageEntry>;

/** The reader's thresholds: the prototypes' measured starting values, for the rig to tune. */
export interface ReaderSettings {
  /** 1U, in mm. */
  unitMm: number;
  /** The marker's centre from its card's top-left corner, along the card and down it, in mm. */
  markerAlongMm: number;
  markerDownMm: number;
  /** Two cards whose angles differ by this much or more never join, nor link line to line. */
  maxAngleDeg: number;
  /** A new join: the gap along the line within [joinMakeAlongMinMm, joinMakeAlongMaxMm], sideways within joinMakeAcrossMm. */
  joinMakeAlongMinMm: number;
  joinMakeAlongMaxMm: number;
  joinMakeAcrossMm: number;
  /** A join already made is kept while along stays within [joinKeepAlongMinMm, joinKeepAlongMaxMm] and sideways within joinKeepAcrossMm. */
  joinKeepAlongMinMm: number;
  joinKeepAlongMaxMm: number;
  joinKeepAcrossMm: number;
  /** A line head's link to the line head above it: made within lineMakeMm of its spot, kept up to lineKeepMm. */
  lineMakeMm: number;
  lineKeepMm: number;
  /**
   * A real card takes a virtual card's place once it has lain still placeStillS seconds within
   * placeMakeMm and placeMakeDeg of it, and keeps a guide's place until past placeKeepMm or placeKeepDeg.
   */
  placeStillS: number;
  placeMakeMm: number;
  placeMakeDeg: number;
  placeKeepMm: number;
  placeKeepDeg: number;
  /** A value guide's length in U. */
  valueGuideLength: number;
  /**
   * A card whose marker the table doesn't know is taken to be a whole number of U from
   * unknownMinLength to unknownMaxLength long, whichever puts the next card in reach of a join.
   */
  unknownMinLength: number;
  unknownMaxLength: number;
}

/**
 * A card the reader knows by name: a real card by its track (`t17`), a stand-in by its id (`s3`).
 * Joins and links are kept between these, so stand-ins join lines like real cards.
 */
export type CardKey = string;

/** One place in the buffer's strip order: a strip by its head card, or a strip kept exactly as written. */
export type StripSlot = { head: CardKey; doc?: string } | { verbatim: string };

/** A stand-in card from the starting text, and where it lies on its strip's grid. */
export interface StandIn {
  id: string;
  card: string;
  length: number;
  /** Its strip's `@table` position, from the coding space's top-left. */
  strip: { x: number; y: number; turn: number };
  /** U along the strip from its head's left end, and its line's index in the strip (its head's line is 0). */
  along: number;
  lineIndex: number;
}

/** Where a track last lay, and since when, to tell a card lying still from one sliding past. */
export interface Pose {
  x: number;
  y: number;
  angle: number;
  since: number;
}

/** What the reader carries from one step to the next. */
export interface ReaderState {
  /**
   * The project's entry text the reader started from. Its hidden `[import]` and `[extern]` lines are
   * kept in front of the buffer exactly as written, and library cards take their local names from
   * its imports.
   */
  entryText: string;
  /** Joins made, as `left>right` card key pairs. */
  joins: ReadonlySet<string>;
  /** Line-to-line links made, as `above>below` card key pairs. */
  links: ReadonlySet<string>;
  /** The strips in buffer order. */
  slots: readonly StripSlot[];
  /** The stand-ins not yet replaced. A replaced stand-in is gone for good. */
  standIns: readonly StandIn[];
  /** Where each track last lay, and since when. */
  poses: ReadonlyMap<number, Pose>;
  /** Guide places held: guide id → track. */
  places: ReadonlyMap<string, number>;
  /** The buffer's version, the text it had, and which card each span was. */
  version: number;
  text: string;
  cards: readonly CardSpan[];
}

/** A card's place in the buffer: line number from 1, and columns from 0, end exclusive. */
export interface Span {
  line: number;
  start: number;
  end: number;
}

/** A card's span: a real card by its track, or a stand-in by its id. */
export type CardSpan = { track: number; span: Span } | { standIn: string; span: Span };

/** A line's real cards, and its stand-ins if it has any. */
export interface LineCards {
  line: number;
  tracks: number[];
  standIns?: string[];
}

/** Which buffer text each card and line stands for, for one buffer version. */
export interface CardMap {
  version: number;
  cards: CardSpan[];
  lines: LineCards[];
}

/** A line of cards that isn't part of the program: its tracks left to right, and what it would read. */
export interface DetachedLine {
  tracks: number[];
  standIns?: string[];
  text: string;
}

/** Why the reader skipped a line: the camera's reason, for the table app's gutter and the 5 s wait. */
export type SkipReason = "not read yet" | "read error" | "connection error" | "unknown card";

/** A line the reader wrote with empty braces, for `check(text, skippedLines)`. */
export interface SkippedLine {
  line: number;
  reason: SkipReason;
}

/**
 * A card in the buffer the table can't write as text: its marker isn't in the lockfile, or the
 * program doesn't import its library, named in `package` ("This program doesn't import
 * snapscript-sound").
 */
export interface UnknownCard {
  track: number;
  marker: number;
  package?: string;
}

/**
 * A card the projector draws where a real card is not: a stand-in (part of the program), a page's
 * guide, or a value guide a call card projects for a value it expects. `x` and `y` are where its
 * marker would be, in table mm, as for a real card, with `angle` in degrees and its length in U.
 */
export type VirtualCard =
  | { id: string; kind: "stand-in" | "guide"; card: string; length: number; x: number; y: number; angle: number }
  | { id: string; kind: "value"; value: string; length: number; x: number; y: number; angle: number };

/** A real card lying in a guide's place, so the guide isn't drawn. */
export interface Place {
  track: number;
  virtual: string;
}

/** A real card in a page guide's place that isn't the card the guide asks for. It still counts. */
export interface Mismatch {
  track: number;
  virtual: string;
  /** The card the guide asks for. */
  card: string;
}

/** The value guides a call card projects, from the checker's expected values for it. */
export interface ValueGuideSource {
  /** The buffer version the call card's text position is from. */
  version: number;
  /** The call card's text position. */
  at: { line: number; start: number };
  /** The values it expects after it, by name. */
  values: string[];
}

/** The guides the table should show: the current page's program text, and value guides. */
export interface GuideSources {
  page?: string;
  values?: ValueGuideSource[];
}

export interface StepOutput {
  version: number;
  text: string;
  map: CardMap;
  /** The strip heads recognised on the table, by track, in buffer order. */
  stripHeads: number[];
  /** Lines of cards that join no strip, such as the loser of two cards that could fill one place. */
  detached: DetachedLine[];
  /** The buffer changed, but only in `@table` tags: a strip moved, and the sketch needn't restart. */
  placementOnly: boolean;
  skippedLines: SkippedLine[];
  unknownCards: UnknownCard[];
  /** The virtual cards to draw: stand-ins, then guides with no real card in their place. */
  virtualCards: VirtualCard[];
  /** Real cards in guides' places. */
  places: Place[];
  mismatches: Mismatch[];
  /**
   * When a card that has stopped by a virtual card will have lain still long enough to take its
   * place, if one has: the table app steps again then, with the same table state.
   */
  wakeAt?: number;
}

export interface StepInput {
  table: TableState;
  layout: Layout;
  lockfile: Lockfile;
  languageMarkers: LanguageMarkers;
  guideSources?: GuideSources;
  /** The time of this step, on the table state's clock: its `t` if not given. */
  now?: number;
  settings?: Partial<ReaderSettings>;
}

export interface StepResult {
  state: ReaderState;
  output: StepOutput;
}
