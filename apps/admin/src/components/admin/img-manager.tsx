"use client";

import { Button, Card, Image, Input, Popconfirm, Select, Space, Table, Tag, TreeSelect, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useMemo, useState, type Key } from "react";

import type {
  ActiveRecord,
  CategoryTreeNode,
  ImgListItem,
} from "@/lib/admin-types";

type ImgManagerProps = {
  initialItems: ImgListItem[];
  categoryTree: CategoryTreeNode[];
  actives: ActiveRecord[];
};

type ImgResponse = {
  items: ImgListItem[];
};

const DIFFICULTY_LABEL_BY_VALUE: Record<number, { label: string; color: string }> = {
  1: { label: "Easy", color: "green" },
  2: { label: "Medium", color: "gold" },
  3: { label: "Hard", color: "red" },
};

type ImgFilterState = {
  keyword: string;
  category_id?: number;
  active_id?: number;
  is_active?: boolean;
};

type CategoryTreeOption = {
  title: string;
  value: number;
  key: number;
  children: CategoryTreeOption[];
};

function buildCategoryTreeData(nodes: CategoryTreeNode[]): CategoryTreeOption[] {
  return nodes.map((node) => ({
    title: node.name,
    value: node.id,
    key: node.id,
    children: buildCategoryTreeData(node.children),
  }));
}

function buildImgPreviewSrc(record: ImgListItem) {
  if (record.file_sync_status === "draft") {
    return null;
  }

  const params = new URLSearchParams();

  if (record.image_url?.trim()) {
    params.set("path", record.image_url.trim());
  }

  if (record.local_file_path?.trim()) {
    params.set("local_file_path", record.local_file_path.trim());
  }

  return params.size ? `/api/admin/imgs/preview?${params.toString()}` : null;
}

