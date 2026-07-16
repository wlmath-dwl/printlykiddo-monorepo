import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashValue(value) {
  return sha256(stableJson(value));
}

export async function hashFile(filePath) {
  return sha256(await readFile(filePath));
}
