import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { generateCategoryPuzzleVideo } from "@/lib/video-template-generation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const AUDIO_EXTENSIONS = new Set([".aac", ".flac", ".m4a", ".mp3", ".mp4", ".ogg", ".wav", ".webm"]);
const AUDIO_EXTENSION_BY_TYPE: Record<string, string> = {
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "audio/m4a": ".m4a",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "audio/x-m4a": ".m4a",
  "audio/x-wav": ".wav",
  "video/mp4": ".mp4",
};
const MAX_AUDIO_FILE_SIZE = 80 * 1024 * 1024;

function getAudioExtension(file: File) {
  const extension = path.extname(file.name || "").toLowerCase();
  if (AUDIO_EXTENSIONS.has(extension)) {
    return extension;
  }

  return AUDIO_EXTENSION_BY_TYPE[file.type.toLowerCase()] ?? "";
}

async function saveTempAudioFile(file: File) {
  if (file.size > MAX_AUDIO_FILE_SIZE) {
    throw new Error("音乐文件不能超过 80MB。");
  }

  const extension = getAudioExtension(file);
  const fileType = file.type.toLowerCase();
  if (!extension || (fileType && !fileType.startsWith("audio/") && fileType !== "video/mp4")) {
    throw new Error("请上传 mp3、m4a、wav、aac、ogg、flac 或 webm 音频文件。");
  }

  const tempDir = path.join(os.tmpdir(), "printly-admin-video-audio");
  const tempPath = path.join(tempDir, `${randomUUID()}${extension}`);
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(tempPath, Buffer.from(await file.arrayBuffer()));
  return tempPath;
}

export async function POST(request: Request, context: RouteContext) {
  let tempAudioPath: string | undefined;

  try {
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") || "";
    let body: { cycle_id?: FormDataEntryValue | number; pose_id?: FormDataEntryValue | number };

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const audioFile = formData.get("audio_file");
      const audioExpected = formData.get("audio_expected") === "1";
      body = {
        cycle_id: formData.get("cycle_id") ?? undefined,
        pose_id: formData.get("pose_id") ?? undefined,
      };

      if (audioFile instanceof File && audioFile.size > 0) {
        tempAudioPath = await saveTempAudioFile(audioFile);
      } else if (audioExpected) {
        throw new Error("没有收到上传的音乐文件，请重新选择音乐后再生成。");
      }
    } else {
      body = (await request.json()) as { cycle_id?: number; pose_id?: number };
    }

    const categoryId = Number(id);
    const cycleId = Number(body.cycle_id);
    const poseId = body.pose_id === undefined ? NaN : Number(body.pose_id);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "分类 id 无效。" }, { status: 400 });
    }

    if (!Number.isInteger(cycleId) || cycleId <= 0) {
      return NextResponse.json({ error: "视频周期 id 无效。" }, { status: 400 });
    }

    if (!Number.isInteger(poseId) || poseId <= 0) {
      return NextResponse.json({ error: "姿态 id 无效。" }, { status: 400 });
    }

    const item = await generateCategoryPuzzleVideo({ categoryId, cycleId, poseId, audioPath: tempAudioPath });
    return NextResponse.json({ ...item, audio_file_used: Boolean(tempAudioPath) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成视频失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    if (tempAudioPath) {
      await fs.rm(tempAudioPath, { force: true });
    }
  }
}
