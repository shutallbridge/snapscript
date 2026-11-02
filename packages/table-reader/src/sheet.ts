// The card sheet as printed (#101): the reader's one source for its sizes.

/** 30 mm per U, the marker centred in the 17 mm marker zone, and labels in Geist Mono at 5.50 mm a letter. */
export const SHEET = {
  /** 1U, in mm. */
  unitMm: 30,
  /** The marker's centre from the sheet's top-left corner, along the card and down it, in mm. */
  markerAlongMm: 8.5,
  markerDownMm: 15,
  /** A printed label's room is a card's length less this, in mm, at letterMm a letter. */
  letterMm: 5.5,
  chromeMm: 24.5,
  /** The shortest printed card, a color card and a handwritten card, in U. */
  minPrinted: 2,
  color: 4,
  handwritten: 4,
  /** [define{…}], [global{…}], [getProp{…}] and [setProp{…}to]. */
  longHandwritten: 5,
} as const;
