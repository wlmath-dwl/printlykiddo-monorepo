"use client";

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Space,
  Steps,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

const { Paragraph, Text, Title } = Typography;

type PinterestStatus = {
  connected: boolean;
  hasRuntimeAccessToken: boolean;
  hasEnvAccessToken: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  clientIdPreview: string;
  redirectUri: string;
  apiOrigin: string;
  apiEnvironment: string;
  scopes: string[];
};

type OAuthNotice = {
  type: "success" | "error";
  title: string;
  description: string;
};

type PublishResult = {
  board?: { id: string; name?: string } | null;
  pin?: { id: string; link?: string; title?: string };
  error?: string;
};

type PublishFormValues = {
  board_id?: string;
  board_name?: string;
  image_url?: string;
  title?: string;
  description?: string;
  link?: string;
  alt_text?: string;
};

const defaultValues: PublishFormValues = {
  board_name: "PrintlyKiddo API Review",
  title: "PrintlyKiddo API Review Test Pin",
  description:
    "This test Pin demonstrates OAuth authorization and Pin publishing through the Pinterest API.",
  link: "https://printlykiddo.com",
  alt_text:
    "A PrintlyKiddo printable activity image used to demonstrate Pinterest API publishing.",
};

export function PinterestReviewPage() {
  const [form] = Form.useForm<PublishFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [status, setStatus] = useState<PinterestStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [oauthNotice, setOauthNotice] = useState<OAuthNotice | null>(null);

  const currentStep = useMemo(() => {
    if (publishResult?.pin?.id) {
      return 2;
    }
    if (status?.hasRuntimeAccessToken) {
      return 1;
    }
    return 0;
  }, [publishResult, status]);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const response = await fetch("/api/admin/pinterest-review/status", {
        cache: "no-store",
      });
      const data = (await response.json()) as PinterestStatus;
      setStatus(data);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取 Pinterest 状态失败。");
    } finally {
      setLoadingStatus(false);
    }
  }, [messageApi]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (params.get("connected") === "1") {
      setOauthNotice({
        type: "success",
        title: "OAuth callback succeeded",
        description: "Pinterest 已返回授权结果，页面会读取本地保存的 OAuth token。",
      });
      window.history.replaceState(null, "", window.location.pathname);
      void loadStatus();
      return;
    }

    if (error) {
      setOauthNotice({
        type: "error",
        title: "OAuth callback failed",
        description: decodeURIComponent(error),
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [loadStatus]);

  async function handlePublish(values: PublishFormValues) {
    setPublishing(true);
    setPublishResult(null);
    try {
      const response = await fetch("/api/admin/pinterest-review/publish-test-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      const data = (await response.json()) as PublishResult;
      if (!response.ok) {
        throw new Error(data.error || "发布测试 Pin 失败。");
      }
      setPublishResult(data);
      messageApi.success("测试 Pin 已发布。");
      await loadStatus();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "发布测试 Pin 失败。";
      setPublishResult({ error: messageText });
      messageApi.error(messageText);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Pinterest API Review Demo
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          用于录制 Pinterest 审核视频的最小 OAuth + Publish Pin 流程。
        </Paragraph>
      </div>

      <Card>
        <Steps
          current={currentStep}
          items={[
            { title: "Connect Pinterest", content: "用户主动授权" },
            { title: "Publish Test Pin", content: "调用 /v5/pins" },
            { title: "Verify on Pinterest", content: "展示新 Pin" },
          ]}
        />
      </Card>

      {oauthNotice ? (
        <Alert
          type={oauthNotice.type}
          showIcon
          title={oauthNotice.title}
          description={oauthNotice.description}
          closable
          onClose={() => setOauthNotice(null)}
        />
      ) : null}

      <Card
        title="1. OAuth 授权"
        extra={
          <Button loading={loadingStatus} onClick={() => void loadStatus()}>
            刷新状态
          </Button>
        }
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Alert
            type={status?.hasRuntimeAccessToken ? "success" : "info"}
            showIcon
            title={status?.hasRuntimeAccessToken ? "Connected Successfully" : "Not connected yet"}
            description={
              status?.hasRuntimeAccessToken
                ? "可以继续点击 Publish Test Pin。"
                : status?.hasEnvAccessToken
                  ? "检测到 .env.local 里有测试 token，但录屏时仍应点击 Connect Pinterest 展示 OAuth 授权流程。"
                  : "录屏时先点击 Connect Pinterest，跳转 Pinterest 授权后会回到本页面。"
            }
          />

          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Client ID">
              {status?.hasClientId ? status.clientIdPreview : "未配置"}
            </Descriptions.Item>
            <Descriptions.Item label="Client Secret">
              {status?.hasClientSecret ? "已配置" : "未配置"}
            </Descriptions.Item>
            <Descriptions.Item label="Access Token">
              {status?.hasRuntimeAccessToken
                ? "OAuth 本次会话已获取"
                : status?.hasEnvAccessToken
                  ? "使用 .env.local 里的测试 token"
                  : "未获取"}
            </Descriptions.Item>
            <Descriptions.Item label="Redirect URI">
              <Text copyable>{status?.redirectUri || ""}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Publish API">
              <Text copyable>{status?.apiOrigin || ""}</Text>
              {status?.apiEnvironment === "sandbox" ? (
                <Text type="secondary"> （Trial access 使用 Sandbox）</Text>
              ) : null}
            </Descriptions.Item>
            <Descriptions.Item label="Scopes">
              {(status?.scopes ?? []).join(", ")}
            </Descriptions.Item>
          </Descriptions>

          <Space>
            <Button
              type="primary"
              href="/api/admin/pinterest-review/connect"
              disabled={!status?.hasClientId}
            >
              Connect Pinterest
            </Button>
            <Text type="secondary">
              如果本地 localhost 不被接受，把上面的 Redirect URI 换成 tunnel 地址。
            </Text>
          </Space>
        </Space>
      </Card>

      <Card title="2. 发布测试 Pin">
        <Form
          form={form}
          layout="vertical"
          initialValues={defaultValues}
          onFinish={(values) => void handlePublish(values)}
        >
          <Form.Item
            label="测试图片 URL"
            name="image_url"
            tooltip="必须是 Pinterest 能访问到的公网图片 URL。也可以配置 PINTEREST_TEST_IMAGE_URL。"
            rules={[
              {
                required: true,
                message: "请输入一个可公网访问的测试图片 URL。",
              },
            ]}
          >
            <Input placeholder="https://img.printlykiddo.com/..." />
          </Form.Item>

          <Form.Item
            label="Board ID（可选）"
            name="board_id"
            tooltip="留空时会自动创建一个测试 Board。"
          >
            <Input placeholder="留空自动创建测试 Board" />
          </Form.Item>

          <Form.Item label="自动创建 Board 名称" name="board_name">
            <Input />
          </Form.Item>

          <Form.Item label="Pin 标题" name="title">
            <Input />
          </Form.Item>

          <Form.Item label="Pin 描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item label="Pin 链接" name="link">
            <Input />
          </Form.Item>

          <Form.Item label="替代文本" name="alt_text">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={publishing}>
            Publish Test Pin
          </Button>
        </Form>
      </Card>

      {publishResult ? (
        <Card title="3. 发布结果">
          {publishResult.error ? (
            <Alert type="error" showIcon title={publishResult.error} />
          ) : (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Board ID">
                <Text copyable>{publishResult.board?.id || form.getFieldValue("board_id") || ""}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Pin ID">
                <Text copyable>{publishResult.pin?.id || ""}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="下一步">
                打开 Pinterest 对应 Board，展示刚发布的新 Pin。
              </Descriptions.Item>
            </Descriptions>
          )}
        </Card>
      ) : null}
    </Space>
  );
}
