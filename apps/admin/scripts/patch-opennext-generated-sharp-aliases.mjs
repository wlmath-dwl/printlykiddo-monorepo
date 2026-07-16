import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const serverFunctionsDir = path.join(
  process.cwd(),
  ".open-next",
  "server-functions",
);
const sharpAliasPattern = /sharp-[a-f0-9]{16}/g;

async function listMjsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return listMjsFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".mjs") ? [entryPath] : [];
    }),
  );

  return files.flat();
}

let patchedCount = 0;

for (const filePath of await listMjsFiles(serverFunctionsDir)) {
  const source = await readFile(filePath, "utf8");
  const patched = source.replace(sharpAliasPattern, "sharp");

  if (patched !== source) {
    await writeFile(filePath, patched);
    patchedCount += 1;
  }
}

if (patchedCount === 0) {
  console.log("No generated OpenNext sharp aliases found.");
} else {
  console.log(`Patched generated OpenNext sharp aliases in ${patchedCount} file(s).`);
}
