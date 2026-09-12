import { defineConfig } from "tsup";

/**
 * One publishable package. Our workspace packages are private and unpublished, so they are listed as
 * devDependencies and tsup bundles them in; real npm packages stay in `dependencies` and are left
 * external. The published tarball therefore never references `@tollgate/*`, and never installs a
 * model client — discovery and payment are the only things it carries.
 */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: { resolve: [/^@tollgate\//] },
});
