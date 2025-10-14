import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import { globSync } from "glob";

// Auto-discover tsconfig.json files from pnpm workspace packages
const workspacePatterns = [
  "lib/**/*",
  "examples/*",
  "templates/*",
  "clients/*",
  "onchain-actions-plugins/**/*"
];

const tsProjectPaths = [
  "./tsconfig.base.json",
  ...workspacePatterns.flatMap(pattern =>
    globSync(`${pattern}/tsconfig.json`, { ignore: "**/node_modules/**" })
  )
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-test/**",
      "**/.pnpm/**",
      "**/*.js", 
      "**/*.d.ts",
      "**/coverage/**",
      "clients/web/**",
      "src/proto/"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        project: tsProjectPaths,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
    },
    rules: {
      "no-constant-condition": [
        "error",
        {
          checkLoops: false,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  eslintConfigPrettier
); 