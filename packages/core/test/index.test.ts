import { expect, test } from "vitest";
import * as core from "../src/index.ts";

test("the package is empty until the core is built", () => {
  expect(Object.keys(core)).toEqual([]);
});
