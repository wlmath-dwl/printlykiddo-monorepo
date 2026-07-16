export type BrowserZipEntry = {
  name: string;
  data: Uint8Array;
};

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pushUint16(parts: number[], value: number) {
  parts.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(parts: number[], value: number) {
  parts.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function dosDateTime(date = new Date()) {
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosDate, dosTime };
}

export function createBrowserZip(entries: BrowserZipEntry[]) {
  const encoder = new TextEncoder();
  const fileParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader: number[] = [];
    pushUint32(localHeader, 0x04034b50);
    pushUint16(localHeader, 20);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, dosTime);
    pushUint16(localHeader, dosDate);
    pushUint32(localHeader, crc);
    pushUint32(localHeader, entry.data.length);
    pushUint32(localHeader, entry.data.length);
    pushUint16(localHeader, nameBytes.length);
    pushUint16(localHeader, 0);
    const localHeaderBytes = new Uint8Array(localHeader);
    fileParts.push(localHeaderBytes, nameBytes, entry.data);

    const centralHeader: number[] = [];
    pushUint32(centralHeader, 0x02014b50);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, dosTime);
    pushUint16(centralHeader, dosDate);
    pushUint32(centralHeader, crc);
    pushUint32(centralHeader, entry.data.length);
    pushUint32(centralHeader, entry.data.length);
    pushUint16(centralHeader, nameBytes.length);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, 0);
    pushUint32(centralHeader, offset);
    centralParts.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeaderBytes.length + nameBytes.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const endHeader: number[] = [];
  pushUint32(endHeader, 0x06054b50);
  pushUint16(endHeader, 0);
  pushUint16(endHeader, 0);
  pushUint16(endHeader, entries.length);
  pushUint16(endHeader, entries.length);
  pushUint32(endHeader, centralSize);
  pushUint32(endHeader, offset);
  pushUint16(endHeader, 0);

  const blobParts = [...fileParts, ...centralParts, new Uint8Array(endHeader)].map(
    (part) => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer,
  );

  return new Blob(blobParts, { type: "application/zip" });
}

export function downloadBrowserBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
