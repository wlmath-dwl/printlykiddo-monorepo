"use client";

import { Button, Card, Input, Modal, Popconfirm, Space, Switch, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type {
  PinPublishCycleCategoryRecord,
  PinPublishCycleRecord,
  PinPublishScheduleItemRecord,
} from "@/lib/admin-types";
import { buildPinterestImageFileName } from "@/lib/pinterest-file-name";

type PinPublishCyclePageProps = {
  cycle: PinPublishCycleRecord;
  initialCategories: PinPublishCycleCategoryRecord[];
  initialItems: PinPublishScheduleItemRecord[];
};

function addDaysToIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCycleDayRows(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const count = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return Array.from({ length: count }, (_, dayIndex) => ({
    key: dayIndex,
    dayIndex,
    label: `Day ${dayIndex + 1}`,
    date: addDaysToIsoDate(startDate, dayIndex),
  }));
}

function getImageFileExtension(imageUrl: string) {
  if (imageUrl.startsWith("data:image/png")) {
    return "png";
  }
  if (imageUrl.startsWith("data:image/jpeg") || imageUrl.startsWith("data:image/jpg")) {
    return "jpg";
  }
  return "png";
}

function toPinterestTimeLabel(value: string) {
  const [hourText, minuteText = "00"] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return value;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${minuteText.padStart(2, "0")} ${period}`;
}

function buildPinterestFormPayload(item: PinPublishScheduleItemRecord, cycle: PinPublishCycleRecord) {
  return {
    title: item.title ?? "",
    description: item.description ?? "",
    link: item.pin_url ?? "",
    board: item.board ?? "",
    section: item.section ?? "",
    alt_text: item.alt_text ?? "",
    tags: item.tags ?? "",
    publish_date: addDaysToIsoDate(cycle.start_date, item.day_index),
    publish_time: toPinterestTimeLabel(item.publish_time),
    allow_comments: true,
    show_similar_products: false,
  };
}

function getCycleDisplayStatus(record: PinPublishCycleRecord) {
  const today = getLocalIsoDate();
  if (record.status === "completed" || record.end_date < today) return { label: "已完成", color: "green" };
  if (record.status === "uploaded") return { label: "已上传", color: "blue" };
  return { label: "待上传", color: "gold" };
}

export function PinPublishCyclePage({
  cycle: initialCycle,
  initialCategories,
  initialItems,
}: PinPublishCyclePageProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [cycle, setCycle] = useState(initialCycle);
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [completing, setCompleting] = useState(false);
  const [removingCategoryId, setRemovingCategoryId] = useState<number | null>(null);
  const [updatingDayIndex, setUpdatingDayIndex] = useState<number | null>(null);
  const [activeDay, setActiveDay] = useState("0");
  const [editingDay, setEditingDay] = useState<number | null>(null);

  const itemsByDay = useMemo(() => {
    const map = new Map<number, PinPublishScheduleItemRecord[]>();
    for (const item of items) {
      const list = map.get(item.day_index) ?? [];
      list.push(item);
      map.set(item.day_index, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.slot_index - b.slot_index);
    }
    return map;
  }, [items]);
  const status = getCycleDisplayStatus(cycle);

  const refreshItems = useCallback(async () => {
    const response = await fetch(`/api/admin/pin-publish-cycles/${cycle.id}/items`, { cache: "no-store" });
    const data = (await response.json()) as { items?: PinPublishScheduleItemRecord[]; error?: string };
    if (!response.ok || !data.items) {
      throw new Error(data.error || "刷新排期失败。");
    }
    setItems(data.items);
  }, [cycle.id]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      const response = await fetch(`/api/admin/pin-publish-cycles/${cycle.id}/complete`, { method: "POST" });
      const data = (await response.json()) as PinPublishCycleRecord | { error?: string };
      if (!response.ok || !("id" in data)) {
        throw new Error("error" in data ? data.error : "设置完成失败。");
      }
      setCycle(data);
      await refreshItems();
      messageApi.success("周期已标记为已上传。");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "设置完成失败。");
    } finally {
      setCompleting(false);
    }
  }, [cycle.id, messageApi, refreshItems]);

  const handleRemoveCategory = useCallback(
    async (categoryId: number) => {
      setRemovingCategoryId(categoryId);
      try {
        const response = await fetch(`/api/admin/pin-publish-cycles/${cycle.id}/categories?category_id=${categoryId}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as {
          categories?: { items: PinPublishCycleCategoryRecord[] };
          items?: { items: PinPublishScheduleItemRecord[] };
          error?: string;
        };
        if (!response.ok || !data.categories || !data.items) {
          throw new Error(data.error || "移除绑定分类失败。");
        }
        setCategories(data.categories.items);
        setItems(data.items.items);
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        messageApi.success("已移除当前周期的绑定分类。");
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "移除绑定分类失败。");
      } finally {
        setRemovingCategoryId(null);
      }
    },
    [cycle.id, messageApi],
  );

  const handleDownloadImage = useCallback((item: PinPublishScheduleItemRecord) => {
    if (!item.image_url) {
      return;
    }
    const link = document.createElement("a");
    link.href = item.image_url;
    const extension = getImageFileExtension(item.image_url);
    link.download = buildPinterestImageFileName({
      subject: item.source_category_name,
      variant: item.variant_key,
      extension,
      descriptor: item.source_pose_key,
    });
    link.click();
  }, []);

  const handleCopyPinterestFormJson = useCallback(
    async (item: PinPublishScheduleItemRecord) => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(buildPinterestFormPayload(item, cycle), null, 2));
        messageApi.success("已复制 Pinterest 填表 JSON。");
      } catch {
        messageApi.error("复制填表 JSON 失败。");
      }
    },
    [cycle, messageApi],
  );

  const dayRows = useMemo(() => getCycleDayRows(cycle.start_date, cycle.end_date), [cycle.end_date, cycle.start_date]);
  const expectedItemCount = dayRows.length * 6;

  const handleToggleDayUploaded = useCallback(
    async (dayIndex: number, uploaded: boolean) => {
      const dayItems = itemsByDay.get(dayIndex) ?? [];
      if (dayItems.length === 0) {
        messageApi.warning("这一天还没有排期数据。");
        return;
      }

      setUpdatingDayIndex(dayIndex);
      try {
        await Promise.all(
          dayItems.map(async (item) => {
            const response = await fetch(`/api/admin/pin-publish-cycles/${cycle.id}/items`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: item.id, uploaded }),
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok || data.error) {
              throw new Error(data.error || "更新发布状态失败。");
            }
          }),
        );

        await refreshItems();
        messageApi.success(uploaded ? "这一天已标记为发布完成。" : "这一天已标记为未发布。");
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "更新发布状态失败。");
      } finally {
        setUpdatingDayIndex(null);
      }
    },
    [cycle.id, itemsByDay, messageApi, refreshItems],
  );

  const columns = useMemo<ColumnsType<(typeof dayRows)[number]>>(
    () => [
      { title: "周期日", dataIndex: "label", key: "label", width: 100 },
      { title: "日期", dataIndex: "date", key: "date", width: 140 },
      {
        title: "发布完成",
        key: "uploaded",
        width: 150,
        render: (_: unknown, row) => {
          const dayItems = itemsByDay.get(row.dayIndex) ?? [];
          const checked = dayItems.length > 0 && dayItems.every((item) => item.uploaded);
          return (
            <Switch
              checked={checked}
              checkedChildren="已发布"
              unCheckedChildren="未发布"
              disabled={dayItems.length === 0}
              loading={updatingDayIndex === row.dayIndex}
              onChange={(value) => void handleToggleDayUploaded(row.dayIndex, value)}
            />
          );
        },
      },
      {
        title: "操作",
        key: "actions",
        width: 120,
        render: (_: unknown, row) => (
          <Button type="link" onClick={() => setEditingDay(row.dayIndex)}>
            查看
          </Button>
        ),
      },
    ],
    [handleToggleDayUploaded, itemsByDay, updatingDayIndex],
  );

  const editingDayItems = editingDay === null ? [] : itemsByDay.get(editingDay) ?? [];
  const editingDayRow = editingDay === null ? null : dayRows.find((row) => row.dayIndex === editingDay) ?? null;
  return (
    <>
      {contextHolder}
      <Card
        title={
          <Space>
            <Link href="/admin/pin-publish">
              <Button type="link" style={{ paddingInline: 0 }}>
                返回
              </Button>
            </Link>
            <span>周期 ID：{cycle.id}</span>
            <Tag color={status.color}>{status.label}</Tag>
          </Space>
        }
        variant="borderless"
        extra={
          <Button type="primary" loading={completing} onClick={() => void handleComplete()}>
            总的完成
          </Button>
        }
      >
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          周期 ID：{cycle.id}　时间段：{cycle.start_date} ~ {cycle.end_date}　完整度：
          {cycle.filled_item_count}/{expectedItemCount}
        </Typography.Text>
        <Card size="small" title="当前周期绑定分类" style={{ marginBottom: 16 }}>
          {categories.length > 0 ? (
            <Space wrap>
              {categories.map((item) => (
                <Tag
                  key={item.category_id}
                  closable={false}
                  style={{ padding: "6px 8px", fontSize: 14 }}
                >
                  <Space size={6}>
                    <span>
                      {item.category_name}
                      {item.category_name_zh ? ` / ${item.category_name_zh}` : ""}
                      {item.pose_title_zh || item.pose_title || item.pose_key
                        ? ` · ${item.pose_title_zh || item.pose_title || item.pose_key}`
                        : ""}
                    </span>
                    <Popconfirm
                      title="确认移除这个绑定分类吗？"
                      description="会移除它在当前周期里的 Pin 图文和排期。"
                      okText="移除"
                      cancelText="取消"
                      onConfirm={() => void handleRemoveCategory(item.category_id)}
                    >
                      <Button
                        type="link"
                        danger
                        size="small"
                        loading={removingCategoryId === item.category_id}
                        style={{ padding: 0, height: "auto" }}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </Tag>
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary">暂无绑定分类，请从三级类型编辑页生成 Pin 并保存到该周期。</Typography.Text>
          )}
        </Card>
        <Table rowKey="key" columns={columns} dataSource={dayRows} pagination={false} />
      </Card>
      <Modal
        title={editingDayRow ? `${editingDayRow.label} ${editingDayRow.date} 图文数据` : "每日排期"}
        open={editingDay !== null}
        onCancel={() => setEditingDay(null)}
        footer={null}
        width={860}
        destroyOnHidden
      >
        <Tabs
          activeKey={activeDay}
          onChange={setActiveDay}
          items={editingDayItems.map((item) => ({
            key: String(item.slot_index),
            label: `${item.publish_time} ${item.source_category_name}`,
            children: (
              <Space orientation="vertical" style={{ width: "100%" }}>
                <Typography.Text type="secondary">
                  类型：{item.source_category_name}
                  {item.source_category_name_zh ? ` / ${item.source_category_name_zh}` : ""}
                  {item.source_pose_title_zh || item.source_pose_title || item.source_pose_key
                    ? ` · ${item.source_pose_title_zh || item.source_pose_title || item.source_pose_key}`
                    : ""}
                  {"　"}发布时间：{item.publish_time}
                </Typography.Text>
                <Space align="start" size={12}>
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.title ?? item.source_category_name}
                      style={{
                        display: "block",
                        width: 120,
                        height: 120,
                        objectFit: "cover",
                        border: "1px solid #f0f0f0",
                        borderRadius: 8,
                        background: "#fafafa",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 120,
                        height: 120,
                        border: "1px dashed #d9d9d9",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#999",
                      }}
                    >
                      未设置图片
                    </div>
                  )}
                  <Space orientation="vertical" size={8}>
                    <Typography.Text strong>{item.label || "Pin 图"}</Typography.Text>
                    <Button disabled={!item.image_url} onClick={() => handleDownloadImage(item)}>
                      下载图片
                    </Button>
                    <Button onClick={() => void handleCopyPinterestFormJson(item)}>
                      复制填表 JSON
                    </Button>
                  </Space>
                </Space>
                {[
                  { label: "标题", value: item.title ?? "", minRows: 1, maxRows: 2 },
                  { label: "描述", value: item.description ?? "", minRows: 3, maxRows: 6 },
                  { label: "链接", value: item.pin_url ?? "", minRows: 1, maxRows: 2 },
                  { label: "建议图板", value: item.board ?? "", minRows: 1, maxRows: 1 },
                  { label: "建议分区", value: item.section ?? "", minRows: 1, maxRows: 1 },
                  { label: "替代文本", value: item.alt_text ?? "", minRows: 2, maxRows: 4 },
                  { label: "标签", value: item.tags ?? "", minRows: 2, maxRows: 3 },
                ].map((field) => (
                  <div key={field.label}>
                    <Space size={8} style={{ marginBottom: 4 }}>
                      <Typography.Text strong>{field.label}</Typography.Text>
                      {field.value ? (
                        <Typography.Text
                          copyable={{
                            text: field.value,
                            tooltips: ["复制", "已复制"],
                          }}
                          style={{ fontSize: 12 }}
                          type="secondary"
                        >
                          复制
                        </Typography.Text>
                      ) : null}
                    </Space>
                    <Input.TextArea
                      readOnly
                      value={field.value}
                      autoSize={{ minRows: field.minRows, maxRows: field.maxRows }}
                    />
                  </div>
                ))}
              </Space>
            ),
          }))}
        />
      </Modal>
    </>
  );
}
