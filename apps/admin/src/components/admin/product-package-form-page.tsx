"use client";

import {
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CategoryRecord,
  PoseSourceListItem,
  ProductPackageRecord,
} from "@/lib/admin-types";

type ProductPackageFormPageProps = {
  categories: CategoryRecord[];
  initialPackage?: ProductPackageRecord | null;
};

type PoseSourceResponse = {
  items: PoseSourceListItem[];
};

type SelectedPackageItem = {
  category_id: number;
  pose_id: number | null;
  sort_order: number;
  display_name: string | null;
};

type FormValues = {
  first_category_id?: number;
  parent_category_id: number;
  title?: string;
  slug?: string;
  subtitle?: string;
  target_label?: string;
  audience_note?: string;
  status?: ProductPackageRecord["status"];
  cover_image_url?: string;
  pdf_file_path?: string;
  preview_file_path?: string;
};

function getCategoryDepth(category: CategoryRecord, categoryMap: Map<number, CategoryRecord>) {
  let depth = 1;
  let parentId = category.parent_id;
  while (parentId !== null) {
    const parent = categoryMap.get(parentId);
    if (!parent) {
      break;
    }
    depth += 1;
    parentId = parent.parent_id;
  }
  return depth;
}

function getPoseLabel(item: PoseSourceListItem) {
  return item.pose_title || item.pose_title_zh || item.pose_key;
}

