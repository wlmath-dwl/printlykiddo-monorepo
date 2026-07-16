"use client";

import { Badge, Button, Input, Modal, Space, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SyncSummary = {
  pending_count: number;
  failed_count: number;
  last_synced_at: string | null;
  categories_pending: number;
  actives_pending: number;
  imgs_pending: number;
  files_pending: number;
};

type SyncRunState = {
  run_id: string | null;
  status: "idle" | "running" | "paused" | "completed" | "failed";
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  total_count: number;
  pause_requested?: boolean;
  entries: Array<{
    timestamp: string;
    message: string;
  }>;
  error: string | null;
};

type SyncResultRow = {
  id: number | string;
  entity_type: string;
  entity_id: number | string;
  operation: string;
  success: boolean;
  error?: string;
};

type RunResponse = {
  summary: SyncSummary;
  started?: boolean;
  already_running?: boolean;
  sync_run?: SyncRunState;
  processed_count: number;
  success_count: number;
  failure_count: number;
  results?: SyncResultRow[];
};

type StatusResponse = SyncSummary & {
  sync_run?: SyncRunState | null;
};

type PauseResponse = {
  paused?: boolean;
  already_stopped?: boolean;
  sync_run?: SyncRunState;
  summary: SyncSummary;
};

type ClearIsrCacheResponse = {
  bucketName: string;
  prefix: string;
  deletedCount: number;
};

type SyncTriggerMode = "default" | "manual";
const SUPPRESSED_AUTO_OPEN_RUN_ID_KEY =
  "printly-admin.sync.suppressed-auto-open-run-id";

function appendLogLine(current: string, next: string) {
  return current.trim() ? `${current}\n${next}` : next;
}

function formatTime(value: string | null) {
  if (!value) {
    return "尚未同步";
  }

  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getSuppressedAutoOpenRunId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(SUPPRESSED_AUTO_OPEN_RUN_ID_KEY);
}

function setSuppressedAutoOpenRunId(runId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!runId) {
    window.sessionStorage.removeItem(SUPPRESSED_AUTO_OPEN_RUN_ID_KEY);
    return;
  }

  window.sessionStorage.setItem(SUPPRESSED_AUTO_OPEN_RUN_ID_KEY, runId);
}

