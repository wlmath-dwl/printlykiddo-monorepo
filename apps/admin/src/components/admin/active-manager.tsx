"use client";

import { Button, Card, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { ActiveListItem } from "@/lib/admin-types";

type ActiveManagerProps = {
  initialItems: ActiveListItem[];
};

type ActiveResponse = {
  items: ActiveListItem[];
};

export function ActiveManager({ initialItems }: ActiveManagerProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/actives", { cache: "no-store" });
      const data = (await response.json()) as ActiveResponse | { error?: string };

      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data ? data.error : "获取功能列表失败。");
      }

      setItems(data.items);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取功能列表失败。");
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`/api/admin/actives/${id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || "删除功能失败。");
        }

        messageApi.success("功能已删除。");
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchItems();
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "删除功能失败。");
      }
    },
    [fetchItems, messageApi],
  );

  const columns = useMemo<ColumnsType<ActiveListItem>>(
    () => [
      { title: "名称", dataIndex: "name", key: "name" },
      { title: "Slug", dataIndex: "slug", key: "slug" },
      {
        title: "描述",
        dataIndex: "description",
        key: "description",
        ellipsis: true,
        render: (value: string | null) => value ?? "-",
      },
      { title: "排序", dataIndex: "sort_order", key: "sort_order", width: 90 },
      {
        title: "彩色标签",
        dataIndex: "colored_label",
        key: "colored_label",
        width: 110,
        render: (value: boolean) =>
          value ? <Tag color="gold">彩色</Tag> : <Tag>否</Tag>,
      },
      {
        title: "操作",
        key: "actions",
        width: 180,
        render: (_: unknown, record: ActiveListItem) => (
          <Space size={4}>
            <Link href={`/admin/actives/${record.id}`}>
              <Button type="link">编辑</Button>
            </Link>
            <Popconfirm
              title="确认删除当前功能吗？"
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
        title="功能管理"
        variant="borderless"
        extra={
          <Link href="/admin/actives/new">
            <Button>新增功能</Button>
          </Link>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
        />
      </Card>
    </>
  );
}
