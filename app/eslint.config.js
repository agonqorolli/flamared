// Lint rules for the window (src/). shadcn's generated components (src/components/ui) are left as they come.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist", "src-tauri", "src/components/ui"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // The window talks to the Rust side in one place.
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/lib/api.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@tauri-apps/*"], message: "Call the Rust side through lib/api.ts." }] },
      ],
    },
  },
);
