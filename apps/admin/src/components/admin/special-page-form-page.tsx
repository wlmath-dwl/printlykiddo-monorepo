"use client";

import {
  BulbOutlined,
  DeleteOutlined,
  DownloadOutlined,
  HolderOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tree,
  Typography,
  Upload,
  message,
} from "antd";
import type { DataNode } from "antd/es/tree";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Key, useEffect, useMemo, useState } from "react";

import type {
  CategoryTreeNode,
  SpecialPageRecord,
  SpecialPageStatus,
} from "@/lib/admin-types";

type SpecialPageFormValues = {
  title: string;
  slug?: string;
  subtitle?: string | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  hero_image_url?: string | null;
  card_image_url?: string | null;
  theme_color: string;
  status: SpecialPageStatus;
  sort_order: number;
};

type SpecialPageFormPageProps = {
  specialPageId?: number;
  initialValues: SpecialPageFormValues & { content_json: string };
  categoryTree: CategoryTreeNode[];
  backHref?: string;
};

type SpecialPageCategoryItem = {
  type: "category";
  group: "Main";
  refId: number;
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
  sortOrder: number;
};

type CategoryOption = {
  id: number;
  name: string;
  nameZh: string | null;
  slugPath: string[];
  url: string;
  imageUrl: string | null;
  displayImageUrl: string | null;
  depth: number;
  isActive: boolean;
};

type SpecialPageContent = {
  items?: Array<Partial<SpecialPageCategoryItem> & { type?: string; refId?: number | null }>;
};

type SpecialPageImageKind = "hero" | "card";
type SpecialPageImageField = "hero_image_url" | "card_image_url";

type UploadedSpecialPageHero = {
  image_url?: string;
  hero_image_url: string;
  variant?: SpecialPageImageKind;
  local_file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
};

function isUploadedSpecialPageHero(value: UploadedSpecialPageHero | { error?: string }): value is UploadedSpecialPageHero {
  return "hero_image_url" in value && typeof value.hero_image_url === "string";
}

function normalizeImageUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `/${trimmed}`;
}

function buildCategoryImagePreviewUrl(imageId: string | null | undefined) {
  const trimmed = imageId?.trim();
  if (!trimmed) {
    return null;
  }

  const searchParams = new URLSearchParams();
  searchParams.set("id", trimmed);
  return `/api/admin/categories/images/preview?${searchParams.toString()}`;
}

function buildManagedImagePreviewUrl(imageUrl: string | null | undefined) {
  const trimmed = imageUrl?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }

  const searchParams = new URLSearchParams();
  searchParams.set("path", trimmed);
  return `/api/admin/homepage-config/preview?${searchParams.toString()}`;
}

function buildManagedImageDownloadFileName(imageUrl: string | null | undefined, fallback: string) {
  const trimmed = imageUrl?.trim();
  if (!trimmed) {
    return fallback;
  }

  const pathname = /^https?:\/\//i.test(trimmed) ? new URL(trimmed).pathname : trimmed;
  return pathname.split("/").filter(Boolean).at(-1) || fallback;
}

function flattenCategories(nodes: CategoryTreeNode[], parentSlugs: string[] = [], depth = 1) {
  const result: CategoryOption[] = [];

  nodes.forEach((node) => {
    const slugPath = [...parentSlugs, node.slug];
    const option: CategoryOption = {
      id: node.id,
      name: node.name,
      nameZh: node.name_zh,
      slugPath,
      url: `/${slugPath.join("/")}`,
      imageUrl: normalizeImageUrl(node.seo_image_url),
      displayImageUrl: buildCategoryImagePreviewUrl(node.cover_image) || normalizeImageUrl(node.seo_image_url),
      depth,
      isActive: node.is_active,
    };
    result.push(option);
    result.push(...flattenCategories(node.children, slugPath, depth + 1));
  });

  return result;
}

function filterActiveCategoryTree(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  return nodes
    .filter((node) => node.is_active)
    .map((node) => ({
      ...node,
      children: filterActiveCategoryTree(node.children),
    }));
}

