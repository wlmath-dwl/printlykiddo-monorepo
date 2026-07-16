"use client";

import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Statistic,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { parseSvgMetadata, type SvgMetadata } from "@/lib/svg-outline";

import styles from "./svg-outline-generator.module.css";

const DEFAULT_SLICE_COUNT = 8;
const OUTLINE_COLOR = "#9ca3af";
const CUT_LINE_COLOR = "#ef4444";
const OUTLINE_CANVAS_MAX_SIDE = 720;

function downloadSvg(svgContent: string, fileName: string) {
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

function svgToDataUrl(svgContent: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("SVG 预览渲染失败。"));
    image.src = src;
  });
}

function extractSvgBody(svgContent: string) {
  const match = svgContent.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  return match?.[1]?.trim() ?? svgContent;
}

function buildOutsideMask(filled: Uint8Array, width: number, height: number) {
  const outside = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;

  const push = (x: number, y: number) => {
    const index = y * width + x;
    if (filled[index] || outside[index]) {
      return;
    }
    outside[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) {
      push(x - 1, y);
    }
    if (x + 1 < width) {
      push(x + 1, y);
    }
    if (y > 0) {
      push(x, y - 1);
    }
    if (y + 1 < height) {
      push(x, y + 1);
    }
  }

  return outside;
}

function buildOuterBoundaryMask(alpha: Uint8ClampedArray, width: number, height: number) {
  const filled = new Uint8Array(width * height);

  for (let index = 0; index < filled.length; index += 1) {
    filled[index] = alpha[index * 4 + 3] > 8 ? 1 : 0;
  }

  const outside = buildOutsideMask(filled, width, height);
  const boundary = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      if (!filled[index]) {
        continue;
      }

      const touchesOutside =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        outside[index - 1] === 1 ||
        outside[index + 1] === 1 ||
        outside[index - width] === 1 ||
        outside[index + width] === 1;

      if (touchesOutside) {
        boundary[index] = 1;
      }
    }
  }

  return boundary;
}

async function buildOutlinePreviewUrl(svgContent: string, metadata: SvgMetadata) {
  const width = Math.max(1, Math.round(metadata.viewBox.width));
  const height = Math.max(1, Math.round(metadata.viewBox.height));
  const scale = Math.min(OUTLINE_CANVAS_MAX_SIDE / Math.max(width, height), 2);
  const renderWidth = Math.max(1, Math.round(width * scale));
  const renderHeight = Math.max(1, Math.round(height * scale));

  const image = await loadImageElement(svgToDataUrl(svgContent));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = renderWidth;
  sourceCanvas.height = renderHeight;

  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) {
    throw new Error("无法创建 SVG 预览画布。");
  }

  sourceContext.drawImage(image, 0, 0, renderWidth, renderHeight);
  const imageData = sourceContext.getImageData(0, 0, renderWidth, renderHeight);
  const boundary = buildOuterBoundaryMask(imageData.data, renderWidth, renderHeight);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = renderWidth;
  maskCanvas.height = renderHeight;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) {
    throw new Error("无法创建外轮廓画布。");
  }

  const maskData = maskContext.createImageData(renderWidth, renderHeight);
  const rgb = {
    r: Number.parseInt(OUTLINE_COLOR.slice(1, 3), 16),
    g: Number.parseInt(OUTLINE_COLOR.slice(3, 5), 16),
    b: Number.parseInt(OUTLINE_COLOR.slice(5, 7), 16),
  };

  for (let index = 0; index < boundary.length; index += 1) {
    if (!boundary[index]) {
      continue;
    }
    const offset = index * 4;
    maskData.data[offset] = rgb.r;
    maskData.data[offset + 1] = rgb.g;
    maskData.data[offset + 2] = rgb.b;
    maskData.data[offset + 3] = 255;
  }

  maskContext.putImageData(maskData, 0, 0);

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = renderWidth;
  finalCanvas.height = renderHeight;
  const finalContext = finalCanvas.getContext("2d");
  if (!finalContext) {
    throw new Error("无法创建描红结果画布。");
  }

  const outlineRadius = Math.max(3, Math.round(Math.max(renderWidth, renderHeight) / 140));
  for (let dy = -outlineRadius; dy <= outlineRadius; dy += 1) {
    for (let dx = -outlineRadius; dx <= outlineRadius; dx += 1) {
      if (dx * dx + dy * dy <= outlineRadius * outlineRadius) {
        finalContext.drawImage(maskCanvas, dx, dy);
      }
    }
  }

  finalContext.drawImage(sourceCanvas, 0, 0);
  return finalCanvas.toDataURL("image/png");
}

