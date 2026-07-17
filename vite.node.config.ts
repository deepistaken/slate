// Production build config for a Node server (Render / any Node host).
// Kept separate from vite.config.ts so local dev and the Cloudflare build are
// untouched. Build with:  npm run build:node   →   .output/server/index.mjs
import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";

import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Local convenience only: load .dev.vars so `npm run build:node` can run locally.
// On Render, env vars come from the dashboard, not this file.
try {
  if (existsSync(".dev.vars")) {
    for (const rawLine of readFileSync(".dev.vars", "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
} catch {
  // ignore
}

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart(),
    // Explicit preset — otherwise Nitro auto-detects wrangler.jsonc and builds
    // a Cloudflare Worker, which `node .output/server/index.mjs` can't run.
    nitro({ preset: "node-server" }),
    viteReact(),
  ],
});
