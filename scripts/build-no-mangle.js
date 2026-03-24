/**
 * Build script with mangling disabled.
 *
 * The platform AI scanner can misinterpret minified/mangled method names
 * (e.g. `this.M()` instead of `this.createGameElements()`) as broken code
 * and attempt to "fix" them, breaking the game.
 *
 * This script builds with minification ON but property mangling OFF,
 * keeping method names readable for the scanner while still reducing size.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The cli/build-service subpath is not in the package exports,
// so we resolve the .js file directly.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildServicePath = path.resolve(
  __dirname,
  "../node_modules/@insidethesim/remix-dev/dist/cli/build-service.js",
);
const { buildGame } = await import(pathToFileURL(buildServicePath).href);

async function main() {
  try {
    const result = await buildGame({ minification: true, mangling: false });

    if (!result.success) {
      console.error("Build failed:", result.error);
      if (result.details) {
        for (const d of result.details) {
          console.error("  -", d.text);
        }
      }
      process.exit(1);
    }

    console.log(`Build completed in ${result.buildTime}ms`);
    if (result.fileSize) {
      const kb = (result.fileSize / 1024).toFixed(2);
      console.log(`Output: dist/index.html (${kb} KB)`);
    }
    if (result.sdkIntegration) {
      const status = result.sdkIntegration.integrated
        ? "Integrated"
        : "Not integrated";
      console.log(
        `SDK: ${status} (${result.sdkIntegration.passedChecks}/${result.sdkIntegration.totalChecks} checks)`,
      );
    }
  } catch (err) {
    console.error("Build error:", err);
    process.exit(1);
  }
}

main();
