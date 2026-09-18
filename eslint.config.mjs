import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // AEGIS reads Meta ad accounts and never changes them. The only code allowed
  // to reach the Graph API is the GET-only client, so a second — possibly
  // writable — path to Meta fails lint instead of slipping through review.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["src/lib/meta/client.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/graph\.facebook\.com/]",
          message:
            "Only src/lib/meta/client.ts may call the Meta Graph API. Use graphGet/graphGetAll from there.",
        },
        {
          selector: "TemplateElement[value.raw=/graph\.facebook\.com/]",
          message:
            "Only src/lib/meta/client.ts may call the Meta Graph API. Use graphGet/graphGetAll from there.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
