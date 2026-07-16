import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(
  path.dirname(require.resolve("@opennextjs/cloudflare")),
  "../..",
);
const bundleServerPath = path.join(
  packageRoot,
  "dist/cli/build/bundle-server.js",
);

const source = await readFile(bundleServerPath, "utf8");

if (source.includes('"sharp-*"')) {
  console.log("OpenNext sharp external patch already present.");
  process.exit(0);
}

const marker = 'external: [\n            "./middleware/handler.mjs",';
if (!source.includes(marker)) {
  throw new Error(
    `Unable to find OpenNext external list in ${bundleServerPath}.`,
  );
}

await writeFile(
  bundleServerPath,
  source.replace(
    marker,
    'external: [\n            "sharp-*",\n            "./middleware/handler.mjs",',
  ),
);

console.log("Patched OpenNext server bundle externals for sharp-*.");
