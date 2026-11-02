import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  // The card classes are a language file: one copy, in language/, read in at build.
  copy: ["../../language/classes.yaml"],
});
