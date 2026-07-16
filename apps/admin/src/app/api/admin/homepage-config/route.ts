import { NextResponse } from "next/server";

import { getHomepageConfig, updateHomepageConfig } from "@/lib/admin-db";

export async function GET() {
  try {
    return NextResponse.json(await getHomepageConfig());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取首页配置失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      hero_image_url?: string;
      seo_title?: string;
      seo_description?: string;
      footer_paragraph?: string;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "首页标题不能为空。" }, { status: 400 });
    }

    if (!body.description?.trim()) {
      return NextResponse.json({ error: "首页描述不能为空。" }, { status: 400 });
    }

    const title = body.title.trim();
    const description = body.description.trim();
    const hero_image_url = body.hero_image_url?.trim() ?? "";
    const seo_title = body.seo_title?.trim() ?? "";
    const seo_description = body.seo_description?.trim() ?? "";
    const footer_paragraph = body.footer_paragraph?.trim() ?? "";

    return NextResponse.json(
      await updateHomepageConfig({
        title,
        description,
        hero_image_url,
        seo_title,
        seo_description,
        footer_paragraph,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存首页配置失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
