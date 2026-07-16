"use client";

import { UploadOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Form,
  Image,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
  TreeSelect,
  message,
} from "antd";
import Upload from "antd/es/upload";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ActiveRecord,
  CategoryTreeNode,
  ImgRecord,
} from "@/lib/admin-types";

type ImgFormValues = {
  category_id: number | null;
  active_id: number | null;
  title: string;
  slug: string;
  description: string;
  difficulty: number | null;
  sort_order: number;
  is_active: boolean;
  image_url: string;
  image_url_card: string;
  local_file_path: string | null;
  local_file_path_card: string | null;
};

type ImgFormPageProps = {
  imgId?: number;
  initialValues: ImgFormValues;
  categoryTree: CategoryTreeNode[];
  actives: ActiveRecord[];
  backHref?: string;
};

type UploadedImgFile = {
  image_url: string;
  image_url_card: string;
  local_file_path: string;
  local_file_path_card: string;
  file_name: string;
};

type CategoryTreeOption = {
  title: string;
  value: number;
  key: number;
  children: CategoryTreeOption[];
};

const { Text } = Typography;

const DIFFICULTY_OPTIONS = [
  { label: "不设置", value: 0 },
  { label: "Easy", value: 1 },
  { label: "Medium", value: 2 },
  { label: "Hard", value: 3 },
];

const IMAGE_PROXY_BASE_URL = (
  process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim() || "https://img.printlykiddo.com"
).replace(/\/+$/u, "");

function buildCategoryTreeData(nodes: CategoryTreeNode[]): CategoryTreeOption[] {
  return nodes.map((node) => ({
    title: node.name,
    value: node.id,
    key: node.id,
    children: buildCategoryTreeData(node.children),
  }));
}

function buildImgPreviewSrc(imageUrl?: string | null, localFilePath?: string | null) {
  if (!localFilePath?.trim()) {
    return null;
  }

  const params = new URLSearchParams();

  if (imageUrl?.trim()) {
    params.set("path", imageUrl.trim());
  }

  if (localFilePath?.trim()) {
    params.set("local_file_path", localFilePath.trim());
  }

  return params.size ? `/api/admin/imgs/preview?${params.toString()}` : null;
}

function buildOnlineImageUrl(imageUrl?: string | null) {
  const value = imageUrl?.trim();
  if (!value) {
    return "";
  }

  if (/^https?:\/\//iu.test(value)) {
    return value;
  }

  return `${IMAGE_PROXY_BASE_URL}/${value.replace(/^\/+/u, "")}`;
}

