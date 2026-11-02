import { expect, test } from "vitest";
import * as tableReader from "../src/index.ts";

test("the package is empty until the table reader is built", () => {
  expect(Object.keys(tableReader)).toEqual([]);
});
