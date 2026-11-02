import { check, type CheckError, type Expr, type SkippedLine, type Statement } from "@snapscript/checker";

/** Program text from lines. */
export const lines = (...text: string[]): string => `${text.join("\n")}\n`;

/** The kind, line and message of each error. */
export function errorsOf(text: string, skipped: SkippedLine[] = []): Pick<CheckError, "kind" | "line" | "message">[] {
  return check(text, skipped).errors.map(({ kind, line, message }) => ({ kind, line, message }));
}

/** The body of the program's first strip. */
export function bodyOf(text: string): Statement[] {
  const { program } = check(text, []);
  const first = program.declarations[0];
  if (first.type !== "define" && first.type !== "on") throw new Error("not a define");
  return first.body;
}

/** Writes a value the way the reference's Python column does: `print(random() + 5)`. */
export function python(expr: Expr | null, nested = false): string {
  const p = (e: Expr | null): string => python(e, nested);
  if (expr === null) return "?";
  switch (expr.type) {
    case "num":
    case "bool":
      return String(expr.value);
    case "str":
      return JSON.stringify(expr.value);
    case "color":
      return expr.value;
    case "none":
      return "None";
    case "root":
      return "root";
    case "get":
      return expr.path.map((n) => n.text).join(".");
    case "call": {
      const callee = expr.path.map((n) => n.text).join(".");
      const receiver = expr.receiver ? `${p(expr.receiver)}.` : "";
      return `${receiver}${callee}(${expr.args.map(p).join(", ")})`;
    }
    case "getProp":
      return `${p(expr.object)}.${expr.name.text}`;
    case "binary":
      {
      const s = `${p(expr.left)} ${expr.op} ${p(expr.right)}`;
      return nested ? `<${s}>` : s;
    }
    case "not":
      return nested ? `<not ${p(expr.operand)}>` : `not ${p(expr.operand)}`;
    case "group":
      return `(${p(expr.value)})`;
  }
}

/** The value of the one statement in `[define{f}]` followed by `line`. */
export function valueOf(line: string): string {
  const [statement] = bodyOf(lines("[define{f}]", line));
  switch (statement.type) {
    case "set":
      return `${statement.name?.text} = ${python(statement.value)}`;
    case "expression":
      return python(statement.value);
    case "if":
      return `if ${python(statement.branches[0].condition)}`;
    case "for":
      return `for ${statement.name?.text} in ${python(statement.iterable)}`;
    default:
      throw new Error(`no value in a ${statement.type}`);
  }
}
