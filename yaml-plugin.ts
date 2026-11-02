// Turns an imported .yaml file into a module whose default export is its data.
// Used by tsdown (rolldown) and Vitest (vite), which share the plugin hooks.
import { parse } from "yaml";

export function yaml(): { name: string; transform(code: string, id: string): string | undefined } {
  return {
    name: "snapscript-yaml",
    transform(code, id) {
      if (!id.endsWith(".yaml")) return undefined;
      return `export default ${JSON.stringify(parse(code))};`;
    },
  };
}
