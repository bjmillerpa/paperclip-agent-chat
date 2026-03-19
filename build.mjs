import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist/ui", { recursive: true });

// Bundle the worker — include SDK and all deps, platform: node
await build({
  entryPoints: ["src/worker.js"],
  outfile: "dist/worker.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  external: ["react", "react-dom"],
});
console.log("✓ worker bundled");

// Bundle the manifest — simple ESM, no bundling needed
await build({
  entryPoints: ["src/manifest.js"],
  outfile: "dist/manifest.js",
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
});
console.log("✓ manifest bundled");

// Bundle the UI — browser ESM, externalize react/sdk-ui
await build({
  entryPoints: ["src/ui/index.js"],
  outfile: "dist/ui/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
  external: [
    "@paperclipai/plugin-sdk/ui",
    "@paperclipai/plugin-sdk/ui/hooks",
    "react",
    "react-dom",
    "react/jsx-runtime",
  ],
});
console.log("✓ UI bundled");

console.log("Build complete → dist/");
