// Names ignore case (ADR 0008): every lookup by a name, a module's or a card's, compares them this way.
export const nameKey = (name: string): string => name.toLowerCase();
export const sameName = (a: string, b: string): boolean => nameKey(a) === nameKey(b);
