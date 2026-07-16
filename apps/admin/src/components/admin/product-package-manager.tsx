"use client";

import { Button, Card, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { ProductPackageListItem } from "@/lib/admin-types";

type ProductPackageManagerProps = {
  initialItems: ProductPackageListItem[];
};

type ProductPackageListResponse = {
  items: ProductPackageListItem[];
};

export function ProductPackageManager({ initialItems }: ProductPackageManagerProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/product-packages", { cache: "no-store" });
      const data = (await response.json()) as ProductPackageListResponse | { error?: string };
      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data ? data.error : "获取产品包失败。");
      }
      setItems(data.items);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取产品包失败。");
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`/api/admin/product-packages/${id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "删除产品包失败。");
        }
        messageApi.success("产品包已删除。");
        await fetchItems();
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "删除产品包失败。");
      }
    },
    [fetchItems, messageApi],
  );

  const columns = useMemo<ColumnsType<ProductPackageListItem>>(
    () => [
      {
        title: "标题",
        dataIndex: "title",
        key: "title",
        render: (value: string, record) => (
          <Link href={`/admin/product-packages/${record.id}`}>{value}</Link>
        ),
      },
      { title: "二级类目", dataIndex: "parent_category_name", key: "parent_category_name" },
      { title: "Slug", dataIndex: "slug", key: "slug", ellipsis: true },
      {
        title: "定位",
        dataIndex: "target_label",
        key: "target_label",
        width: 130,
      },
      {
        title: "条目",
        dataIndex: "item_count",
        key: "item_count",
        width: 90,
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 100,
        render: (value: ProductPackageListItem["status"]) => (
          <Tag color={value === "ready" ? "green" : value === "archived" ? "default" : "gold"}>
            {value}
          </Tag>
        ),
      },
      {
        title: "更新时间",
        dataIndex: "updated_at",
        key: "updated_at",
        width: 210,
      },
      {
        title: "操作",
        key: "actions",
        width: 150,
        render: (_: unknown, record) => (
          <Space size={4}>
            <Link href={`/admin/product-packages/${record.id}`}>
              <Button type="link">编辑</Button>
            </Link>
            <Popconfirm
              title="确认删除当前产品包吗？"
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
        title="产品包"
        variant="borderless"
        extra={
          <Link href="/admin/product-packages/new">
            <Button type="primary">创建产品包</Button>
          </Link>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </>
  );
}
