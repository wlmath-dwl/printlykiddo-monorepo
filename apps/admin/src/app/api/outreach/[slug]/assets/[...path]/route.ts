import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const OUTREACH_ROOT = path.join(process.cwd(), "data", "outreach");

type RouteContext = {
  params: Promise<{
    slug: string;
    path: string[];
  }>;
};

const contentTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(_: Request, context: RouteContext) {
  const { slug, path: filePathParts } = await context.params;
  const filePath = path.join(OUTREACH_ROOT, slug, ...filePathParts);
  const relativePath = path.relative(path.join(OUTREACH_ROOT, slug), filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return NextResponse.json({ error: "Invalid asset path." }, { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    return new NextResponse(file, {
      headers: {
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}
