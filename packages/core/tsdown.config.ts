import { defineConfig } from "tsdown";
import { yaml } from "../../yaml-plugin.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  // The language markers are a language file: one copy, in language/, read in
  // at build, as the parser reads classes.yaml. The file itself is copied
  // beside the bundle for anything else that reads it.
  plugins: [yaml()],
  copy: ["../../language/markers.yaml"],
});
