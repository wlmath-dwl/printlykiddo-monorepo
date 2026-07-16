"use client";

import { DownloadOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  InputNumber,
  Row,
  Slider,
  Space,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CATEGORY_CUTOUT_RENDER_DEFAULTS,
  generateCategoryCutoutFile,
  type CategoryCutoutRenderOptions,
} from "@/lib/category-cutout-client";

type CutoutParamKey = "strokeWidth" | "dashLength" | "dashGap" | "offset" | "simplifyTolerance" | "smoothIterations";

type CutoutParamConfig = {
  key: CutoutParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

const PARAM_CONFIGS: CutoutParamConfig[] = [
  { key: "strokeWidth", label: "虚线粗细", min: 1, max: 12, step: 0.5 },
  { key: "dashLength", label: "虚线长度", min: 4, max: 60, step: 1 },
  { key: "dashGap", label: "虚线间隔", min: 2, max: 60, step: 1 },
  { key: "offset", label: "外扩距离", min: 0, max: 60, step: 1 },
  { key: "simplifyTolerance", label: "轮廓简化", min: 1, max: 20, step: 1 },
  { key: "smoothIterations", label: "平滑次数", min: 0, max: 6, step: 1 },
];

function revokeObjectUrl(url: string | null) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/i, "") || "cutout-test";
}

