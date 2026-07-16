"use client";

import { DownloadOutlined, FilePdfOutlined } from "@ant-design/icons";
import { Button, Card, Form, InputNumber, Select, Space, Tag, Typography, message } from "antd";
import { useMemo, useState } from "react";

import { createBrowserZip, downloadBrowserBlob, type BrowserZipEntry } from "@/lib/browser-zip";
import {
  generateTracingCollection,
  TRACING_PAGE_SIZE,
  TRACING_TYPE_OPTIONS,
  type TracingDifficulty,
  type TracingLineType,
  type TracingPage,
} from "@/lib/line-tracing-generator";

import styles from "./line-tracing-generator-page.module.css";

type FormValues = {
  types: TracingLineType[];
  difficulty: TracingDifficulty;
  countPerType: number;
};

const ALL_TYPES = TRACING_TYPE_OPTIONS.map((item) => item.value);
const DIFFICULTIES = [
  { value: "easy", label: "Easy（短路径 / 大间距）" },
  { value: "medium", label: "Medium（更多重复 / 中等密度）" },
  { value: "hard", label: "Hard（长路径 / 高密度）" },
];

function svgToBlob(svg: string) {
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

async function svgToPng(svg: string) {
  const blob = svgToBlob(svg);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("SVG 渲染失败。"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = TRACING_PAGE_SIZE.width;
    canvas.height = TRACING_PAGE_SIZE.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片画布。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => png ? resolve(png) : reject(new Error("PNG 导出失败。")), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pngBytes(page: TracingPage) {
  return new Uint8Array(await (await svgToPng(page.svg)).arrayBuffer());
}

export function LineTracingGeneratorPage() {
  const [form] = Form.useForm<FormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [exporting, setExporting] = useState<"zip" | "pdf" | null>(null);
  const types = Form.useWatch("types", form) ?? ALL_TYPES;
  const difficulty = Form.useWatch("difficulty", form) ?? "easy";
  const countPerType = Form.useWatch("countPerType", form) ?? 5;

  const pages = useMemo(() => generateTracingCollection({
    types: types.length ? types : ALL_TYPES,
    difficulty,
    countPerType: Math.max(1, Math.min(20, Number(countPerType))),
  }), [countPerType, difficulty, types]);
  const previews = useMemo(() => {
    const firstByType = new Map<TracingLineType, TracingPage>();
    for (const page of pages) {
      if (!firstByType.has(page.type)) firstByType.set(page.type, page);
    }
    return [...firstByType.values()];
  }, [pages]);

  async function exportZip() {
    setExporting("zip");
    try {
      const entries: BrowserZipEntry[] = [];
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        entries.push({ name: `svg/${page.type}/${page.fileName}.svg`, data: new TextEncoder().encode(page.svg) });
        entries.push({ name: `png/${page.type}/${page.fileName}.png`, data: await pngBytes(page) });
        if ((index + 1) % 5 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      downloadBrowserBlob(createBrowserZip(entries), `line-tracing-${difficulty}-${pages.length}-pages.zip`);
      messageApi.success(`已生成 ${pages.length} 页 SVG + PNG。`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成失败，请重试。");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    setExporting("pdf");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      for (let index = 0; index < pages.length; index += 1) {
        const png = await pdf.embedPng(await pngBytes(pages[index]));
        const sheet = pdf.addPage([612, 792]);
        sheet.drawImage(png, { x: 0, y: 0, width: 612, height: 792 });
        if ((index + 1) % 5 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      downloadBrowserBlob(new Blob([await pdf.save() as unknown as BlobPart], { type: "application/pdf" }), `line-tracing-${difficulty}-${pages.length}-pages.pdf`);
      messageApi.success(`已生成 ${pages.length} 页 PDF。`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "PDF 生成失败，请重试。");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className={styles.page}>
      {contextHolder}
      <Typography.Title level={2}>Line Tracing 生成器</Typography.Title>
      <Typography.Paragraph type="secondary">
        使用 SVG 几何路径生成高精度描线练习纸。默认 6 类各 5 页，共 30 页。
      </Typography.Paragraph>

      <Card className={styles.formCard} title="生成设置">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ types: ALL_TYPES, difficulty: "easy", countPerType: 5 }}
        >
          <Form.Item label="线条类型" name="types" rules={[{ required: true, message: "请至少选择一种线条。" }]}>
            <Select mode="multiple" options={TRACING_TYPE_OPTIONS.map(({ value, label }) => ({ value, label }))} />
          </Form.Item>
          <Space size="large" wrap align="start">
            <Form.Item label="难度" name="difficulty">
              <Select style={{ width: 260 }} options={DIFFICULTIES} />
            </Form.Item>
            <Form.Item label="每类页数" name="countPerType" tooltip="前 5 页分别使用不同版式；超过 5 页会在版式内继续变化路径参数。">
              <InputNumber min={1} max={20} precision={0} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Typography.Paragraph className={styles.summary}>
            当前将生成 <strong>{types.length || ALL_TYPES.length}</strong> 类 × <strong>{Math.max(1, Number(countPerType))}</strong> 页 = <strong>{pages.length}</strong> 页
          </Typography.Paragraph>
          <Space wrap style={{ marginTop: 18 }}>
            <Button type="primary" icon={<DownloadOutlined />} loading={exporting === "zip"} disabled={exporting !== null} onClick={exportZip}>
              下载 SVG + PNG ZIP
            </Button>
            <Button icon={<FilePdfOutlined />} loading={exporting === "pdf"} disabled={exporting !== null} onClick={exportPdf}>
              下载整本 PDF
            </Button>
          </Space>
        </Form>
      </Card>

      <Typography.Title level={3}>版式预览</Typography.Title>
      <div className={styles.previewGrid}>
        {previews.map((page) => (
          <Card key={page.type} className={styles.previewCard} styles={{ body: { padding: 12 } }}>
            <div className={styles.preview} dangerouslySetInnerHTML={{ __html: page.svg }} />
            <div className={styles.previewLabel}>
              <Typography.Text strong>{page.title}</Typography.Text>
              <Tag>{page.variant}</Tag>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
