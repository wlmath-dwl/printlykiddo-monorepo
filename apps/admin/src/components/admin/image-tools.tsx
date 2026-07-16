"use client";

import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

const SIZE_PRESETS = [128, 256, 512, 768, 1024];
const DEFAULT_SIZE = 512;
const WEBP_QUALITY = 80;

function revokeObjectUrl(url: string | null) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImageTools() {
  const [messageApi, contextHolder] = message.useMessage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState("converted.webp");
  const [resultBytes, setResultBytes] = useState(0);
  const [selectedSize, setSelectedSize] = useState<number>(DEFAULT_SIZE);
  const [converting, setConverting] = useState(false);

  useEffect(() => () => {
    revokeObjectUrl(resultPreviewUrl);
  }, [resultPreviewUrl]);

  const convertFile = useCallback(
    async (file: File, size: number) => {
      setConverting(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("size", String(size));

        const response = await fetch("/api/admin/image-tools/webp", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "转换 WebP 失败。");
        }

        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition");
        const matchedFileName = disposition?.match(/filename="([^"]+)"/i)?.[1];
        const nextPreviewUrl = URL.createObjectURL(blob);

        revokeObjectUrl(resultPreviewUrl);
        setResultPreviewUrl(nextPreviewUrl);
        setResultFileName(
          matchedFileName || `${file.name.replace(/\.[^.]+$/i, "") || "converted"}-${size}.webp`,
        );
        setResultBytes(blob.size);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "转换 WebP 失败，请稍后重试。";
        messageApi.error(errorMessage);
      } finally {
        setConverting(false);
      }
    },
    [messageApi, resultPreviewUrl],
  );

  const uploadProps = useMemo<UploadProps>(
    () => ({
      accept: "image/*",
      maxCount: 1,
      showUploadList: false,
      beforeUpload: (file) => {
        const nextFile = file as File;
        revokeObjectUrl(resultPreviewUrl);
        setSelectedFile(nextFile);
        setResultPreviewUrl(null);
        setResultBytes(0);
        void convertFile(nextFile, selectedSize);
        return false;
      },
    }),
    [convertFile, resultPreviewUrl, selectedSize],
  );

  const handleSizeChange = useCallback(
    (size: number) => {
      setSelectedSize(size);

      if (selectedFile) {
        void convertFile(selectedFile, size);
      }
    },
    [convertFile, selectedFile],
  );

  const handleDownload = useCallback(() => {
    if (!resultPreviewUrl) {
      messageApi.warning("请先生成 WebP 结果。");
      return;
    }

    const link = document.createElement("a");
    link.href = resultPreviewUrl;
    link.download = resultFileName;
    link.click();
  }, [messageApi, resultFileName, resultPreviewUrl]);

  return (
    <>
      {contextHolder}
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Card variant="borderless">
          <Space wrap size={12}>
            <Upload {...uploadProps}>
              <Button type="primary" icon={<UploadOutlined />} loading={converting}>
                上传图片
              </Button>
            </Upload>
            {SIZE_PRESETS.map((size) => (
              <Tag
                key={size}
                color={selectedSize === size ? "blue" : undefined}
                style={{ cursor: "pointer", padding: "6px 12px", marginInlineEnd: 0 }}
                onClick={() => handleSizeChange(size)}
              >
                {size}
              </Tag>
            ))}
            <Tag>正方形</Tag>
            <Tag>质量 {WEBP_QUALITY}</Tag>
            <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!resultPreviewUrl}>
              下载 WebP
            </Button>
          </Space>
          <div style={{ marginTop: 12 }}>
            <Typography.Text type="secondary">
              {selectedFile ? `当前文件：${selectedFile.name}` : "请先上传一张图片。"}
            </Typography.Text>
          </div>
        </Card>

        <Card title="处理结果" variant="borderless" extra={resultPreviewUrl ? resultFileName : undefined}>
          {resultPreviewUrl ? (
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <img
                src={resultPreviewUrl}
                alt="WebP 转换结果"
                style={{
                  width: "100%",
                  maxWidth: 520,
                  aspectRatio: "1 / 1",
                  objectFit: "contain",
                  borderRadius: 12,
                  background: "#fafafa",
                }}
              />
              <Typography.Text type="secondary">
                输出尺寸：{selectedSize} x {selectedSize}，文件大小：{formatBytes(resultBytes)}
              </Typography.Text>
            </Space>
          ) : (
            <Typography.Text type="secondary">
              上传图片后会直接生成 {selectedSize} x {selectedSize} 的 WebP 结果。
            </Typography.Text>
          )}
        </Card>
      </Space>
    </>
  );
}
