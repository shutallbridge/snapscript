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
}

/** What the reader carries from one step to the next. */
export interface ReaderState {
  /**
   * The project's entry text the reader started from, kept in front of the buffer exactly as written:
   * its hidden `[import]` and `[extern]` lines, and its strips in their order. Library cards take
   * their local names from its imports.
   */
  entryText: string;
  /** Joins made, as `left>right` track pairs. */
  joins: ReadonlySet<string>;
  /** Line-to-line links made, as `above>below` track pairs. */
  links: ReadonlySet<string>;
  /** The strips in buffer order, by their head card's track. */
  strips: readonly number[];
  /** The buffer's version and the text it had. */
  version: number;
  text: string;
}

/** A card's place in the buffer: line number from 1, and columns from 0, end exclusive. */
export interface Span {
  line: number;
  start: number;
  end: number;
}

export interface CardSpan {
  track: number;
  span: Span;
}

export interface LineCards {
  line: number;
  tracks: number[];
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
}

export interface StepInput {
  table: TableState;
  layout: Layout;
  lockfile: Lockfile;
  languageMarkers: LanguageMarkers;
  /** Guide sources (pages' program text and value guides): taken by the step, used once places land (#168). */
  guideSources?: unknown;
  settings?: Partial<ReaderSettings>;
}

export interface StepResult {
  state: ReaderState;
  output: StepOutput;
}
