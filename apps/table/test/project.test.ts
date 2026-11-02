import { describe, expect, test } from "vitest";
import { languageMarkers } from "@snapscript/core";
import { join } from "node:path";
import { loadProject, ProjectError, type Page } from "../src/project.ts";
import { fixtureProject, fixtures } from "./helpers.ts";

describe("the project loader", () => {
  test("reads the lockfile into the reader's Lockfile", () => {
    const project = loadProject(fixtureProject());
    expect([...project.lockfile]).toEqual([
      [400, { kind: "library", card: "call", package: "fixture-shapes", name: "square", length: 2 }],
      [402, { kind: "library", card: "call", package: "fixture-shapes", name: "retired", length: 2 }],
    ]);
    expect(project.languageMarkers).toBe(languageMarkers);
  });
});

describe("library cards", () => {
  test("each @card in a library, with its label, function colour, help and shortest length", () => {
    const project = loadProject(fixtureProject());
    expect(project.cards).toEqual([
      {
        card: "call",
        package: "fixture-shapes",
        name: "square",
        text: "[call(fixture-shapes.square)]",
        label: "square",
        functionColor: "setting",
        help: {
          sentence: "Draws a square. x and y are its top-left corner.",
          values: [
            { name: "x", about: "how far from the left edge" },
            { name: "y", about: "how far down from the top edge" },
            { name: "size", about: "how wide" },
          ],
        },
        length: 2,
        marker: 400,
      },
      {
        card: "call",
        package: "fixture-shapes",
        name: "starburst",
        text: "[call(fixture-shapes.starburst)]",
        label: "starburst",
        functionColor: "primary",
        help: { sentence: "Draws a five-pointed star.", values: [{ name: "x", about: "how far from the left edge" }] },
        length: 3,
        marker: null,
      },
      {
        card: "define",
        package: "fixture-shapes",
        name: "setup",
        text: "[define(setup)]",
        label: "define setup",
        functionColor: null,
        help: { sentence: "Runs once when the program starts.", values: [] },
        length: 4,
        marker: null,
      },
      {
        card: "define",
        package: "fixture-shapes",
        name: "draw",
        text: "[define(draw)]",
        label: "define draw",
        functionColor: null,
        help: { sentence: "Runs again and again, every frame, after setup.", values: [] },
        length: 3,
        marker: null,
      },
    ]);
  });
});

describe("textbook pages", () => {
  const program = [
    "/** @table hidden */",
    "[import(fixture-shapes)as(shapes)]",
    "",
    "[define(setup)]",
    "\t[call(shapes.square)][num{10}][num{20}][num{30}]",
  ].join("\n");

  test("each # heading of each volume starts a page, numbered from 1; a page's program is its snap block", () => {
    const project = loadProject(fixtureProject());
    expect(project.pages.map(({ textbook, volume, page, heading, program, marker }) => ({ textbook, volume, page, heading, program, marker }))).toEqual([
      { textbook: "fixture-lessons", volume: "first", page: 1, heading: "Before we start", program: null, marker: null },
      { textbook: "fixture-lessons", volume: "first", page: 2, heading: "A square", program, marker: null },
      { textbook: "fixture-lessons", volume: "first", page: 3, heading: "Many squares", program: null, marker: null },
      { textbook: "fixture-lessons", volume: "second", page: 1, heading: "The end", program: null, marker: null },
    ]);
  });

  test("inline code in card notation is a mini card, other inline code stays code", () => {
    const [first, second, third] = loadProject(fixtureProject()).pages;
    expect(inline(first!)).toEqual([{ cards: ["[call(shapes.square)]"] }, { code: "x[0]" }, { code: "[1, 2]" }]);
    expect(inline(second!)).toEqual([{ cards: ["[repeat]", "[num{3}]"] }]);
    // Other code blocks stay in the page.
    expect(third!.content.children.map((n) => n.type)).toEqual(["paragraph", "code"]);
  });

  test("the program's block and the heading are not in the page's content", () => {
    const second = loadProject(fixtureProject()).pages[1]!;
    expect(second.content.children.map((n) => n.type)).toEqual(["paragraph"]);
  });

  test("an image is a file beside its volume", () => {
    const first = loadProject(fixtureProject()).pages[0]!;
    const images = nodes(first.content).filter((n) => n.type === "image");
    expect(images.map((n) => ("url" in n ? n.url : null))).toEqual([join(fixtures, "lessons", "canvas.png")]);
  });

  test("a page with two snap blocks is an error", () => {
    expect(() => loadProject(fixtureProject({ dependencies: ["fixture-two-programs"] }))).toThrow(
      new ProjectError("fixture-two-programs/broken page 2 (Two programs) has two ```snap blocks; a page holds at most one program"),
    );
  });
});

type Node = Page["content"]["children"][number] | { type: string; children?: unknown[] };

function nodes(node: { children?: unknown[] }): Node[] {
  return (node.children ?? []).flatMap((child) => [child as Node, ...nodes(child as { children?: unknown[] })]);
}

/** A page's mini cards and inline code, in order. */
function inline(page: Page): ({ cards: string[] } | { code: string })[] {
  return nodes(page.content).flatMap((n): ({ cards: string[] } | { code: string })[] => {
    if (n.type === "miniCard" && "cards" in n) return [{ cards: n.cards as string[] }];
    if (n.type === "inlineCode" && "value" in n) return [{ code: n.value as string }];
    return [];
  });
}
