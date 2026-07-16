export function toWebpFileName(fileName: string) {
  const extensionMatch = fileName.match(/(\.[a-zA-Z0-9]+)$/);
  if (!extensionMatch) {
    return `${fileName}.webp`;
  }

  return `${fileName.slice(0, -extensionMatch[1].length)}.webp`;
}
