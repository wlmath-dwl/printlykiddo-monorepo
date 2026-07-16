"use client";

import { Button, Card, Space, Switch, Tag, Typography, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ToolPageRecord } from "@/lib/tool-local-db";

function ToolActiveSwitch({ tool }: { tool: ToolPageRecord }) {
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const router = useRouter();

  async function update(checked: boolean) {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tools/${tool.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: checked }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "更新工具状态失败。");
      messageApi.success(checked ? "已启用，部署时会生成该工具页面。" : "已停用，部署时不会生成可访问页面。");
      router.refresh();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新工具状态失败。");
    } finally {
      setSaving(false);
    }
  }

  return <>
    {contextHolder}
    <Switch
      checked={Boolean(tool.is_active)}
      checkedChildren="启用"
      unCheckedChildren="停用"
      loading={saving}
      onChange={(checked) => void update(checked)}
    />
  </>;
}

export function ToolManager({ tools }: { tools: ToolPageRecord[] }) {
  return <Card title="工具管理" variant="borderless">
    <Typography.Paragraph type="secondary">
      只有启用的工具会出现在前台导航、工具列表和 Sitemap；停用工具的页面直接返回 404，Word Search 主题 URL 也不会参与静态构建。
    </Typography.Paragraph>
    <div style={{ overflow: "hidden", border: "1px solid #f0f0f0", borderRadius: 8 }}>
      {tools.map((tool, index) => (
        <div
          key={tool.slug}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "16px 24px",
            borderTop: index === 0 ? undefined : "1px solid #f0f0f0",
          }}
        >
          <Space orientation="vertical" size={2}>
            <Typography.Text strong>{tool.title}</Typography.Text>
            <Typography.Text type="secondary">{tool.page_path}</Typography.Text>
          </Space>
          <Space>
            {tool.slug === "word-search-generator" ? <>
              <Tag color="blue">词模式</Tag>
              <Button size="small"><Link href="/admin/activity-library">维护词库</Link></Button>
            </> : null}
            <ToolActiveSwitch tool={tool} />
          </Space>
        </div>
      ))}
    </div>
  </Card>;
}
