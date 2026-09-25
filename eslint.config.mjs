import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  { ignores: [".next/**", "node_modules/**", "out/**", "submission/**", "public/audio/**", "coverage/**", "playwright-report/**", "test-results/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
