import { NextResponse } from "next/server";

export const runtime = "nodejs";

function parsePositiveInteger(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 4096) {
    throw new Error(`${label} 必须是 1 - 4096 之间的整数。`);
  }

  return parsed;
}

function sanitizeFileName(name: string) {
  const baseName = name.replace(/\.[^.]+$/i, "").trim() || "converted-image";
  return `${baseName.replace(/[^\w.-]+/g, "-")}.webp`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "请选择要转换的图片文件。" }, { status: 400 });
    }

    const size = parsePositiveInteger(formData.get("size"), "尺寸");

    const sharp = (await import("sharp")).default;
    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    const pipeline = sharp(sourceBuffer).rotate().resize({
      width: size,
      height: size,
      fit: "contain",
      background: "#ffffff",
    });

    const webpBuffer = await pipeline.webp({ quality: 80 }).toBuffer();

    return new NextResponse(new Uint8Array(webpBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": `attachment; filename="${sanitizeFileName(file.name)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "转换 WebP 失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
