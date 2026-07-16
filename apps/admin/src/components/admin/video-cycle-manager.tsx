"use client";

import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { VideoPublishCycleRecord } from "@/lib/admin-types";

type VideoCycleManagerProps = {
  initialItems: VideoPublishCycleRecord[];
};

type VideoCycleListResponse = {
  items: VideoPublishCycleRecord[];
};

function addDaysToIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCycleDurationDays(record: VideoPublishCycleRecord) {
  const start = new Date(`${record.start_date}T00:00:00`);
  const end = new Date(`${record.end_date}T00:00:00`);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function VideoCycleManager({ initialItems }: VideoCycleManagerProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<VideoPublishCycleRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Modal 走 Portal，避免 SSR 与首屏客户端 DOM 不一致导致 hydration 报错 */
  const [clientReady, setClientReady] = useState(false);
  const [form] = Form.useForm<{ start_date: string; end_date: string }>();
  const [editForm] = Form.useForm<{ start_date: string }>();

  useEffect(() => {
    setClientReady(true);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/video-cycles", { cache: "no-store" });
      const data = (await response.json()) as VideoCycleListResponse | { error?: string };
      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data ? data.error : "获取视频周期失败。");
      }
      setItems(data.items);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取视频周期失败。");
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  const handleCreate = useCallback(async () => {
    const values = await form.validateFields();
    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/video-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json()) as VideoPublishCycleRecord | { error?: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "创建视频周期失败。");
      }

      messageApi.success("视频周期已创建。");
      setCreateOpen(false);
      form.resetFields();
      await fetchItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建视频周期失败。");
    } finally {
      setSubmitting(false);
    }
  }, [fetchItems, form, messageApi]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`/api/admin/video-cycles/${id}`, { method: "DELETE" });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "删除视频周期失败。");
        }

        messageApi.success("视频周期已删除。");
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchItems();
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "删除视频周期失败。");
      }
    },
    [fetchItems, messageApi],
  );

  const handleOpenEdit = useCallback(
    (record: VideoPublishCycleRecord) => {
      setEditingRecord(record);
      editForm.setFieldsValue({ start_date: record.start_date });
    },
    [editForm],
  );

  const handleUpdateStartDate = useCallback(async () => {
    if (!editingRecord) {
      return;
    }

    const values = await editForm.validateFields();
    const durationDays = getCycleDurationDays(editingRecord);
    const endDate = addDaysToIsoDate(values.start_date, durationDays - 1);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/admin/video-cycles/${editingRecord.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingRecord.name,
          start_date: values.start_date,
          end_date: endDate,
        }),
      });
      const data = (await response.json()) as VideoPublishCycleRecord | { error?: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "修改视频周期失败。");
      }

      messageApi.success("视频周期起始日期已修改。");
      setEditingRecord(null);
      editForm.resetFields();
      await fetchItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "修改视频周期失败。");
    } finally {
      setSubmitting(false);
    }
  }, [editForm, editingRecord, fetchItems, messageApi]);

  const columns = useMemo<ColumnsType<VideoPublishCycleRecord>>(
    () => [
      {
        title: "周期ID",
        dataIndex: "id",
        key: "id",
        width: 120,
        render: (id: number) => <Typography.Text strong>{id}</Typography.Text>,
      },
      {
        title: "时间段",
        key: "date_range",
        width: 220,
        render: (_: unknown, record) => `${record.start_date} ~ ${record.end_date}`,
      },
      {
        title: "操作",
        key: "actions",
        width: 170,
        render: (_: unknown, record) => (
          <Space size={4}>
            <Link href={`/admin/video-cycles/${record.id}`}>
              <Button type="link">编辑</Button>
            </Link>
            <Button type="link" onClick={() => handleOpenEdit(record)}>
              改日期
            </Button>
            <Popconfirm
              title="确认删除这个视频周期吗？"
              description="删除后会移除该周期关联的三级类型和已生成视频记录。"
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
    [handleDelete, handleOpenEdit],
  );

  return (
    <>
      {contextHolder}
      <Card
        title="视频周期管理"
        variant="borderless"
        extra={<Button onClick={() => setCreateOpen(true)}>创建视频周期</Button>}
      >
        <Table rowKey="id" loading={loading} columns={columns} dataSource={items} pagination={false} />
      </Card>

      {clientReady ? (
        <>
          <Modal
            title="创建视频周期"
            open={createOpen}
            onCancel={() => setCreateOpen(false)}
            onOk={() => void handleCreate()}
            okText="创建"
            cancelText="取消"
            confirmLoading={submitting}
            forceRender
            destroyOnHidden
          >
            <Form form={form} layout="vertical">
              <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: "请选择开始日期" }]}>
                <Input type="date" />
              </Form.Item>
              <Form.Item name="end_date" label="结束日期" rules={[{ required: true, message: "请选择结束日期" }]}>
                <Input type="date" />
              </Form.Item>
              <Typography.Text type="secondary">视频周期至少 2 天。</Typography.Text>
            </Form>
          </Modal>
          <Modal
            title="修改视频周期起始日期"
            open={Boolean(editingRecord)}
            onCancel={() => setEditingRecord(null)}
            onOk={() => void handleUpdateStartDate()}
            okText="保存"
            cancelText="取消"
            confirmLoading={submitting}
            forceRender
            destroyOnHidden
          >
            <Form form={editForm} layout="vertical">
              <Form.Item name="start_date" label="新的开始日期" rules={[{ required: true, message: "请选择开始日期" }]}>
                <Input type="date" />
              </Form.Item>
              <Typography.Text type="secondary">
                保存后会保持当前周期天数不变，结束日期和已有视频排期一起往后推。
              </Typography.Text>
            </Form>
          </Modal>
        </>
      ) : null}
    </>
  );
}
