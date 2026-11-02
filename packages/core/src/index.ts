// The shared rules table. It knows nothing of the table or of text.

/** When an error is found (REFERENCE.md §4.3). */
export type Stage = "structure" | "check" | "runtime";

/** What went wrong, named as in Python. */
export type ErrorKind =
  | "SyntaxError"
  | "IndentationError"
  | "NameError"
  | "TypeError"
  | "AttributeError"
  | "ImportError"
  | "IndexError"
  | "ValueError"
  | "ZeroDivisionError"
  | "RecursionError";

/** The stages each kind can be found at, earliest first. */
export const stagesOfKind: Readonly<Record<ErrorKind, readonly Stage[]>> = {
  SyntaxError: ["structure"],
  IndentationError: ["structure"],
  NameError: ["check", "runtime"],
  TypeError: ["check", "runtime"],
  AttributeError: ["check", "runtime"],
  ImportError: ["check", "runtime"],
  IndexError: ["runtime"],
  ValueError: ["runtime"],
  ZeroDivisionError: ["runtime"],
  RecursionError: ["runtime"],
};
