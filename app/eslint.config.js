// Lint rules for the window (src/). shadcn's generated components (src/components/ui) are left as they come.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist", "src-tauri", "src/components/ui"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "simple-import-sort": simpleImportSort },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // Plain statements: no comma expressions, no `return void (x = y)`, no `!` to silence the type checker.
      "no-sequences": ["error", { allowInParentheses: false }],
      "no-void": ["error", { allowAsStatement: true }],
      "@typescript-eslint/no-non-null-assertion": "error",
      // Imports in one block: packages, then our own modules (@/...), then the files next door; a stylesheet last.
      "simple-import-sort/imports": ["error", { groups: [["^node:", "^@?\\w", "^", "^\\.", "^\\u0000"]] }],
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
