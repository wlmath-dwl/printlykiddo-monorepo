"use client";

import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  message,
} from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { ActiveRecord } from "@/lib/admin-types";

type ActiveFormValues = {
  name: string;
  slug?: string;
  description?: string;
  sort_order: number;
  colored_label: boolean;
};

type ActiveFormPageProps = {
  activeId?: number;
  initialValues: ActiveFormValues;
  backHref?: string;
};

export function ActiveFormPage({
  activeId,
  initialValues,
  backHref = "/admin/actives",
}: ActiveFormPageProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ActiveFormValues>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const isEdit = typeof activeId === "number";

  useEffect(() => {
    form.setFieldsValue(initialValues);
  }, [form, initialValues]);

  async function handleSave(values: ActiveFormValues) {
    setSaving(true);

    try {
      const response = await fetch(
        isEdit ? `/api/admin/actives/${activeId}` : "/api/admin/actives",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name.trim(),
            slug: values.slug?.trim() || "",
            description: values.description?.trim() || null,
            sort_order: Number(values.sort_order ?? 0),
            colored_label: values.colored_label,
          }),
        },
      );
      const data = (await response.json()) as ActiveRecord | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "保存功能失败。");
      }

      messageApi.success(isEdit ? "功能已更新。" : "功能已创建。");
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      router.push(backHref);
      router.refresh();
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "保存功能失败。",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {contextHolder}
      <Card
        title={isEdit ? "编辑功能" : "新增功能"}
        variant="borderless"
        extra={<Link href={backHref}>返回列表</Link>}
      >
        <Form<ActiveFormValues>
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={(values) => void handleSave(values)}
        >
          <Form.Item
            label="功能名称"
            name="name"
            rules={[{ required: true, message: "请输入功能名称" }]}
          >
            <Input placeholder="例如：Coloring Pages" />
          </Form.Item>
          <Form.Item label="Slug" name="slug">
            <Input placeholder="留空时自动生成" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={4} placeholder="可选描述" />
          </Form.Item>
          <Form.Item label="排序" name="sort_order">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label="彩色标签"
            name="colored_label"
            valuePropName="checked"
            extra="仅供前端识别当前功能是否为彩色内容，不再关联独立 tags。"
          >
            <Switch checkedChildren="彩色" unCheckedChildren="默认否" />
          </Form.Item>

          <Space style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存功能
            </Button>
            <Link href={backHref}>
              <Button>取消</Button>
            </Link>
          </Space>
        </Form>
      </Card>
    </>
  );
}
