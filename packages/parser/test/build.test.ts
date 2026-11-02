import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "tsdown";
import { afterEach, expect, test } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const language = fileURLToPath(new URL("../../../language/", import.meta.url));

let outDir: string | undefined;

afterEach(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

test("the build copies classes.yaml in from language/", async () => {
  outDir = await mkdtemp(join(tmpdir(), "snapscript-parser-"));
  await build({ cwd: root, outDir, logLevel: "silent" });

  const built = await readFile(join(outDir, "classes.yaml"));
  const source = await readFile(join(language, "classes.yaml"));
  expect(built.equals(source)).toBe(true);
});
