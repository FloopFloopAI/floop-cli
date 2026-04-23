import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  splitting: false,
  shims: false,
  // Single-file output with the shebang prepended so `chmod +x dist/index.js`
  // gives a working executable. Cross-compiled binaries (bun --compile) come
  // in a later slice.
  banner: { js: "#!/usr/bin/env node" },
});