function buildTreeData(nodes: CategoryTreeNode[], optionsById: Map<number, CategoryOption>): DataNode[] {
  return nodes.map((node) => {
    const option = optionsById.get(node.id);
    const selectable = option?.depth === 3 && option.isActive;

    return {
      key: node.id,
      selectable,
      title: (
        <Space size={8}>
          {option?.displayImageUrl ? (
            <Image
              src={option.displayImageUrl}
              alt={node.name}
              width={28}
              height={28}
              preview={false}
              style={{ objectFit: "cover", borderRadius: 6 }}
              fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
            />
          ) : (
            <Avatar shape="square" size={28}>
              {node.name.slice(0, 1)}
            </Avatar>
          )}
          <span>
            {node.name}
            {node.name_zh ? (
              <Typography.Text type="secondary" style={{ marginLeft: 6 }}>
                {node.name_zh}
              </Typography.Text>
            ) : null}
          </span>
        </Space>
      ),
      children: buildTreeData(node.children, optionsById),
    };
  });
}

function parseSelectedItems(contentJson: string, optionsById: Map<number, CategoryOption>) {
  try {
    const parsed = JSON.parse(contentJson || "{}") as SpecialPageContent;
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return items
      .filter((item) => item.type === "category" && typeof item.refId === "number")
      .map((item, index): SpecialPageCategoryItem | null => {
        const option = optionsById.get(Number(item.refId));
        if (!option) {
          return null;
        }

        return {
          type: "category",
          group: "Main",
          refId: option.id,
          title: item.title?.trim() || option.name,
          description: item.description?.trim() || "",
          url: option.url,
          imageUrl: option.imageUrl,
          sortOrder: index,
        };
      })
      .filter((item): item is SpecialPageCategoryItem => Boolean(item));
  } catch {
    return [];
  }
}

