"use client";

import { DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Form,
  Input,
  Space,
  Statistic,
  Typography,
  Upload,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";

import type { HomepageConfigRecord } from "@/lib/admin-types";

type HomepageConfigFormValues = {
  title: string;
  description: string;
  hero_image_url: string;
  seo_title: string;
  seo_description: string;
  footer_paragraph: string;
};

type HomepageConfigFormProps = {
  initialConfig: HomepageConfigRecord;
};

export function HomepageConfigForm({ initialConfig }: HomepageConfigFormProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<HomepageConfigFormValues>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const heroImageUrl = Form.useWatch("hero_image_url", form);

  const heroPreviewUrl = useMemo(() => {
    const value = heroImageUrl?.trim();
    if (!value) {
      return "";
    }
    if (/^(https?:)?\/\//i.test(value) || value.startsWith("/")) {
      return value;
    }
    return `/api/admin/homepage-config/preview?path=${encodeURIComponent(value)}`;
  }, [heroImageUrl]);

  const categoryPrintableCounts = useMemo(() => {
    try {
      const parsed = JSON.parse(initialConfig.category_printable_counts || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return [];
      }
      return Object.entries(parsed as Record<string, unknown>)
        .map(([slug, count]) => ({ slug, count: Number(count ?? 0) }))
        .filter((item) => Number.isFinite(item.count))
        .sort((a, b) => b.count - a.count);
    } catch {
      return [];
    }
  }, [initialConfig.category_printable_counts]);

  useEffect(() => {
    form.setFieldsValue({
      title: initialConfig.title,
      description: initialConfig.description,
      hero_image_url: initialConfig.hero_image_url,
      seo_title: initialConfig.seo_title,
      seo_description: initialConfig.seo_description,
      footer_paragraph: initialConfig.footer_paragraph,
    });
  }, [form, initialConfig]);

  async function handleSave(values: HomepageConfigFormValues) {
    setSaving(true);

    const payload = {
      title: values.title.trim(),
      description: values.description.trim(),
      hero_image_url: values.hero_image_url?.trim() ?? "",
      seo_title: values.seo_title?.trim() ?? "",
      seo_description: values.seo_description?.trim() ?? "",
      footer_paragraph: values.footer_paragraph?.trim() ?? "",
    };

    try {
      const response = await fetch("/api/admin/homepage-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as HomepageConfigRecord | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "保存首页配置失败。");
      }

      const savedConfig = data as HomepageConfigRecord;

      messageApi.success("首页配置已保存。");
      form.setFieldsValue({
        title: savedConfig.title,
        description: savedConfig.description,
        hero_image_url: savedConfig.hero_image_url,
        seo_title: savedConfig.seo_title,
        seo_description: savedConfig.seo_description,
        footer_paragraph: savedConfig.footer_paragraph,
      });
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "保存首页配置失败，请稍后重试。";
      messageApi.error(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  const uploadProps = useMemo<UploadProps>(
    () => ({
      accept: "image/png,image/jpeg,image/webp",
      maxCount: 1,
      customRequest: async ({ file, onError, onSuccess }) => {
        setUploading(true);
        try {
          if (!(file instanceof File)) {
            throw new Error("无效的图片文件。");
          }

          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch("/api/admin/homepage-config/upload", {
            method: "POST",
            body: formData,
          });
          const data = (await response.json()) as
            | { hero_image_url: string; local_file_path: string; file_name: string }
            | { error?: string };

          if (!response.ok || !("hero_image_url" in data)) {
            throw new Error(
              "error" in data && data.error ? data.error : "上传首页图片失败。",
            );
          }

          form.setFieldValue("hero_image_url", data.hero_image_url.trim());
          messageApi.success("图片已转为 WebP 并压缩，保存后生效。");
          onSuccess?.({});
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "上传首页图片失败。";
          messageApi.error(errorMessage);
          onError?.(new Error(errorMessage));
        } finally {
          setUploading(false);
        }
      },
      fileList: heroPreviewUrl
        ? ([
            {
              uid: heroImageUrl || "homepage-hero",
              name: heroImageUrl?.split("/").pop() || "homepage-hero.webp",
              status: "done",
              url: heroPreviewUrl,
              thumbUrl: heroPreviewUrl,
            },
          ] satisfies UploadFile[])
        : [],
      onPreview: (file) => {
        const previewUrl = file.url || file.thumbUrl;
        if (previewUrl) {
          window.open(previewUrl, "_blank", "noopener,noreferrer");
        }
      },
      onRemove: () => {
        form.setFieldValue("hero_image_url", "");
        return true;
      },
      listType: "picture-card",
      showUploadList: {
        showPreviewIcon: true,
        showRemoveIcon: true,
        removeIcon: <DeleteOutlined />,
      },
    }),
    [form, heroImageUrl, heroPreviewUrl, messageApi],
  );

  return (
    <>
      {contextHolder}
      <Card title="首页管理" variant="borderless">
        <Typography.Text type="secondary">
          配置首页标题、描述和统计信息。素材数量会在一键同步时自动刷新。
        </Typography.Text>
        <div style={{ marginTop: 16, marginBottom: 24 }}>
          <Space size={16} wrap>
            <Statistic title="活跃素材总数" value={initialConfig.total_printable_count} />
            {categoryPrintableCounts.map((item) => (
              <Statistic key={item.slug} title={item.slug} value={item.count} />
            ))}
          </Space>
        </div>
        <Form<HomepageConfigFormValues>
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onFinish={(values) => void handleSave(values)}
        >
          <Form.Item
            label="首页标题"
            name="title"
            rules={[
              { required: true, message: "请输入首页标题" },
              { whitespace: true, message: "标题不能只包含空格" },
            ]}
          >
            <Input placeholder="例如：Free Printable Worksheets for Kids" />
          </Form.Item>
          <Form.Item
            label="首页描述"
            name="description"
            rules={[
              { required: true, message: "请输入首页描述" },
              { whitespace: true, message: "描述不能只包含空格" },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder="例如：Download printable coloring pages, tracing sheets and puzzle activities."
            />
          </Form.Item>
          <Form.Item label="SEO 标题" name="seo_title">
            <Input placeholder="留空时可由前台自行兜底处理" />
          </Form.Item>
          <Form.Item label="SEO 描述" name="seo_description">
            <Input.TextArea rows={3} placeholder="用于首页 SEO 描述，可留空" />
          </Form.Item>
          <Form.Item label="底部文案" name="footer_paragraph">
            <Input.TextArea rows={4} placeholder="用于首页底部说明文案，可留空" />
          </Form.Item>
          <Form.Item name="hero_image_url" hidden>
            <Input type="hidden" />
          </Form.Item>
          <Form.Item label="首页主图">
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              支持 PNG、JPG 和 WebP。图片会缩放至最长边不超过 1024px，并以 WebP（质量 86）保存。
            </Typography.Text>
            <Upload {...uploadProps} disabled={uploading}>
              {!heroImageUrl?.trim() ? (
                <button
                  type="button"
                  style={{ border: 0, background: "none", cursor: "pointer" }}
                >
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>{uploading ? "处理中" : "选择图片"}</div>
                </button>
              ) : null}
            </Upload>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={saving} block>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