export function CutoutTestTool() {
  const [messageApi, contextHolder] = message.useMessage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState("cutout-test.png");
  const [renderOptions, setRenderOptions] = useState<CategoryCutoutRenderOptions>({
    strokeWidth: CATEGORY_CUTOUT_RENDER_DEFAULTS.strokeWidth,
    dashLength: CATEGORY_CUTOUT_RENDER_DEFAULTS.dashLength,
    dashGap: CATEGORY_CUTOUT_RENDER_DEFAULTS.dashGap,
    offset: CATEGORY_CUTOUT_RENDER_DEFAULTS.offset,
    simplifyTolerance: CATEGORY_CUTOUT_RENDER_DEFAULTS.simplifyTolerance,
    smoothIterations: CATEGORY_CUTOUT_RENDER_DEFAULTS.smoothIterations,
  });
  const [generating, setGenerating] = useState(false);
  const generationIdRef = useRef(0);
  const sourcePreviewUrlRef = useRef<string | null>(null);
  const resultPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    sourcePreviewUrlRef.current = sourcePreviewUrl;
  }, [sourcePreviewUrl]);

  useEffect(() => {
    resultPreviewUrlRef.current = resultPreviewUrl;
  }, [resultPreviewUrl]);

  useEffect(
    () => () => {
      revokeObjectUrl(sourcePreviewUrlRef.current);
      revokeObjectUrl(resultPreviewUrlRef.current);
    },
    [],
  );

  const generatePreview = useCallback(
    async (file: File, sourceUrl: string, options: CategoryCutoutRenderOptions) => {
      const generationId = generationIdRef.current + 1;
      generationIdRef.current = generationId;
      setGenerating(true);

      try {
        const resultFile = await generateCategoryCutoutFile({
          sourceUrl,
          sourceName: file.name,
          variant: "cut_color",
          renderOptions: options,
        });
        const nextResultUrl = URL.createObjectURL(resultFile);

        if (generationIdRef.current !== generationId) {
          revokeObjectUrl(nextResultUrl);
          return;
        }

        setResultPreviewUrl((previousUrl) => {
          revokeObjectUrl(previousUrl);
          return nextResultUrl;
        });
        setResultFileName(resultFile.name || `${getBaseName(file.name)}-cut-color.png`);
      } catch (error) {
        if (generationIdRef.current === generationId) {
          messageApi.error(error instanceof Error ? error.message : "生成剪纸虚线框失败。");
        }
      } finally {
        if (generationIdRef.current === generationId) {
          setGenerating(false);
        }
      }
    },
    [messageApi],
  );

  const uploadProps = useMemo<UploadProps>(
    () => ({
      accept: "image/*",
      maxCount: 1,
      showUploadList: false,
      beforeUpload: (file) => {
        const nextFile = file as File;
        const nextSourceUrl = URL.createObjectURL(nextFile);

        setSelectedFile(nextFile);
        setSourcePreviewUrl((previousUrl) => {
          revokeObjectUrl(previousUrl);
          return nextSourceUrl;
        });
        setResultPreviewUrl((previousUrl) => {
          revokeObjectUrl(previousUrl);
          return null;
        });
        void generatePreview(nextFile, nextSourceUrl, renderOptions);

        return false;
      },
    }),
    [generatePreview, renderOptions],
  );

  const updateParam = useCallback(
    (key: CutoutParamKey, value: number | null) => {
      if (value === null || !Number.isFinite(value)) {
        return;
      }

      const nextOptions = {
        ...renderOptions,
        [key]: value,
      };
      setRenderOptions(nextOptions);

      if (selectedFile && sourcePreviewUrl) {
        void generatePreview(selectedFile, sourcePreviewUrl, nextOptions);
      }
    },
    [generatePreview, renderOptions, selectedFile, sourcePreviewUrl],
  );

  const resetParams = useCallback(() => {
    const nextOptions: CategoryCutoutRenderOptions = {
      strokeWidth: CATEGORY_CUTOUT_RENDER_DEFAULTS.strokeWidth,
      dashLength: CATEGORY_CUTOUT_RENDER_DEFAULTS.dashLength,
      dashGap: CATEGORY_CUTOUT_RENDER_DEFAULTS.dashGap,
      offset: CATEGORY_CUTOUT_RENDER_DEFAULTS.offset,
      simplifyTolerance: CATEGORY_CUTOUT_RENDER_DEFAULTS.simplifyTolerance,
      smoothIterations: CATEGORY_CUTOUT_RENDER_DEFAULTS.smoothIterations,
    };

    setRenderOptions(nextOptions);
    if (selectedFile && sourcePreviewUrl) {
      void generatePreview(selectedFile, sourcePreviewUrl, nextOptions);
    }
  }, [generatePreview, selectedFile, sourcePreviewUrl]);

  const handleRegenerate = useCallback(() => {
    if (!selectedFile || !sourcePreviewUrl) {
      messageApi.warning("请先上传一张图片。");
      return;
    }

    void generatePreview(selectedFile, sourcePreviewUrl, renderOptions);
  }, [generatePreview, messageApi, renderOptions, selectedFile, sourcePreviewUrl]);

  const handleDownload = useCallback(() => {
    if (!resultPreviewUrl) {
      messageApi.warning("请先生成结果图。");
      return;
    }

    const link = document.createElement("a");
    link.href = resultPreviewUrl;
    link.download = resultFileName;
    link.click();
  }, [messageApi, resultFileName, resultPreviewUrl]);

  return (
    <>
      {contextHolder}
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Card variant="borderless">
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              临时剪纸虚线测试
            </Typography.Title>
            <Typography.Text type="secondary">
              上传图片后按分类编辑生成功能图中的剪纸图算法生成虚线框，可临时调整虚线粗细、长度和间隔。
            </Typography.Text>
          </Space>
        </Card>

        <Alert
          showIcon
          type="info"
          title="默认参数与当前功能图剪纸生成保持一致"
          description="参数调整只影响本页面预览，不会保存到分类或功能图数据。"
        />

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={7}>
            <Card title="控制面板" variant="borderless">
              <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Space wrap>
                  <Upload {...uploadProps}>
                    <Button type="primary" icon={<UploadOutlined />} loading={generating}>
                      上传图片
                    </Button>
                  </Upload>
                  <Button icon={<ReloadOutlined />} onClick={handleRegenerate} disabled={!selectedFile}>
                    重新生成
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!resultPreviewUrl}>
                    下载结果
                  </Button>
                </Space>

                <Typography.Text type="secondary">
                  当前文件：{selectedFile ? selectedFile.name : "未上传"}
                </Typography.Text>

                {PARAM_CONFIGS.map((item) => (
                  <div key={item.key}>
                    <Typography.Text>{item.label}</Typography.Text>
                    <Row gutter={12} align="middle">
                      <Col flex="auto">
                        <Slider
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={renderOptions[item.key]}
                          onChange={(value) => updateParam(item.key, value)}
                        />
                      </Col>
                      <Col>
                        <InputNumber
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={renderOptions[item.key]}
                          onChange={(value) => updateParam(item.key, typeof value === "number" ? value : null)}
                          style={{ width: 86 }}
                        />
                      </Col>
                    </Row>
                  </div>
                ))}

                <Button onClick={resetParams}>恢复默认参数</Button>
              </Space>
            </Card>
          </Col>

          <Col xs={24} xl={17}>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title="原图" variant="borderless">
                  {sourcePreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sourcePreviewUrl}
                      alt="上传原图"
                      style={{
                        width: "100%",
                        maxHeight: 620,
                        objectFit: "contain",
                        borderRadius: 12,
                        background: "#fafafa",
                      }}
                    />
                  ) : (
                    <Empty description="请先上传图片" />
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="生成结果" variant="borderless" extra={resultPreviewUrl ? resultFileName : undefined}>
                  {resultPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resultPreviewUrl}
                      alt="剪纸虚线框生成结果"
                      style={{
                        width: "100%",
                        maxHeight: 620,
                        objectFit: "contain",
                        borderRadius: 12,
                        background: "#fafafa",
                      }}
                    />
                  ) : (
                    <Empty description={generating ? "生成中..." : "上传后自动生成"} />
                  )}
                </Card>
              </Col>
            </Row>
          </Col>
        </Row>
      </Space>
    </>
  );
}
