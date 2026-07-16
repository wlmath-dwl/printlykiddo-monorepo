"use client";

import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, message, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";

type CountRow = { status?: string; page_type?: string; count: number };
type PageRow = {
  id: number;
  url: string;
  r2_key: string;
  page_type: string;
  status: string;
  dirty_reason: string | null;
  last_error: string | null;
  updated_at: string;
};
type RegistryResponse = {
  initialized: boolean;
  total: number;
  rows: PageRow[];
  byStatus: CountRow[];
  byType: CountRow[];
  error?: string;
};

const statusColors: Record<string, string> = {
  published: "green",
  built: "blue",
  dirty: "gold",
  failed: "red",
  deleted: "default",
};

export function SitePageManager() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [status, setStatus] = useState<string>();
  const [pageType, setPageType] = useState<string>();
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (status) params.set("status", status);
      if (pageType) params.set("page_type", pageType);
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/admin/site-pages?${params}`, { cache: "no-store" });
      const result = await response.json() as RegistryResponse;
      if (!response.ok) throw new Error(result.error || "读取 URL 清单失败");
      setData(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "读取 URL 清单失败");
    } finally {
      setLoading(false);
    }
  }, [pageType, query, status]);

  useEffect(() => { void load(); }, [load]);

  async function run(nextAction: "scan" | "build" | "publish-local" | "rebuild", scope?: string) {
    setAction(nextAction);
    try {
      const response = await fetch("/api/admin/site-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: nextAction,
          scope,
          origin: "http://localhost:3000",
          limit: nextAction === "build" ? 100 : undefined,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "操作失败");
      message.success(nextAction === "scan" ? "已重新扫描本地数据和代码" : "本地操作完成");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setAction(null);
    }
  }

  const statusCount = useMemo<Record<string, number>>(
    () => Object.fromEntries((data?.byStatus || []).map((item) => [item.status || "unknown", Number(item.count)])),
    [data],
  );
  const columns: ColumnsType<PageRow> = [
    { title: "URL", dataIndex: "url", width: 330, render: (value: string) => <Typography.Text copyable>{value}</Typography.Text> },
    { title: "页面类型", dataIndex: "page_type", width: 160 },
    { title: "状态", dataIndex: "status", width: 110, render: (value: string) => <Tag color={statusColors[value]}>{value}</Tag> },
    { title: "原因 / 错误", key: "reason", render: (_, row) => row.last_error || row.dirty_reason || "—" },
    { title: "R2 Key", dataIndex: "r2_key", width: 300, ellipsis: true },
    { title: "操作", key: "actions", width: 100, render: (_, row) => <Button size="small" onClick={() => void run("rebuild", row.url)}>重建</Button> },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>URL 与静态页</Typography.Title>
        <Typography.Text type="secondary">根据本地数据库、词库和前台代码计算受影响 URL；这里只构建并发布到本地 R2 目录。</Typography.Text>
      </div>
      <Alert type="info" showIcon title="本地迁移模式" description="不会上传 R2、部署 Worker 或清理线上缓存。构建前请在 3000 端口启动前台渲染器。" />
      <Space wrap>
        <Card><Statistic title="全部 URL" value={Object.values(statusCount).reduce((sum, value) => sum + Number(value), 0)} /></Card>
        <Card><Statistic title="待构建" value={statusCount.dirty || 0} /></Card>
        <Card><Statistic title="已构建待发布" value={statusCount.built || 0} /></Card>
        <Card><Statistic title="本地已发布" value={statusCount.published || 0} /></Card>
        <Card><Statistic title="失败" value={statusCount.failed || 0} styles={{ content: { color: statusCount.failed ? "#cf1322" : undefined } }} /></Card>
      </Space>
      <Card>
        <Space wrap>
          <Button type="primary" loading={action === "scan"} onClick={() => void run("scan")}>扫描变更</Button>
          <Button loading={action === "build"} onClick={() => void run("build")}>构建下一批（100 页）</Button>
          <Button loading={action === "publish-local"} onClick={() => void run("publish-local")}>发布到本地 R2</Button>
          <Button danger loading={action === "rebuild"} onClick={() => void run("rebuild", "all")}>全部标记重建</Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        </Space>
      </Card>
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索 URL 或 R2 Key" value={query} onChange={(event) => setQuery(event.target.value)} style={{ width: 280 }} />
          <Select allowClear placeholder="状态" value={status} onChange={setStatus} style={{ width: 150 }} options={(data?.byStatus || []).map((item) => ({ value: item.status, label: `${item.status} (${item.count})` }))} />
          <Select allowClear placeholder="页面类型" value={pageType} onChange={setPageType} style={{ width: 210 }} options={(data?.byType || []).map((item) => ({ value: item.page_type, label: `${item.page_type} (${item.count})` }))} />
        </Space>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={data?.rows || []} pagination={{ pageSize: 50, showSizeChanger: false }} scroll={{ x: 1200 }} />
      </Card>
    </Space>
  );
}
