import { defineConfig } from "tsdown";
import { yaml } from "../../yaml-plugin.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  // The card classes are a language file: one copy, in language/, read in at
  // build. The parser imports it, so its card patterns are bundled in, and the
  // file itself is copied beside the bundle for anything else that reads it.
  plugins: [yaml()],
  copy: ["../../language/classes.yaml"],
});
