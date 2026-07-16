/**
 * 多路机翻：Lingva 镜像链 + MyMemory 兜底（均无 API Key）。
 * 请适度限速（脚本侧 LINGVA_DELAY_MS），避免滥用公共服务。
 */
const LINGVA_MIRRORS = [
  "https://translate.plausibility.cloud/api/v1/en/zh",
  "https://lingva.ml/api/v1/en/zh",
];

const MYMEMORY =
  "https://api.mymemory.translated.net/get";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function translateLingvaMirror(text) {
  const q = encodeURIComponent(text.slice(0, 450));
  for (const base of LINGVA_MIRRORS) {
    const res = await fetch(`${base}/${q}`);
    const raw = await res.text();
    if (raw.trimStart().startsWith("<") || !raw.trimStart().startsWith("{")) {
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    if (data.error) {
      continue;
    }
    const out = data.translation?.trim();
    if (out) {
      return out;
    }
  }
  throw new Error("Lingva mirrors failed");
}

async function translateMyMemory(text) {
  const q = encodeURIComponent(text.slice(0, 500));
  const res = await fetch(`${MYMEMORY}?q=${q}&langpair=en|zh-CN`);
  if (!res.ok) {
    throw new Error(`MyMemory HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.responseStatus !== 200) {
    throw new Error(data.responseDetails || "MyMemory error");
  }
  const out = data.responseData?.translatedText?.trim();
  if (!out) {
    throw new Error("MyMemory empty");
  }
  return out;
}

export async function translateEnToZhCn(text, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      try {
        return await translateLingvaMirror(text);
      } catch (e1) {
        lastErr = e1;
        return await translateMyMemory(text);
      }
    } catch (e) {
      lastErr = e;
      const wait = 1200 * 2 ** attempt + Math.floor(Math.random() * 500);
      await sleep(wait);
    }
  }
  throw lastErr;
}
