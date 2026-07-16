"use client";

import { Button, Card, Modal, Popconfirm, Space, Switch, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { GeneratedVideoRecord, VideoPublishCycleRecord } from "@/lib/admin-types";
import {
  buildDownloadFileName,
  buildVideoPreviewUrl,
  buildYoutubeUploadCopy,
  formatYoutubeUploadCopy,
} from "@/lib/video-cycle-ui";

type VideoCycleEditorProps = {
  cycle: VideoPublishCycleRecord;
  initialVideos: GeneratedVideoRecord[];
};

type DayVideoRow = {
  dayIndex: number;
  date: string;
  videos: GeneratedVideoRecord[];
};

function addDaysToIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDayRows(cycle: VideoPublishCycleRecord, videos: GeneratedVideoRecord[]) {
  const start = new Date(`${cycle.start_date}T00:00:00`);
  const end = new Date(`${cycle.end_date}T00:00:00`);
  const dayCount = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const rows: DayVideoRow[] = Array.from({ length: dayCount }, (_, index) => ({
    dayIndex: index + 1,
    date: addDaysToIsoDate(cycle.start_date, index),
    videos: [],
  }));

  videos.forEach((video, index) => {
    const rowIndex = video.day_index ?? index;
    rows[rowIndex]?.videos.push(video);
  });

  return rows;
}

function getVideoLabel(record: GeneratedVideoRecord) {
  const category = record.category_name_zh || record.category_name;
  const pose = record.pose_title_zh || record.pose_title || record.pose_key;
  return pose ? `${category} / ${pose}` : category;
}

type CopyFieldProps = {
  label: string;
  value: string;
  strong?: boolean;
  preWrap?: boolean;
  onCopy: (label: string, value: string) => void;
};

function CopyField({ label, value, strong, preWrap, onCopy }: CopyFieldProps) {
  return (
    <div>
      <Space size={8} align="center" style={{ marginBottom: 6 }}>
        <Typography.Text strong>{label}：</Typography.Text>
        <Button size="small" onClick={() => onCopy(label, value)}>
          复制
        </Button>
      </Space>
      <Typography.Paragraph
        strong={strong}
        style={{ whiteSpace: preWrap ? "pre-wrap" : undefined, margin: 0 }}
      >
        {value}
      </Typography.Paragraph>
    </div>
  );
}

function YoutubeCopyPanel({
  record,
  onCopy,
}: {
  record: GeneratedVideoRecord;
  onCopy: (label: string, value: string) => void;
}) {
  const copy = buildYoutubeUploadCopy(record);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px minmax(0, 1fr)",
        gap: 20,
        alignItems: "start",
      }}
    >
      <Space orientation="vertical" size={10} style={{ width: 160 }}>
        <video
          src={buildVideoPreviewUrl(record.local_file_path)}
          muted
          loop
          playsInline
          preload="metadata"
          style={{
            width: 120,
            height: 120,
            objectFit: "cover",
            borderRadius: 8,
            background: "#000",
            display: "block",
          }}
        />
        <Button
          size="small"
          href={buildVideoPreviewUrl(record.local_file_path)}
          download={buildDownloadFileName(record)}
        >
          下载视频
        </Button>
        <Button size="small" href={buildVideoPreviewUrl(record.local_file_path)} target="_blank">
          打开预览
        </Button>
      </Space>

      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Button size="small" onClick={() => onCopy("全部文案", formatYoutubeUploadCopy(record))}>
          复制全部文案
        </Button>
        <CopyField label="标题" value={copy.title} strong onCopy={onCopy} />
        <CopyField label="描述" value={copy.description} preWrap onCopy={onCopy} />
        <CopyField label="标签" value={copy.tags} onCopy={onCopy} />
        <CopyField label="Hashtags" value={copy.hashtags} onCopy={onCopy} />
        <CopyField label="上传设置建议" value={copy.uploadSettings} preWrap onCopy={onCopy} />
      </Space>
    </div>
  );
}

