/**
 * Static export. The front end is built to `out/` and served by the Express app in `web/src`,
 * which keeps every API route — SSE, health, replay, the ENS catalogue read — exactly where it
 * already is. Nothing here runs on a server.
 *
 * `trailingSlash` makes the export emit `dashboard/index.html` rather than `dashboard.html`,
 * which is the shape `express.static` resolves without extra routing.
 */
/** @type {import('next').NextConfig} */
export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};
