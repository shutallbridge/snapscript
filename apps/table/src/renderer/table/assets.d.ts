// What Vite gives the renderer's imports: `?inline`, a file as a data URL; a stylesheet, nothing.
declare module "*?inline" {
  const url: string;
  export default url;
}

// Stylesheets imported for their fonts.
declare module "*.css";
