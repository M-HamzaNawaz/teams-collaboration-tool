import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Runtime files the local Supabase stack drops while running (git-ignored).
    "supabase/.temp/**",
    // Tauri desktop shell — Rust project with generated JS in target/.
    "desktop/**",
  ]),
]);

export default eslintConfig;