export function SyncToolbar() {
  const [messageApi, contextHolder] = message.useMessage();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [syncRunning, setSyncRunning] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalTitle, setLogModalTitle] = useState("同步日志");
  const [syncLog, setSyncLog] = useState("");
  const [syncRun, setSyncRun] = useState<SyncRunState | null>(null);
  const [clearingIsrCache, setClearingIsrCache] = useState(false);
  const handledRunKeyRef = useRef<string | null>(null);
  const autoOpenedRunKeyRef = useRef<string | null>(null);
  const observedRunningRunIdRef = useRef<string | null>(null);

  const badgeCount = useMemo(() => {
    if (!summary) {
      return 0;
    }

    return summary.pending_count + summary.failed_count;
  }, [summary]);

  const fetchStatus = useCallback(async (): Promise<SyncSummary | null> => {
    try {
      const response = await fetch("/api/admin/sync/status", { cache: "no-store" });
      const data = (await response.json()) as StatusResponse | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "获取同步状态失败。");
      }

      setSummary(data);
      setSyncRun(data.sync_run ?? null);
      if (data.sync_run) {
        setSyncRunning(data.sync_run.status === "running");
        if (data.sync_run.entries.length > 0) {
          setSyncLog(data.sync_run.entries.map((entry) => entry.message).join("\n"));
          setLogModalTitle(
            data.sync_run.status === "running"
              ? "同步日志"
              : data.sync_run.status === "paused"
                ? "同步已暂停"
              : data.sync_run.status === "failed"
                ? "同步完成（有异常）"
                : "同步完成",
          );
        }
      }
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取同步状态失败。";
      messageApi.error(errorMessage);
      return null;
    }
  }, [messageApi]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!syncRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchStatus();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [fetchStatus, syncRunning]);

  useEffect(() => {
    const handleRefresh = () => {
      void fetchStatus();
    };

    window.addEventListener("admin-local-changes", handleRefresh);
    window.addEventListener("admin-sync-finished", handleRefresh);

    return () => {
      window.removeEventListener("admin-local-changes", handleRefresh);
      window.removeEventListener("admin-sync-finished", handleRefresh);
    };
  }, [fetchStatus]);

  useEffect(() => {
    if (!syncRun || syncRun.status !== "running") {
      return;
    }

    const currentRunId = syncRun.run_id ?? "none";
    observedRunningRunIdRef.current = currentRunId;

    if (syncRun.pause_requested) {
      setSuppressedAutoOpenRunId(currentRunId);
    }

    if (getSuppressedAutoOpenRunId() === currentRunId) {
      return;
    }

    const runKey = `${currentRunId}:${syncRun.status}`;
    if (autoOpenedRunKeyRef.current === runKey) {
      return;
    }

    autoOpenedRunKeyRef.current = runKey;
    setLogModalOpen(true);
  }, [syncRun]);

  const showLogModal = useCallback((title: string, report?: string) => {
    setLogModalTitle(title);
    if (report !== undefined) {
      setSyncLog(report);
    }
    setLogModalOpen(true);
  }, []);

  const copySyncLog = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(syncLog);
      messageApi.success("已复制到剪贴板");
    } catch {
      messageApi.error("复制失败，请手动全选文本复制");
    }
  }, [messageApi, syncLog]);

  const pauseSync = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/sync/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as PauseResponse | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "暂停同步失败。");
      }

      setSummary(data.summary);
      if (data.sync_run) {
        setSyncRun(data.sync_run);
        setSyncRunning(data.sync_run.status === "running");
        setSuppressedAutoOpenRunId(data.sync_run.run_id ?? null);
      }

      messageApi.success(
        data.already_stopped
          ? "当前没有正在执行的同步任务。"
          : "已请求暂停：当前处理项完成后将停止后续同步。",
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "暂停同步失败。";
      messageApi.error(errorMessage);
    }
  }, [messageApi]);

  const clearIsrCache = useCallback(async () => {
    setClearingIsrCache(true);
    try {
      const response = await fetch("/api/admin/sync/clear-isr-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as ClearIsrCacheResponse | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "清空 ISR 缓存失败。");
      }

      messageApi.success(`已清空 ISR 缓存：删除 ${data.deletedCount} 个对象。`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "清空 ISR 缓存失败。";
      messageApi.error(errorMessage);
    } finally {
      setClearingIsrCache(false);
    }
  }, [messageApi]);

  const triggerSync = useCallback(async (mode: SyncTriggerMode) => {
    setSuppressedAutoOpenRunId(null);

    if (syncRunning) {
      setLogModalOpen(true);
      return;
    }

    setLogModalOpen(true);

    const currentSummary = await fetchStatus();

    if (
      mode === "default" &&
      (currentSummary?.pending_count ?? 0) +
        (currentSummary?.failed_count ?? 0) +
        (currentSummary?.categories_pending ?? 0) +
        (currentSummary?.actives_pending ?? 0) +
        (currentSummary?.imgs_pending ?? 0) +
        (currentSummary?.files_pending ?? 0) === 0
    ) {
      showLogModal("同步日志", "当前没有需要同步的变更。");
      return;
    }

    setLogModalTitle("同步日志");
    setSyncLog(mode === "manual" ? "开始手动同步..." : "开始同步...");
    setSyncRunning(true);

    try {
      const response = await fetch(
        mode === "manual" ? "/api/admin/sync/manual" : "/api/admin/sync/run",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        },
      );
      const data = (await response.json()) as RunResponse | { error: string };

      if (!response.ok || "error" in data) {
        const err = "error" in data ? data.error : "执行同步失败。";
        setLogModalTitle("同步日志");
        setSyncLog((current) => appendLogLine(current, `FAILED | ${err}`));
        setSyncRunning(false);
        await fetchStatus();
        return;
      }

      setSummary(data.summary);
      if ("sync_run" in data && data.sync_run) {
        setSyncRun(data.sync_run);
        setSyncRunning(data.sync_run.status === "running");
        setSyncLog(data.sync_run.entries.map((entry) => entry.message).join("\n"));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "执行同步失败。";
      setLogModalTitle("同步日志");
      setSyncLog((current) => appendLogLine(current, `FAILED | ${errorMessage}`));
      setSyncRunning(false);
      await fetchStatus();
    }
  }, [fetchStatus, showLogModal, syncRunning]);

  useEffect(() => {
    if (!syncRun || syncRun.status === "idle" || syncRun.status === "running") {
      return;
    }

    const currentRunId = syncRun.run_id ?? "none";
    if (observedRunningRunIdRef.current !== currentRunId) {
      handledRunKeyRef.current = `${currentRunId}:${syncRun.status}`;
      return;
    }

    const runKey = `${syncRun.run_id ?? "none"}:${syncRun.status}`;
    if (handledRunKeyRef.current === runKey) {
      return;
    }

    handledRunKeyRef.current = runKey;
    observedRunningRunIdRef.current = null;
    window.dispatchEvent(new CustomEvent("admin-sync-finished"));
    if (syncRun.status === "failed") {
      messageApi.warning("同步结束，但执行过程中有异常。");
      return;
    }

    if (syncRun.status === "paused") {
      messageApi.info("同步已暂停，剩余队列保留待下次继续。");
      return;
    }

    const failureCount = syncRun.entries.filter((entry) => entry.message.startsWith("FAILED")).length;
    if (failureCount > 0) {
      messageApi.warning(`同步完成，但有 ${failureCount} 项失败。`);
      return;
    }

    messageApi.success(`同步完成：已处理 ${syncRun.processed_count} 项。`);
  }, [messageApi, syncRun]);

  return (
    <Space size={12}>
      {contextHolder}
      <Typography.Text type="secondary">
        最近同步: {formatTime(summary?.last_synced_at ?? null)}
      </Typography.Text>
      <Badge count={badgeCount} size="small">
        <Button
          type="primary"
          onClick={() => void triggerSync("default")}
          loading={syncRunning}
          disabled={syncRunning}
        >
          一键同步
        </Button>
      </Badge>
      <Button
        onClick={() => void triggerSync("manual")}
        loading={syncRunning}
        disabled={syncRunning}
      >
        手动同步
      </Button>
      <Button
        danger
        onClick={() => void clearIsrCache()}
        loading={clearingIsrCache}
        disabled={syncRunning || clearingIsrCache}
      >
        清空 ISR 缓存
      </Button>

      <Modal
        title={logModalTitle}
        open={logModalOpen}
        onCancel={() => setLogModalOpen(false)}
        onOk={() => setLogModalOpen(false)}
        okText="关闭"
        width={640}
        footer={[
          <Button key="copy" onClick={() => void copySyncLog()}>
            复制全部
          </Button>,
          ...(syncRun?.status === "running"
            ? [
                <Button key="pause" onClick={() => void pauseSync()}>
                  暂停同步
                </Button>,
              ]
            : []),
          <Button key="ok" type="primary" onClick={() => setLogModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          这里会保留本次同步的逐条日志。同步过程中关闭后，再点同步按钮会重新打开此弹窗。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {syncRun?.status === "running"
            ? `正在同步：已处理 ${syncRun?.processed_count ?? 0} 项 / 共 ${syncRun?.total_count ?? 0} 项`
            : syncRun?.status === "paused"
              ? `同步已暂停：已处理 ${syncRun?.processed_count ?? 0} 项 / 共 ${syncRun?.total_count ?? 0} 项`
              : "当前未在执行同步任务。"}
        </Typography.Paragraph>
        <Input.TextArea
          value={syncLog}
          readOnly
          autoSize={{ minRows: 10, maxRows: 22 }}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13 }}
        />
      </Modal>
    </Space>
  );
}
