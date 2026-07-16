"use client";

import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";

import type {
  BacklinkExchangeRecord,
  BacklinkExchangeStatus,
  BacklinkLinkType,
} from "@/lib/admin-types";

const statusOptions: Array<{ value: BacklinkExchangeStatus; label: string; color: string }> = [
  { value: "uncontacted", label: "未联系", color: "default" },
  { value: "email_sent", label: "已发送邮件", color: "blue" },
  { value: "communicating", label: "在沟通", color: "gold" },
  { value: "contacted", label: "已联系", color: "green" },
];

const linkTypeOptions: Array<{ value: BacklinkLinkType; label: string }> = [
  { value: "nofollow", label: "nofollow" },
  { value: "dofollow", label: "dofollow" },
];

const statusMeta = new Map(statusOptions.map((item) => [item.value, item]));

type Props = { initialItems: BacklinkExchangeRecord[] };
type FormValues = Pick<
  BacklinkExchangeRecord,
  "domain" | "backlinks" | "status"
>;

const emptyValues: FormValues = {
  domain: "",
  backlinks: [],
  status: "uncontacted",
};

export function BacklinkExchangeManager({ initialItems }: Props) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<BacklinkExchangeRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/backlink-exchanges", { cache: "no-store" });
      const data = (await response.json()) as { items?: BacklinkExchangeRecord[]; error?: string };
      if (!response.ok || !data.items) throw new Error(data.error || "获取网站列表失败。");
      setItems(data.items);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取网站列表失败。");
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.setFieldsValue(emptyValues);
    setModalOpen(true);
  }, [form]);

  const openEdit = useCallback((record: BacklinkExchangeRecord) => {
    setEditing(record);
    form.setFieldsValue({
      domain: record.domain,
      backlinks: record.backlinks,
      status: record.status,
    });
    setModalOpen(true);
  }, [form]);

  const save = useCallback(async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const response = await fetch(
        editing ? `/api/admin/backlink-exchanges/${editing.id}` : "/api/admin/backlink-exchanges",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...editing, ...values, site_name: values.domain }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "保存失败。");
      messageApi.success(editing ? "网站已更新。" : "网站已添加。");
      setModalOpen(false);
      await fetchItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }, [editing, fetchItems, form, messageApi]);

  const remove = useCallback(async (id: number) => {
    const response = await fetch(`/api/admin/backlink-exchanges/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      messageApi.error(data.error || "删除失败。");
      return;
    }
    messageApi.success("网站已删除。");
    await fetchItems();
  }, [fetchItems, messageApi]);

  const columns = useMemo<ColumnsType<BacklinkExchangeRecord>>(() => [
    {
      title: "域名",
      dataIndex: "domain",
      width: 220,
      render: (domain: string, record) => (
        <Typography.Link href={record.website_url} target="_blank">{domain}</Typography.Link>
      ),
    },
    {
      title: "外链数据",
      dataIndex: "backlinks",
      render: (backlinks: BacklinkExchangeRecord["backlinks"]) => backlinks.length ? (
        <Space orientation="vertical" size={2}>
          {backlinks.map((backlink, index) => (
            <Space key={`${backlink.url}-${index}`} size={6}>
              <Typography.Link href={backlink.url} target="_blank" ellipsis style={{ maxWidth: 520 }}>
                {backlink.url}
              </Typography.Link>
              <Tag color={backlink.link_type === "dofollow" ? "green" : "default"}>{backlink.link_type}</Tag>
            </Space>
          ))}
        </Space>
      ) : <Typography.Text type="secondary">暂无外链</Typography.Text>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 130,
      filters: statusOptions.map(({ label, value }) => ({ text: label, value })),
      onFilter: (value, record) => record.status === value,
      render: (status: BacklinkExchangeStatus) => {
        const meta = statusMeta.get(status);
        return <Tag color={meta?.color}>{meta?.label}</Tag>;
      },
    },
    {
      title: "操作",
      width: 130,
      fixed: "right",
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除这个网站吗？" onConfirm={() => void remove(record.id)}>
            <Button type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [openEdit, remove]);

  return (
    <>
      {contextHolder}
      <Card
        variant="borderless"
        title={<Space><span>外链管理</span><Tag color="blue">{items.length} 个网站</Tag></Space>}
        extra={<Space><Button onClick={() => void fetchItems()}>刷新</Button><Button type="primary" onClick={openCreate}>新增网站</Button></Space>}
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 850 }}
        />
      </Card>

      <Modal title={editing ? "编辑网站" : "新增网站"} open={modalOpen} width={760} okText="保存" cancelText="取消" confirmLoading={saving} onOk={() => void save()} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical" initialValues={emptyValues}>
          <Form.Item label="域名" name="domain" rules={[{ required: true, message: "请输入域名" }]}>
            <Input placeholder="example.com" />
          </Form.Item>
          <Form.List name="backlinks">
            {(fields, { add, remove: removeField }) => (
              <Form.Item label="外链数据">
                {fields.map(({ key, ...field }) => (
                  <Space key={key} style={{ display: "flex", marginBottom: 8 }} align="baseline">
                    <Form.Item
                      {...field}
                      name={[field.name, "url"]}
                      rules={[
                        { required: true, message: "请输入外链链接" },
                        { type: "url", message: "请输入有效的 URL" },
                      ]}
                    >
                      <Input placeholder="https://example.com/page-with-your-link" style={{ width: 470 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "link_type"]}>
                      <Select options={linkTypeOptions} style={{ width: 130 }} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => removeField(field.name)} />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ url: "", link_type: "nofollow" })}
                  block
                  icon={<PlusOutlined />}
                >
                  添加外链
                </Button>
              </Form.Item>
            )}
          </Form.List>

          <Form.Item label="网站状态" name="status">
            <Select options={statusOptions.map(({ value, label }) => ({ value, label }))} />
          </Form.Item>

        </Form>
      </Modal>
    </>
  );
}
