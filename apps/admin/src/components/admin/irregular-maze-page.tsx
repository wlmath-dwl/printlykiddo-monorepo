"use client";

import { CopyOutlined, DownloadOutlined, InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Statistic, Typography, Upload } from "antd";
import { useMemo, useState } from "react";

import {
  detectInternalRegions,
  generateIrregularMaze,
  type DetectedInternalRegion,
  type InternalFeatureType,
  type IrregularMazeDifficulty,
  type IrregularMazeOutput,
  type MazeForeground,
} from "@/lib/irregular-maze-generator";

import styles from "./irregular-maze-page.module.css";

const { Dragger } = Upload;

const IMAGE_PROMPT = `Create a clean black silhouette reference image of {SUBJECT} for an organic-shaped printable maze.

Requirements:
- pure solid black subject on a pure white background
- one single connected, closed silhouette
- centered composition with generous white margin
- square 1:1 canvas, 2048 × 2048 px
- recognizable, anatomically coherent outer contour
- preserve the subject's natural proportions and all defining features
- do not simplify, thicken, shorten, enlarge, or reshape body parts for the maze
- no internal details, no outlines, no text, no gray, no shadows, no gradients
- no detached parts or floating elements
- narrow areas will be handled later by the maze-generation algorithm
- crisp high-contrast edges, printable vector-like shape`;

function buildImagePrompt(subject: string) {
  return `Create a clean binary mask silhouette of ${subject} for a printable shape maze.

Requirements:
- pure solid black subject on a pure white background
- one single connected and completely closed silhouette
- centered composition with 8–12% white margin
- square 1:1 canvas, 2048 × 2048 px
- recognizable and anatomically coherent outer contour
- preserve the subject's natural proportions, distinctive shape, pose, limbs, tail, wings, horns, and other defining features
- do not simplify, thicken, shorten, enlarge, or reshape any body part for the maze
- faithfully represent the requested subject; narrow areas will be handled later by the maze-generation algorithm
- no internal holes, eyes, mouth, facial features, patterns, line art, or white cutouts
- no detached or floating components
- no open gaps or broken contour edges
- crisp vector-like edges
- no gray, shading, gradients, textures, outlines, text, shadows, or detached elements
- use only pure black #000000 and pure white #FFFFFF`;
}