function buildSlicedPreviewSvg(svgContent: string, metadata: SvgMetadata) {
  const body = extractSvgBody(svgContent);
  const { x, y, width, height } = metadata.viewBox;
  const sliceCount = DEFAULT_SLICE_COUNT;
  const sliceWidth = width / sliceCount;
  const labelBandHeight = Math.max(height * 0.18, 90);
  const totalHeight = height + labelBandHeight;
  const renderedHeight = metadata.height * (totalHeight / height);

  const lines = Array.from({ length: sliceCount - 1 }, (_, index) => {
    const lineX = x + sliceWidth * (index + 1);
    return `<line x1="${lineX}" y1="${y}" x2="${lineX}" y2="${y + height}" stroke="${CUT_LINE_COLOR}" stroke-width="${Math.max(width / 400, 2)}" stroke-dasharray="${Math.max(width / 80, 8)} ${Math.max(width / 120, 6)}" />`;
  }).join("\n  ");

  const labels = Array.from({ length: sliceCount }, (_, index) => {
    const centerX = x + sliceWidth * index + sliceWidth / 2;
    const labelY = y + height + labelBandHeight * 0.62;
    return `<text x="${centerX}" y="${labelY}" text-anchor="middle" font-size="${Math.max(width / 45, 18)}" font-family="Arial, sans-serif" font-weight="700" fill="#111827">${index + 1}</text>`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${metadata.width}" height="${renderedHeight}" viewBox="${x} ${y} ${width} ${totalHeight}" version="1.1">
  <g>
    ${body}
  </g>
  <rect x="${x}" y="${y + height}" width="${width}" height="${labelBandHeight}" fill="#ffffff" />
  <g>
    ${lines}
  </g>
  <g>
    ${labels}
  </g>
</svg>`;
}

export function SvgOutlineGenerator() {
  const [messageApi, contextHolder] = message.useMessage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [svgName, setSvgName] = useState("traced-image");
  const [resultSvg, setResultSvg] = useState("");
  const [outlinePreviewUrl, setOutlinePreviewUrl] = useState("");
  const [slicedPreviewSvg, setSlicedPreviewSvg] = useState("");
  const [metadata, setMetadata] = useState<SvgMetadata | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const resetGenerated = useCallback(() => {
    setResultSvg("");
    setOutlinePreviewUrl("");
    setSlicedPreviewSvg("");
    setMetadata(null);
  }, []);

  useEffect(() => {
    return () => {
      if (sourcePreviewUrl) {
        URL.revokeObjectURL(sourcePreviewUrl);
      }
    };
  }, [sourcePreviewUrl]);

  const generateFromFile = useCallback(
    async (file: File) => {
      setIsGenerating(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/admin/svg-outline/trace", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as {
          error?: string;
          svg?: string;
          metadata?: SvgMetadata;
        };

        if (!response.ok || !payload.svg) {
          throw new Error(payload.error || "图片转 SVG 失败，请稍后重试。");
        }

        const nextMetadata = payload.metadata ?? parseSvgMetadata(payload.svg);
        const outlineUrl = await buildOutlinePreviewUrl(payload.svg, nextMetadata);
        const slicedSvg = buildSlicedPreviewSvg(payload.svg, nextMetadata);

        setResultSvg(payload.svg);
        setMetadata(nextMetadata);
        setOutlinePreviewUrl(outlineUrl);
        setSlicedPreviewSvg(slicedSvg);
        messageApi.success("SVG 已生成，并已输出 3 张结果图。");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "图片转 SVG 失败，请稍后重试。";
        messageApi.error(errorMessage);
      } finally {
        setIsGenerating(false);
      }
    },
    [messageApi],
  );

  const loadImage = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file);
      setSelectedFile(file);
      setSourcePreviewUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        return previewUrl;
      });
      setSvgName(file.name.replace(/\.[^.]+$/i, "") || "traced-image");
      resetGenerated();
      messageApi.loading({
        content: "图片已上传，正在自动生成 SVG 预览...",
        key: "svg-outline-upload",
      });
      await generateFromFile(file);
      messageApi.destroy("svg-outline-upload");
    },
    [generateFromFile, messageApi, resetGenerated],
  );

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: ".png,.jpg,.jpeg,.bmp,image/png,image/jpeg,image/bmp",
      showUploadList: false,
      beforeUpload: async (file) => {
        await loadImage(file as File);
        return false;
      },
    }),
    [loadImage],
  );

  const handleDownload = useCallback(() => {
    if (!resultSvg) {
      messageApi.warning("请先生成结果。");
      return;
    }

    downloadSvg(resultSvg, `${svgName}-trace.svg`);
  }, [messageApi, resultSvg, svgName]);

  return (
    <div className={styles.page}>
      {contextHolder}
      <div className={styles.shell}>
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Card variant="borderless">
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                图片转 SVG
              </Typography.Title>
              <Typography.Text type="secondary">
                上传后立即自动生成 3 张结果图：原始 SVG、整体外轮廓描红图、竖条切割编号图。
              </Typography.Text>
            </Space>
          </Card>

          <Alert
            showIcon
            type="info"
            title="使用说明"
            description="当前支持 PNG、JPG、JPEG、BMP。上传后会自动输出 3 张结果图，不再提供额外参数调整。"
          />

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={6}>
              <Card title="控制面板" variant="borderless">
                <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                  <Upload {...uploadProps}>
                    <Button block type="primary" icon={<UploadOutlined />} loading={isGenerating}>
                      上传图片
                    </Button>
                  </Upload>

                  <Space wrap>
                    <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!resultSvg}>
                      下载 SVG
                    </Button>
                  </Space>

                  <Typography.Text type="secondary">
                    当前文件：{selectedFile ? selectedFile.name : "未上传"}
                  </Typography.Text>

                  {sourcePreviewUrl ? (
                    <div className={styles.sourceThumb}>
                      <img src={sourcePreviewUrl} alt="上传原图" className={styles.previewImage} />
                    </div>
                  ) : null}
                </Space>
              </Card>
            </Col>

            <Col xs={24} xl={18}>
              <Card title="预览" variant="borderless">
                <div className={styles.previewGrid}>
                  <div className={styles.previewPanel}>
                    <Typography.Text strong>1. 生成的 SVG 图</Typography.Text>
                    <div className={styles.previewBox}>
                      {resultSvg ? (
                        <div
                          className={styles.svgPreview}
                          dangerouslySetInnerHTML={{ __html: resultSvg }}
                        />
                      ) : (
                        <Empty description="上传后自动生成" />
                      )}
                    </div>
                  </div>

                  <div className={styles.previewPanel}>
                    <Typography.Text strong>2. 外轮廓描红图</Typography.Text>
                    <div className={styles.previewBox}>
                      {outlinePreviewUrl ? (
                        <img
                          src={outlinePreviewUrl}
                          alt="SVG 外轮廓描红图"
                          className={styles.previewImage}
                        />
                      ) : (
                        <Empty description="上传后自动生成" />
                      )}
                    </div>
                  </div>

                  <div className={styles.previewPanel}>
                    <Typography.Text strong>3. 竖条切割编号图</Typography.Text>
                    <div className={styles.previewBox}>
                      {slicedPreviewSvg ? (
                        <div
                          className={styles.svgPreview}
                          dangerouslySetInnerHTML={{ __html: slicedPreviewSvg }}
                        />
                      ) : (
                        <Empty description="上传后自动生成" />
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card variant="borderless">
                <Statistic title="画布宽度" value={metadata ? Math.round(metadata.width) : 0} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card variant="borderless">
                <Statistic title="画布高度" value={metadata ? Math.round(metadata.height) : 0} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card variant="borderless">
                <Statistic title="切割条数" value={DEFAULT_SLICE_COUNT} />
              </Card>
            </Col>
          </Row>
        </Space>
      </div>
    </div>
  );
}
