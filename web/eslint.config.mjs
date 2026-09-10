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
    // Scratch probes, throwaway by convention and now by rule.
    //
    // A leading underscore in scripts/ means temporary. .gitignore already
    // refuses to commit them, and eslint was still linting them off disk, so
    // one stray probe with an `any` in it turned `npm run verify` red while
    // every real file was clean. The same rule belongs in both places or it is
    // not a rule.
    "scripts/_*",
  ]),
]);

export default eslintConfig;
