"use client";

import { BulbOutlined, CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Card, Col, Empty, Form, Image, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Statistic, Table, Tabs, Tag, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";

import type { ActivityItem, ActivityItemInput, ActivityTag, ActivityTagInput, ActivityTopic, ActivityTopicInput, ItemStatus } from "@/lib/activity-item-types";

type Props = { initialItems: ActivityItem[]; initialTopics: ActivityTopic[]; initialTags: ActivityTag[] };
type ItemValues = ActivityItemInput;
type TopicValues = ActivityTopicInput;
type TagValues = ActivityTagInput;

const itemStatus = { draft: { label: "Draft", color: "default" }, published: { label: "Published", color: "green" }, archived: { label: "Archived", color: "orange" } } as const;
const topicStatus = { draft: { label: "Draft", color: "default" }, published: { label: "Published", color: "green" } } as const;
const assetUrl = (path: string) => `/api/admin/activity-library/assets/${encodeURIComponent(path)}`;

function buildItemImagePrompt(item: ActivityItem) {
  return `Create a child-friendly activity icon of ${item.name} (${item.word}).

SUBJECT
- Show exactly one ${item.name} as a clear, immediately recognizable object.
- Show the complete object with no cropped edges.
- Tightly frame and center the subject so its visible bounds occupy about 90%–92% of the canvas.
- Leave only 3%–5% transparent safety padding around the outermost visible parts of the object.

STYLE
- Clean, colorful 2D children’s educational illustration.
- Friendly rounded shapes, smooth edges, simple details, and a consistent bright color palette.
- Polished vector-like finish with a subtle, consistent outline.
- Not photorealistic and not a 3D render.

BACKGROUND AND COMPOSITION
- Transparent background with a clean alpha channel.
- Square 1:1 composition, designed for a 512 × 512 px master image.
- Keep the subject readable when reduced to 128 × 128 px.
- Treat this as a reusable source asset for placement inside PDF activity cells; do not add layout padding inside the image.

CONSTRAINTS
- No words, letters, numbers, labels, borders, frames, logos, watermarks, scenery, extra objects, or decorative elements.
- No large cast shadow or effect extending beyond the object; if needed, use only a very subtle compact shadow contained close to the object.
- No excessive transparent margins, glow, blur, complex texture, or visual clutter.`;
}

function buildTopicImagePrompt(topic: ActivityTopic, allItems: ActivityItem[]) {
  const representatives = topic.item_ids.map((id) => allItems.find((item) => item.id === id)?.name).filter(Boolean).slice(0, 5);
  const subjects = representatives.length ? representatives.join(", ") : `3–5 representative objects from the ${topic.name} topic`;
  return `Create a child-friendly topic cover illustration for “${topic.name}”.

SUBJECT
- Show a cohesive group of 3–5 representative objects: ${subjects}.
- Make every object recognizable and visually balanced; do not repeat objects.
- Keep all important objects inside the central 80% safe area.

STYLE
- Clean, colorful 2D children’s educational illustration.
- Friendly rounded shapes, smooth edges, simple details, and a consistent bright color palette.
- Use the same polished vector-like visual language as the individual Item icons.
- Not photorealistic and not a 3D render.

BACKGROUND AND COMPOSITION
- Simple soft pastel background related to the topic, with strong separation between subjects and background.
- Square 1:1 composition, designed for a 512 × 512 px master image.
- Balanced cover composition that remains readable when reduced to 128 × 128 px.

CONSTRAINTS
- No words, letters, labels, borders, logos, watermarks, photo collage, busy scenery, or tiny decorative details.
- No cropped main subjects, heavy shadows, glow, blur, or complex texture.`;
}

export function ActivityLibraryManager({ initialItems, initialTopics, initialTags }: Props) {
  const [messageApi, holder] = message.useMessage();
  const [items, setItems] = useState(initialItems);
  const [topics, setTopics] = useState(initialTopics);
  const [tags, setTags] = useState(initialTags);
  const [itemForm] = Form.useForm<ItemValues>();
  const [topicForm] = Form.useForm<TopicValues>();
  const [tagForm] = Form.useForm<TagValues>();
  const [editingItem, setEditingItem] = useState<ActivityItem | null>(null);
  const [editingTopic, setEditingTopic] = useState<ActivityTopic | null>(null);
  const [editingTag, setEditingTag] = useState<ActivityTag | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptText, setPromptText] = useState("");
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [topicFilter, setTopicFilter] = useState<number>();
  const [statusFilter, setStatusFilter] = useState<ItemStatus>();

  async function reload() {
    const [itemResponse, topicResponse, tagResponse] = await Promise.all([
      fetch("/api/admin/activity-library/items", { cache: "no-store" }),
      fetch("/api/admin/activity-library/topics", { cache: "no-store" }),
      fetch("/api/admin/activity-library/tags", { cache: "no-store" }),
    ]);
    const [itemData, topicData, tagData] = await Promise.all([itemResponse.json(), topicResponse.json(), tagResponse.json()]);
    setItems(itemData.items); setTopics(topicData.items); setTags(tagData.items);
  }

  function openItem(item?: ActivityItem) {
    setEditingItem(item || null);
    setItemOpen(true);
  }

  function initializeItemForm() {
    itemForm.resetFields();
    itemForm.setFieldsValue(editingItem ? {
      name: editingItem.name, slug: editingItem.slug, word: editingItem.word, description: editingItem.description, related_words: editingItem.related_words,
      topic_ids: editingItem.topic_ids, status: editingItem.status,
    } : { name: "", slug: "", word: "", description: null, related_words: [], topic_ids: [], status: "draft" });
  }

  async function saveItem(values: ItemValues) {
    setSaving(true);
    try {
      const response = await fetch(editingItem ? `/api/admin/activity-library/items/${editingItem.id}` : "/api/admin/activity-library/items", {
        method: editingItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存对象词条失败。");
      await reload(); setItemOpen(false); messageApi.success(editingItem ? "对象词条已更新。" : "对象词条已创建。");
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "保存失败。"); }
    finally { setSaving(false); }
  }

  async function removeItem(id: number) {
    const response = await fetch(`/api/admin/activity-library/items/${id}`, { method: "DELETE" });
    if (response.ok) { await reload(); messageApi.success("对象词条已删除。"); }
    else messageApi.error("删除对象词条失败。");
  }

  function openTopic(topic?: ActivityTopic) {
    setEditingTopic(topic || null);
    setTopicOpen(true);
  }

  function initializeTopicForm() {
    topicForm.resetFields();
    topicForm.setFieldsValue(editingTopic ? {
      name: editingTopic.name, slug: editingTopic.slug, tag_id: editingTopic.tag_id, description: editingTopic.description,
      icon: editingTopic.icon, sort_order: editingTopic.sort_order, status: editingTopic.status, item_ids: editingTopic.item_ids,
    } : { name: "", slug: "", tag_id: null, description: null, icon: null, sort_order: topics.length + 1, status: "draft", item_ids: [] });
  }

  async function saveTopic(values: TopicValues) {
    setSaving(true);
    try {
      const response = await fetch(editingTopic ? `/api/admin/activity-library/topics/${editingTopic.id}` : "/api/admin/activity-library/topics", {
        method: editingTopic ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存主题失败。");
      await reload(); setTopicOpen(false); messageApi.success(editingTopic ? "主题已更新。" : "主题已创建。");
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "保存失败。"); }
    finally { setSaving(false); }
  }

  async function removeTopic(id: number) {
    const response = await fetch(`/api/admin/activity-library/topics/${id}`, { method: "DELETE" });
    if (response.ok) { await reload(); messageApi.success("主题已删除，对象词条已保留。"); }
    else messageApi.error("删除主题失败。");
  }

  function openTag(tag?: ActivityTag) {
    setEditingTag(tag || null);
    setTagOpen(true);
  }

  function initializeTagForm() {
    tagForm.resetFields();
    tagForm.setFieldsValue(editingTag ? {
      name: editingTag.name, slug: editingTag.slug, description: editingTag.description, sort_order: editingTag.sort_order,
    } : { name: "", slug: "", description: null, sort_order: tags.length + 1 });
  }

  async function saveTag(values: TagValues) {
    setSaving(true);
    try {
      const response = await fetch(editingTag ? `/api/admin/activity-library/tags/${editingTag.id}` : "/api/admin/activity-library/tags", {
        method: editingTag ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存 Topic 分组失败。");
      await reload(); setTagOpen(false); messageApi.success(editingTag ? "Topic 分组已更新。" : "Topic 分组已创建。");
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "保存失败。"); }
    finally { setSaving(false); }
  }

  async function removeTag(id: number) {
    const response = await fetch(`/api/admin/activity-library/tags/${id}`, { method: "DELETE" });
    if (response.ok) { await reload(); messageApi.success("分组已删除，原 Topic 已保留并变为未分组。"); }
    else messageApi.error("删除 Topic 分组失败。");
  }

  async function uploadTopicCover(topicId: number, file: File) {
    const body = new FormData();
    body.set("file", file);
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/activity-library/topics/${topicId}/cover`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "上传主题图片失败。");
      await reload(); messageApi.success("Topic Cover 已生成 128、256、512 三种尺寸。");
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "上传主题图片失败。"); }
    finally { setSaving(false); }
    return false;
  }

  async function removeTopicCover(topicId: number) {
    const response = await fetch(`/api/admin/activity-library/topics/${topicId}/cover`, { method: "DELETE" });
    if (response.ok) { await reload(); messageApi.success("Topic Cover 已删除。"); }
    else messageApi.error("删除主题图片失败。");
  }

  async function uploadItemIcon(itemId: number, file: File) {
    const body = new FormData();
    body.set("file", file); body.set("item_id", String(itemId)); body.set("type", "icon"); body.set("status", "approved");
    setSaving(true);
    try {
      const response = await fetch("/api/admin/activity-library/assets", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "上传 Item Icon 失败。");
      await reload(); messageApi.success("Item Icon 已生成 128、256、512 三种尺寸。");
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "上传 Item Icon 失败。"); }
    finally { setSaving(false); }
    return false;
  }

  async function removeAsset(id: number) {
    const response = await fetch(`/api/admin/activity-library/assets/${id}`, { method: "DELETE" });
    if (response.ok) { await reload(); messageApi.success("图片素材已删除。"); }
    else messageApi.error("删除图片失败。");
  }

  function openItemPrompt(item: ActivityItem) {
    setPromptTitle(`${item.name} · Item Icon 提示词`);
    setPromptText(buildItemImagePrompt(item));
    setPromptOpen(true);
  }

  function openTopicPrompt(topic: ActivityTopic) {
    setPromptTitle(`${topic.name} · Topic Cover 提示词`);
    setPromptText(buildTopicImagePrompt(topic, items));
    setPromptOpen(true);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptText);
      messageApi.success("提示词已复制。");
    } catch {
      messageApi.error("复制失败，请手动选择文本复制。");
    }
  }

  const visibleItems = useMemo(() => items.filter((item) => {
    const q = keyword.trim().toLowerCase();
    return (!q || [item.name, item.word, item.description || ""].some((value) => value.toLowerCase().includes(q)))
      && (!topicFilter || item.topic_ids.includes(topicFilter)) && (!statusFilter || item.status === statusFilter);
  }), [items, keyword, topicFilter, statusFilter]);
  const currentEditingItem = editingItem ? items.find((item) => item.id === editingItem.id) || editingItem : null;
  const currentEditingIcon = currentEditingItem?.assets.find((asset) => asset.type === "icon") || null;
  const currentEditingTopic = editingTopic ? topics.find((topic) => topic.id === editingTopic.id) || editingTopic : null;

  const itemColumns: ColumnsType<ActivityItem> = [
    { title: "Icon", width: 72, render: (_, item) => item.icon ? <Image src={assetUrl(item.icon.variants.size_128 || item.icon.path)} alt={item.name} width={44} height={44} style={{ objectFit: "contain", borderRadius: 6 }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} styles={{ image: { height: 28 } }} /> },
    { title: "对象", dataIndex: "name", width: 180, render: (name: string, item) => <div><strong>{name}</strong><div style={{ color: "#8c8c8c", fontSize: 12 }}>{item.description || item.slug}</div></div> },
    { title: "核心词", dataIndex: "word", width: 150, render: (word: string) => <Tag color="blue">{word}</Tag> },
    { title: "主题", dataIndex: "topic_names", render: (values: string[]) => values.length ? values.map((value) => <Tag key={value}>{value}</Tag>) : "-" },
    { title: "图片", width: 80, render: (_, item) => item.assets.length },
    { title: "状态", dataIndex: "status", width: 105, render: (status: ItemStatus) => <Tag color={itemStatus[status].color}>{itemStatus[status].label}</Tag> },
    { title: "操作", width: 110, render: (_, item) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => openItem(item)} /><Popconfirm title="删除这个对象词条？" description="关联图片也会删除，主题不会删除。" onConfirm={() => void removeItem(item.id)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];

  const topicColumns: ColumnsType<ActivityTopic> = [
    { title: "排序", dataIndex: "sort_order", width: 70 },
    { title: "Cover", width: 84, render: (_, topic) => topic.cover_path ? <Image src={assetUrl(topic.cover_variants.size_128 || topic.cover_path)} alt={topic.name} width={52} height={52} style={{ objectFit: "cover", borderRadius: 8 }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} styles={{ image: { height: 30 } }} /> },
    { title: "主题", render: (_, topic) => <Space><span style={{ fontSize: 22 }}>{topic.icon || "🧩"}</span><div><strong>{topic.name}</strong><div style={{ color: "#8c8c8c", fontSize: 12 }}>{topic.description || topic.slug}</div></div></Space> },
    { title: "分组", dataIndex: "tag_name", width: 180, render: (name: string | null) => name ? <Tag color="cyan">{name}</Tag> : <Tag>未分组</Tag> },
    { title: "对象数", dataIndex: "item_count", width: 90 },
    { title: "状态", dataIndex: "status", width: 110, render: (status: keyof typeof topicStatus) => <Tag color={topicStatus[status].color}>{topicStatus[status].label}</Tag> },
    { title: "操作", width: 170, render: (_, topic) => <Space>
      <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { void uploadTopicCover(topic.id, file); return false; }}><Button type="text" title="上传 Topic Cover" icon={<UploadOutlined />} /></Upload>
      {topic.cover_path ? <Popconfirm title="删除 Topic Cover？" onConfirm={() => void removeTopicCover(topic.id)}><Button type="text" danger title="删除 Topic Cover" icon={<DeleteOutlined />} /></Popconfirm> : null}
      <Button type="text" icon={<EditOutlined />} onClick={() => openTopic(topic)} />
      <Popconfirm title="删除主题？" description="主题内对象词条会保留。" onConfirm={() => void removeTopic(topic.id)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
    </Space> },
  ];

  const tagColumns: ColumnsType<ActivityTag> = [
    { title: "排序", dataIndex: "sort_order", width: 80 },
    { title: "Topic 分组", render: (_, tag) => <div><Tag color="cyan">{tag.name}</Tag><div style={{ color: "#8c8c8c", fontSize: 12, marginTop: 4 }}>{tag.slug}</div></div> },
    { title: "中文描述", dataIndex: "description", render: (description: string | null) => description || "-" },
    { title: "Topic 数", dataIndex: "topic_count", width: 110 },
    { title: "操作", width: 120, render: (_, tag) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => openTag(tag)} /><Popconfirm title="删除这个 Topic 分组？" description="Topic 不会删除，但会变为未分组。" onConfirm={() => void removeTag(tag.id)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];

  return <>
    {holder}
    <Card title={<div><div>Activity Item Library</div><div style={{ color: "#8c8c8c", fontSize: 13, fontWeight: 400 }}>独立儿童活动对象库 · Topic 管集合，Item 管对象，图片随 Topic / Item 维护，Tag 只标记 Topic 分组</div></div>} variant="borderless">
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col><Statistic title="Topics" value={topics.length} /></Col><Col><Statistic title="Items" value={items.length} /></Col><Col><Statistic title="Tags" value={tags.length} /></Col>
      </Row>
      <Tabs items={[
        { key: "items", label: `Items (${items.length})`, children: <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}><Col flex="auto"><Input.Search allowClear placeholder="搜索对象、核心词或中文描述" onChange={(event) => setKeyword(event.target.value)} /></Col>
            <Col><Select allowClear style={{ width: 200 }} placeholder="主题" value={topicFilter} onChange={setTopicFilter} options={topics.map((topic) => ({ label: topic.tag_name ? `${topic.tag_name} / ${topic.name}` : topic.name, value: topic.id }))} /></Col>
            <Col><Select allowClear style={{ width: 130 }} placeholder="状态" value={statusFilter} onChange={setStatusFilter} options={Object.entries(itemStatus).map(([value, meta]) => ({ value, label: meta.label }))} /></Col>
            <Col><Button type="primary" icon={<PlusOutlined />} onClick={() => openItem()}>新增 Item</Button></Col></Row>
          <Table rowKey="id" columns={itemColumns} dataSource={visibleItems} scroll={{ x: 1150 }} pagination={{ pageSize: 20, showSizeChanger: true }} />
        </> },
        { key: "topics", label: `Topics (${topics.length})`, children: <><div style={{ textAlign: "right", marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={() => openTopic()}>新增 Topic</Button></div><Table rowKey="id" columns={topicColumns} dataSource={topics} pagination={false} /></> },
        { key: "tags", label: `Topic Groups (${tags.length})`, children: <><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><span style={{ color: "#8c8c8c" }}>Tag 仅用于 Topic 的后台展示与筛选分组，不形成新的层级或 URL。</span><Button type="primary" icon={<PlusOutlined />} onClick={() => openTag()}>新增分组</Button></div><Table rowKey="id" dataSource={tags} pagination={false} columns={tagColumns} /></> },
      ]} />
    </Card>

    <Modal title={editingItem ? "编辑 Item" : "新增 Item"} open={itemOpen} onCancel={() => setItemOpen(false)} onOk={() => itemForm.submit()} confirmLoading={saving} width={760} destroyOnHidden afterOpenChange={(open) => { if (open) initializeItemForm(); }}>
      <Form form={itemForm} layout="vertical" onFinish={(values) => void saveItem(values)}>
        <Row gutter={16}><Col span={12}><Form.Item name="name" label="对象名称" rules={[{ required: true }]}><Input placeholder="Dog" /></Form.Item></Col><Col span={12}><Form.Item name="word" label="核心词" rules={[{ required: true }]} extra="保存时自动转为大写"><Input placeholder="DOG" /></Form.Item></Col></Row>
        <Row gutter={16}><Col span={12}><Form.Item name="slug" label="Slug"><Input placeholder="dog（留空自动生成）" /></Form.Item></Col><Col span={12}><Form.Item name="status" label="发布状态" rules={[{ required: true }]}><Select options={Object.entries(itemStatus).map(([value, meta]) => ({ value, label: meta.label }))} /></Form.Item></Col></Row>
        <Form.Item name="description" label="中文描述"><Input placeholder="狗" /></Form.Item>
        <Form.Item name="topic_ids" label="所属 Topic（可多选）"><Select mode="multiple" optionFilterProp="label" options={topics.map((topic) => ({ label: topic.name, value: topic.id }))} /></Form.Item>
        <Form.Item name="related_words" label="Related Words（可选）" extra="相关词没有独立图片"><Select mode="tags" tokenSeparators={[","]} placeholder="PUPPY, PAW, TAIL" /></Form.Item>
        <Form.Item label="Item Icon" extra="单对象、透明背景；上传后自动生成 128 / 256 / 512 三种尺寸">
          {currentEditingItem ? <Space align="start" size={16}>
            {currentEditingIcon ? <Image src={assetUrl(currentEditingIcon.variants.size_256 || currentEditingIcon.path)} alt={currentEditingItem.name} width={112} height={112} style={{ objectFit: "contain", border: "1px solid #f0f0f0", borderRadius: 8 }} /> : <div style={{ width: 112, height: 112, border: "1px dashed #d9d9d9", borderRadius: 8, display: "grid", placeItems: "center", color: "#8c8c8c" }}>暂无图片</div>}
            <Space orientation="vertical">
              <Space>
                <Upload accept="image/*" showUploadList={false} disabled={saving} beforeUpload={(file) => { void uploadItemIcon(currentEditingItem.id, file); return false; }}><Button icon={<UploadOutlined />} loading={saving}>{currentEditingIcon ? "上传新 Icon" : "上传 Icon"}</Button></Upload>
                <Button icon={<BulbOutlined />} onClick={() => openItemPrompt(currentEditingItem)}>生成提示词</Button>
              </Space>
              {currentEditingIcon ? <Popconfirm title="删除当前 Item Icon？" onConfirm={() => void removeAsset(currentEditingIcon.id)}><Button danger icon={<DeleteOutlined />}>删除 Icon</Button></Popconfirm> : null}
              <span style={{ color: "#8c8c8c", fontSize: 12 }}>上传新图会直接替换并清理旧 Icon。</span>
            </Space>
          </Space> : <div style={{ padding: "14px 16px", background: "#fafafa", borderRadius: 8, color: "#8c8c8c" }}>请先保存 Item，再进入编辑上传核心图片。</div>}
        </Form.Item>
      </Form>
    </Modal>

    <Modal title={editingTopic ? "编辑 Topic" : "新增 Topic"} open={topicOpen} onCancel={() => setTopicOpen(false)} onOk={() => topicForm.submit()} confirmLoading={saving} width={760} destroyOnHidden afterOpenChange={(open) => { if (open) initializeTopicForm(); }}>
      <Form form={topicForm} layout="vertical" onFinish={(values) => void saveTopic(values)}>
        <Row gutter={16}><Col span={12}><Form.Item name="name" label="主题名称" rules={[{ required: true }]}><Input placeholder="Animals" /></Form.Item></Col><Col span={12}><Form.Item name="slug" label="Slug"><Input placeholder="animals（留空自动生成）" /></Form.Item></Col></Row>
        <Row gutter={16}><Col span={8}><Form.Item name="tag_id" label="Topic 分组" extra="仅用于后台展示与筛选"><Select allowClear placeholder="选择分组" options={tags.map((tag) => ({ label: tag.name, value: tag.id }))} /></Form.Item></Col><Col span={6}><Form.Item name="icon" label="图标"><Input placeholder="🐾" /></Form.Item></Col><Col span={5}><Form.Item name="sort_order" label="排序"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col><Col span={5}><Form.Item name="status" label="状态"><Select options={Object.entries(topicStatus).map(([value, meta]) => ({ value, label: meta.label }))} /></Form.Item></Col></Row>
        <Form.Item name="item_ids" label="Topic 内的 Items"><Select mode="multiple" optionFilterProp="label" options={items.filter((item) => item.status !== "archived").map((item) => ({ label: `${item.name} · ${item.word}`, value: item.id }))} /></Form.Item>
        <Form.Item name="description" label="中文描述"><Input placeholder="宠物" /></Form.Item>
        <Form.Item label="Topic Cover" extra="主题代表图；居中方形裁切并自动生成 128 / 256 / 512 三种尺寸">
          {currentEditingTopic ? <Space align="start" size={16}>
            {currentEditingTopic.cover_path ? <Image src={assetUrl(currentEditingTopic.cover_variants.size_256 || currentEditingTopic.cover_path)} alt={currentEditingTopic.name} width={112} height={112} style={{ objectFit: "cover", border: "1px solid #f0f0f0", borderRadius: 8 }} /> : <div style={{ width: 112, height: 112, border: "1px dashed #d9d9d9", borderRadius: 8, display: "grid", placeItems: "center", color: "#8c8c8c" }}>暂无图片</div>}
            <Space orientation="vertical">
              <Space>
                <Upload accept="image/*" showUploadList={false} disabled={saving} beforeUpload={(file) => { void uploadTopicCover(currentEditingTopic.id, file); return false; }}><Button icon={<UploadOutlined />} loading={saving}>{currentEditingTopic.cover_path ? "上传新 Cover" : "上传 Cover"}</Button></Upload>
                <Button icon={<BulbOutlined />} onClick={() => openTopicPrompt(currentEditingTopic)}>生成提示词</Button>
              </Space>
              {currentEditingTopic.cover_path ? <Popconfirm title="删除当前 Topic Cover？" onConfirm={() => void removeTopicCover(currentEditingTopic.id)}><Button danger icon={<DeleteOutlined />}>删除 Cover</Button></Popconfirm> : null}
            </Space>
          </Space> : <div style={{ padding: "14px 16px", background: "#fafafa", borderRadius: 8, color: "#8c8c8c" }}>请先保存 Topic，再进入编辑上传主题图片。</div>}
        </Form.Item>
      </Form>
    </Modal>

    <Modal title={editingTag ? "编辑 Topic 分组" : "新增 Topic 分组"} open={tagOpen} onCancel={() => setTagOpen(false)} onOk={() => tagForm.submit()} confirmLoading={saving} width={560} destroyOnHidden afterOpenChange={(open) => { if (open) initializeTagForm(); }}>
      <Form form={tagForm} layout="vertical" onFinish={(values) => void saveTag(values)}>
        <Row gutter={16}><Col span={12}><Form.Item name="name" label="分组名称" rules={[{ required: true }]}><Input placeholder="Animals & Dinosaurs" /></Form.Item></Col><Col span={12}><Form.Item name="slug" label="Slug"><Input placeholder="animals-dinosaurs（留空自动生成）" /></Form.Item></Col></Row>
        <Form.Item name="description" label="中文描述"><Input placeholder="动物与恐龙" /></Form.Item>
        <Form.Item name="sort_order" label="排序"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
      </Form>
    </Modal>

    <Modal title={promptTitle} open={promptOpen} onCancel={() => setPromptOpen(false)} width={760} footer={<Space><Button onClick={() => setPromptOpen(false)}>关闭</Button><Button type="primary" icon={<CopyOutlined />} onClick={() => void copyPrompt()}>复制提示词</Button></Space>} destroyOnHidden>
      <div style={{ marginBottom: 12, color: "#8c8c8c" }}>提示词已包含创建对象、统一风格、背景、构图比例、输出尺寸及禁止项，可在复制前直接编辑。</div>
      <Input.TextArea value={promptText} onChange={(event) => setPromptText(event.target.value)} autoSize={{ minRows: 18, maxRows: 26 }} />
    </Modal>
  </>;
}
