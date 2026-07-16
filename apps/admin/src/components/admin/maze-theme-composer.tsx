"use client";

import { DeleteOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Card, Image, Space, Typography, Upload, message } from "antd";
import { useRef, useState } from "react";

import {
  createBrowserZip,
  downloadBrowserBlob,
  type BrowserZipEntry,
} from "@/lib/browser-zip";

type MazePair = {
  id: number;
  puzzle: UploadedImage | null;
  answer: UploadedImage | null;
};

type UploadedImage = {
  name: string;
  dataUrl: string;
};

type LoadedImage = {
  image: HTMLImageElement;
  width: number;
  height: number;
};

function FilePreview({ file }: { file: UploadedImage }) {
  return (
    <Image
      src={file.dataUrl}
      alt={file.name}
      width={72}
      height={72}
      style={{ objectFit: "contain", border: "1px solid #f0f0f0" }}
    />
  );
}

function ImageUploadSlot(props: {
  label: string;
  file: UploadedImage | null;
  onChange: (file: File) => void;
}) {
  const { label, file, onChange } = props;

  return (
    <div style={{ minWidth: 0 }}>
      <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
        {label}
      </Typography.Text>
      <Space align="start" size={12}>
        {file ? <FilePreview file={file} /> : null}
        <div style={{ minWidth: 0 }}>
          <Upload
            accept="image/png,image/jpeg,image/webp"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(nextFile) => {
              onChange(nextFile);
              return Upload.LIST_IGNORE;
            }}
          >
            <Button icon={<UploadOutlined />}>{file ? "替换图片" : "选择图片"}</Button>
          </Upload>
          <Typography.Text
            type="secondary"
            ellipsis={{ tooltip: file?.name }}
            style={{ display: "block", maxWidth: 260, marginTop: 6 }}
          >
            {file?.name ?? "支持 PNG、JPG、WebP"}
          </Typography.Text>
        </div>
      </Space>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error(`无法读取图片文件：${file.name}`));
      }
    };
    reader.onerror = () => reject(new Error(`无法读取图片文件：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImage(file: UploadedImage): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      resolve({ image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      reject(new Error(`无法读取图片：${file.name}`));
    };
    image.src = file.dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("成品图导出失败。"));
      }
    }, "image/png");
  });
}

function drawContained(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.drawImage(image, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
}

async function composeMaze(background: LoadedImage, maze: LoadedImage) {
  const canvas = document.createElement("canvas");
  canvas.width = background.width;
  canvas.height = background.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("浏览器不支持 Canvas 图片合成。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(background.image, 0, 0, canvas.width, canvas.height);
  context.save();
  context.globalCompositeOperation = "multiply";
  drawContained(context, maze.image, maze.width, maze.height, canvas.width, canvas.height);
  context.restore();

  return canvasToBlob(canvas);
}

function assertBackgrounds(color: LoadedImage, outline: LoadedImage) {
  const colorSquare = color.width === color.height;
  const outlineSquare = outline.width === outline.height;
  if (!colorSquare || !outlineSquare) {
    throw new Error("两张主题背景图都必须是正方形。");
  }
  if (color.width !== outline.width || color.height !== outline.height) {
    throw new Error("彩色背景图和线框背景图的像素尺寸必须一致。");
  }
  if (color.width > 4096) {
    throw new Error("主题背景图尺寸不能超过 4096 x 4096。");
  }
}

function safeBaseName(file: UploadedImage, index: number) {
  const source = file.name.replace(/\.[^.]+$/, "").trim();
  const safe = source.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${String(index + 1).padStart(3, "0")}-${safe || "maze"}.png`;
}

export function MazeThemeComposer() {
  const [messageApi, contextHolder] = message.useMessage();
  const nextPairId = useRef(2);
  const [colorBackground, setColorBackground] = useState<UploadedImage | null>(null);
  const [outlineBackground, setOutlineBackground] = useState<UploadedImage | null>(null);
  const [pairs, setPairs] = useState<MazePair[]>([
    { id: 1, puzzle: null, answer: null },
  ]);
  const [generating, setGenerating] = useState(false);

  async function storeUploadedImage(
    file: File,
    setter: (value: UploadedImage) => void,
  ) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setter({ name: file.name, dataUrl });
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : `无法读取图片文件：${file.name}`);
    }
  }

  function updatePair(id: number, patch: Partial<Pick<MazePair, "puzzle" | "answer">>) {
    setPairs((current) => current.map((pair) => (pair.id === id ? { ...pair, ...patch } : pair)));
  }

  function addPair() {
    const id = nextPairId.current;
    nextPairId.current += 1;
    setPairs((current) => [...current, { id, puzzle: null, answer: null }]);
  }

  function removePair(id: number) {
    setPairs((current) => current.filter((pair) => pair.id !== id));
  }

  async function handleGenerate() {
    if (!colorBackground || !outlineBackground) {
      messageApi.warning("请先上传彩色主题背景图和线框主题背景图。");
      return;
    }
    if (pairs.length === 0 || pairs.some((pair) => !pair.puzzle || !pair.answer)) {
      messageApi.warning("每组都需要上传题目迷宫和对应答案迷宫。");
      return;
    }

    setGenerating(true);
    try {
      const [color, outline] = await Promise.all([
        loadImage(colorBackground),
        loadImage(outlineBackground),
      ]);
      assertBackgrounds(color, outline);
      const entries: BrowserZipEntry[] = [];

      for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[index];
        const puzzle = pair.puzzle!;
        const answer = pair.answer!;
        const fileName = safeBaseName(puzzle, index);
        const [puzzleImage, answerImage] = await Promise.all([
          loadImage(puzzle),
          loadImage(answer),
        ]);
        const [colorPuzzle, colorAnswer, outlinePuzzle, outlineAnswer] = await Promise.all([
          composeMaze(color, puzzleImage),
          composeMaze(color, answerImage),
          composeMaze(outline, puzzleImage),
          composeMaze(outline, answerImage),
        ]);
        const outputs = [
          ["color/puzzles", colorPuzzle],
          ["color/answers", colorAnswer],
          ["outline/puzzles", outlinePuzzle],
          ["outline/answers", outlineAnswer],
        ] as const;

        for (const [folder, blob] of outputs) {
          entries.push({
            name: `${folder}/${fileName}`,
            data: new Uint8Array(await blob.arrayBuffer()),
          });
        }

        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      downloadBrowserBlob(createBrowserZip(entries), `themed-mazes-${pairs.length}-sets.zip`);
      messageApi.success(`已生成 ${pairs.length} 组彩图和线框图，共 ${entries.length} 张成品图。`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "主题迷宫合成失败。");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      {contextHolder}
      <Card title="主题迷宫合成" variant="borderless" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary">
          上传同尺寸的彩色与线框主题背景，再为每组上传题目迷宫和答案迷宫。系统会保留背景装饰并叠加迷宫线条，输出两套成品 ZIP。
        </Typography.Paragraph>

        <Typography.Title level={5}>主题背景</Typography.Title>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            maxWidth: 760,
          }}
        >
          <ImageUploadSlot
            label="彩色主题背景图"
            file={colorBackground}
            onChange={(file) => void storeUploadedImage(file, setColorBackground)}
          />
          <ImageUploadSlot
            label="线框主题背景图"
            file={outlineBackground}
            onChange={(file) => void storeUploadedImage(file, setOutlineBackground)}
          />
        </div>

        <Space style={{ marginTop: 28, marginBottom: 12 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            迷宫配对
          </Typography.Title>
          <Button icon={<PlusOutlined />} onClick={addPair}>
            添加一组
          </Button>
        </Space>

        <div style={{ display: "grid", gap: 12, maxWidth: 920 }}>
          {pairs.map((pair, index) => (
            <div
              key={pair.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
                gap: 20,
                alignItems: "start",
                border: "1px solid #f0f0f0",
                borderRadius: 6,
                padding: 16,
              }}
            >
              <ImageUploadSlot
                label={`第 ${index + 1} 组 · 题目迷宫`}
                file={pair.puzzle}
                onChange={(file) =>
                  void storeUploadedImage(file, (image) => updatePair(pair.id, { puzzle: image }))
                }
              />
              <ImageUploadSlot
                label={`第 ${index + 1} 组 · 答案迷宫`}
                file={pair.answer}
                onChange={(file) =>
                  void storeUploadedImage(file, (image) => updatePair(pair.id, { answer: image }))
                }
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除第 ${index + 1} 组`}
                title="删除这一组"
                onClick={() => removePair(pair.id)}
              />
            </div>
          ))}
        </div>

        <Space style={{ marginTop: 20 }}>
          <Button type="primary" loading={generating} onClick={() => void handleGenerate()}>
            生成两类成品 ZIP
          </Button>
          <Typography.Text type="secondary">
            当前 {pairs.length} 组，预计输出 {pairs.length * 4} 张 PNG
          </Typography.Text>
        </Space>
      </Card>
    </>
  );
}