export function ImgFormPage({
  imgId,
  initialValues,
  categoryTree,
  actives,
  backHref = "/admin/imgs",
}: ImgFormPageProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ImgFormValues>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isEdit = typeof imgId === "number";
  const selectedCategoryId = Form.useWatch("category_id", form);
  const selectedActiveId = Form.useWatch("active_id", form);
  const currentImageUrl = Form.useWatch("image_url", form);
  const currentImageUrlCard = Form.useWatch("image_url_card", form);
  const currentLocalFilePath = Form.useWatch("local_file_path", form);
  const previousSelectionRef = useRef({
    category_id: initialValues.category_id,
    active_id: initialValues.active_id,
  });

  useEffect(() => {
    form.setFieldsValue(initialValues);
    previousSelectionRef.current = {
      category_id: initialValues.category_id,
      active_id: initialValues.active_id,
    };
  }, [form, initialValues]);

  const categoryOptions = useMemo(() => buildCategoryTreeData(categoryTree), [categoryTree]);

  const activeOptions = useMemo(
    () =>
      actives.map((active) => ({
        label: active.name,
        value: active.id,
      })),
    [actives],
  );

  const previewSrc = useMemo(
    () => buildImgPreviewSrc(currentImageUrl, currentLocalFilePath),
    [currentImageUrl, currentLocalFilePath],
  );
  const onlineImageUrl = useMemo(() => buildOnlineImageUrl(currentImageUrl), [currentImageUrl]);
  const onlineImageUrlCard = useMemo(
    () => buildOnlineImageUrl(currentImageUrlCard),
    [currentImageUrlCard],
  );

  useEffect(() => {
    const previousSelection = previousSelectionRef.current;
    const currentSelection = {
      category_id: selectedCategoryId ?? null,
      active_id: selectedActiveId ?? null,
    };

    if (
      currentLocalFilePath &&
      (previousSelection.category_id !== currentSelection.category_id ||
        previousSelection.active_id !== currentSelection.active_id)
    ) {
      form.setFieldsValue({
        image_url: "",
        image_url_card: "",
        local_file_path: null,
        local_file_path_card: null,
      });
      messageApi.info("分类或功能变更后，请重新上传图片。");
    }

    previousSelectionRef.current = currentSelection;
  }, [currentLocalFilePath, form, messageApi, selectedActiveId, selectedCategoryId]);

  async function handleUpload(file: File) {
    const categoryId = form.getFieldValue("category_id");
    const activeId = form.getFieldValue("active_id");

    if (!categoryId || !activeId) {
      messageApi.error("请先选择分类和功能，再上传图片。");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category_id", String(categoryId));
      formData.append("active_id", String(activeId));

      const response = await fetch("/api/admin/imgs/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadedImgFile | { error?: string };

      if (
        !response.ok ||
        !("image_url" in data) ||
        !("image_url_card" in data) ||
        !("local_file_path" in data) ||
        !("local_file_path_card" in data)
      ) {
        throw new Error("error" in data ? data.error : "上传图片失败。");
      }

      form.setFieldsValue({
        image_url: data.image_url,
        image_url_card: data.image_url_card,
        local_file_path: data.local_file_path,
        local_file_path_card: data.local_file_path_card,
      });
      messageApi.success("图片已上传，保存表单后会进入同步队列。");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "上传图片失败。");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(values: ImgFormValues) {
    setSaving(true);

    try {
      const response = await fetch(
        isEdit ? `/api/admin/imgs/${imgId}` : "/api/admin/imgs",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: values.category_id,
            active_id: values.active_id,
            image_url: values.image_url.trim(),
            image_url_card: values.image_url_card.trim(),
            local_file_path: values.local_file_path,
            local_file_path_card: values.local_file_path_card,
            title: values.title.trim() || null,
            slug: values.slug.trim() || "",
            description: values.description.trim() || null,
            difficulty: values.difficulty || null,
            sort_order: Number(values.sort_order ?? 0),
            is_active: values.is_active,
          }),
        },
      );
      const data = (await response.json()) as ImgRecord | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "保存图片失败。");
      }

      messageApi.success(isEdit ? "图片已更新。" : "图片已创建。");
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      router.push(backHref);
      router.refresh();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "保存图片失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {contextHolder}
      <Card
        title={isEdit ? "编辑图片" : "新增图片"}
        variant="borderless"
        extra={<Link href={backHref}>返回列表</Link>}
      >
        <Form<ImgFormValues>
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={(values) => void handleSave(values)}
        >
          <Form.Item
            label="分类"
            name="category_id"
            rules={[{ required: true, message: "请选择分类" }]}
          >
            <TreeSelect
              showSearch
              treeNodeFilterProp="title"
              placeholder="请选择分类"
              treeData={categoryOptions}
              allowClear
            />
          </Form.Item>

          <Form.Item
            label="功能"
            name="active_id"
            rules={[{ required: true, message: "请选择功能" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="请选择功能"
              options={activeOptions}
            />
          </Form.Item>

          <Form.Item label="标题" name="title">
            <Input placeholder="可选标题" />
          </Form.Item>

          <Form.Item label="Slug" name="slug">
            <Input placeholder="留空时自动生成" />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={4} placeholder="可选描述" />
          </Form.Item>

          <Form.Item
            label="难度"
            name="difficulty"
            extra="可留空。1=Easy，2=Medium，3=Hard；迷宫、数独等益智类建议设置。"
          >
            <Select options={DIFFICULTY_OPTIONS} />
          </Form.Item>

          <Form.Item label="排序" name="sort_order">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="启用状态" name="is_active" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>

          <Form.Item
            label="图片文件"
            required
            extra="上传后会先保存在本地待同步目录，保存表单后再参与 Cloudflare 同步。"
          >
            <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
              {previewSrc ? (
                <Image
                  alt="图片预览"
                  src={previewSrc}
                  width={220}
                  style={{ border: "1px solid #f0f0f0", borderRadius: 8 }}
                />
              ) : null}

              <Space wrap>
                <Upload
                  accept="image/*"
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void handleUpload(file as File);
                    return false;
                  }}
                >
                  <Button icon={<UploadOutlined />} loading={uploading}>
                    {previewSrc ? "重新上传" : "上传图片"}
                  </Button>
                </Upload>
                {!currentImageUrl ? <span>尚未上传图片</span> : null}
              </Space>

              <Space orientation="vertical" size={6} style={{ width: "100%" }}>
                <div>
                  <Text strong>线上主图：</Text>
                  {onlineImageUrl ? (
                    <Text copyable={{ text: onlineImageUrl }}>
                      <a href={onlineImageUrl} target="_blank" rel="noreferrer">
                        {onlineImageUrl}
                      </a>
                    </Text>
                  ) : (
                    <Text type="secondary">上传后显示完整线上地址</Text>
                  )}
                </div>
                <div>
                  <Text strong>线上卡片图：</Text>
                  {onlineImageUrlCard ? (
                    <Text copyable={{ text: onlineImageUrlCard }}>
                      <a href={onlineImageUrlCard} target="_blank" rel="noreferrer">
                        {onlineImageUrlCard}
                      </a>
                    </Text>
                  ) : (
                    <Text type="secondary">上传后显示完整线上地址</Text>
                  )}
                </div>
              </Space>
            </Space>
          </Form.Item>

          <Form.Item
            name="image_url"
            hidden
            rules={[{ required: true, message: "请先上传图片" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="image_url_card"
            hidden
            rules={[{ required: true, message: "请先生成卡片图" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="local_file_path" hidden>
            <Input />
          </Form.Item>

          <Form.Item name="local_file_path_card" hidden>
            <Input />
          </Form.Item>

          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存图片
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
