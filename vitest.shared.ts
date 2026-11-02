// Shared Vitest settings for the packages: tests run against each workspace
// package's source, so a test never needs another package built first.
import { fileURLToPath } from "node:url";
import { yaml } from "./yaml-plugin.ts";

const source = (name: string, file = "index"): string =>
  fileURLToPath(new URL(`./packages/${name}/src/${file}.ts`, import.meta.url));

export const shared = {
  plugins: [yaml()],
  resolve: {
    alias: {
      "@snapscript/core": source("core"),
      "@snapscript/parser": source("parser"),
      // Before the package itself, which would match as a prefix.
      "@snapscript/checker/disk": source("checker", "disk"),
      "@snapscript/checker": source("checker"),
      "@snapscript/table-reader": source("table-reader"),
    },
  },
};
