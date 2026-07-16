import { NextResponse } from "next/server";

import {
  createPinterestReviewBoard,
  publishPinterestReviewPin,
} from "@/lib/pinterest-review";

type PublishBody = {
  board_id?: string;
  board_name?: string;
  image_url?: string;
  title?: string;
  description?: string;
  link?: string;
  alt_text?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PublishBody;
    const imageUrl =
      body.image_url?.trim() ||
      process.env.PINTEREST_TEST_IMAGE_URL?.trim() ||
      "";

    if (!imageUrl) {
      return NextResponse.json(
        { error: "请输入一个可公网访问的测试图片 URL，或配置 PINTEREST_TEST_IMAGE_URL。" },
        { status: 400 },
      );
    }

    let boardId = body.board_id?.trim() || "";
    let board = null;
    if (!boardId) {
      board = await createPinterestReviewBoard(
        body.board_name?.trim() || "PrintlyKiddo API Review",
      );
      boardId = board.id;
    }

    const pin = await publishPinterestReviewPin({
      boardId,
      imageUrl,
      title: body.title?.trim() || "PrintlyKiddo API Review Test Pin",
      description:
        body.description?.trim() ||
        "This test Pin demonstrates OAuth authorization and Pin publishing through the Pinterest API.",
      link: body.link?.trim() || "https://printlykiddo.com",
      altText:
        body.alt_text?.trim() ||
        "A PrintlyKiddo printable activity image used to demonstrate Pinterest API publishing.",
    });

    return NextResponse.json({ board, pin });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发布测试 Pin 失败。" },
      { status: 400 },
    );
  }
}
