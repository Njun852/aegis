import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = pathToFileURL(process.cwd() + "/src/").href;

/** The extensions TypeScript lets an import omit, in resolution order. */
function firstThatExists(base) {
  for (const candidate of [base, base + ".ts", base + ".tsx", base + "/index.ts"]) {
    try {
      if (existsSync(fileURLToPath(candidate))) return candidate;
    } catch {
      // Not a testable file URL — let Node resolve it however it would.
    }
  }
  return null;
}

/**
 * Resolves the project's "@/..." alias and the extensionless imports TypeScript
 * allows.
 *
 * Relative specifiers are handled too ("./failures"), not just aliased ones:
 * Node's ESM resolver requires the extension, so a script importing any module
 * that imports its neighbour by relative path would otherwise fail to load.
 */
export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = SRC + specifier.slice(2);
    return next(firstThatExists(base) ?? base, context);
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL
  ) {
    const found = firstThatExists(new URL(specifier, context.parentURL).href);
    if (found) return next(found, context);
  }

  return next(specifier, context);
}
