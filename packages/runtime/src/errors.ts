// The errors a run meets: one class per error kind, for native modules to throw, and what reaches the
// host when a run stops on one.
import type { ErrorKind } from "@snapscript/core";
import type { Span } from "./values.ts";

/** An error the program meets while running: one of the reference's kinds. */
export class SnapscriptError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = kind;
  }
}

/** One kind's class: `new ValueError(message)`. */
export type ErrorOfKind = new (message: string) => SnapscriptError;

/** A class for one kind, for native modules to throw: `throw new ValueError("…")`. */
const errorOfKind = (kind: ErrorKind): ErrorOfKind =>
  class extends SnapscriptError {
    constructor(message: string) {
      super(kind, message);
    }
  };

export const SyntaxError: ErrorOfKind = errorOfKind("SyntaxError");
export const IndentationError: ErrorOfKind = errorOfKind("IndentationError");
export const NameError: ErrorOfKind = errorOfKind("NameError");
export const TypeError: ErrorOfKind = errorOfKind("TypeError");
export const AttributeError: ErrorOfKind = errorOfKind("AttributeError");
export const ImportError: ErrorOfKind = errorOfKind("ImportError");
export const IndexError: ErrorOfKind = errorOfKind("IndexError");
export const ValueError: ErrorOfKind = errorOfKind("ValueError");
export const ZeroDivisionError: ErrorOfKind = errorOfKind("ZeroDivisionError");
export const RecursionError: ErrorOfKind = errorOfKind("RecursionError");

/** Each kind in core's table, and its class. */
export const errorKinds: Readonly<Record<ErrorKind, ErrorOfKind>> = {
  SyntaxError,
  IndentationError,
  NameError,
  TypeError,
  AttributeError,
  ImportError,
  IndexError,
  ValueError,
  ZeroDivisionError,
  RecursionError,
};

/** Marks a runtime error, so one thrown by another copy of this library still counts. */
const errorBrand = Symbol.for("@snapscript/runtime.error");
Object.defineProperty(SnapscriptError.prototype, errorBrand, { value: true });

export const isSnapscriptError = (e: unknown): e is SnapscriptError =>
  e instanceof SnapscriptError || (typeof e === "object" && e !== null && (e as Record<symbol, unknown>)[errorBrand] === true);

/** A library's own code broke: its message names the library and the function. */
export class LibraryError extends Error {}

/** What reaches the host when a run stops on an error. */
export interface RunError {
  /** A runtime error has a kind; anything else a native module throws is a library error. */
  type: "runtime" | "library";
  kind: ErrorKind | null;
  message: string;
  /** The card on the table that led there. */
  span: Span | null;
}
