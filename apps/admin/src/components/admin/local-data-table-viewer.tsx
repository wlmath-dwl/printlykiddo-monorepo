"use client";

import { Alert, Button, Space, Spin, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LOCAL_DB_VIEW_TABLES, type LocalDbViewTableName } from "@/lib/local-db-viewer-tables";

type ApiRow = Record<string, unknown>;

type ApiResponse = {
  columns: string[];
  rows: ApiRow[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};

type OverwriteResponse = {
  summary: string;
  tables: Array<{
    table: string;
    rows: number;
    added_columns: string[];
    note?: string;
  }>;
  warnings: string[];
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  // JSON 中的 BLOB 常为 { type: 'Buffer', data: number[] }
  const maybeBuffer = value as unknown as { type?: string; data?: unknown };
  if (
    typeof value === "object" &&
    value !== null &&
    maybeBuffer.type === "Buffer" &&
    Array.isArray(maybeBuffer.data)
  ) {
    const data = maybeBuffer.data as number[];
    const hex = data.map((b) => Number(b).toString(16).padStart(2, "0")).join("");
    return hex.length > 48 ? `${hex.slice(0, 48)}…` : hex;
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function LocalDataTableViewer({ table }: { table: LocalDbViewTableName }) {
  const [messageApi, contextHolder] = message.useMessage();
  const label = LOCAL_DB_VIEW_TABLES.find((t) => t.name === table)?.label ?? table;
  const [loading, setLoading] = useState(true);
  const [overwriting, setOverwriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`/api/admin/local-db/tables/${table}?${qs}`, { cache: "no-store" });
      const json = (await res.json()) as ApiResponse & { error?: string };
      if (!res.ok || ("error" in json && json.error)) {
        throw new Error("error" in json && json.error ? json.error : "加载失败");
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, table]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<ApiRow> = useMemo(() => {
    if (!data?.columns?.length) {
      return [];
    }

    return data.columns.map((key) => ({
      title: key,
      dataIndex: key,
      key,
      ellipsis: true,
      width: key.length > 20 ? 200 : 140,
      render: (_: unknown, record: ApiRow) => formatCell(record[key]),
    }));
  }, [data?.columns]);

  const handleOverwriteFromRemote = useCallback(async () => {
    const confirmed = window.confirm(
      "这会用远端 D1 的共享业务数据覆盖本地表，并清空本地同步队列。\n\n该操作用于结构补齐/基线重建，不可撤销。确定继续吗？",
    );
    if (!confirmed) {
      return;
    }

    setOverwriting(true);
    try {
      const response = await fetch("/api/admin/local-db/overwrite-from-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as OverwriteResponse | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "远端覆盖本地失败。");
      }

      const details = data.tables
        .map((item) => {
          const added = item.added_columns.length > 0 ? `，新增列：${item.added_columns.join(", ")}` : "";
          const note = item.note ? `；${item.note}` : "";
          return `${item.table}: ${item.rows} 行${added}${note}`;
        })
        .join("\n");
      const warnings = data.warnings.length > 0 ? `\n\n注意：\n${data.warnings.join("\n")}` : "";

      window.alert(`${data.summary}\n\n${details}${warnings}`);
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "远端覆盖本地失败。");
    } finally {
      setOverwriting(false);
    }
  }, [load, messageApi]);

  return (
    <div>
      {contextHolder}
      <Space
        align="center"
        size={12}
        style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}
      >
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
          本地数据 · {label}
        </Typography.Title>
        <Tag color="blue">总数 {data?.total ?? 0}</Tag>
      </Space>
      <Alert
        type="info"
        showIcon
        title="只读浏览"
        description={
          <div>
            <div>数据来自本机 data/local-admin.sqlite，仅供排查；请勿依赖此页编辑数据。</div>
            <div style={{ marginTop: 12 }}>
              <Button danger loading={overwriting} onClick={() => void handleOverwriteFromRemote()}>
                用远端结构和数据覆盖本地
              </Button>
            </div>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      {error ? (
        <Alert type="error" showIcon title="无法加载数据" description={error} />
      ) : (
        <Spin spinning={loading}>
          <Table<ApiRow>
            size="small"
            scroll={{ x: "max-content" }}
            columns={columns}
            dataSource={data?.rows?.map((row, i) => ({ ...row, key: i })) ?? []}
            pagination={{
              current: page,
              pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [25, 50, 100],
              showTotal: (t) => `共 ${t} 行`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
          />
        </Spin>
      )}
    </div>
  );
}