function download(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

export function IrregularMazePage() {
  const { message } = App.useApp();
  const [file, setFile] = useState<File>();
  const [foreground, setForeground] = useState<MazeForeground>("black");
  const [difficulty, setDifficulty] = useState<IrregularMazeDifficulty>("easy");
  const [seed, setSeed] = useState<number>();
  const [result, setResult] = useState<IrregularMazeOutput>();
  const [generating, setGenerating] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptSubject, setPromptSubject] = useState("");
  const [imagePrompt, setImagePrompt] = useState(IMAGE_PROMPT);
  const [internalRegions, setInternalRegions] = useState<DetectedInternalRegion[]>([]);
  const [featureAssignments, setFeatureAssignments] = useState<Record<string, InternalFeatureType>>({});
  const [detectingRegions, setDetectingRegions] = useState(false);
  const filename = useMemo(() => file?.name.replace(/\.[^.]+$/, "") || "irregular-maze", [file]);

  async function handleGenerate(useExistingSeed = false) {
    if (!file) {
      message.warning("请先上传黑白轮廓图");
      return;
    }
    setGenerating(true);
    try {
      const output = await generateIrregularMaze(
        file,
        foreground,
        difficulty,
        useExistingSeed ? seed : undefined,
        featureAssignments,
      );
      setResult(output);
      setSeed(output.seed);
      message.success("异形迷宫生成完成");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function analyzeInternalRegions(nextFile: File, nextForeground: MazeForeground) {
    setDetectingRegions(true);
    try {
      const regions = await detectInternalRegions(nextFile, nextForeground);
      setInternalRegions(regions);
      setFeatureAssignments(Object.fromEntries(regions.map((region) => [region.id, "original"])));
      if (regions.length) message.success(`检测到 ${regions.length} 个内部区域`);
    } catch (error) {
      setInternalRegions([]);
      setFeatureAssignments({});
      message.error(error instanceof Error ? error.message : "内部区域检测失败");
    } finally {
      setDetectingRegions(false);
    }
  }

  return (
    <div className={styles.page}>
      <Card className={styles.hero}>
        <Typography.Title level={2} style={{ marginTop: 0 }}>异形迷宫生成器</Typography.Title>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          上传动物、Logo 或物体的黑白剪影，在轮廓约束网格中生成唯一解迷宫，并同步输出真实答案。
        </Typography.Paragraph>
      </Card>

      <Card title="1. 生成合格黑白图的提示词" extra={<Space><Button onClick={() => setPromptModalOpen(true)}>生成提示词</Button><Button icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(imagePrompt).then(() => message.success("提示词已复制"))}>复制提示词</Button></Space>}>
        <Alert type="info" showIcon title="输入主体类型即可生成提示词；剪影应忠实保留主体原始比例和辨识特征，狭窄区域由迷宫算法自动处理。" style={{ marginBottom: 14 }} />
        <div className={styles.prompt}>{imagePrompt}</div>
      </Card>

      <Modal
        title="生成黑白 Mask 提示词"
        open={promptModalOpen}
        okText="生成提示词"
        cancelText="取消"
        onCancel={() => setPromptModalOpen(false)}
        onOk={() => {
          if (!promptSubject.trim()) {
            message.warning("请输入生成类型名");
            return;
          }
          setImagePrompt(buildImagePrompt(promptSubject.trim()));
          setPromptModalOpen(false);
          message.success("提示词已生成");
        }}
      >
        <Form layout="vertical" style={{ marginTop: 20 }}>
          <Form.Item label="生成类型名" required extra="建议使用英文，例如：a friendly front-facing owl">
            <Input value={promptSubject} onChange={(event) => setPromptSubject(event.target.value)} placeholder="例如：a cute bat with spread wings" />
          </Form.Item>
        </Form>
      </Modal>

      <div className={styles.controls}>
        <Card title="2. 上传并配置">
          <Form layout="vertical">
            <Form.Item label="黑白轮廓图" required>
              <Dragger
                className={styles.upload}
                accept="image/png,image/jpeg,image/webp"
                maxCount={1}
                beforeUpload={(nextFile) => {
                  setFile(nextFile);
                  setResult(undefined);
                  void analyzeInternalRegions(nextFile, foreground);
                  return false;
                }}
                onRemove={() => {
                  setFile(undefined);
                  setResult(undefined);
                  setInternalRegions([]);
                  setFeatureAssignments({});
                }}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">点击或拖入黑白图片</p>
                <p className="ant-upload-hint">PNG / JPG / WebP，推荐 1:1</p>
              </Dragger>
            </Form.Item>
            <Form.Item label="剪影颜色">
              <Select value={foreground} onChange={(value) => {
                setForeground(value);
                setResult(undefined);
                if (file) void analyzeInternalRegions(file, value);
              }} options={[{ label: "黑色剪影 / 白色背景", value: "black" }, { label: "白色剪影 / 黑色背景", value: "white" }]} />
            </Form.Item>
            <Form.Item label="内部区域合成" extra={internalRegions.length ? "为每个封闭白洞指定最终图形；迷宫网格会自动绕开这些区域" : "上传后自动检测封闭白洞"}>
              {detectingRegions ? (
                <Typography.Text type="secondary">正在检测内部区域…</Typography.Text>
              ) : internalRegions.length ? (
                <div className={styles.regionList}>
                  {internalRegions.map((region, index) => (
                    <div className={styles.regionRow} key={region.id}>
                      <Typography.Text>区域 {index + 1} · {Math.round(region.width)}×{Math.round(region.height)} px</Typography.Text>
                      <Select
                        value={featureAssignments[region.id] ?? "original"}
                        onChange={(value) => setFeatureAssignments((current) => ({ ...current, [region.id]: value }))}
                        options={[
                          { label: "保留原图内容", value: "original" },
                          { label: "保持留白", value: "blank" },
                          { label: "卡通眼睛", value: "eye" },
                          { label: "微笑嘴巴", value: "mouth" },
                          { label: "浅色斑点", value: "spot" },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <Typography.Text type="secondary">未检测到可保留的内部区域</Typography.Text>
              )}
            </Form.Item>
            <Form.Item label="难度">
              <Select
                value={difficulty}
                onChange={(value) => {
                  setDifficulty(value);
                  setResult(undefined);
                }}
                options={[
                  { label: "Easy · 5–6 岁（大网格、短路线、1–2 条迷惑分支）", value: "easy" },
                  { label: "Hard · 7–9 岁（密网格、长路线、2–4 条长假路）", value: "hard" },
                ]}
              />
            </Form.Item>
            <Form.Item label="随机种子" extra="保留种子可重复生成完全相同的迷宫">
              <InputNumber style={{ width: "100%" }} min={0} max={999999999} value={seed} onChange={(value) => setSeed(value ?? undefined)} placeholder="首次自动生成" />
            </Form.Item>
            <Space wrap>
              <Button type="primary" loading={generating} onClick={() => handleGenerate(false)}>生成迷宫</Button>
              <Button icon={<ReloadOutlined />} disabled={!file || seed === undefined} loading={generating} onClick={() => handleGenerate(true)}>按此种子重生成</Button>
            </Space>
          </Form>
        </Card>

        <Card title="3. 生成结果">
          {!result ? (
            <div className={styles.empty}>上传轮廓图并点击“生成迷宫”</div>
          ) : (
            <>
              <Space size="large" style={{ marginBottom: 16 }} wrap>
                <Statistic title="有效单元" value={result.cells} />
                <Statistic title="答案步数" value={result.solutionSteps} />
                <Statistic title="难度" value={result.difficulty === "easy" ? "Easy" : "Hard"} />
                <Statistic title="自适应网格" value={`${result.gridSize}×${result.gridSize}`} />
                <Statistic title="随机种子" value={result.seed} />
              </Space>
              <div className={styles.previewGrid}>
                <Card size="small" title="迷宫图" extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => download(result.mazeUrl, `${filename}-${result.difficulty}-maze.png`)}>下载</Button>}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.preview} src={result.mazeUrl} alt="生成的异形迷宫" />
                </Card>
                <Card size="small" title="答案图" extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => download(result.answerUrl, `${filename}-${result.difficulty}-maze-answer.png`)}>下载</Button>}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.preview} src={result.answerUrl} alt="带答案的异形迷宫" />
                </Card>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
