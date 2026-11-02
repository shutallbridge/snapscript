import { expect, test } from "vitest";
import * as checker from "../src/index.ts";

test("the package is empty until the checker is built", () => {
  expect(Object.keys(checker)).toEqual([]);
});
