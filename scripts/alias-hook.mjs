import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = pathToFileURL(process.cwd() + "/src/").href;

/** Resolves the project's "@/..." alias and its extensionless imports. */
export function resolve(specifier, context, next) {
  if (!specifier.startsWith("@/")) return next(specifier, context);

  const base = SRC + specifier.slice(2);
  for (const candidate of [base, base + ".ts", base + ".tsx", base + "/index.ts"]) {
    if (existsSync(fileURLToPath(candidate))) {
      return next(candidate, context);
    }
  }
  return next(base, context);
}
