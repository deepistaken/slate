// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Dev convenience: `vite dev` does NOT read Cloudflare's `.dev.vars`, so load it
// into process.env here. This runs only in Node during `vite dev` / `vite build`
// (never in the deployed worker), so production still uses the real Cloudflare
// secret. Existing environment variables always win.
try {
  if (existsSync(".dev.vars")) {
    for (const rawLine of readFileSync(".dev.vars", "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
} catch {
  // dev convenience only — ignore any read/parse issues
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Render sets RENDER=true in every build/runtime env. Without this, the
  // Lovable config defaults Nitro to "cloudflare-module" (it auto-detects
  // wrangler.jsonc), producing a Worker bundle that `node` exits on immediately.
  ...(process.env.RENDER ? { nitro: { preset: "node-server" } } : {}),
});
