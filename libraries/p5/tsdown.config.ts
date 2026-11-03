import { defineConfig } from "tsdown";

// p5.js is built beside p5.snap: the runtime takes a module's native code
// from the .js file next to it with the same name.
export default defineConfig({
  entry: ["src/p5.ts"],
  outDir: ".",
  // The output folder is the package itself.
  clean: false,
  outExtensions: () => ({ js: ".js" }),
  // Nothing imports its types; tsdown would write them because the base tsconfig sets declaration.
  dts: false,
});