function parseJsonPreview(value: string | null) {
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function ProductPackageFormPage({
  categories,
  initialPackage = null,
}: ProductPackageFormPageProps) {
  const [form] = Form.useForm<FormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [selectedItems, setSelectedItems] = useState<SelectedPackageItem[]>(
    () =>
      initialPackage?.items.map((item, index) => ({
        category_id: item.category_id,
        pose_id: item.pose_id,
        sort_order: item.sort_order ?? index,
        display_name: item.display_name,
      })) ?? [],
  );
  const [poseOptionsByCategory, setPoseOptionsByCategory] = useState<
    Record<number, PoseSourceListItem[]>
  >({});
  const [loadingPoseCategoryIds, setLoadingPoseCategoryIds] = useState<Set<number>>(
    () => new Set(),
  );
  const parentCategoryId = Form.useWatch("parent_category_id", form);
  const firstCategoryId = Form.useWatch("first_category_id", form);
  const isEdit = Boolean(initialPackage);

  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const secondLevelCategories = useMemo(
    () =>
      categories
        .filter((item) => getCategoryDepth(item, categoryMap) === 2)
        .filter((item) => !firstCategoryId || item.parent_id === Number(firstCategoryId))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categories, categoryMap, firstCategoryId],
  );
  const firstLevelCategories = useMemo(
    () =>
      categories
        .filter((item) => getCategoryDepth(item, categoryMap) === 1)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categories, categoryMap],
  );
  const childCategories = useMemo(
    () =>
      categories
        .filter((item) => item.parent_id === Number(parentCategoryId))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categories, parentCategoryId],
  );
  const selectedByCategory = useMemo(
    () => new Map(selectedItems.map((item) => [item.category_id, item])),
    [selectedItems],
  );
  const initialFirstCategoryId = useMemo(() => {
    if (!initialPackage?.parent_category_id) {
      return undefined;
    }
    return categoryMap.get(initialPackage.parent_category_id)?.parent_id ?? undefined;
  }, [categoryMap, initialPackage?.parent_category_id]);

  const fetchPoseOptions = useCallback(
    async (categoryId: number) => {
      if (poseOptionsByCategory[categoryId] || loadingPoseCategoryIds.has(categoryId)) {
        return;
      }
      setLoadingPoseCategoryIds((current) => new Set([...current, categoryId]));
      try {
        const response = await fetch(`/api/admin/pose-sources?category_id=${categoryId}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as PoseSourceResponse | { error?: string };
        if (!response.ok || !("items" in data)) {
          throw new Error("error" in data ? data.error : "获取姿态失败。");
        }
        setPoseOptionsByCategory((current) => ({
          ...current,
          [categoryId]: data.items,
        }));
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "获取姿态失败。");
      } finally {
        setLoadingPoseCategoryIds((current) => {
          const next = new Set(current);
          next.delete(categoryId);
          return next;
        });
      }
    },
    [loadingPoseCategoryIds, messageApi, poseOptionsByCategory],
  );

  useEffect(() => {
    selectedItems.forEach((item) => {
      void fetchPoseOptions(item.category_id);
    });
  }, [fetchPoseOptions, selectedItems]);

  useEffect(() => {
    if (!parentCategoryId) {
      return;
    }
    childCategories.forEach((item) => {
      void fetchPoseOptions(item.id);
    });
  }, [childCategories, fetchPoseOptions, parentCategoryId]);

  const updateSelectedItem = useCallback((categoryId: number, patch: Partial<SelectedPackageItem>) => {
    setSelectedItems((current) =>
      current.map((item) => (item.category_id === categoryId ? { ...item, ...patch } : item)),
    );
  }, []);

  const toggleCategory = useCallback(
    (categoryId: number, checked: boolean) => {
      if (!checked) {
        setSelectedItems((current) => current.filter((item) => item.category_id !== categoryId));
        return;
      }
      void fetchPoseOptions(categoryId);
      setSelectedItems((current) => {
        if (current.some((item) => item.category_id === categoryId)) {
          return current;
        }
        const firstPose = poseOptionsByCategory[categoryId]?.[0];
        return [
          ...current,
          {
            category_id: categoryId,
            pose_id: firstPose?.id ?? null,
            sort_order: current.length,
            display_name: null,
          },
        ];
      });
    },
    [fetchPoseOptions, poseOptionsByCategory],
  );

  useEffect(() => {
    if (!parentCategoryId) {
      return;
    }
    const childIds = new Set(childCategories.map((item) => item.id));
    setSelectedItems((current) => current.filter((item) => childIds.has(item.category_id)));
  }, [childCategories, parentCategoryId]);

  useEffect(() => {
    setSelectedItems((current) =>
      current.map((item) => {
        if (item.pose_id !== null) {
          return item;
        }
        const firstPose = poseOptionsByCategory[item.category_id]?.[0];
        return firstPose ? { ...item, pose_id: firstPose.id } : item;
      }),
    );
  }, [poseOptionsByCategory]);

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      const items = selectedItems
        .map((item, index) => ({
          category_id: item.category_id,
          pose_id: item.pose_id,
          sort_order: index,
          day_index: index,
          display_name: item.display_name,
        }))
        .filter((item): item is Omit<typeof item, "pose_id"> & { pose_id: number } =>
          Number.isInteger(item.pose_id),
        );

      if (items.length < 2) {
        messageApi.error("请至少选择 2 个三级类目。");
        return;
      }

      setSaving(true);
      try {
        const response = await fetch(
          isEdit
            ? `/api/admin/product-packages/${initialPackage?.id}`
            : "/api/admin/product-packages",
          {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parent_category_id: Number(values.parent_category_id),
              title: values.title,
              slug: values.slug,
              subtitle: values.subtitle,
              target_label: values.target_label,
              audience_note: values.audience_note,
              status: values.status,
              cover_image_url: values.cover_image_url,
              pdf_file_path: values.pdf_file_path,
              preview_file_path: values.preview_file_path,
              items,
            }),
          },
        );
        const data = (await response.json()) as ProductPackageRecord | { error?: string };
        if (!response.ok || !("id" in data)) {
          throw new Error("error" in data ? data.error : "保存产品包失败。");
        }
        messageApi.success("产品包已保存，正在生成 PDF。");
        const generateResponse = await fetch(`/api/admin/product-packages/${data.id}/generate-pdf`, {
          method: "POST",
        });
        const generateData = (await generateResponse.json()) as { error?: string };
        if (!generateResponse.ok) {
          throw new Error(generateData.error || "产品包已保存，但 PDF 生成失败。");
        }
        messageApi.success("PDF 已生成并保存到本地。");
        if (!isEdit) {
          window.location.href = `/admin/product-packages/${data.id}`;
        } else {
          window.location.reload();
        }
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "保存产品包失败。");
      } finally {
        setSaving(false);
      }
    },
    [initialPackage?.id, isEdit, messageApi, selectedItems],
  );

  const handleGeneratePdf = useCallback(async () => {
    if (!initialPackage?.id) {
      messageApi.error("请先保存产品包，再生成 PDF。");
      return;
    }
    setGeneratingPdf(true);
    try {
      const response = await fetch(
        `/api/admin/product-packages/${initialPackage.id}/generate-pdf`,
        { method: "POST" },
      );
      const data = (await response.json()) as
        | { pdf_file_path: string; preview_file_path: string }
        | { error?: string };
      if (!response.ok || !("pdf_file_path" in data)) {
        throw new Error("error" in data ? data.error : "生成 PDF 失败。");
      }
      messageApi.success("PDF 已生成并保存到本地。");
      window.location.reload();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成 PDF 失败。");
    } finally {
      setGeneratingPdf(false);
    }
  }, [initialPackage?.id, messageApi]);

  const columns = useMemo<ColumnsType<CategoryRecord>>(
    () => [
      {
        title: "选择",
        key: "selected",
        width: 80,
        render: (_: unknown, record) => (
          <Checkbox
            checked={selectedByCategory.has(record.id)}
            onChange={(event) => toggleCategory(record.id, event.target.checked)}
          />
        ),
      },
      {
        title: "三级类目",
        dataIndex: "name",
        key: "name",
        render: (value: string, record) => (
          <Space>
            <span>{value}</span>
            {record.name_zh ? <Tag>{record.name_zh}</Tag> : null}
          </Space>
        ),
      },
      {
        title: "姿态",
        key: "pose",
        render: (_: unknown, record) => {
          const selected = selectedByCategory.get(record.id);
          const poses = poseOptionsByCategory[record.id] ?? [];
          return (
            <Select
              style={{ minWidth: 260 }}
              placeholder="选择姿态"
              disabled={!selected}
              loading={loadingPoseCategoryIds.has(record.id)}
              value={selected?.pose_id ?? undefined}
              options={poses.map((item) => ({ label: getPoseLabel(item), value: item.id }))}
              onChange={(value) => updateSelectedItem(record.id, { pose_id: value })}
            />
          );
        },
      },
      {
        title: "显示名",
        key: "display_name",
        render: (_: unknown, record) => {
          const selected = selectedByCategory.get(record.id);
          return (
            <Input
              placeholder={record.name}
              disabled={!selected}
              value={selected?.display_name ?? ""}
              onChange={(event) =>
                updateSelectedItem(record.id, {
                  display_name: event.target.value.trim() || null,
                })
              }
            />
          );
        },
      },
    ],
    [
      loadingPoseCategoryIds,
      poseOptionsByCategory,
      selectedByCategory,
      toggleCategory,
      updateSelectedItem,
    ],
  );

  return (
    <>
      {contextHolder}
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <Card
          title={isEdit ? "编辑产品包" : "创建产品包"}
          variant="borderless"
          extra={<Link href="/admin/product-packages">返回产品包列表</Link>}
        >
          <Form<FormValues>
            form={form}
            layout="vertical"
            initialValues={{
              first_category_id: initialFirstCategoryId,
              parent_category_id: initialPackage?.parent_category_id,
              title: initialPackage?.title,
              slug: initialPackage?.slug,
              subtitle:
                initialPackage?.subtitle ||
                "No Prep Fine Motor, Puzzle & Cut-and-Paste Printables",
              target_label: initialPackage?.target_label || "Kindergarten",
              audience_note:
                initialPackage?.audience_note ||
                "Designed for Kindergarten. Also great for Pre-K review, 1st grade early finishers, homeschool, centers, and morning work.",
              status: initialPackage?.status || "draft",
              cover_image_url: initialPackage?.cover_image_url || undefined,
              pdf_file_path: initialPackage?.pdf_file_path || undefined,
              preview_file_path: initialPackage?.preview_file_path || undefined,
            }}
            onFinish={(values) => void handleSubmit(values)}
          >
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  label="一级类目"
                  name="first_category_id"
                  rules={[{ required: true, message: "请选择一级类目。" }]}
                >
                  <Select
                    showSearch
                    placeholder="选择一级类目"
                    optionFilterProp="label"
                    options={firstLevelCategories.map((item) => ({
                      label: item.name,
                      value: item.id,
                    }))}
                    onChange={() => {
                      form.setFieldsValue({
                        parent_category_id: undefined as unknown as number,
                        title: undefined,
                        slug: undefined,
                      });
                      setSelectedItems([]);
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label="二级类目"
                  name="parent_category_id"
                  rules={[{ required: true, message: "请选择二级类目。" }]}
                >
                  <Select
                    showSearch
                    placeholder="选择二级类目"
                    optionFilterProp="label"
                    disabled={!firstCategoryId}
                    options={secondLevelCategories.map((item) => ({
                      label: item.name,
                      value: item.id,
                    }))}
                    onChange={(value) => {
                      const selected = categoryMap.get(Number(value));
                      form.setFieldsValue({
                        title: selected ? `${selected.name} Kindergarten Activity Pack` : undefined,
                        slug: undefined,
                      });
                      setSelectedItems([]);
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="产品标题" name="title">
                  <Input placeholder="留空则自动生成" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Slug" name="slug">
                  <Input placeholder="留空则自动生成" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="副标题" name="subtitle">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="主定位" name="target_label">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="状态" name="status">
                  <Select
                    options={[
                      { label: "draft", value: "draft" },
                      { label: "ready", value: "ready" },
                      { label: "archived", value: "archived" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="受众说明" name="audience_note">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="封面图 URL / 路径" name="cover_image_url">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="PDF 文件路径" name="pdf_file_path">
                  <Input readOnly />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Preview 文件路径" name="preview_file_path">
                  <Input readOnly />
                </Form.Item>
              </Col>
            </Row>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={childCategories}
              pagination={false}
              locale={{ emptyText: parentCategoryId ? "该二级类目下暂无三级类目" : "请先选择二级类目" }}
            />
            <Space style={{ marginTop: 16 }}>
              <Button type="primary" htmlType="submit" loading={saving}>
                保存并生成 PDF
              </Button>
              {initialPackage ? (
                <Button loading={generatingPdf} onClick={() => void handleGeneratePdf()}>
                  重新生成 PDF
                </Button>
              ) : null}
              {initialPackage?.pdf_file_path ? (
                <Button
                  onClick={() =>
                    window.open(
                      `/api/admin/product-packages/${initialPackage.id}/file?kind=pdf`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  预览完整 PDF
                </Button>
              ) : null}
              {initialPackage?.pdf_file_path ? (
                <Button
                  onClick={() =>
                    window.open(
                      `/api/admin/product-packages/${initialPackage.id}/file?kind=pdf&download=1`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  下载完整 PDF
                </Button>
              ) : null}
              <Typography.Text type="secondary">
                已选择 {selectedItems.length} 个三级类目
              </Typography.Text>
            </Space>
          </Form>
        </Card>

        {initialPackage ? (
          <Card title="生成结果预览" variant="borderless">
            <Collapse
              items={[
                {
                  key: "copy",
                  label: "copy_json",
                  children: (
                    <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                      {parseJsonPreview(initialPackage.copy_json)}
                    </pre>
                  ),
                },
                {
                  key: "page-plan",
                  label: "page_plan_json",
                  children: (
                    <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                      {parseJsonPreview(initialPackage.page_plan_json)}
                    </pre>
                  ),
                },
              ]}
            />
          </Card>
        ) : null}
      </Space>
    </>
  );
}
