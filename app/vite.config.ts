import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

// Dev only: outside the Tauri window there is no Rust side, so the page can read a saved snapshot instead
// (SNAPSHOT_FILE=<json from `cargo run --example dump`>). Never part of a build.
const devSnapshot = (): Plugin => ({
  name: "dev-snapshot",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__snapshot.json", (_req, res) => {
      const file = process.env.SNAPSHOT_FILE;
      if (!file || !fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader("content-type", "application/json");
      fs.createReadStream(file).pipe(res);
    });
  },
});
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), devSnapshot()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
