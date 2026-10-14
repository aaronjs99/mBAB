import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

// Execute the compiled artifact in the Worker runtime, including cloudflare: imports.
// This harness has no public listener or outbound service access.
export function createBuiltWorker({ assets } = {}) {
  const root = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const config = JSON.parse(readFileSync(join(root, "wrangler.json"), "utf8"));
  const paths = ["index.js", ...readdirSync(root, { recursive: true }).filter(path => path.endsWith(".js") && path !== "index.js")];
  return new Miniflare(convertV4MiniflareOptions({
    host: "127.0.0.1",
    port: 0,
    cf: false,
    workers: [{
      name: "mbab-build-test",
      modulesRoot: root,
      modules: paths.map(path => ({ type: "ESModule", path: join(root, path) })),
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags ?? [],
      serviceBindings: { ASSETS: assets ?? (async () => new Response("Missing asset", { status: 404 })) },
      outboundService: async () => new Response("Network access disabled in build tests", { status: 503 }),
    }],
  }));
}