export function ImgManager({
  initialItems,
  categoryTree,
  actives,
}: ImgManagerProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState(initialItems);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<ImgFilterState>({
    keyword: "",
  });

  const categoryOptions = useMemo(
    () => buildCategoryTreeData(categoryTree),
    [categoryTree],
  );

  const activeOptions = useMemo(
    () =>
      actives.map((active) => ({
        label: active.name,
        value: active.id,
      })),
    [actives],
  );

  const fetchItems = useCallback(async (nextFilters: ImgFilterState) => {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (nextFilters.keyword.trim()) {
        params.set("keyword", nextFilters.keyword.trim());
      }

      if (nextFilters.category_id) {
        params.set("category_id", String(nextFilters.category_id));
      }

      if (nextFilters.active_id) {
        params.set("active_id", String(nextFilters.active_id));
      }

      if (typeof nextFilters.is_active === "boolean") {
        params.set("is_active", nextFilters.is_active ? "true" : "false");
      }

      const response = await fetch(`/api/admin/imgs?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as ImgResponse | { error?: string };

      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data ? data.error : "获取图片列表失败。");
      }

      setItems(data.items);
      setPage(1);
      setSelectedRowKeys([]);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取图片列表失败。");
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`/api/admin/imgs/${id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || "删除图片失败。");
        }

        messageApi.success("图片已删除。");
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchItems(filters);
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "删除图片失败。");
      }
    },
    [fetchItems, filters, messageApi],
  );

  const handleBatchDelete = useCallback(async () => {
    const ids = selectedRowKeys
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return;
    }

    try {
      const response = await fetch("/api/admin/imgs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await response.json()) as { deleted?: number; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "批量删除失败。");
      }

      messageApi.success(`已删除 ${data.deleted ?? ids.length} 张图片。`);
      setSelectedRowKeys([]);
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      await fetchItems(filters);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "批量删除失败。");
    }
  }, [fetchItems, filters, messageApi, selectedRowKeys]);

  const columns = useMemo<ColumnsType<ImgListItem>>(
    () => [
      {
        title: "预览",
        key: "preview",
        width: 110,
        render: (_: unknown, record: ImgListItem) => {
          const previewSrc = buildImgPreviewSrc(record);

          return previewSrc ? (
            <Image
              alt={record.title || record.slug || "图片"}
              src={previewSrc}
              width={72}
              height={72}
              style={{ borderRadius: 8, objectFit: "cover" }}
            />
          ) : (
            "-"
          );
        },
      },
      {
        title: "标题",
        key: "title",
        render: (_: unknown, record: ImgListItem) => record.title || record.slug || "-",
      },
      { title: "分类", dataIndex: "category_name", key: "category_name" },
      { title: "功能", dataIndex: "active_name", key: "active_name", width: 120 },
      {
        title: "难度",
        key: "difficulty",
        width: 100,
        render: (_: unknown, record: ImgListItem) => {
          const meta = record.difficulty
            ? DIFFICULTY_LABEL_BY_VALUE[record.difficulty]
            : null;
          return meta ? <Tag color={meta.color}>{meta.label}</Tag> : "-";
        },
      },
      { title: "排序", dataIndex: "sort_order", key: "sort_order", width: 90 },
      {
        title: "状态",
        key: "status",
        width: 120,
        render: (_: unknown, record: ImgListItem) =>
          record.is_active ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
      },
      {
        title: "操作",
        key: "actions",
        width: 180,
        render: (_: unknown, record: ImgListItem) => (
          <Space size={4}>
            <Link href={`/admin/imgs/${record.id}`}>
              <Button type="link">编辑</Button>
            </Link>
            <Popconfirm
              title="确认删除当前图片吗？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void handleDelete(record.id)}
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [handleDelete],
  );

  return (
    <>
      {contextHolder}
      <Card
        title={
          <Space size={8}>
            <span>图片管理</span>
            <Tag color="blue">总数 {items.length}</Tag>
          </Space>
        }
        variant="borderless"
        extra={
          <Space>
            {selectedRowKeys.length > 0 ? (
              <Popconfirm
                title={`确认删除选中的 ${selectedRowKeys.length} 张图片吗？`}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => void handleBatchDelete()}
              >
                <Button danger>批量删除（{selectedRowKeys.length}）</Button>
              </Popconfirm>
            ) : null}
            <Link href="/admin/imgs/new">
              <Button type="primary">新增图片</Button>
            </Link>
          </Space>
        }
      >
        <Space wrap size="middle" style={{ marginBottom: 16 }}>
          <Input
            allowClear
            placeholder="标题 / slug / 描述"
            style={{ width: 220 }}
            value={filters.keyword}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                keyword: event.target.value,
              }))
            }
            onPressEnter={() => void fetchItems(filters)}
          />
          <TreeSelect
            allowClear
            showSearch
            treeNodeFilterProp="title"
            placeholder="分类"
            style={{ width: 240 }}
            value={filters.category_id}
            treeData={categoryOptions}
            onChange={(value) =>
              setFilters((current) => {
                const nextCategoryId = typeof value === "number" ? value : undefined;
                return {
                  ...current,
                  category_id: nextCategoryId,
                };
              })
            }
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="功能"
            style={{ width: 180 }}
            value={filters.active_id}
            options={activeOptions}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                active_id: value as number | undefined,
              }))
            }
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 120 }}
            value={filters.is_active}
            options={[
              { label: "启用", value: true },
              { label: "停用", value: false },
            ]}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                is_active: value as boolean | undefined,
              }))
            }
          />
          <Space>
            <Button type="primary" onClick={() => void fetchItems(filters)}>
              筛选
            </Button>
            <Button
              onClick={() => {
                const nextFilters = { keyword: "" };
                setFilters(nextFilters);
                void fetchItems(nextFilters);
              }}
            >
              重置
            </Button>
          </Space>
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{
            current: page,
            pageSize,
            total: items.length,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            preserveSelectedRowKeys: false,
          }}
        />
      </Card>
    </>
  );
}
