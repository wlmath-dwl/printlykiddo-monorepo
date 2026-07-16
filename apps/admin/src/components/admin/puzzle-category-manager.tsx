"use client";

import { EditOutlined, RightOutlined } from "@ant-design/icons";
import { Button, Card, Col, Image, Modal, Row, Space, Switch, Typography, Upload, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PuzzleCategoryRecord } from "@/lib/puzzle-local-db";

function imageUrl(category: PuzzleCategoryRecord) {
  if (!category.cover_image_url && !category.cover_local_file_path) return "";
  const params = new URLSearchParams();
  if (category.cover_image_url) params.set("path", category.cover_image_url);
  if (category.cover_local_file_path) params.set("local_file_path", category.cover_local_file_path);
  return `/api/admin/imgs/preview?${params.toString()}`;
}

export function PuzzleCoverEditorButton({ category, label = "编辑封面" }: { category: PuzzleCategoryRecord; label?: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const router = useRouter();

  async function save() {
    if (!file) return messageApi.error("请选择封面图片。");
    setSaving(true);
    try {
      const form = new FormData();
      form.set("cover", file);
      const response = await fetch(`/api/admin/puzzles/categories/${category.slug}`, { method: "POST", body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "更新封面失败。");
      messageApi.success("封面已更新并同步到前台构建数据。");
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新封面失败。");
    } finally {
      setSaving(false);
    }
  }

  return <>
    {contextHolder}
    <Button icon={<EditOutlined />} onClick={() => setOpen(true)}>{label}</Button>
    <Modal title={`编辑 ${category.title} 封面`} open={open} onCancel={() => setOpen(false)} onOk={() => void save()} confirmLoading={saving} okText="上传并保存">
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        {category.cover_image_url ? <Image src={imageUrl(category)} alt={category.title} width={240} height={240} style={{ objectFit: "contain", background: "#fff" }} /> : null}
        <Upload beforeUpload={(nextFile) => { setFile(nextFile); return false; }} maxCount={1} accept="image/*" fileList={file ? [file as never] : []} onRemove={() => { setFile(null); }}>
          <Button>选择新封面</Button>
        </Upload>
        <Typography.Text type="secondary">保存后上传到线上图床，同时写入本地益智数据和前台构建快照。</Typography.Text>
      </Space>
    </Modal>
  </>;
}

export function PuzzleActiveSwitch({ category }: { category: PuzzleCategoryRecord }) {
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const router = useRouter();

  async function update(checked: boolean) {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/puzzles/categories/${category.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: checked }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "更新活跃状态失败。");
      messageApi.success(checked ? "已启用，部署时会构建该页面。" : "已停用，部署时不会构建该页面。");
      router.refresh();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新活跃状态失败。");
    } finally {
      setSaving(false);
    }
  }

  return <>
    {contextHolder}
    <Space size="small">
      <Typography.Text>活跃</Typography.Text>
      <Switch
        checked={Boolean(category.is_active)}
        checkedChildren="启用"
        unCheckedChildren="停用"
        loading={saving}
        onChange={(checked) => void update(checked)}
      />
    </Space>
  </>;
}

export function PuzzleCategoryList({ title, current, items, family }: {
  title: string;
  current: PuzzleCategoryRecord;
  items: PuzzleCategoryRecord[];
  family?: string;
}) {
  return <Card title={title} extra={<Space wrap><PuzzleActiveSwitch category={current} /><PuzzleCoverEditorButton category={current} label={`编辑 ${current.title} 封面`} /></Space>}>
    <Row gutter={[16, 16]}>
      {items.map((item) => {
        const href = family ? `/admin/puzzles/${family}/${item.slug}` : `/admin/puzzles/${item.slug}`;
        return <Col xs={24} sm={12} lg={8} key={item.slug}>
          <Card cover={<div style={{ height: 220, display: "grid", placeItems: "center", background: "#fafafa" }}><Image preview={false} src={imageUrl(item)} alt={item.title} style={{ width: 190, height: 190, objectFit: "contain" }} /></div>}>
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Typography.Title level={4} style={{ margin: 0 }}>{item.title}</Typography.Title>
              <PuzzleActiveSwitch category={item} />
              <Space wrap>
                <Link href={href}><Button type="primary" icon={<RightOutlined />}>{family ? "编辑页面" : "进入三级列表"}</Button></Link>
                <PuzzleCoverEditorButton category={item} />
              </Space>
            </Space>
          </Card>
        </Col>;
      })}
    </Row>
  </Card>;
}