export function VideoCycleEditor({ cycle, initialVideos }: VideoCycleEditorProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [videos, setVideos] = useState(initialVideos);
  const [editingDay, setEditingDay] = useState<DayVideoRow | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<number | null>(null);
  const [updatingDayIndex, setUpdatingDayIndex] = useState<number | null>(null);
  const dayRows = useMemo(() => buildDayRows(cycle, videos), [cycle, videos]);
  const editingDayVideos = useMemo(
    () => (editingDay ? dayRows.find((row) => row.dayIndex === editingDay.dayIndex)?.videos ?? [] : []),
    [dayRows, editingDay],
  );

  const handleCopy = useCallback(
    async (label: string, value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        messageApi.success(`${label}已复制。`);
      } catch {
        messageApi.error("复制失败，请检查浏览器剪贴板权限。");
      }
    },
    [messageApi],
  );

  const refreshVideos = useCallback(async () => {
    const response = await fetch(`/api/admin/video-cycles/${cycle.id}/videos`, { cache: "no-store" });
    const data = (await response.json()) as { items?: GeneratedVideoRecord[]; error?: string };
    if (!response.ok || !data.items) {
      throw new Error(data.error || "刷新视频数据失败。");
    }
    setVideos(data.items);
  }, [cycle.id]);

  const handleToggleDayUploaded = useCallback(
    async (row: DayVideoRow, uploaded: boolean) => {
      if (row.videos.length === 0) {
        messageApi.warning("这一天还没有视频数据。");
        return;
      }

      setUpdatingDayIndex(row.dayIndex);
      try {
        await Promise.all(
          row.videos.map(async (video) => {
            const response = await fetch(`/api/admin/generated-videos/${video.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uploaded }),
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok || data.error) {
              throw new Error(data.error || "更新视频发布状态失败。");
            }
          }),
        );

        await refreshVideos();
        messageApi.success(uploaded ? "这一天已标记为发布完成。" : "这一天已标记为未发布。");
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "更新视频发布状态失败。");
      } finally {
        setUpdatingDayIndex(null);
      }
    },
    [messageApi, refreshVideos],
  );

  const handleDeleteVideo = useCallback(
    async (record: GeneratedVideoRecord) => {
      setDeletingVideoId(record.id);
      try {
        const response = await fetch(`/api/admin/generated-videos/${record.id}`, { method: "DELETE" });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "删除视频数据失败。");
        }

        setVideos((current) => current.filter((video) => video.id !== record.id));
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        messageApi.success("视频数据已删除。");
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "删除视频数据失败。");
      } finally {
        setDeletingVideoId(null);
      }
    },
    [messageApi],
  );

  const columns = useMemo<ColumnsType<DayVideoRow>>(
    () => [
      {
        title: "周期日",
        dataIndex: "dayIndex",
        key: "dayIndex",
        width: 120,
        render: (dayIndex: number) => <Typography.Text strong>Day {dayIndex}</Typography.Text>,
      },
      {
        title: "日期",
        dataIndex: "date",
        key: "date",
        width: 160,
      },
      {
        title: "关联视频数据",
        key: "videos",
        render: (_: unknown, row) =>
          row.videos.length > 0 ? (
            <Space wrap>
              {row.videos.map((video) => (
                <Tag key={video.id}>{getVideoLabel(video)}</Tag>
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary">-</Typography.Text>
          ),
      },
      {
        title: "数量",
        key: "count",
        width: 100,
        render: (_: unknown, row) => `${row.videos.length}/1`,
      },
      {
        title: "发布完成",
        key: "uploaded",
        width: 150,
        render: (_: unknown, row) => {
          const checked = row.videos.length > 0 && row.videos.every((video) => video.uploaded);
          return (
            <Switch
              checked={checked}
              checkedChildren="已发布"
              unCheckedChildren="未发布"
              disabled={row.videos.length === 0}
              loading={updatingDayIndex === row.dayIndex}
              onChange={(value) => void handleToggleDayUploaded(row, value)}
            />
          );
        },
      },
      {
        title: "操作",
        key: "actions",
        width: 100,
        render: (_: unknown, row) => (
          <Button type="link" onClick={() => setEditingDay(row)}>
            编辑
          </Button>
        ),
      },
    ],
    [handleToggleDayUploaded, updatingDayIndex],
  );

  return (
    <>
      {contextHolder}
      <Card
        title={
          <Space size={12}>
            <Link href="/admin/video-cycles">返回</Link>
            <span>视频周期编辑</span>
            <Tag color="blue">周期 ID：{cycle.id}</Tag>
          </Space>
        }
        variant="borderless"
      >
        <Space orientation="vertical" size={18} style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            时间段：{cycle.start_date} ~ {cycle.end_date}；已生成视频 {videos.length} 个。每天展示 1
            个类型视频数据。
          </Typography.Text>
          <Table rowKey="dayIndex" columns={columns} dataSource={dayRows} pagination={false} />
        </Space>
      </Card>

      <Modal
        title={editingDay ? `编辑 Day ${editingDay.dayIndex} - ${editingDay.date}` : "编辑日期视频"}
        open={Boolean(editingDay)}
        onCancel={() => setEditingDay(null)}
        footer={[
          <Button key="close" onClick={() => setEditingDay(null)}>
            关闭
          </Button>,
        ]}
        width={1080}
        destroyOnHidden
      >
        {editingDay && editingDayVideos.length > 0 ? (
          <Tabs
            items={editingDayVideos.map((video, index) => ({
              key: String(video.id),
              label: (
                <Space size={4}>
                  <span>视频 {index + 1}</span>
                  <Popconfirm
                    title="确认删除这个视频数据吗？"
                    description="删除后会移除当前周期里的这条视频数据，并删除本地 MP4 文件。"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => void handleDeleteVideo(video)}
                  >
                    <Button
                      type="link"
                      size="small"
                      danger
                      loading={deletingVideoId === video.id}
                      onClick={(event) => event.stopPropagation()}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
              children: <YoutubeCopyPanel record={video} onCopy={handleCopy} />,
            }))}
          />
        ) : (
          <Typography.Text type="secondary">当天还没有关联的视频数据。</Typography.Text>
        )}
      </Modal>
    </>
  );
}