function buildContentJson(items: SpecialPageCategoryItem[]) {
  return JSON.stringify(
    {
      items: items.map((item, index) => ({
        ...item,
        sortOrder: index,
      })),
    },
    null,
    2,
  );
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function buildSpecialPageImagePrompt(input: {
  title?: string | null;
  description?: string | null;
  themeColor?: string | null;
  items: SpecialPageCategoryItem[];
  kind: SpecialPageImageKind;
}) {
  const title = input.title?.trim() || "a seasonal printable collection";
  const description = input.description?.trim() || "A child-friendly collection of printable learning activities.";
  const themeColor = /^#[0-9A-F]{6}$/i.test(input.themeColor?.trim() || "")
    ? String(input.themeColor).trim().toUpperCase()
    : "#7ADDE8";
  const itemTopics = input.items
    .map((item) => item.title.trim())
    .filter(Boolean)
    .slice(0, 8);
  const visualAnchor = itemTopics[0] || title;
  const supportingTopics = itemTopics.slice(1, 4);
  const themeGuidance = supportingTopics.length > 0
    ? `Supporting theme references: ${supportingTopics.join(", ")}. These are context only; do not draw them as a checklist.`
    : "Supporting theme references: use only one subtle, relevant educational cue if needed.";
  const isHero = input.kind === "hero";
  const assetRules = isHero
    ? `ASSET
Type: responsive website hero background
Canvas: 16:9 landscape, 1600 x 900 px

COMPOSITION
- Build one continuous full-color environment, never a split layout or poster.
- Keep the left 40% calm and text-safe: soft sky, a gentle gradient, or a simple environmental surface only.
- Put the only focal cluster on the center-right or right side.
- Use "${visualAnchor}" as the single primary subject.
- Add at most two secondary figures or objects and at most one small prop.
- If characters appear, they must perform one simple shared action related to the collection.
- Keep important subjects away from every edge for responsive cover cropping.
- Use the outer edges only as quiet crop-safe scenery.`
    : `ASSET
Type: UI collection thumbnail
Canvas: 1:1 square, 512 x 512 px

COMPOSITION
- Treat this as a close-up crop from the hero's visual world, not a separate illustration.
- Use "${visualAnchor}" as the one main subject, large and immediately readable.
- Allow at most one small supporting prop.
- Use a simple full-color environmental background with shallow depth.
- Keep a clean silhouette and comfortable breathing room for small-size display.
- Do not add a second focal point or build a narrative scene.`;

  return `Create a ${isHero ? "wide hero illustration" : "square thumbnail illustration"} for PrintlyKiddo.

COLLECTION
Title: ${title}
Context: ${description}
Theme color: ${themeColor}
Visual anchor: ${visualAnchor}
${themeGuidance}

SYSTEM INTENT
This is a reusable UI visual for a printable educational resource website, not narrative artwork. Communicate one theme with one clear focal subject. Hero and card must feel like two crops from the same visual system.

${assetRules}

SHARED VISUAL SYSTEM
- Soft flat children's storybook illustration
- Warm pastel palette anchored by ${themeColor}, with bright but gentle supporting colors
- Clean rounded shapes, simple shading, soft linework, gentle lighting
- Consistent character design, palette, atmosphere, and rendering across hero and card
- Educational website aesthetic; no imitation of an animation or entertainment IP

BACKGROUND
- Relevant pastel environment with simple depth and minimal detail
- Full color across the canvas; no plain white or transparent background
- Background supports the subject and never competes with it

RESTRICTIONS
- No text, letters, numbers, logos, labels, signage, or watermark
- No collage, inventory layout, worksheet montage, sticker sheet, or floating-object poster
- No multiple scenes, dense props, scattered stationery, or decorative clutter
- No complex storytelling, dramatic action, exaggerated poses, or large character groups
- No photorealism, glossy 3D rendering, hard icon style, or dark dramatic lighting

OUTPUT
Clean WebP-friendly illustration with crisp edges, optimized for responsive UI scaling and cropping.`;
}

export function SpecialPageFormPage({
  specialPageId,
  initialValues,
  categoryTree,
  backHref = "/admin/special-pages",
}: SpecialPageFormPageProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<SpecialPageFormValues>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingCard, setUploadingCard] = useState(false);
  const [hoveredImageKind, setHoveredImageKind] = useState<SpecialPageImageKind | null>(null);
  const [promptImageKind, setPromptImageKind] = useState<SpecialPageImageKind | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const isEdit = typeof specialPageId === "number";
  const heroImageUrl = Form.useWatch("hero_image_url", form);
  const cardImageUrl = Form.useWatch("card_image_url", form);
  const watchedTitle = Form.useWatch("title", form);
  const watchedDescription = Form.useWatch("description", form);
  const watchedThemeColor = Form.useWatch("theme_color", form);
  const heroPreviewUrl = buildManagedImagePreviewUrl(heroImageUrl);
  const cardPreviewUrl = buildManagedImagePreviewUrl(cardImageUrl);
  const heroDownloadFileName = buildManagedImageDownloadFileName(heroImageUrl, "special-page-hero.webp");
  const cardDownloadFileName = buildManagedImageDownloadFileName(cardImageUrl, "special-page-card.webp");

  const activeCategoryTree = useMemo(() => filterActiveCategoryTree(categoryTree), [categoryTree]);
  const categoryOptions = useMemo(() => flattenCategories(activeCategoryTree), [activeCategoryTree]);
  const optionsById = useMemo(
    () => new Map(categoryOptions.map((option) => [option.id, option])),
    [categoryOptions],
  );
  const treeData = useMemo(() => buildTreeData(activeCategoryTree, optionsById), [activeCategoryTree, optionsById]);
  const [selectedItems, setSelectedItems] = useState<SpecialPageCategoryItem[]>(() =>
    parseSelectedItems(initialValues.content_json, optionsById),
  );
  const currentImagePrompt = useMemo(
    () =>
      promptImageKind
        ? buildSpecialPageImagePrompt({
            title: watchedTitle || initialValues.title,
            description: watchedDescription || initialValues.description,
            themeColor: watchedThemeColor || initialValues.theme_color,
            items: selectedItems,
            kind: promptImageKind,
          })
        : "",
    [initialValues.description, initialValues.theme_color, initialValues.title, promptImageKind, selectedItems, watchedDescription, watchedThemeColor, watchedTitle],
  );

  useEffect(() => {
    form.setFieldsValue(initialValues);
    setSelectedItems(parseSelectedItems(initialValues.content_json, optionsById));
  }, [form, initialValues, optionsById]);

  function handleSelectCategory(keys: Key[]) {
    const id = Number(keys[0]);
    const option = optionsById.get(id);
    if (!option || option.depth !== 3 || !option.isActive) {
      return;
    }
    if (selectedItems.some((item) => item.refId === option.id)) {
      messageApi.info("这个三级页面已经添加过了。");
      return;
    }

    setSelectedItems((items) => [
      ...items,
      {
        type: "category",
        group: "Main",
        refId: option.id,
        title: option.name,
        description: "",
        url: option.url,
        imageUrl: option.imageUrl,
        sortOrder: items.length,
      },
    ]);
  }

  function handleRemove(index: number) {
    setSelectedItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
  }

  function getDisplayImageUrl(item: SpecialPageCategoryItem) {
    return optionsById.get(item.refId)?.displayImageUrl || normalizeImageUrl(item.imageUrl);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    setSelectedItems((items) => moveItem(items, dragIndex, targetIndex));
    setDragIndex(null);
  }

  function handleRemoveSpecialPageImage(fieldName: SpecialPageImageField) {
    form.setFieldValue(fieldName, "");
    messageApi.success(fieldName === "hero_image_url" ? "Hero 图片已移除，保存后生效。" : "卡片小图已移除，保存后生效。");
  }

  function renderSpecialPageImagePreview(input: {
    kind: SpecialPageImageKind;
    previewUrl: string | null;
    alt: string;
    emptyText: string;
    width: number;
    height: number;
    fieldName: SpecialPageImageField;
  }) {
    const isHovered = hoveredImageKind === input.kind;

    if (!input.previewUrl) {
      return (
        <div
          style={{
            width: input.width,
            height: input.height,
            display: "grid",
            placeItems: "center",
            border: "1px dashed #d9d9d9",
            borderRadius: 8,
            color: "#999",
            background: "#fafafa",
          }}
        >
          {input.emptyText}
        </div>
      );
    }

    return (
      <div
        onMouseEnter={() => setHoveredImageKind(input.kind)}
        onMouseLeave={() => setHoveredImageKind(null)}
        style={{
          width: input.width,
          height: input.height,
          position: "relative",
          overflow: "hidden",
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        <Image
          src={input.previewUrl}
          alt={input.alt}
          width={input.width}
          height={input.height}
          style={{
            objectFit: "cover",
            display: "block",
          }}
          fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
        />
        <div
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,0.38)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? "auto" : "none",
            position: "absolute",
            transition: "opacity 0.16s ease",
            zIndex: 2,
          }}
        >
          <Button
            danger
            shape="circle"
            icon={<DeleteOutlined />}
            aria-label={input.kind === "hero" ? "删除 Hero 图片" : "删除卡片小图"}
            title={input.kind === "hero" ? "删除 Hero 图片" : "删除卡片小图"}
            onClick={() => handleRemoveSpecialPageImage(input.fieldName)}
          />
        </div>
      </div>
    );
  }

  async function handleSpecialPageImageUpload(file: File, fieldName: SpecialPageImageField) {
    const isHero = fieldName === "hero_image_url";
    if (isHero) {
      setUploadingHero(true);
    } else {
      setUploadingCard(true);
    }
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "slug",
        String(form.getFieldValue("slug") || form.getFieldValue("title") || ""),
      );
      formData.append("variant", isHero ? "hero" : "card");

      const response = await fetch("/api/admin/special-pages/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadedSpecialPageHero | { error?: string };

      if (!response.ok || !isUploadedSpecialPageHero(data)) {
        throw new Error("error" in data ? data.error : "上传专题图片失败。");
      }

      form.setFieldValue(fieldName, data.image_url || data.hero_image_url);
      messageApi.success(isHero ? "专题 Hero 图片已上传并压缩。" : "专题卡片小图已上传并压缩。");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "上传专题图片失败。");
    } finally {
      if (isHero) {
        setUploadingHero(false);
      } else {
        setUploadingCard(false);
      }
    }
  }

  async function handleSave(values: SpecialPageFormValues) {
    setSaving(true);

    try {
      const response = await fetch(
        isEdit ? `/api/admin/special-pages/${specialPageId}` : "/api/admin/special-pages",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: values.title.trim(),
            slug: values.slug?.trim() || "",
            subtitle: values.subtitle?.trim() || null,
            description: values.description?.trim() || null,
            seo_title: values.seo_title?.trim() || null,
            seo_description: values.seo_description?.trim() || null,
            hero_image_url: values.hero_image_url?.trim() || null,
            card_image_url: values.card_image_url?.trim() || null,
            theme_color: values.theme_color?.trim().toUpperCase() || "#7ADDE8",
            status: values.status,
            sort_order: Number(values.sort_order ?? 0),
            content_json: buildContentJson(selectedItems),
          }),
        },
      );
      const data = (await response.json()) as SpecialPageRecord | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "保存专题页失败。");
      }

      messageApi.success(isEdit ? "专题页已更新。" : "专题页已创建。");
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      router.push(backHref);
      router.refresh();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "保存专题页失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {contextHolder}
      <Card
        title={isEdit ? "编辑专题页" : "创建专题页"}
        variant="borderless"
        extra={<Link href={backHref}>返回列表</Link>}
      >
        <Form<SpecialPageFormValues>
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={(values) => void handleSave(values)}
        >
          <Form.Item
            label="专题标题"
            name="title"
            rules={[{ required: true, message: "请输入专题标题" }]}
          >
            <Input placeholder="例如：Back to School Printables" />
          </Form.Item>
          <Form.Item label="Slug" name="slug">
            <Input placeholder="留空时自动生成，例如 back-to-school-printables" />
          </Form.Item>
          <Form.Item label="副标题" name="subtitle">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="顶部描述" name="description">
            <Input.TextArea rows={3} placeholder="专题页顶部展示文案" />
          </Form.Item>
          <Form.Item
            label="专题主题色"
            name="theme_color"
            extra="用于首页和专题详情的 Hero 背景与蒙层，也会写入图片生成提示词。"
            rules={[
              { required: true, message: "请选择专题主题色" },
              { pattern: /^#[0-9A-Fa-f]{6}$/, message: "请输入 6 位十六进制颜色，例如 #7ADDE8" },
            ]}
          >
            <Input type="color" style={{ width: 96, height: 40, padding: 4 }} />
          </Form.Item>
          <Form.Item label="SEO Title" name="seo_title">
            <Input placeholder="可选；为空时前台可按 title 拼接" />
          </Form.Item>
          <Form.Item label="SEO Description" name="seo_description">
            <Input.TextArea rows={3} placeholder="可选；用于专题页 meta description" />
          </Form.Item>
          <Form.Item name="hero_image_url" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="Hero Image">
            <Space align="start" size={16} wrap>
              {renderSpecialPageImagePreview({
                kind: "hero",
                previewUrl: heroPreviewUrl,
                alt: "专题 Hero 预览",
                emptyText: "暂无图片",
                width: 240,
                height: 135,
                fieldName: "hero_image_url",
              })}
              <Space orientation="vertical" size={8}>
                <Space wrap>
                  <Upload
                    accept="image/png,image/jpeg,image/webp"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      void handleSpecialPageImageUpload(file as File, "hero_image_url");
                      return Upload.LIST_IGNORE;
                    }}
                  >
                    <Button icon={<UploadOutlined />} loading={uploadingHero}>
                      {heroImageUrl ? "替换图片" : "选择图片"}
                    </Button>
                  </Upload>
                  {heroPreviewUrl ? (
                    <a href={heroPreviewUrl} download={heroDownloadFileName}>
                      <Button icon={<DownloadOutlined />}>下载图片</Button>
                    </a>
                  ) : null}
                  <Button icon={<BulbOutlined />} onClick={() => setPromptImageKind("hero")}>
                    Hero 提示词
                  </Button>
                </Space>
                {heroImageUrl ? (
                  <Typography.Text copyable type="secondary">
                    {heroImageUrl}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary">
                    上传后会裁切压缩为 1600 x 900 WebP，并保存到 imgs/special-pages 目录。
                  </Typography.Text>
                )}
              </Space>
            </Space>
          </Form.Item>
          <Form.Item name="card_image_url" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="Card Image">
            <Space align="start" size={16} wrap>
              {renderSpecialPageImagePreview({
                kind: "card",
                previewUrl: cardPreviewUrl,
                alt: "专题卡片小图预览",
                emptyText: "暂无小图",
                width: 96,
                height: 96,
                fieldName: "card_image_url",
              })}
              <Space orientation="vertical" size={8}>
                <Space wrap>
                  <Upload
                    accept="image/png,image/jpeg,image/webp"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      void handleSpecialPageImageUpload(file as File, "card_image_url");
                      return Upload.LIST_IGNORE;
                    }}
                  >
                    <Button icon={<UploadOutlined />} loading={uploadingCard}>
                      {cardImageUrl ? "替换小图" : "选择小图"}
                    </Button>
                  </Upload>
                  {cardPreviewUrl ? (
                    <a href={cardPreviewUrl} download={cardDownloadFileName}>
                      <Button icon={<DownloadOutlined />}>下载小图</Button>
                    </a>
                  ) : null}
                  <Button icon={<BulbOutlined />} onClick={() => setPromptImageKind("card")}>
                    小图提示词
                  </Button>
                </Space>
                {cardImageUrl ? (
                  <Typography.Text copyable type="secondary">
                    {cardImageUrl}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary">
                    上传后会裁切压缩为 512 x 512 WebP；用于专题管理和前台专题卡片。
                  </Typography.Text>
                )}
              </Space>
            </Space>
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              options={[
                { label: "草稿 draft", value: "draft" },
                { label: "发布 published", value: "published" },
                { label: "归档 archived", value: "archived" },
              ]}
            />
          </Form.Item>
          <Form.Item label="排序" name="sort_order">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="聚合页面">
            <Card
              size="small"
              title={`已选页面（${selectedItems.length}）`}
              extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setSelectorOpen(true)}>
                  添加页面
                </Button>
              }
            >
              {selectedItems.length === 0 ? (
                <Empty description="点击添加页面，从分类树选择三级页面" />
              ) : (
                <div role="list">
                  {selectedItems.map((item, index) => {
                    const displayImageUrl = getDisplayImageUrl(item);

                    return (
                      <div
                        key={`${item.type}-${item.refId}`}
                        role="listitem"
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDrop(index)}
                        style={{
                          border: "1px solid #f0f0f0",
                          borderRadius: 8,
                          marginBottom: 10,
                          padding: 12,
                          cursor: "grab",
                          background: dragIndex === index ? "#f5f5f5" : "#fff",
                        }}
                      >
                        <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                          <Space align="start">
                            {displayImageUrl ? (
                              <Image
                                src={displayImageUrl}
                                alt={item.title}
                                width={56}
                                height={56}
                                preview={false}
                                style={{ objectFit: "cover", borderRadius: 8 }}
                                fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
                              />
                            ) : (
                              <Avatar shape="square" size={56}>
                                {item.title.slice(0, 1)}
                              </Avatar>
                            )}
                            <div>
                              <Space>
                                <HolderOutlined style={{ color: "#999" }} />
                                <Typography.Text strong>{item.title}</Typography.Text>
                              </Space>
                              <div style={{ marginTop: 4 }}>
                                <Space orientation="vertical" size={2}>
                                  <Typography.Text type="secondary">ID: {item.refId}</Typography.Text>
                                  <Typography.Text copyable>{item.url}</Typography.Text>
                                </Space>
                              </div>
                            </div>
                          </Space>
                          <Space>
                            <Button
                              disabled={index === 0}
                              onClick={() => setSelectedItems((items) => moveItem(items, index, index - 1))}
                            >
                              上移
                            </Button>
                            <Button
                              disabled={index === selectedItems.length - 1}
                              onClick={() => setSelectedItems((items) => moveItem(items, index, index + 1))}
                            >
                              下移
                            </Button>
                            <Button
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemove(index)}
                            />
                          </Space>
                        </Space>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </Form.Item>

          <Modal
            title="添加三级分类页面"
            open={selectorOpen}
            footer={null}
            width={760}
            onCancel={() => setSelectorOpen(false)}
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              只能选择已启用的三级分类页面；点击节点后会添加到已选页面列表。
            </Typography.Paragraph>
            <div style={{ maxHeight: 620, overflow: "auto" }}>
              <Tree
                showLine
                defaultExpandAll
                treeData={treeData}
                onSelect={handleSelectCategory}
              />
            </div>
          </Modal>

          <Modal
            title={promptImageKind === "card" ? "专题卡片小图提示词" : "专题 Hero 图提示词"}
            open={promptImageKind !== null}
            onCancel={() => setPromptImageKind(null)}
            width={760}
            footer={[
              <Button key="close" onClick={() => setPromptImageKind(null)}>
                关闭
              </Button>,
            ]}
          >
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <Typography.Text type="secondary">
                {promptImageKind === "card"
                  ? "复制这段提示词生成 1:1 小方图，生成后回到这里上传即可。"
                  : "复制这段提示词生成 16:9 长方形 Hero 图，生成后回到这里上传即可。"}
              </Typography.Text>
              <Typography.Paragraph
                copyable={{
                  text: currentImagePrompt,
                  tooltips: ["复制提示词", "已复制"],
                }}
                style={{
                  whiteSpace: "pre-wrap",
                  background: "#fafafa",
                  border: "1px solid #f0f0f0",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 0,
                }}
              >
                {currentImagePrompt}
              </Typography.Paragraph>
            </Space>
          </Modal>

          <Space style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存专题页
            </Button>
            <Link href={backHref}>
              <Button>取消</Button>
            </Link>
          </Space>
        </Form>
      </Card>
    </>
  );
}
