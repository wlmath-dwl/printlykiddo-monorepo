"use client";

import { Button, Card, Image, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { SpecialPageListItem } from "@/lib/admin-types";

type SpecialPageManagerProps = {
  initialItems: SpecialPageListItem[];
};

type SpecialPageListResponse = {
  items: SpecialPageListItem[];
};

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

export function SpecialPageManager({ initialItems }: SpecialPageManagerProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/special-pages", { cache: "no-store" });
      const data = (await response.json()) as SpecialPageListResponse | { error?: string };
      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data ? data.error : "获取专题页失败。");
      }
      setItems(data.items);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取专题页失败。");
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`/api/admin/special-pages/${id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "删除专题页失败。");
        }
        messageApi.success("专题页已删除。");
        await fetchItems();
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "删除专题页失败。");
      }
    },
    [fetchItems, messageApi],
  );

  const columns = useMemo<ColumnsType<SpecialPageListItem>>(
    () => [
      {
        title: "小图",
        key: "card_image_url",
        width: 76,
        render: (_: unknown, record) => {
          const previewUrl = buildManagedImagePreviewUrl(record.card_image_url || record.hero_image_url);
          return previewUrl ? (
            <Image
              src={previewUrl}
              alt={record.title}
              width={44}
              height={44}
              preview={false}
              style={{ objectFit: "cover", borderRadius: 8, border: "1px solid #f0f0f0" }}
              fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
            />
          ) : (
            "-"
          );
        },
      },
      {
        title: "标题",
        dataIndex: "title",
        key: "title",
        render: (value: string, record) => (
          <Link href={`/admin/special-pages/${record.id}`}>{value}</Link>
        ),
      },
      { title: "Slug", dataIndex: "slug", key: "slug", ellipsis: true },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 110,
        render: (value: SpecialPageListItem["status"]) => (
          <Tag color={value === "published" ? "green" : value === "archived" ? "default" : "gold"}>
            {value}
          </Tag>
        ),
      },
      {
        title: "排序",
        dataIndex: "sort_order",
        key: "sort_order",
        width: 90,
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
            <Link href={`/admin/special-pages/${record.id}`}>
              <Button type="link">编辑</Button>
            </Link>
            <Popconfirm
              title="确认删除当前专题页吗？"
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
        title="专题页"
        variant="borderless"
        extra={
          <Link href="/admin/special-pages/new">
            <Button type="primary">创建专题页</Button>
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
