import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import slugify from "slugify";

import type {
  ActiveListItem,
  ActiveRecord,
  BacklinkExchangeRecord,
  BacklinkExchangeStatus,
  BacklinkLinkType,
  BacklinkItem,
  CategoryRecord,
  CategoryTreeNode,
  FileSyncStatus,
  GeneratedVideoRecord,
  ImgListItem,
  ImgSourceListItem,
  HomepageConfigRecord,
  PinPublishCycleCategoryRecord,
  PinPublishCycleRecord,
  PinPublishCycleStatus,
  PinPublishScheduleItemRecord,
  PoseSourceListItem,
  PoseSourceRecord,
  ProductPackageItemRecord,
  ProductPackageListItem,
  ProductPackageRecord,
  ProductPackageStatus,
  SpecialPageListItem,
  SpecialPageRecord,
  SpecialPageStatus,
  SyncStatus,
  VideoPublishCycleRecord,
} from "@/lib/admin-types";
import {
  CATEGORY_IMAGE_SIZES,
  type CategoryImageSize,
  appendCategoryImageSizeSuffix,
  buildCategoryContentImageKey,
  buildCategoryCoverImageKey,
  buildLegacyRemoteCategoryImageKey,
  buildPendingCategoryImagePath,
} from "@/lib/category-image";
import { collectCategoryImageIds } from "@/lib/category-image-list";
import {
  copyManagedFile,
  deleteManagedFile,
  buildPendingHomepageImagePath,
  hasManagedFile,
  listPendingManagedFiles,
  resolveManagedFilePath,
} from "@/lib/local-image-storage";
import { buildPromptPlansFromCategory } from "@/lib/pose-prompt-plan-builder";

export type SyncEntityType =
  | "category"
  | "active"
  | "img"
  | "img_file"
  | "homepage"
  | "special_page";
export type OutboxOperation = "create" | "update" | "delete" | "upload";
export type OutboxStatus = "pending" | "syncing" | "failed" | "synced" | "conflict";

export type CategoryInput = {
  parent_id: number | null;
  name: string;
  slug?: string;
  description?: string | null;
  /** 仅写入本地库，不参与远端同步 */
  name_zh?: string | null;
  /** 三级分类姿态信息 JSON，仅写入本地库，不参与远端同步 */
  pose_prompt_specs?: string | null;
  /** 是否发布到 Pinterest，仅写入本地库，不参与远端同步 */
  publish_to_pin?: boolean;
  cover_image?: string | null;
  seo_image_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type ActiveInput = {
  name: string;
  slug?: string;
  description?: string | null;
  sort_order?: number;
  colored_label?: boolean;
};

export type ImgInput = {
  category_id: number;
  active_id: number;
  image_url: string;
  image_url_card: string;
  local_file_path?: string | null;
  local_file_path_card?: string | null;
  answer_image_url?: string | null;
  answer_local_file_path?: string | null;
  manual_upload_pending?: boolean;
  difficulty?: number | null;
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type ImgFilters = {
  category_id?: number;
  active_id?: number;
  is_active?: boolean;
  keyword?: string;
};

export type ImgSourceInput = {
  category_id: number;
  source_kind: "outline" | "color" | "scene_color";
  image_url?: string | null;
  local_file_path?: string | null;
  title?: string | null;
  description?: string | null;
  prompt_key?: string | null;
  prompt_group?: string | null;
  prompt_text_zh?: string | null;
  prompt_text_en?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type ImgSourcePromptPlanInput = {
  category_id: number;
  source_kind: ImgSourceInput["source_kind"];
  prompt_key: string;
  prompt_group: string;
  title: string;
  description?: string | null;
  prompt_text_zh: string;
  prompt_text_en: string;
  sort_order?: number;
  is_active?: boolean;
};

export type ProductPackageItemInput = {
  category_id: number;
  pose_id: number;
  day_index?: number | null;
  sort_order?: number;
  display_name?: string | null;
};

export type ProductPackageInput = {
  parent_category_id: number;
  title?: string;
  slug?: string;
  subtitle?: string | null;
  target_label?: string;
  audience_note?: string | null;
  status?: ProductPackageStatus;
  cover_image_url?: string | null;
  pdf_file_path?: string | null;
  preview_file_path?: string | null;
  items: ProductPackageItemInput[];
};

export type SpecialPageInput = {
  title: string;
  slug?: string;
  subtitle?: string | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  hero_image_url?: string | null;
  card_image_url?: string | null;
  theme_color?: string | null;
  status?: SpecialPageStatus;
  sort_order?: number;
  content_json?: string | null;
};

export type HomepageConfigInput = {
  title: string;
  description: string;
  hero_image_url: string;
  seo_title: string;
  seo_description: string;
  footer_paragraph: string;
};

export type BacklinkExchangeInput = {
  domain: string;
  site_name?: string;
  website_url?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_url?: string | null;
  facebook_url?: string | null;
  status?: BacklinkExchangeStatus;
  priority?: number;
  topical_fit?: string | null;
  pitch_angle?: string | null;
  target_url?: string | null;
  anchor_text?: string | null;
  offered_asset?: string | null;
  outreach_email?: string | null;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  response_summary?: string | null;
  backlink_url?: string | null;
  backlinks?: BacklinkItem[];
  image_urls?: string[];
  copy_texts?: string[];
  link_type?: BacklinkLinkType;
  notes?: string | null;
};

export type SyncQueueItem = {
  id: number;
  entity_type: SyncEntityType;
  entity_id: number;
  operation: OutboxOperation;
  payload_snapshot: string | null;
  status: OutboxStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type DevCacheStore = Map<string, Promise<unknown>>;

type CategoryRow = CategoryRecord & {
  remote_id: number | null;
  sync_status: SyncStatus;
  local_updated_at: string;
  remote_updated_at_snapshot: string | null;
  last_synced_at: string | null;
  deleted_at: string | null;
};

type ActiveRow = ActiveRecord & {
  remote_id: number | null;
  sync_status: SyncStatus;
  local_updated_at: string;
  remote_updated_at_snapshot: string | null;
  last_synced_at: string | null;
  deleted_at: string | null;
};

type ActiveListRow = ActiveRow;

type ImgRow = ImgListItem & {
  remote_id: number | null;
  remote_file_key: string | null;
  remote_file_key_card: string | null;
  previous_remote_file_key: string | null;
  previous_remote_file_key_card: string | null;
  file_sync_status: FileSyncStatus;
  file_hash: string | null;
  sync_status: SyncStatus;
  local_updated_at: string;
  remote_updated_at_snapshot: string | null;
  last_synced_at: string | null;
  deleted_at: string | null;
};

type ImgSourceRow = ImgSourceListItem;
type PoseSourceRow = PoseSourceRecord & {
  category_name: string;
  category_slug: string;
};
type ProductPackageRow = ProductPackageListItem;
type ProductPackageItemRow = ProductPackageItemRecord;
type SpecialPageRow = SpecialPageListItem & {
  sync_status: SyncStatus;
  local_updated_at: string;
  remote_updated_at_snapshot: string | null;
  last_synced_at: string | null;
  deleted_at: string | null;
};

type HomepageConfigRow = HomepageConfigRecord;
type PinPublishCycleRow = PinPublishCycleRecord;
type PinPublishCycleCategoryRow = PinPublishCycleCategoryRecord;
type PinPublishScheduleItemRow = PinPublishScheduleItemRecord;
type VideoPublishCycleRow = VideoPublishCycleRecord;
type GeneratedVideoRow = GeneratedVideoRecord;
type BacklinkExchangeRow = BacklinkExchangeRecord;

export type LocalSyncIntegritySnapshot = {
  removed_orphan_outbox_count: number;
  orphan_categories: Array<{
    id: number;
    parent_id: number | null;
    remote_id: number | null;
    sync_status: SyncStatus;
    deleted_at: string | null;
  }>;
  orphan_imgs: Array<{
    id: number;
    category_id: number;
    active_id: number;
    remote_id: number | null;
    sync_status: SyncStatus;
    deleted_at: string | null;
  }>;
  orphan_img_sources: Array<{
    id: number;
    category_id: number;
  }>;
};

const DB_PATH = path.join(process.cwd(), "data", "local-admin.sqlite");
const DEV_CACHE_NAMESPACE = "__printlyAdminDevCache";
const SYNC_LOCK_NAME = "cloudflare-sync";

let database: Database.Database | null = null;

function now() {
  return new Date().toISOString();
}

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

function getDevCacheStore() {
  const scopedGlobal = globalThis as typeof globalThis & {
    [DEV_CACHE_NAMESPACE]?: DevCacheStore;
  };

  if (!scopedGlobal[DEV_CACHE_NAMESPACE]) {
    scopedGlobal[DEV_CACHE_NAMESPACE] = new Map<string, Promise<unknown>>();
  }

  return scopedGlobal[DEV_CACHE_NAMESPACE];
}

async function withDevCache<T>(key: string, loader: () => Promise<T>) {
  if (!isDevelopment()) {
    return loader();
  }

  const store = getDevCacheStore();
  const cached = store.get(key) as Promise<T> | undefined;

  if (cached) {
    return cached;
  }

  const pending = loader().catch((error: unknown) => {
    store.delete(key);
    throw error;
  });

  store.set(key, pending as Promise<unknown>);
  return pending;
}

function invalidateDevCache(...keys: string[]) {
  if (!isDevelopment()) {
    return;
  }

  const store = getDevCacheStore();

  keys.forEach((key) => {
    if (key.endsWith("*")) {
      const prefix = key.slice(0, -1);
      Array.from(store.keys()).forEach((cachedKey) => {
        if (cachedKey.startsWith(prefix)) {
          store.delete(cachedKey);
        }
      });
      return;
    }

    store.delete(key);
  });
}

function toBoolean(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function normalizeSlug(value: string) {
  const base = slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  });

  return base || `item-${Date.now()}`;
}

function normalizeDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return withoutProtocol.split("/")[0]?.trim() ?? "";
}

function normalizeWebsiteUrl(domain: string, value?: string | null) {
  const trimmed = value?.trim();
  if (trimmed) {
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
  return `https://${domain}`;
}

function normalizeBacklinkStatus(value: unknown): BacklinkExchangeStatus {
  const allowed = new Set<BacklinkExchangeStatus>([
    "uncontacted",
    "email_sent",
    "communicating",
    "contacted",
  ]);

  if (allowed.has(value as BacklinkExchangeStatus)) return value as BacklinkExchangeStatus;
  if (value === "replied" || value === "negotiating") return "communicating";
  if (value === "linked") return "contacted";
  if (value === "contacted") return "email_sent";
  return "uncontacted";
}

function normalizeBacklinkLinkType(value: unknown): BacklinkLinkType {
  return value === "dofollow" ? "dofollow" : "nofollow";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function parseStringList(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    return normalizeStringList(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeBacklinks(value: unknown): BacklinkItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { url?: unknown; link_type?: unknown };
    const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
    return url ? [{ url, link_type: normalizeBacklinkLinkType(candidate.link_type) }] : [];
  });
}

function parseBacklinks(value: unknown, legacyUrl: unknown, legacyType: unknown): BacklinkItem[] {
  if (typeof value === "string" && value) {
    try {
      const parsed = normalizeBacklinks(JSON.parse(value));
      if (parsed.length) return parsed;
    } catch {
      // 继续兼容旧的单外链字段。
    }
  }
  const url = typeof legacyUrl === "string" ? legacyUrl.trim() : "";
  return url ? [{ url, link_type: normalizeBacklinkLinkType(legacyType) }] : [];
}

function nullableTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseGeneratedImgIds(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return [] as number[];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => Number(item))
      .filter((item, index, array) => Number.isInteger(item) && item > 0 && array.indexOf(item) === index);
  } catch {
    return [];
  }
}

function stringifyGeneratedImgIds(ids: number[]) {
  const normalized = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  return JSON.stringify(normalized);
}

function getLocalChangeType(syncStatus: unknown) {
  if (syncStatus === "pending_create") {
    return "created" as const;
  }

  if (syncStatus === "pending_update") {
    return "updated" as const;
  }

  if (syncStatus === "conflict") {
    return "conflict" as const;
  }

  return null;
}

function normalizeCategoryImageId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getCategoryPathRows(
  categoryId: number,
  rowsById: Map<number, Pick<CategoryRow, "id" | "parent_id" | "slug">>,
) {
  const path: Array<Pick<CategoryRow, "id" | "parent_id" | "slug">> = [];
  let currentId: number | null = categoryId;

  while (currentId !== null) {
    const row = rowsById.get(currentId);
    if (!row) {
      break;
    }
    path.unshift(row);
    currentId = row.parent_id;
  }

  return path;
}

function buildCategoryImageObjectKeyForCategory(options: {
  categoryId: number;
  imageId: string;
  isCoverImage: boolean;
  rowsById: Map<number, Pick<CategoryRow, "id" | "parent_id" | "slug">>;
}) {
  const pathRows = getCategoryPathRows(options.categoryId, options.rowsById);

  if (pathRows.length === 0) {
    return buildLegacyRemoteCategoryImageKey(options.imageId);
  }

  const firstCategory = pathRows[0];
  const secondCategory = pathRows[1] ?? null;
  const thirdCategory = pathRows[2] ?? null;

  if (options.isCoverImage && pathRows.length <= 2) {
    return buildCategoryCoverImageKey({
      id: options.imageId,
      firstCategorySlug: firstCategory.slug,
      secondCategorySlug: secondCategory?.slug ?? null,
    });
  }

  return buildCategoryContentImageKey({
    id: options.imageId,
    firstCategorySlug: firstCategory.slug,
    secondCategorySlug: secondCategory?.slug ?? null,
    thirdCategorySlug: thirdCategory?.slug ?? null,
  });
}

function buildSizedCategoryImageObjectKey(objectKey: string, size: CategoryImageSize) {
  return appendCategoryImageSizeSuffix(objectKey, size);
}

const BACKLINK_EXCHANGE_SEED: BacklinkExchangeInput[] = [
  {
    domain: "3dinosaurs.com",
    site_name: "3 Dinosaurs",
    contact_name: "Cassie",
    priority: 1,
    topical_fit: "核心 printables 站，长期做 dinosaur、seasonal、animal themed packs；优先送 Dinosaur 5-in-1，其次 Farm/Ocean Animals 5-in-1，可作为她现有主题包的额外 reader freebie。",
    pitch_angle: "从 dinosaur printable pack 切入，强调我们已有涂色、描线、剪纸、数字排序、网格拼图 5 合 1，能直接补她的 dinosaur/theme printable 页面。",
    target_url: "/dinosaurs/",
    anchor_text: "free dinosaur printables",
    offered_asset: "Dinosaur 5-in-1 Printable Activity Pack",
    notes: "极品目标。首发恐龙包；如果她回复感兴趣，再补 farm/ocean/forest animals 多主题包。",
  },
  {
    domain: "livingmontessorinow.com",
    site_name: "Living Montessori Now",
    contact_name: "Deb",
    priority: 1,
    topical_fit: "Montessori 早教站，读者关心 fine motor、cutting、tracing、hands-on activities；适合送 Animal Fine Motor 资源：动物描线、剪纸、网格拼图、数字排序。",
    pitch_angle: "不要主推普通涂色页，主推 Montessori-friendly fine motor printable：tracing worksheets、scissor skills pages、grid puzzles 和 number sequencing。",
    target_url: "/animals/",
    anchor_text: "animal fine motor printables",
    offered_asset: "Animal Fine Motor 5-in-1 Printable Pack",
    notes: "适合切入精细动作训练和低龄启蒙资源。",
  },
  {
    domain: "thisreadingmama.com",
    site_name: "This Reading Mama",
    contact_name: "Becky",
    priority: 1,
    topical_fit: "阅读/phonics 老师站，核心是字母、识字、描红；适合送 Animal Alphabet + Tracing 资源，用动物主题承接 letter recognition、handwriting、beginning sounds。",
    pitch_angle: "切入她的 alphabet/phonics 内容，提供动物字母描线、动物词汇 tracing、简单 coloring page，强调可作为 literacy printable 的补充。",
    target_url: "/animals/",
    anchor_text: "animal alphabet tracing worksheets",
    offered_asset: "Animal Alphabet and Tracing Printable Pack",
    notes: "优先找 reading、alphabet、phonics 相关合作入口。",
  },
  {
    domain: "rockyourhomeschool.net",
    site_name: "Rock Your Homeschool",
    contact_name: "Amy",
    priority: 2,
    topical_fit: "Homeschool freebies 站，适合可直接下载的 no-prep 活动；优先送 Dinosaur 5-in-1 或 Farm Animals 5-in-1，适合男孩/低龄孩子消耗精力。",
    pitch_angle: "强调资源可直接作为她 Freebies/printable roundup 的赠品：涂色、描线、剪纸、数字排序、网格拼图一次打包。",
    target_url: "/dinosaurs/",
    anchor_text: "free dinosaur printables",
    offered_asset: "Dinosaur or Farm Animals 5-in-1 Printable Pack",
    notes: "Freebies 调性强，合作话术可以更直接。",
  },
  {
    domain: "simplelivingcreativelearning.com",
    site_name: "Simple Living Creative Learning",
    contact_name: "Stacey",
    priority: 2,
    topical_fit: "喜欢完整主题包和 unit study；适合送 Farm Animals/Ocean Animals/Dinosaur 5-in-1，突出一个主题内含 5 种玩法，方便她做整包推荐。",
    pitch_angle: "用 complete printable pack 角度切入：同一主题同时有 coloring、tracing、cutting、number sequencing、grid puzzles，适合她的 themed pack 读者。",
    target_url: "/animals/farm-animals/",
    anchor_text: "farm animal printables",
    offered_asset: "Farm Animals 5-in-1 Printable Activity Pack",
    notes: "她偏好 pack 形态，邮件里突出 bundle/package。",
  },
  {
    domain: "homeschoolcreations.net",
    site_name: "Homeschool Creations",
    contact_name: "Jolanthe",
    priority: 2,
    topical_fit: "K/early elementary worksheet 站，有 Printables 分类；适合送 Farm Animals 或 Pets 5-in-1，偏 kindergarten worksheet、tracing、number order、cutting practice。",
    pitch_angle: "从 kindergarten animal worksheets 切入，强调 no-prep、黑白打印、省墨、适合课堂中心活动或 homeschool morning work。",
    target_url: "/animals/farm-animals/",
    anchor_text: "farm animal worksheets",
    offered_asset: "Farm Animals Kindergarten Worksheet Pack",
    notes: "适合从 Printables 分类下的动物、幼儿园主题页切入。",
  },
  {
    domain: "encouragingmomsathome.com",
    site_name: "Encouraging Moms at Home",
    contact_name: "Amy",
    priority: 2,
    topical_fit: "Teaching Ideas / Free Printables 分类明确，适合送 Animal Coloring + Matching/Fine Motor 资源：动物涂色、描线、剪纸、数字排序。",
    pitch_angle: "以 Free Printables 补充资源切入，提供可直接加入 teaching ideas 文章的动物涂色和低龄练习包。",
    target_url: "/animals/",
    anchor_text: "free animal coloring pages",
    offered_asset: "Animal Coloring and Fine Motor Printable Set",
    notes: "分类入口清晰，适合让助理直接找 Free Printables 相关联系页。",
  },
  {
    domain: "mamateaches.com",
    site_name: "Mama Teaches",
    priority: 3,
    topical_fit: "老师/妈妈活动站，覆盖 kids activities、crafts、worksheets；适合送高清黑白 Animal Coloring Pack，或按主题给 Farm/Ocean/Dinosaur 5-in-1。",
    pitch_angle: "先用高质量黑白动物涂色页降低门槛，再说明同主题还有 tracing、cutting、number sequencing、grid puzzles 可扩展成完整活动包。",
    target_url: "/animals/",
    anchor_text: "animal coloring pages for kids",
    offered_asset: "High-Resolution Animal Coloring and Activity Pack",
    notes: "待补充联系人；邮件里突出高清、可打印、黑白线稿。",
  },
];

function seedBacklinkExchanges(database: Database.Database) {
  const timestamp = now();
  const statement = database.prepare(`
    INSERT OR IGNORE INTO backlink_exchanges (
      domain, site_name, website_url, contact_name, contact_email, contact_url, facebook_url, status, priority,
      topical_fit, pitch_angle, target_url, anchor_text, offered_asset, outreach_email, last_contacted_at,
      next_follow_up_at, response_summary, backlink_url, notes, created_at, updated_at
    )
    VALUES (
      @domain, @site_name, @website_url, @contact_name, @contact_email, @contact_url, @facebook_url, @status, @priority,
      @topical_fit, @pitch_angle, @target_url, @anchor_text, @offered_asset, @outreach_email, @last_contacted_at,
      @next_follow_up_at, @response_summary, @backlink_url, @notes, @created_at, @updated_at
    )
  `);

  BACKLINK_EXCHANGE_SEED.forEach((item) => {
    const domain = normalizeDomain(item.domain);
    statement.run({
      domain,
      site_name: item.site_name,
      website_url: normalizeWebsiteUrl(domain, item.website_url),
      contact_name: nullableTrim(item.contact_name),
      contact_email: nullableTrim(item.contact_email),
      contact_url: nullableTrim(item.contact_url),
      facebook_url: nullableTrim(item.facebook_url),
      status: normalizeBacklinkStatus(item.status),
      priority: Number(item.priority ?? 3),
      topical_fit: nullableTrim(item.topical_fit),
      pitch_angle: nullableTrim(item.pitch_angle),
      target_url: nullableTrim(item.target_url),
      anchor_text: nullableTrim(item.anchor_text),
      offered_asset: nullableTrim(item.offered_asset),
      outreach_email: nullableTrim(item.outreach_email),
      last_contacted_at: nullableTrim(item.last_contacted_at),
      next_follow_up_at: nullableTrim(item.next_follow_up_at),
      response_summary: nullableTrim(item.response_summary),
      backlink_url: nullableTrim(item.backlink_url),
      notes: nullableTrim(item.notes),
      created_at: timestamp,
      updated_at: timestamp,
    });
  });
}

function buildCategoryImageObjectKeysForCategory(options: {
  categoryId: number;
  imageId: string;
  rowsById: Map<number, Pick<CategoryRow, "id" | "parent_id" | "slug">>;
}) {
  const baseObjectKey = buildCategoryImageObjectKeyForCategory({
    categoryId: options.categoryId,
    imageId: options.imageId,
    isCoverImage: true,
    rowsById: options.rowsById,
  });

  return CATEGORY_IMAGE_SIZES.map((size) => ({
    size,
    objectKey: buildSizedCategoryImageObjectKey(baseObjectKey, size),
  }));
}

function buildCategorySeoImageObjectKey(options: {
  categoryId: number;
  imageId: string;
  rowsById: Map<number, Pick<CategoryRow, "id" | "parent_id" | "slug">>;
}) {
  const baseObjectKey = buildCategoryImageObjectKeyForCategory({
    categoryId: options.categoryId,
    imageId: options.imageId,
    isCoverImage: true,
    rowsById: options.rowsById,
  });

  return buildSizedCategoryImageObjectKey(baseObjectKey, 1024);
}

async function ensureCategoryImageMirrorFile(options: {
  imageId: string;
  nextObjectKey: string;
  size?: CategoryImageSize;
  currentObjectKey?: string | null;
}) {
  if (await hasManagedFile(options.nextObjectKey)) {
    return;
  }

  if (
    options.currentObjectKey &&
    options.currentObjectKey !== options.nextObjectKey &&
    (await hasManagedFile(options.currentObjectKey))
  ) {
    await copyManagedFile(options.currentObjectKey, options.nextObjectKey);
    return;
  }

  const pendingPath = buildPendingCategoryImagePath(options.imageId, options.size);
  if (await hasManagedFile(pendingPath)) {
    await copyManagedFile(pendingPath, options.nextObjectKey);
    return;
  }

  throw new Error(
    `封面图片文件已失效（${options.size ?? CATEGORY_IMAGE_SIZES[0]}px），请重新上传封面后再保存。`,
  );
}

async function ensureCategoryImageMirrorFiles(options: {
  imageId: string;
  nextObjectKeys: Array<{ size: CategoryImageSize; objectKey: string }>;
  currentObjectKeys?: Array<{ size: CategoryImageSize; objectKey: string }> | null;
}) {
  await Promise.all(
    options.nextObjectKeys.map(({ size, objectKey }) =>
      ensureCategoryImageMirrorFile({
        imageId: options.imageId,
        size,
        currentObjectKey:
          options.currentObjectKeys?.find((item) => item.size === size)?.objectKey ?? null,
        nextObjectKey: objectKey,
      }),
    ),
  );
}

async function assertPendingCategoryImageFiles(imageId: string) {
  const availability = await Promise.all(
    CATEGORY_IMAGE_SIZES.map(async (size) => ({
      size,
      exists: await hasManagedFile(buildPendingCategoryImagePath(imageId, size)),
    })),
  );
  const missingSizes = availability
    .filter((item) => !item.exists)
    .map((item) => item.size);

  if (missingSizes.length > 0) {
    throw new Error(
      `封面图片文件已失效，缺少 ${missingSizes.join("/")}px 文件，请重新上传封面后再保存。`,
    );
  }
}

async function assertCategoryImageSources(options: {
  imageId: string;
  nextObjectKeys: Array<{ size: CategoryImageSize; objectKey: string }>;
  currentObjectKeys?: Array<{ size: CategoryImageSize; objectKey: string }> | null;
}) {
  const availability = await Promise.all(
    options.nextObjectKeys.map(async ({ size, objectKey }) => {
      const currentObjectKey =
        options.currentObjectKeys?.find((item) => item.size === size)?.objectKey ?? null;
      const exists =
        (await hasManagedFile(objectKey)) ||
        (currentObjectKey ? await hasManagedFile(currentObjectKey) : false) ||
        (await hasManagedFile(buildPendingCategoryImagePath(options.imageId, size)));
      return { size, exists };
    }),
  );
  const missingSizes = availability
    .filter((item) => !item.exists)
    .map((item) => item.size);

  if (missingSizes.length > 0) {
    throw new Error(
      `封面图片文件已失效，缺少 ${missingSizes.join("/")}px 文件，请重新上传封面后再保存。`,
    );
  }
}

async function deleteCategoryImageLocalFiles(imageId: string, objectKeys: Array<string | null | undefined> = []) {
  const paths = new Set<string>(CATEGORY_IMAGE_SIZES.map((size) => buildPendingCategoryImagePath(imageId, size)));
  objectKeys.forEach((objectKey) => {
    if (objectKey?.trim()) {
      paths.add(objectKey);
    }
  });

  await Promise.all([...paths].map((relativePath) => deleteManagedFile(relativePath)));
}

function collectReferencedCategoryImageIds(options: {
  cover_image?: unknown;
}) {
  return collectCategoryImageIds(options.cover_image);
}

function hasPendingCategoryImageFile(imageId: string) {
  return existsSync(resolveManagedFilePath(buildPendingCategoryImagePath(imageId)));
}

function getPendingCategoryImageIdFromPath(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  const match = normalized.match(/^uploads\/pending\/([^/]+)(?:-\d+)?\.webp$/i);
  return match?.[1] ?? null;
}

function deleteQueuedCategoryImageDeletes(db: Database.Database, imageIds: string[]) {
  if (imageIds.length === 0) {
    return;
  }

  const placeholders = imageIds.map(() => "?").join(", ");
  db.prepare(`DELETE FROM category_image_delete_queue WHERE image_id IN (${placeholders})`).run(...imageIds);
}

function recreateImgsTableWithoutTags(database: Database.Database) {
  const imgColumns = database
    .prepare("PRAGMA table_info(imgs)")
    .all() as Array<{ name: string }>;
  const hasLegacyTagColumns = imgColumns.some(
    (column) => column.name === "style_tag_id" || column.name === "level_tag_id",
  );

  if (!hasLegacyTagColumns) {
    return;
  }

  database.exec(`
    DROP TABLE IF EXISTS imgs__tagless_reset;
    CREATE TABLE imgs__tagless_reset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER NULL,
      category_id INTEGER NOT NULL,
      active_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      image_url_card TEXT NOT NULL DEFAULT '',
      local_file_path TEXT NULL,
      local_file_path_card TEXT NULL,
      answer_image_url TEXT NULL,
      answer_local_file_path TEXT NULL,
      difficulty INTEGER NULL,
      remote_file_key TEXT NULL,
      remote_file_key_card TEXT NULL,
      previous_remote_file_key TEXT NULL,
      previous_remote_file_key_card TEXT NULL,
      file_sync_status TEXT NOT NULL DEFAULT 'pending_upload',
      file_hash TEXT NULL,
      title TEXT NULL,
      slug TEXT NULL UNIQUE,
      description TEXT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_create',
      local_updated_at TEXT NOT NULL,
      remote_updated_at_snapshot TEXT NULL,
      last_synced_at TEXT NULL,
      deleted_at TEXT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (active_id) REFERENCES actives(id)
    );
    INSERT INTO imgs__tagless_reset (
      id, remote_id, category_id, active_id, image_url, image_url_card, local_file_path, local_file_path_card,
      remote_file_key, remote_file_key_card, previous_remote_file_key, previous_remote_file_key_card,
      file_sync_status, file_hash, title, slug, description, difficulty, sort_order, is_active, created_at, updated_at,
      sync_status, local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
    )
    SELECT
      id, remote_id, category_id, active_id, image_url, COALESCE(image_url_card, image_url), local_file_path,
      local_file_path_card, remote_file_key, remote_file_key_card, previous_remote_file_key,
      previous_remote_file_key_card, file_sync_status, file_hash, title, slug, description, NULL, sort_order,
      is_active, created_at, updated_at, sync_status, local_updated_at, remote_updated_at_snapshot,
      last_synced_at, deleted_at
    FROM imgs;
    DROP TABLE imgs;
    ALTER TABLE imgs__tagless_reset RENAME TO imgs;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_imgs_remote_id ON imgs(remote_id);
    CREATE INDEX IF NOT EXISTS idx_imgs_category_id ON imgs(category_id);
    CREATE INDEX IF NOT EXISTS idx_imgs_active_id ON imgs(active_id);
    CREATE INDEX IF NOT EXISTS idx_imgs_deleted_at ON imgs(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_imgs_file_sync_status ON imgs(file_sync_status);
    CREATE INDEX IF NOT EXISTS idx_imgs_slug ON imgs(slug);
    CREATE INDEX IF NOT EXISTS idx_imgs_category_active_sort ON imgs(category_id, active_id, is_active, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_imgs_active_sort ON imgs(active_id, is_active, sort_order, id);
  `);
}

function queueCategoryImageDelete(db: Database.Database, imageId: string, objectKey: string) {
  db.prepare(
    `INSERT INTO category_image_delete_queue (image_id, object_key, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(image_id) DO UPDATE SET object_key = excluded.object_key, created_at = excluded.created_at`,
  ).run(imageId, objectKey, now());
}

function queueCategoryImageKeySetDelete(db: Database.Database, imageId: string, objectKeys: string[]) {
  queueCategoryImageDelete(db, imageId, JSON.stringify([...new Set(objectKeys)]));
}

function backfillImgSourceGeneratedImgIds(database: Database.Database) {
  const sourceColumns = database
    .prepare("PRAGMA table_info(img_sources)")
    .all() as Array<{ name: string }>;

  if (!sourceColumns.some((column) => column.name === "generated_img_ids")) {
    database.exec("ALTER TABLE img_sources ADD COLUMN generated_img_ids TEXT NULL");
  }

  const rows = database.prepare(
    `SELECT imgs.id, imgs.category_id, imgs.slug, actives.slug AS active_slug
     FROM imgs
     INNER JOIN actives ON actives.id = imgs.active_id
     WHERE imgs.slug IS NOT NULL
       AND imgs.deleted_at IS NULL`,
  ).all() as Array<{
    id: number;
    category_id: number;
    slug: string | null;
    active_slug: string;
  }>;
  const sourceIdToGeneratedIds = new Map<number, number[]>();
  const hasSourceStatement = database.prepare(
    "SELECT id FROM img_sources WHERE id = ? AND category_id = ? LIMIT 1",
  );
  const updateStatement = database.prepare("UPDATE img_sources SET generated_img_ids = ? WHERE id = ?");

  rows.forEach((row) => {
    if (!row.slug) {
      return;
    }

    const matched = row.slug.match(new RegExp(`-(\\d+)-${escapeRegExp(row.active_slug)}$`));
    if (!matched) {
      return;
    }

    const sourceId = Number(matched[1]);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return;
    }

    const source = hasSourceStatement.get(sourceId, row.category_id) as { id: number } | undefined;
    if (!source) {
      return;
    }

    const current = sourceIdToGeneratedIds.get(sourceId) ?? [];
    current.push(row.id);
    sourceIdToGeneratedIds.set(sourceId, current);
  });

  sourceIdToGeneratedIds.forEach((generatedIds, sourceId) => {
    updateStatement.run(stringifyGeneratedImgIds(generatedIds), sourceId);
  });
}

function recreateCategoriesTableWithoutSeoKeywords(database: Database.Database) {
  const categoryColumns = database
    .prepare("PRAGMA table_info(categories)")
    .all() as Array<{ name: string }>;
  const columnNames = categoryColumns.map((column) => column.name);
  const hasRemovedColumns =
    columnNames.includes("keywords") ||
    columnNames.includes("similar_keywords") ||
    columnNames.includes("image_list");

  if (!hasRemovedColumns) {
    return;
  }

  const coverImageSelect = columnNames.includes("cover_image")
    ? "cover_image"
    : "NULL AS cover_image";
  const seoImageUrlSelect = columnNames.includes("seo_image_url")
    ? "seo_image_url"
    : "NULL AS seo_image_url";
  const nameZhSelect = columnNames.includes("name_zh") ? "name_zh" : "NULL AS name_zh";
  const posePromptSpecsSelect = columnNames.includes("pose_prompt_specs")
    ? "pose_prompt_specs"
    : "NULL AS pose_prompt_specs";
  const publishToPinSelect = columnNames.includes("publish_to_pin")
    ? "publish_to_pin"
    : "0 AS publish_to_pin";

  database.exec(`
    DROP TABLE IF EXISTS categories__schema_reset;
    CREATE TABLE categories__schema_reset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER NULL,
      parent_id INTEGER NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NULL,
      name_zh TEXT NULL,
      pose_prompt_specs TEXT NULL,
      publish_to_pin INTEGER NOT NULL DEFAULT 0,
      cover_image TEXT NULL,
      seo_image_url TEXT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_create',
      local_updated_at TEXT NOT NULL,
      remote_updated_at_snapshot TEXT NULL,
      last_synced_at TEXT NULL,
      deleted_at TEXT NULL,
      FOREIGN KEY (parent_id) REFERENCES categories__schema_reset(id)
    );
    INSERT INTO categories__schema_reset (
      id, remote_id, parent_id, name, slug, description, name_zh, pose_prompt_specs, publish_to_pin, cover_image, seo_image_url, sort_order, is_active,
      created_at, updated_at, sync_status, local_updated_at, remote_updated_at_snapshot,
      last_synced_at, deleted_at
    )
    SELECT
      id, remote_id, parent_id, name, slug, description, ${nameZhSelect}, ${posePromptSpecsSelect}, ${publishToPinSelect}, ${coverImageSelect}, ${seoImageUrlSelect}, sort_order, is_active,
      created_at, updated_at, sync_status, local_updated_at, remote_updated_at_snapshot,
      last_synced_at, deleted_at
    FROM categories;
    DROP TABLE categories;
    ALTER TABLE categories__schema_reset RENAME TO categories;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_remote_id ON categories(remote_id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
    CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON categories(deleted_at);
  `);
}

/** 修复误指向已删除表 categories__drop_keywords 的 parent_id 外键（历史迁移残留） */
function repairCategoriesParentForeignKeyIfNeeded(database: Database.Database) {
  let fkRows: Array<{ table: string }> = [];
  try {
    fkRows = database.prepare("PRAGMA foreign_key_list(categories)").all() as Array<{ table: string }>;
  } catch {
    return;
  }

  if (!fkRows.some((row) => row.table === "categories__drop_keywords")) {
    return;
  }

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE categories__parent_fk_rebuild (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER NULL,
      parent_id INTEGER NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NULL,
      name_zh TEXT NULL,
      cover_image TEXT NULL,
      seo_image_url TEXT NULL,
      publish_to_pin INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_create',
      local_updated_at TEXT NOT NULL,
      remote_updated_at_snapshot TEXT NULL,
      last_synced_at TEXT NULL,
      deleted_at TEXT NULL,
      pose_prompt_specs TEXT NULL
    );
    INSERT INTO categories__parent_fk_rebuild (
      id, remote_id, parent_id, name, slug, description, name_zh, cover_image, seo_image_url, publish_to_pin, sort_order, is_active,
      created_at, updated_at, sync_status, local_updated_at, remote_updated_at_snapshot,
      last_synced_at, deleted_at, pose_prompt_specs
    )
    SELECT
      id, remote_id, parent_id, name, slug, description, name_zh, NULL, 0, sort_order, is_active,
      created_at, updated_at, sync_status, local_updated_at, remote_updated_at_snapshot,
      last_synced_at, deleted_at, NULL
    FROM categories;
    DROP TABLE categories;
    ALTER TABLE categories__parent_fk_rebuild RENAME TO categories;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_remote_id ON categories(remote_id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
    CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON categories(deleted_at);
    COMMIT;
  `);
  database.exec("PRAGMA foreign_keys = ON");
}

function splitCategoryImageDeletes(imageIds: string[]) {
  return imageIds.reduce(
    (result, imageId) => {
      if (hasPendingCategoryImageFile(imageId)) {
        result.localOnlyIds.push(imageId);
      } else {
        result.remoteIds.push(imageId);
      }

      return result;
    },
    { localOnlyIds: [] as string[], remoteIds: [] as string[] },
  );
}

function mapCategory(row: Record<string, unknown>): CategoryRecord {
  return {
    id: Number(row.id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description === null ? null : String(row.description),
    name_zh:
      row.name_zh === null || row.name_zh === undefined
        ? null
        : String(row.name_zh).trim() || null,
    pose_prompt_specs:
      row.pose_prompt_specs === null || row.pose_prompt_specs === undefined
        ? null
        : String(row.pose_prompt_specs).trim() || null,
    publish_to_pin: toBoolean(row.publish_to_pin),
    pin_publish_cycle_id:
      row.pin_publish_cycle_id === null || row.pin_publish_cycle_id === undefined
        ? null
        : Number(row.pin_publish_cycle_id),
    video_publish_cycle_id:
      row.video_publish_cycle_id === null || row.video_publish_cycle_id === undefined
        ? null
        : Number(row.video_publish_cycle_id),
    cover_image: normalizeCategoryImageId(row.cover_image),
    seo_image_url:
      row.seo_image_url === null || row.seo_image_url === undefined
        ? null
        : String(row.seo_image_url).trim() || null,
    sort_order: Number(row.sort_order),
    is_active: toBoolean(row.is_active),
    local_change_type: getLocalChangeType(row.sync_status),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapPinPublishCycle(row: Record<string, unknown>): PinPublishCycleRecord {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    start_date: String(row.start_date ?? ""),
    end_date: String(row.end_date ?? ""),
    status: String(row.status ?? "pending_upload") as PinPublishCycleStatus,
    category_count: Number(row.category_count ?? 0),
    item_count: Number(row.item_count ?? 0),
    filled_item_count: Number(row.filled_item_count ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapPinPublishCycleCategory(row: Record<string, unknown>): PinPublishCycleCategoryRecord {
  return {
    id: Number(row.id),
    cycle_id: Number(row.cycle_id),
    day_index: Number(row.day_index),
    category_id: Number(row.category_id),
    pose_id:
      row.pose_id === null || row.pose_id === undefined || row.pose_id === ""
        ? null
        : Number(row.pose_id),
    category_name: String(row.category_name ?? ""),
    category_name_zh:
      row.category_name_zh === null || row.category_name_zh === undefined
        ? null
        : String(row.category_name_zh).trim() || null,
    category_slug: String(row.category_slug ?? ""),
    pose_key:
      row.pose_key === null || row.pose_key === undefined ? null : String(row.pose_key).trim() || null,
    pose_title:
      row.pose_title === null || row.pose_title === undefined
        ? null
        : String(row.pose_title).trim() || null,
    pose_title_zh:
      row.pose_title_zh === null || row.pose_title_zh === undefined
        ? null
        : String(row.pose_title_zh).trim() || null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapPinPublishScheduleItem(row: Record<string, unknown>): PinPublishScheduleItemRecord {
  return {
    id: Number(row.id),
    cycle_id: Number(row.cycle_id),
    day_index: Number(row.day_index),
    slot_index: Number(row.slot_index),
    source_category_id: Number(row.source_category_id),
    source_pose_id:
      row.source_pose_id === null || row.source_pose_id === undefined || row.source_pose_id === ""
        ? null
        : Number(row.source_pose_id),
    source_category_name: String(row.source_category_name ?? ""),
    source_category_name_zh:
      row.source_category_name_zh === null || row.source_category_name_zh === undefined
        ? null
        : String(row.source_category_name_zh).trim() || null,
    source_pose_key:
      row.source_pose_key === null || row.source_pose_key === undefined
        ? null
        : String(row.source_pose_key).trim() || null,
    source_pose_title:
      row.source_pose_title === null || row.source_pose_title === undefined
        ? null
        : String(row.source_pose_title).trim() || null,
    source_pose_title_zh:
      row.source_pose_title_zh === null || row.source_pose_title_zh === undefined
        ? null
        : String(row.source_pose_title_zh).trim() || null,
    publish_time: String(row.publish_time ?? ""),
    image_url: row.image_url === null || row.image_url === undefined ? null : String(row.image_url),
    title: row.title === null || row.title === undefined ? null : String(row.title),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    pin_url: row.pin_url === null || row.pin_url === undefined ? null : String(row.pin_url),
    board: row.board === null || row.board === undefined ? null : String(row.board),
    section: row.section === null || row.section === undefined ? null : String(row.section),
    alt_text: row.alt_text === null || row.alt_text === undefined ? null : String(row.alt_text),
    tags: row.tags === null || row.tags === undefined ? null : String(row.tags),
    variant_key: row.variant_key === null || row.variant_key === undefined ? null : String(row.variant_key),
    label: row.label === null || row.label === undefined ? null : String(row.label),
    uploaded: toBoolean(row.uploaded),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapVideoPublishCycle(row: Record<string, unknown>): VideoPublishCycleRecord {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    start_date: String(row.start_date ?? ""),
    end_date: String(row.end_date ?? ""),
    category_count: Number(row.category_count ?? 0),
    video_count: Number(row.video_count ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapGeneratedVideo(row: Record<string, unknown>): GeneratedVideoRecord {
  return {
    id: Number(row.id),
    cycle_id: Number(row.cycle_id),
    category_id: Number(row.category_id),
    pose_id:
      row.pose_id === null || row.pose_id === undefined || row.pose_id === ""
        ? null
        : Number(row.pose_id),
    day_index:
      row.day_index === null || row.day_index === undefined || row.day_index === ""
        ? null
        : Number(row.day_index),
    slot_index:
      row.slot_index === null || row.slot_index === undefined || row.slot_index === ""
        ? null
        : Number(row.slot_index),
    category_name: String(row.category_name ?? ""),
    category_name_zh:
      row.category_name_zh === null || row.category_name_zh === undefined
        ? null
        : String(row.category_name_zh).trim() || null,
    category_slug_path: [
      row.category_level1_slug,
      row.category_level2_slug,
      row.category_level3_slug,
    ]
      .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
      .filter(Boolean),
    pose_key:
      row.pose_key === null || row.pose_key === undefined
        ? null
        : String(row.pose_key).trim() || null,
    pose_title:
      row.pose_title === null || row.pose_title === undefined
        ? null
        : String(row.pose_title).trim() || null,
    pose_title_zh:
      row.pose_title_zh === null || row.pose_title_zh === undefined
        ? null
        : String(row.pose_title_zh).trim() || null,
    local_file_path: String(row.local_file_path ?? ""),
    asset_color_path: String(row.asset_color_path ?? ""),
    asset_outline_path: String(row.asset_outline_path ?? ""),
    asset_scene_color_path: String(row.asset_scene_color_path ?? ""),
    template_version: String(row.template_version ?? ""),
    status: row.status === "failed" ? "failed" : "generated",
    error_message:
      row.error_message === null || row.error_message === undefined
        ? null
        : String(row.error_message),
    uploaded: Boolean(row.uploaded),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapActive(row: Record<string, unknown>): ActiveRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description === null ? null : String(row.description),
    sort_order: Number(row.sort_order),
    colored_label: toBoolean(row.colored_label),
    local_change_type: getLocalChangeType(row.sync_status),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapActiveListItem(row: Record<string, unknown>): ActiveListItem {
  return mapActive(row);
}

function mapBacklinkExchange(row: Record<string, unknown>): BacklinkExchangeRecord {
  return {
    id: Number(row.id),
    domain: String(row.domain),
    site_name: String(row.site_name),
    website_url: String(row.website_url),
    contact_name: row.contact_name === null ? null : String(row.contact_name),
    contact_email: row.contact_email === null ? null : String(row.contact_email),
    contact_url: row.contact_url === null ? null : String(row.contact_url),
    facebook_url: row.facebook_url === null ? null : String(row.facebook_url),
    status: normalizeBacklinkStatus(row.status),
    priority: Number(row.priority ?? 3),
    topical_fit: row.topical_fit === null ? null : String(row.topical_fit),
    pitch_angle: row.pitch_angle === null ? null : String(row.pitch_angle),
    target_url: row.target_url === null ? null : String(row.target_url),
    anchor_text: row.anchor_text === null ? null : String(row.anchor_text),
    offered_asset: row.offered_asset === null ? null : String(row.offered_asset),
    outreach_email: row.outreach_email === null ? null : String(row.outreach_email),
    last_contacted_at: row.last_contacted_at === null ? null : String(row.last_contacted_at),
    next_follow_up_at: row.next_follow_up_at === null ? null : String(row.next_follow_up_at),
    response_summary: row.response_summary === null ? null : String(row.response_summary),
    backlink_url: row.backlink_url === null ? null : String(row.backlink_url),
    backlinks: parseBacklinks(row.backlinks, row.backlink_url, row.link_type),
    image_urls: parseStringList(row.image_urls),
    copy_texts: parseStringList(row.copy_texts),
    link_type: normalizeBacklinkLinkType(row.link_type),
    notes: row.notes === null ? null : String(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapImg(row: Record<string, unknown>): ImgListItem {
  return {
    id: Number(row.id),
    category_id: Number(row.category_id),
    active_id: Number(row.active_id),
    image_url: String(row.image_url),
    image_url_card:
      row.image_url_card === null || row.image_url_card === undefined
        ? String(row.image_url)
        : String(row.image_url_card),
    local_file_path: row.local_file_path === null ? null : String(row.local_file_path),
    local_file_path_card:
      row.local_file_path_card === null || row.local_file_path_card === undefined
        ? null
        : String(row.local_file_path_card),
    answer_image_url:
      row.answer_image_url === null || row.answer_image_url === undefined
        ? null
        : String(row.answer_image_url),
    answer_local_file_path:
      row.answer_local_file_path === null || row.answer_local_file_path === undefined
        ? null
        : String(row.answer_local_file_path),
    difficulty:
      row.difficulty === null || row.difficulty === undefined
        ? null
        : Number(row.difficulty),
    file_sync_status:
      row.file_sync_status === "draft"
        ? "draft"
        : row.file_sync_status === "pending_upload"
          ? "pending_upload"
          : row.file_sync_status === "pending_delete"
            ? "pending_delete"
            : row.file_sync_status === "failed"
              ? "failed"
              : "synced",
    title: row.title === null ? null : String(row.title),
    slug: row.slug === null ? null : String(row.slug),
    description: row.description === null ? null : String(row.description),
    sort_order: Number(row.sort_order),
    is_active: toBoolean(row.is_active),
    local_change_type: getLocalChangeType(row.sync_status),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    category_name: String(row.category_name),
    active_name: String(row.active_name),
  };
}

function mapImgSource(row: Record<string, unknown>): ImgSourceListItem {
  const sourceKind =
    row.source_kind === "scene_color"
      ? "scene_color"
      : row.source_kind === "color"
        ? "color"
        : "outline";
  const imageUrl = row.image_url === null ? "" : String(row.image_url ?? "");
  const localFilePath =
    row.local_file_path === null ? "" : String(row.local_file_path ?? "");

  return {
    id: Number(row.id),
    category_id: Number(row.category_id),
    source_kind: sourceKind,
    image_url: imageUrl || null,
    local_file_path: localFilePath || null,
    generated_img_ids: parseGeneratedImgIds(row.generated_img_ids),
    title: row.title === null ? null : String(row.title),
    description: row.description === null ? null : String(row.description),
    prompt_key: row.prompt_key === null ? null : String(row.prompt_key),
    prompt_group: row.prompt_group === null ? null : String(row.prompt_group),
    prompt_text_zh: row.prompt_text_zh === null ? null : String(row.prompt_text_zh),
    prompt_text_en: row.prompt_text_en === null ? null : String(row.prompt_text_en),
    sort_order: Number(row.sort_order),
    is_active: toBoolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
  };
}

const POSE_SOURCE_KINDS = ["color", "outline", "scene_color"] as const;
type PoseSourceKind = (typeof POSE_SOURCE_KINDS)[number];

type PoseSourceGroup = {
  pose_key: string;
  pose_title: string | null;
  pose_title_zh: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  color: ImgSourceRow | null;
  outline: ImgSourceRow | null;
  scene_color: ImgSourceRow | null;
};

function getPoseSourceBaseKey(promptKey?: string | null) {
  const normalized = promptKey?.trim() || "";
  if (!normalized) {
    return "";
  }

  return normalized.split(":")[0]?.trim() || "";
}

function extractPoseTitleZhFromPromptTexts(
  promptTextZh?: string | null,
  promptTextEn?: string | null,
) {
  const normalizedZh = promptTextZh?.trim() || "";
  if (normalizedZh.startsWith("绘制") && normalizedZh.endsWith("姿态的图")) {
    return normalizedZh.slice(2, -4).trim() || "";
  }
  if (normalizedZh.startsWith("绘制") && normalizedZh.endsWith("主体图")) {
    return normalizedZh.slice(2, -"主体图".length).trim() || "";
  }

  const zhMatch = normalizedZh.match(/【([^/\]]+)\s*\/\s*([^\]]+)】/u);
  if (zhMatch?.[1]?.trim()) {
    return zhMatch[1].trim();
  }

  const normalizedEn = promptTextEn?.trim() || "";
  const enMatch = normalizedEn.match(/\[([^\]/]+)\s*\/\s*([^\]]+)\]/u);
  if (enMatch?.[1]?.trim()) {
    return enMatch[1].trim();
  }

  return "";
}

function extractPoseTitleEnFromPromptTexts(
  promptGroup?: string | null,
  promptTextEn?: string | null,
) {
  const normalizedGroup = promptGroup?.trim() || "";
  if (normalizedGroup) {
    return normalizedGroup;
  }

  const normalizedEn = promptTextEn?.trim() || "";
  const enMatch = normalizedEn.match(/\[([^\]/]+)\s*\/\s*([^\]]+)\]/u);
  if (enMatch?.[2]?.trim()) {
    return enMatch[2].trim();
  }

  return "";
}

function buildPoseSourceKindRecord(
  row: Record<string, unknown>,
  kind: PoseSourceKind,
  sourceMap: Map<number, ImgSourceRow>,
) {
  const sourceIdField = `${kind}_source_id`;
  const imageUrlField = `${kind}_image_url`;
  const localFilePathField = `${kind}_local_file_path`;
  const generatedImgIdsField = `${kind}_generated_img_ids`;
  const rawSourceId = row[sourceIdField];
  const sourceId =
    rawSourceId === null || rawSourceId === undefined ? null : Number(rawSourceId);
  const sourceRow = sourceId === null ? null : sourceMap.get(sourceId) ?? null;
  const imageUrl =
    row[imageUrlField] === null ? "" : String(row[imageUrlField] ?? "");
  const localFilePath =
    row[localFilePathField] === null ? "" : String(row[localFilePathField] ?? "");

  return {
    source_id: sourceId,
    image_url: imageUrl.trim() || null,
    local_file_path: localFilePath.trim() || null,
    generated_img_ids: parseGeneratedImgIds(row[generatedImgIdsField]),
    prompt_key: sourceRow?.prompt_key ?? null,
    prompt_group: sourceRow?.prompt_group ?? null,
    prompt_text_zh: sourceRow?.prompt_text_zh ?? null,
    prompt_text_en: sourceRow?.prompt_text_en ?? null,
  };
}

function mapPoseSource(
  row: Record<string, unknown>,
  sourceMap: Map<number, ImgSourceRow>,
): PoseSourceListItem {
  return {
    id: Number(row.id),
    category_id: Number(row.category_id),
    pose_key: String(row.pose_key),
    pose_title:
      row.pose_title === null || row.pose_title === undefined
        ? null
        : String(row.pose_title).trim() || null,
    pose_title_zh:
      row.pose_title_zh === null || row.pose_title_zh === undefined
        ? null
        : String(row.pose_title_zh).trim() || null,
    pin_publish_cycle_id:
      row.pin_publish_cycle_id === null || row.pin_publish_cycle_id === undefined
        ? null
        : Number(row.pin_publish_cycle_id),
    video_publish_cycle_id:
      row.video_publish_cycle_id === null || row.video_publish_cycle_id === undefined
        ? null
        : Number(row.video_publish_cycle_id),
    sort_order: Number(row.sort_order ?? 0),
    color: buildPoseSourceKindRecord(row, "color", sourceMap),
    outline: buildPoseSourceKindRecord(row, "outline", sourceMap),
    scene_color: buildPoseSourceKindRecord(row, "scene_color", sourceMap),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
  };
}

function normalizeProductPackageStatus(value: unknown): ProductPackageStatus {
  return value === "ready" || value === "archived" ? value : "draft";
}

function normalizeSpecialPageStatus(value: unknown): SpecialPageStatus {
  return value === "published" || value === "archived" ? value : "draft";
}

function mapProductPackage(row: Record<string, unknown>): ProductPackageListItem {
  return {
    id: Number(row.id),
    parent_category_id: Number(row.parent_category_id),
    parent_category_name: String(row.parent_category_name),
    parent_category_slug: String(row.parent_category_slug),
    title: String(row.title),
    slug: String(row.slug),
    subtitle:
      row.subtitle === null || row.subtitle === undefined
        ? null
        : String(row.subtitle).trim() || null,
    target_label: String(row.target_label || "Kindergarten"),
    audience_note:
      row.audience_note === null || row.audience_note === undefined
        ? null
        : String(row.audience_note).trim() || null,
    status: normalizeProductPackageStatus(row.status),
    cover_image_url:
      row.cover_image_url === null || row.cover_image_url === undefined
        ? null
        : String(row.cover_image_url).trim() || null,
    pdf_file_path:
      row.pdf_file_path === null || row.pdf_file_path === undefined
        ? null
        : String(row.pdf_file_path).trim() || null,
    preview_file_path:
      row.preview_file_path === null || row.preview_file_path === undefined
        ? null
        : String(row.preview_file_path).trim() || null,
    copy_json:
      row.copy_json === null || row.copy_json === undefined
        ? null
        : String(row.copy_json).trim() || null,
    page_plan_json:
      row.page_plan_json === null || row.page_plan_json === undefined
        ? null
        : String(row.page_plan_json).trim() || null,
    item_count: Number(row.item_count ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapProductPackageItem(row: Record<string, unknown>): ProductPackageItemRecord {
  return {
    id: Number(row.id),
    package_id: Number(row.package_id),
    category_id: Number(row.category_id),
    pose_id: Number(row.pose_id),
    day_index:
      row.day_index === null || row.day_index === undefined ? null : Number(row.day_index),
    sort_order: Number(row.sort_order ?? 0),
    display_name:
      row.display_name === null || row.display_name === undefined
        ? null
        : String(row.display_name).trim() || null,
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
    pose_key: String(row.pose_key),
    pose_title:
      row.pose_title === null || row.pose_title === undefined
        ? null
        : String(row.pose_title).trim() || null,
    pose_title_zh:
      row.pose_title_zh === null || row.pose_title_zh === undefined
        ? null
        : String(row.pose_title_zh).trim() || null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSpecialPage(row: Record<string, unknown>): SpecialPageListItem {
  return {
    id: Number(row.id),
    remote_id:
      row.remote_id === null || row.remote_id === undefined ? null : Number(row.remote_id),
    title: String(row.title),
    slug: String(row.slug),
    subtitle:
      row.subtitle === null || row.subtitle === undefined
        ? null
        : String(row.subtitle).trim() || null,
    description:
      row.description === null || row.description === undefined
        ? null
        : String(row.description).trim() || null,
    seo_title:
      row.seo_title === null || row.seo_title === undefined
        ? null
        : String(row.seo_title).trim() || null,
    seo_description:
      row.seo_description === null || row.seo_description === undefined
        ? null
        : String(row.seo_description).trim() || null,
    hero_image_url:
      row.hero_image_url === null || row.hero_image_url === undefined
        ? null
        : String(row.hero_image_url).trim() || null,
    card_image_url:
      row.card_image_url === null || row.card_image_url === undefined
        ? null
        : String(row.card_image_url).trim() || null,
    theme_color: /^#[0-9A-F]{6}$/i.test(String(row.theme_color ?? ""))
      ? String(row.theme_color).toUpperCase()
      : "#7ADDE8",
    status: normalizeSpecialPageStatus(row.status),
    sort_order: Number(row.sort_order ?? 0),
    content_json: String(row.content_json || '{"items":[]}'),
    local_change_type: getLocalChangeType(row.sync_status),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapHomepageConfig(row: Record<string, unknown>): HomepageConfigRecord {
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    hero_image_url: String(row.hero_image_url ?? ""),
    seo_title: String(row.seo_title ?? ""),
    seo_description: String(row.seo_description ?? ""),
    footer_paragraph: String(row.footer_paragraph ?? ""),
    category_printable_counts: String(row.category_printable_counts ?? "{}"),
    total_printable_count: Number(row.total_printable_count ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function getHomepageConfigRow() {
  return getDb()
    .prepare("SELECT * FROM homepage_config ORDER BY id DESC LIMIT 1")
    .get() as HomepageConfigRow | undefined;
}

/** 旧库 generated_videos 无 pose_id：重建表，历史行 pose_id 置空（仍按周期+分类唯一） */
function migrateGeneratedVideosTableForPose(db: InstanceType<typeof Database>) {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generated_videos'")
    .get() as { name: string } | undefined;
  if (!table) {
    return;
  }

  const cols = db.prepare("PRAGMA table_info(generated_videos)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "pose_id")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE generated_videos__pose_migrate (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        pose_id INTEGER NULL,
        local_file_path TEXT NOT NULL,
        asset_color_path TEXT NOT NULL,
        asset_outline_path TEXT NOT NULL,
        asset_scene_color_path TEXT NOT NULL,
        template_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'generated',
        error_message TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (cycle_id) REFERENCES video_publish_cycles(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        FOREIGN KEY (pose_id) REFERENCES img_source_poses(id) ON DELETE CASCADE
      );
      INSERT INTO generated_videos__pose_migrate (
        id, cycle_id, category_id, pose_id, local_file_path, asset_color_path, asset_outline_path,
        asset_scene_color_path, template_version, status, error_message, created_at, updated_at
      )
      SELECT
        id, cycle_id, category_id, NULL, local_file_path, asset_color_path, asset_outline_path,
        asset_scene_color_path, template_version, status, error_message, created_at, updated_at
      FROM generated_videos;
      DROP TABLE generated_videos;
      ALTER TABLE generated_videos__pose_migrate RENAME TO generated_videos;
      COMMIT;
    `);
    db.exec("PRAGMA foreign_keys = ON");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generated_videos_cycle
      ON generated_videos(cycle_id, category_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_generated_videos_cycle_pose
      ON generated_videos(cycle_id, pose_id)
      WHERE pose_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_generated_videos_cycle_cat_legacy
      ON generated_videos(cycle_id, category_id)
      WHERE pose_id IS NULL;
  `);
}

function buildCategoryTree(flat: CategoryRecord[]) {
  const nodeMap = new Map<number, CategoryTreeNode>();
  const tree: CategoryTreeNode[] = [];

  flat.forEach((item) => {
    nodeMap.set(item.id, { ...item, children: [] });
  });

  nodeMap.forEach((node) => {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id)?.children.push(node);
      return;
    }

    tree.push(node);
  });

  return tree;
}

function collectCategorySubtreeRows(rootId: number) {
  const rows = getDb()
    .prepare(
      "SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order ASC, id ASC",
    )
    .all() as CategoryRow[];
  const childrenByParentId = new Map<number, CategoryRow[]>();

  rows.forEach((row) => {
    if (row.parent_id === null) {
      return;
    }

    const siblings = childrenByParentId.get(row.parent_id) ?? [];
    siblings.push(row);
    childrenByParentId.set(row.parent_id, siblings);
  });

  const root = rows.find((row) => row.id === rootId) ?? null;
  if (!root) {
    return [] as CategoryRow[];
  }

  const ordered: CategoryRow[] = [];
  const visit = (row: CategoryRow) => {
    (childrenByParentId.get(row.id) ?? []).forEach(visit);
    ordered.push(row);
  };

  visit(root);
  return ordered;
}

function getDb() {
  if (database) {
    return database;
  }

  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  database = new Database(DB_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER NULL,
      parent_id INTEGER NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NULL,
      name_zh TEXT NULL,
      pose_prompt_specs TEXT NULL,
      publish_to_pin INTEGER NOT NULL DEFAULT 0,
      cover_image TEXT NULL,
      seo_image_url TEXT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_create',
      local_updated_at TEXT NOT NULL,
      remote_updated_at_snapshot TEXT NULL,
      last_synced_at TEXT NULL,
      deleted_at TEXT NULL,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_remote_id ON categories(remote_id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
    CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON categories(deleted_at);

    CREATE TABLE IF NOT EXISTS actives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NULL,
      sort_order INTEGER DEFAULT 0,
      colored_label INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_create',
      local_updated_at TEXT NOT NULL,
      remote_updated_at_snapshot TEXT NULL,
      last_synced_at TEXT NULL,
      deleted_at TEXT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_actives_remote_id ON actives(remote_id);
    CREATE INDEX IF NOT EXISTS idx_actives_slug ON actives(slug);
    CREATE INDEX IF NOT EXISTS idx_actives_deleted_at ON actives(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_actives_sort_order ON actives(sort_order);

    CREATE TABLE IF NOT EXISTS imgs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER NULL,
      category_id INTEGER NOT NULL,
      active_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      image_url_card TEXT NOT NULL DEFAULT '',
      local_file_path TEXT NULL,
      local_file_path_card TEXT NULL,
      remote_file_key TEXT NULL,
      remote_file_key_card TEXT NULL,
      previous_remote_file_key TEXT NULL,
      previous_remote_file_key_card TEXT NULL,
      file_sync_status TEXT NOT NULL DEFAULT 'pending_upload',
      file_hash TEXT NULL,
      title TEXT NULL,
      slug TEXT NULL UNIQUE,
      description TEXT NULL,
      difficulty INTEGER NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_create',
      local_updated_at TEXT NOT NULL,
      remote_updated_at_snapshot TEXT NULL,
      last_synced_at TEXT NULL,
      deleted_at TEXT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (active_id) REFERENCES actives(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_imgs_remote_id ON imgs(remote_id);
    CREATE INDEX IF NOT EXISTS idx_imgs_category_id ON imgs(category_id);
    CREATE INDEX IF NOT EXISTS idx_imgs_active_id ON imgs(active_id);
    CREATE INDEX IF NOT EXISTS idx_imgs_deleted_at ON imgs(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_imgs_file_sync_status ON imgs(file_sync_status);
    CREATE INDEX IF NOT EXISTS idx_imgs_slug ON imgs(slug);
    CREATE INDEX IF NOT EXISTS idx_imgs_category_active_sort ON imgs(category_id, active_id, is_active, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_imgs_active_sort ON imgs(active_id, is_active, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_imgs_category_active_difficulty_sort ON imgs(category_id, active_id, is_active, difficulty, sort_order, id);

    CREATE TABLE IF NOT EXISTS img_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      source_kind TEXT NOT NULL DEFAULT 'outline',
      image_url TEXT NOT NULL,
      local_file_path TEXT NOT NULL,
      generated_img_ids TEXT NULL,
      title TEXT NULL,
      description TEXT NULL,
      prompt_key TEXT NULL,
      prompt_group TEXT NULL,
      prompt_text_zh TEXT NULL,
      prompt_text_en TEXT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_img_sources_category_sort
      ON img_sources(category_id, is_active, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_img_sources_local_file_path
      ON img_sources(local_file_path);

    CREATE TABLE IF NOT EXISTS img_source_poses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      pose_key TEXT NOT NULL,
      pose_title TEXT NULL,
      pose_title_zh TEXT NULL,
      sort_order INTEGER DEFAULT 0,
      color_source_id INTEGER NULL,
      color_image_url TEXT NOT NULL DEFAULT '',
      color_local_file_path TEXT NOT NULL DEFAULT '',
      color_generated_img_ids TEXT NULL,
      outline_source_id INTEGER NULL,
      outline_image_url TEXT NOT NULL DEFAULT '',
      outline_local_file_path TEXT NOT NULL DEFAULT '',
      outline_generated_img_ids TEXT NULL,
      scene_color_source_id INTEGER NULL,
      scene_color_image_url TEXT NOT NULL DEFAULT '',
      scene_color_local_file_path TEXT NOT NULL DEFAULT '',
      scene_color_generated_img_ids TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_img_source_poses_category_pose_key
      ON img_source_poses(category_id, pose_key);
    CREATE INDEX IF NOT EXISTS idx_img_source_poses_category_sort
      ON img_source_poses(category_id, sort_order, id);

    CREATE TABLE IF NOT EXISTS product_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      subtitle TEXT NULL,
      target_label TEXT NOT NULL DEFAULT 'Kindergarten',
      audience_note TEXT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      cover_image_url TEXT NULL,
      pdf_file_path TEXT NULL,
      preview_file_path TEXT NULL,
      copy_json TEXT NULL,
      page_plan_json TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_packages_parent
      ON product_packages(parent_category_id, status, updated_at);

    CREATE TABLE IF NOT EXISTS product_package_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      pose_id INTEGER NOT NULL,
      day_index INTEGER NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      display_name TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (package_id) REFERENCES product_packages(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (pose_id) REFERENCES img_source_poses(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_package_items_package_category
      ON product_package_items(package_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_product_package_items_package_sort
      ON product_package_items(package_id, sort_order, id);

    CREATE TABLE IF NOT EXISTS special_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      subtitle TEXT NULL,
      description TEXT NULL,
      seo_title TEXT NULL,
      seo_description TEXT NULL,
      hero_image_url TEXT NULL,
      card_image_url TEXT NULL,
      theme_color TEXT NOT NULL DEFAULT '#7ADDE8',
      status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER NOT NULL DEFAULT 0,
      content_json TEXT NOT NULL DEFAULT '{"items":[]}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_create',
      local_updated_at TEXT NOT NULL,
      remote_updated_at_snapshot TEXT NULL,
      last_synced_at TEXT NULL,
      deleted_at TEXT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_special_pages_remote_id ON special_pages(remote_id);
    CREATE INDEX IF NOT EXISTS idx_special_pages_status_sort
      ON special_pages(status, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_special_pages_deleted_at ON special_pages(deleted_at);

    CREATE TABLE IF NOT EXISTS homepage_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      hero_image_url TEXT NOT NULL,
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      footer_paragraph TEXT NOT NULL DEFAULT '',
      category_printable_counts TEXT NOT NULL DEFAULT '{}',
      total_printable_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS puzzle_pages (
      slug TEXT PRIMARY KEY,
      family TEXT NOT NULL,
      variant TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TEXT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS puzzle_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_slug TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      asset_kind TEXT NOT NULL,
      image_url TEXT NOT NULL,
      local_file_path TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (page_slug) REFERENCES puzzle_pages(slug) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_puzzle_assets_page
      ON puzzle_assets(page_slug, difficulty, asset_kind, sort_order);

    CREATE TABLE IF NOT EXISTS puzzle_asset_delete_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_slug TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      image_url TEXT NOT NULL,
      local_file_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_puzzle_asset_delete_queue_page
      ON puzzle_asset_delete_queue(page_slug, difficulty, id);

    CREATE TABLE IF NOT EXISTS backlink_exchanges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      site_name TEXT NOT NULL,
      website_url TEXT NOT NULL,
      contact_name TEXT NULL,
      contact_email TEXT NULL,
      contact_url TEXT NULL,
      facebook_url TEXT NULL,
      status TEXT NOT NULL DEFAULT 'candidate',
      priority INTEGER NOT NULL DEFAULT 3,
      topical_fit TEXT NULL,
      pitch_angle TEXT NULL,
      target_url TEXT NULL,
      anchor_text TEXT NULL,
      offered_asset TEXT NULL,
      outreach_email TEXT NULL,
      last_contacted_at TEXT NULL,
      next_follow_up_at TEXT NULL,
      response_summary TEXT NULL,
      backlink_url TEXT NULL,
      image_urls TEXT NOT NULL DEFAULT '[]',
      copy_texts TEXT NOT NULL DEFAULT '[]',
      link_type TEXT NOT NULL DEFAULT 'nofollow',
      backlinks TEXT NOT NULL DEFAULT '[]',
      notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_backlink_exchanges_status_priority
      ON backlink_exchanges(status, priority, updated_at);

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      operation TEXT NOT NULL,
      payload_snapshot TEXT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS category_image_delete_queue (
      image_id TEXT PRIMARY KEY,
      object_key TEXT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_runtime_lock (
      name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      locked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pin_publish_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_upload',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pin_publish_cycle_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      day_index INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      pose_id INTEGER NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cycle_id, day_index),
      UNIQUE(cycle_id, category_id),
      FOREIGN KEY (cycle_id) REFERENCES pin_publish_cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (pose_id) REFERENCES img_source_poses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS pin_publish_schedule_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      day_index INTEGER NOT NULL,
      slot_index INTEGER NOT NULL,
      source_category_id INTEGER NOT NULL,
      source_pose_id INTEGER NULL,
      publish_time TEXT NOT NULL,
      image_url TEXT NULL,
      title TEXT NULL,
      description TEXT NULL,
      pin_url TEXT NULL,
      board TEXT NULL,
      section TEXT NULL,
      alt_text TEXT NULL,
      tags TEXT NULL,
      variant_key TEXT NULL,
      label TEXT NULL,
      uploaded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cycle_id, day_index, slot_index),
      FOREIGN KEY (cycle_id) REFERENCES pin_publish_cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (source_category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (source_pose_id) REFERENCES img_source_poses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS category_pin_publish_cycles (
      category_id INTEGER PRIMARY KEY,
      cycle_id INTEGER NOT NULL,
      pose_id INTEGER NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (cycle_id) REFERENCES pin_publish_cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (pose_id) REFERENCES img_source_poses(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pin_publish_schedule_items_cycle
      ON pin_publish_schedule_items(cycle_id, day_index, slot_index);

    CREATE TABLE IF NOT EXISTS pin_publish_category_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      pose_id INTEGER NULL,
      slot_index INTEGER NOT NULL,
      variant_key TEXT NOT NULL,
      label TEXT NOT NULL,
      image_url TEXT NOT NULL,
      title TEXT NULL,
      description TEXT NULL,
      link TEXT NULL,
      board TEXT NULL,
      section TEXT NULL,
      alt_text TEXT NULL,
      tags TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cycle_id, category_id, slot_index),
      FOREIGN KEY (cycle_id) REFERENCES pin_publish_cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (pose_id) REFERENCES img_source_poses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS video_publish_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_video_publish_cycles (
      category_id INTEGER PRIMARY KEY,
      cycle_id INTEGER NOT NULL,
      pose_id INTEGER NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (cycle_id) REFERENCES video_publish_cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (pose_id) REFERENCES img_source_poses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS generated_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      pose_id INTEGER NULL,
      day_index INTEGER NULL,
      slot_index INTEGER NULL,
      local_file_path TEXT NOT NULL,
      asset_color_path TEXT NOT NULL,
      asset_outline_path TEXT NOT NULL,
      asset_scene_color_path TEXT NOT NULL,
      template_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'generated',
      error_message TEXT NULL,
      uploaded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (cycle_id) REFERENCES video_publish_cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (pose_id) REFERENCES img_source_poses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_generated_videos_cycle
      ON generated_videos(cycle_id, category_id);
  `);

  repairCategoriesParentForeignKeyIfNeeded(database);
  recreateCategoriesTableWithoutSeoKeywords(database);
  database.exec("DROP TABLE IF EXISTS ai_img_generation_queue");

  const categoryColumns = database
    .prepare("PRAGMA table_info(categories)")
    .all() as Array<{ name: string }>;

  if (!categoryColumns.some((column) => column.name === "cover_image")) {
    database.exec("ALTER TABLE categories ADD COLUMN cover_image TEXT NULL");
  }

  if (!categoryColumns.some((column) => column.name === "seo_image_url")) {
    database.exec("ALTER TABLE categories ADD COLUMN seo_image_url TEXT NULL");
  }

  if (!categoryColumns.some((column) => column.name === "name_zh")) {
    database.exec("ALTER TABLE categories ADD COLUMN name_zh TEXT NULL");
  }

  if (!categoryColumns.some((column) => column.name === "pose_prompt_specs")) {
    database.exec("ALTER TABLE categories ADD COLUMN pose_prompt_specs TEXT NULL");
  }

  if (!categoryColumns.some((column) => column.name === "publish_to_pin")) {
    database.exec("ALTER TABLE categories ADD COLUMN publish_to_pin INTEGER NOT NULL DEFAULT 0");
  }

  const pinScheduleColumns = database
    .prepare("PRAGMA table_info(pin_publish_schedule_items)")
    .all() as Array<{ name: string }>;
  const migrationDb = database;
  const ensurePinScheduleColumn = (name: string) => {
    if (!pinScheduleColumns.some((column) => column.name === name)) {
      migrationDb.exec(`ALTER TABLE pin_publish_schedule_items ADD COLUMN ${name} TEXT NULL`);
    }
  };
  [
    "board",
    "section",
    "alt_text",
    "tags",
    "variant_key",
    "label",
  ].forEach(ensurePinScheduleColumn);
  if (!pinScheduleColumns.some((column) => column.name === "source_pose_id")) {
    database.exec("ALTER TABLE pin_publish_schedule_items ADD COLUMN source_pose_id INTEGER NULL");
  }

  const pinCycleCategoryColumns = database
    .prepare("PRAGMA table_info(pin_publish_cycle_categories)")
    .all() as Array<{ name: string }>;
  if (!pinCycleCategoryColumns.some((column) => column.name === "pose_id")) {
    database.exec("ALTER TABLE pin_publish_cycle_categories ADD COLUMN pose_id INTEGER NULL");
  }

  const categoryPinCycleColumns = database
    .prepare("PRAGMA table_info(category_pin_publish_cycles)")
    .all() as Array<{ name: string }>;
  if (!categoryPinCycleColumns.some((column) => column.name === "pose_id")) {
    database.exec("ALTER TABLE category_pin_publish_cycles ADD COLUMN pose_id INTEGER NULL");
  }

  const pinCategoryItemColumns = database
    .prepare("PRAGMA table_info(pin_publish_category_items)")
    .all() as Array<{ name: string }>;
  if (!pinCategoryItemColumns.some((column) => column.name === "pose_id")) {
    database.exec("ALTER TABLE pin_publish_category_items ADD COLUMN pose_id INTEGER NULL");
  }

  const categoryVideoCycleColumns = database
    .prepare("PRAGMA table_info(category_video_publish_cycles)")
    .all() as Array<{ name: string }>;
  if (!categoryVideoCycleColumns.some((column) => column.name === "pose_id")) {
    database.exec("ALTER TABLE category_video_publish_cycles ADD COLUMN pose_id INTEGER NULL");
  }

  const generatedVideoColumns = database
    .prepare("PRAGMA table_info(generated_videos)")
    .all() as Array<{ name: string }>;
  if (!generatedVideoColumns.some((column) => column.name === "day_index")) {
    database.exec("ALTER TABLE generated_videos ADD COLUMN day_index INTEGER NULL");
  }
  if (!generatedVideoColumns.some((column) => column.name === "slot_index")) {
    database.exec("ALTER TABLE generated_videos ADD COLUMN slot_index INTEGER NULL");
  }
  if (!generatedVideoColumns.some((column) => column.name === "uploaded")) {
    database.exec("ALTER TABLE generated_videos ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0");
  }

  const activeColumns = database
    .prepare("PRAGMA table_info(actives)")
    .all() as Array<{ name: string }>;

  if (!activeColumns.some((column) => column.name === "colored_label")) {
    database.exec("ALTER TABLE actives ADD COLUMN colored_label INTEGER NOT NULL DEFAULT 0");
  }

  const imgColumns = database
    .prepare("PRAGMA table_info(imgs)")
    .all() as Array<{ name: string }>;

  if (!imgColumns.some((column) => column.name === "image_url_card")) {
    database.exec("ALTER TABLE imgs ADD COLUMN image_url_card TEXT NULL");
    database.exec("UPDATE imgs SET image_url_card = image_url WHERE image_url_card IS NULL");
  }

  if (!imgColumns.some((column) => column.name === "local_file_path_card")) {
    database.exec("ALTER TABLE imgs ADD COLUMN local_file_path_card TEXT NULL");
  }

  if (!imgColumns.some((column) => column.name === "answer_image_url")) {
    database.exec("ALTER TABLE imgs ADD COLUMN answer_image_url TEXT NULL");
  }

  if (!imgColumns.some((column) => column.name === "answer_local_file_path")) {
    database.exec("ALTER TABLE imgs ADD COLUMN answer_local_file_path TEXT NULL");
  }

  if (!imgColumns.some((column) => column.name === "difficulty")) {
    database.exec("ALTER TABLE imgs ADD COLUMN difficulty INTEGER NULL");
  }

  if (!imgColumns.some((column) => column.name === "remote_file_key_card")) {
    database.exec("ALTER TABLE imgs ADD COLUMN remote_file_key_card TEXT NULL");
  }

  if (!imgColumns.some((column) => column.name === "previous_remote_file_key_card")) {
    database.exec("ALTER TABLE imgs ADD COLUMN previous_remote_file_key_card TEXT NULL");
  }

  const imgSourceColumns = database
    .prepare("PRAGMA table_info(img_sources)")
    .all() as Array<{ name: string }>;

  if (!imgSourceColumns.some((column) => column.name === "source_kind")) {
    database.exec("ALTER TABLE img_sources ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'outline'");
    database.exec(`
      UPDATE img_sources
      SET source_kind = CASE
        WHEN lower(COALESCE(title, '')) LIKE '%color%'
          OR COALESCE(title, '') LIKE '%彩图%'
          OR COALESCE(title, '') LIKE '%彩色%'
        THEN 'color'
        ELSE 'outline'
      END
    `);
  }

  if (!imgSourceColumns.some((column) => column.name === "generated_img_ids")) {
    database.exec("ALTER TABLE img_sources ADD COLUMN generated_img_ids TEXT NULL");
  }

  if (!imgSourceColumns.some((column) => column.name === "prompt_key")) {
    database.exec("ALTER TABLE img_sources ADD COLUMN prompt_key TEXT NULL");
  }

  if (!imgSourceColumns.some((column) => column.name === "prompt_group")) {
    database.exec("ALTER TABLE img_sources ADD COLUMN prompt_group TEXT NULL");
  }

  if (!imgSourceColumns.some((column) => column.name === "prompt_text_zh")) {
    database.exec("ALTER TABLE img_sources ADD COLUMN prompt_text_zh TEXT NULL");
  }

  if (!imgSourceColumns.some((column) => column.name === "prompt_text_en")) {
    database.exec("ALTER TABLE img_sources ADD COLUMN prompt_text_en TEXT NULL");
  }

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_img_sources_category_prompt_key
      ON img_sources(category_id, prompt_key)
  `);

  const poseSourceColumns = database
    .prepare("PRAGMA table_info(img_source_poses)")
    .all() as Array<{ name: string }>;

  if (!poseSourceColumns.some((column) => column.name === "pose_title")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN pose_title TEXT NULL");
  }

  if (!poseSourceColumns.some((column) => column.name === "pose_title_zh")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN pose_title_zh TEXT NULL");
  }

  if (!poseSourceColumns.some((column) => column.name === "sort_order")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN sort_order INTEGER DEFAULT 0");
  }

  if (!poseSourceColumns.some((column) => column.name === "color_source_id")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN color_source_id INTEGER NULL");
  }

  if (!poseSourceColumns.some((column) => column.name === "color_image_url")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN color_image_url TEXT NOT NULL DEFAULT ''");
  }

  if (!poseSourceColumns.some((column) => column.name === "color_local_file_path")) {
    database.exec(
      "ALTER TABLE img_source_poses ADD COLUMN color_local_file_path TEXT NOT NULL DEFAULT ''",
    );
  }

  if (!poseSourceColumns.some((column) => column.name === "color_generated_img_ids")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN color_generated_img_ids TEXT NULL");
  }

  if (!poseSourceColumns.some((column) => column.name === "outline_source_id")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN outline_source_id INTEGER NULL");
  }

  if (!poseSourceColumns.some((column) => column.name === "outline_image_url")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN outline_image_url TEXT NOT NULL DEFAULT ''");
  }

  if (!poseSourceColumns.some((column) => column.name === "outline_local_file_path")) {
    database.exec(
      "ALTER TABLE img_source_poses ADD COLUMN outline_local_file_path TEXT NOT NULL DEFAULT ''",
    );
  }

  if (!poseSourceColumns.some((column) => column.name === "outline_generated_img_ids")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN outline_generated_img_ids TEXT NULL");
  }

  if (!poseSourceColumns.some((column) => column.name === "scene_color_source_id")) {
    database.exec("ALTER TABLE img_source_poses ADD COLUMN scene_color_source_id INTEGER NULL");
  }

  if (!poseSourceColumns.some((column) => column.name === "scene_color_image_url")) {
    database.exec(
      "ALTER TABLE img_source_poses ADD COLUMN scene_color_image_url TEXT NOT NULL DEFAULT ''",
    );
  }

  if (!poseSourceColumns.some((column) => column.name === "scene_color_local_file_path")) {
    database.exec(
      "ALTER TABLE img_source_poses ADD COLUMN scene_color_local_file_path TEXT NOT NULL DEFAULT ''",
    );
  }

  if (!poseSourceColumns.some((column) => column.name === "scene_color_generated_img_ids")) {
    database.exec(
      "ALTER TABLE img_source_poses ADD COLUMN scene_color_generated_img_ids TEXT NULL",
    );
  }

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_img_source_poses_category_pose_key
      ON img_source_poses(category_id, pose_key)
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_img_source_poses_category_sort
      ON img_source_poses(category_id, sort_order, id)
  `);

  migrateGeneratedVideosTableForPose(database);
  const generatedVideoColumnsAfterPoseMigration = database
    .prepare("PRAGMA table_info(generated_videos)")
    .all() as Array<{ name: string }>;
  if (!generatedVideoColumnsAfterPoseMigration.some((column) => column.name === "day_index")) {
    database.exec("ALTER TABLE generated_videos ADD COLUMN day_index INTEGER NULL");
  }
  if (!generatedVideoColumnsAfterPoseMigration.some((column) => column.name === "slot_index")) {
    database.exec("ALTER TABLE generated_videos ADD COLUMN slot_index INTEGER NULL");
  }
  if (!generatedVideoColumnsAfterPoseMigration.some((column) => column.name === "uploaded")) {
    database.exec("ALTER TABLE generated_videos ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0");
  }

  recreateImgsTableWithoutTags(database);
  backfillImgSourceGeneratedImgIds(database);
  database.exec("DELETE FROM sync_outbox WHERE entity_type = 'tag'");
  database.exec("DROP TABLE IF EXISTS active_tags");
  database.exec("DROP TABLE IF EXISTS tags");
  database.exec("DROP INDEX IF EXISTS idx_active_categories_category_id");
  database.exec("DROP TABLE IF EXISTS active_categories");

  // 废弃的「维度 / 维度图」表与同步类型，启动时清掉，避免残留结构。
  database.exec("DELETE FROM sync_outbox WHERE entity_type IN ('function', 'dimension', 'image', 'image_file')");
  database.exec("DROP TABLE IF EXISTS functions");
  database.exec("DROP TABLE IF EXISTS images");
  database.exec("DROP TABLE IF EXISTS dimensions");

  const categoryImageDeleteQueueColumns = database
    .prepare("PRAGMA table_info(category_image_delete_queue)")
    .all() as Array<{ name: string }>;

  if (!categoryImageDeleteQueueColumns.some((column) => column.name === "object_key")) {
    database.exec("ALTER TABLE category_image_delete_queue ADD COLUMN object_key TEXT NULL");
  }

  const homepageConfigColumns = database
    .prepare("PRAGMA table_info(homepage_config)")
    .all() as Array<{ name: string }>;

  if (!homepageConfigColumns.some((column) => column.name === "seo_title")) {
    database.exec("ALTER TABLE homepage_config ADD COLUMN seo_title TEXT NOT NULL DEFAULT ''");
  }

  if (!homepageConfigColumns.some((column) => column.name === "seo_description")) {
    database.exec("ALTER TABLE homepage_config ADD COLUMN seo_description TEXT NOT NULL DEFAULT ''");
  }

  if (!homepageConfigColumns.some((column) => column.name === "footer_paragraph")) {
    database.exec("ALTER TABLE homepage_config ADD COLUMN footer_paragraph TEXT NOT NULL DEFAULT ''");
  }

  if (!homepageConfigColumns.some((column) => column.name === "category_printable_counts")) {
    database.exec("ALTER TABLE homepage_config ADD COLUMN category_printable_counts TEXT NOT NULL DEFAULT '{}'");
  }

  if (!homepageConfigColumns.some((column) => column.name === "total_printable_count")) {
    database.exec("ALTER TABLE homepage_config ADD COLUMN total_printable_count INTEGER NOT NULL DEFAULT 0");
  }

  const specialPageColumns = database
    .prepare("PRAGMA table_info(special_pages)")
    .all() as Array<{ name: string }>;

  if (!specialPageColumns.some((column) => column.name === "card_image_url")) {
    database.exec("ALTER TABLE special_pages ADD COLUMN card_image_url TEXT NULL");
  }

  if (!specialPageColumns.some((column) => column.name === "theme_color")) {
    database.exec("ALTER TABLE special_pages ADD COLUMN theme_color TEXT NOT NULL DEFAULT '#7ADDE8'");
  }

  const backlinkExchangeColumns = database
    .prepare("PRAGMA table_info(backlink_exchanges)")
    .all() as Array<{ name: string }>;

  if (!backlinkExchangeColumns.some((column) => column.name === "outreach_email")) {
    database.exec("ALTER TABLE backlink_exchanges ADD COLUMN outreach_email TEXT NULL");
  }

  if (!backlinkExchangeColumns.some((column) => column.name === "facebook_url")) {
    database.exec("ALTER TABLE backlink_exchanges ADD COLUMN facebook_url TEXT NULL");
  }

  if (!backlinkExchangeColumns.some((column) => column.name === "image_urls")) {
    database.exec("ALTER TABLE backlink_exchanges ADD COLUMN image_urls TEXT NOT NULL DEFAULT '[]'");
  }

  if (!backlinkExchangeColumns.some((column) => column.name === "copy_texts")) {
    database.exec("ALTER TABLE backlink_exchanges ADD COLUMN copy_texts TEXT NOT NULL DEFAULT '[]'");
  }

  if (!backlinkExchangeColumns.some((column) => column.name === "link_type")) {
    database.exec("ALTER TABLE backlink_exchanges ADD COLUMN link_type TEXT NOT NULL DEFAULT 'nofollow'");
  }

  if (!backlinkExchangeColumns.some((column) => column.name === "backlinks")) {
    database.exec("ALTER TABLE backlink_exchanges ADD COLUMN backlinks TEXT NOT NULL DEFAULT '[]'");
  }

  const homepageConfigCount = database
    .prepare("SELECT COUNT(*) AS count FROM homepage_config")
    .get() as { count: number };

  if (!homepageConfigCount.count) {
    database
      .prepare(
        `INSERT INTO homepage_config
          (title, description, hero_image_url, seo_title, seo_description, footer_paragraph, category_printable_counts, total_printable_count, created_at, updated_at)
         VALUES ('', '', '', '', '', '', '{}', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run();
  }

  // 外链管理从空列表开始，不再自动写入旧版示例网站。
  void seedBacklinkExchanges;

  const poseCategoryIds = database
    .prepare("SELECT DISTINCT category_id FROM img_sources ORDER BY category_id ASC")
    .all() as Array<{ category_id: number }>;

  poseCategoryIds.forEach((row) => {
    syncPoseSourceRowsForCategory(Number(row.category_id));
  });

  return database;
}

function buildUniqueSlug(
  table: "categories" | "actives" | "imgs",
  rawValue: string,
  excludeId?: number,
) {
  const db = getDb();
  const baseSlug = normalizeSlug(rawValue);
  let nextSlug = baseSlug;
  let counter = 1;
  const slugMustBeGloballyUnique = table === "actives" || table === "imgs";

  while (true) {
    const existing = db
      .prepare(
        `SELECT id
         FROM ${table}
         WHERE slug = ?
           ${slugMustBeGloballyUnique ? "" : "AND deleted_at IS NULL"}
           ${excludeId ? "AND id != ?" : ""}
         LIMIT 1`,
      )
      .get(...(excludeId ? [nextSlug, excludeId] : [nextSlug])) as { id: number } | undefined;

    if (!existing) {
      return nextSlug;
    }

    counter += 1;
    nextSlug = `${baseSlug}-${counter}`;
  }
}

function queueOutbox(db: Database.Database, item: {
  entityType: SyncEntityType;
  entityId: number;
  operation: OutboxOperation;
  payload: Record<string, unknown>;
}) {
  const timestamp = now();

  if (item.operation === "delete") {
    db.prepare(
      "DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'failed', 'syncing')",
    ).run(item.entityType, item.entityId);
  } else if (item.operation === "update") {
    const createPending = db
      .prepare(
        "SELECT id FROM sync_outbox WHERE entity_type = ? AND entity_id = ? AND operation = 'create' AND status IN ('pending', 'failed', 'syncing') LIMIT 1",
      )
      .get(item.entityType, item.entityId);

    if (createPending) {
      return;
    }

    db.prepare(
      "DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ? AND operation = 'update' AND status IN ('pending', 'failed', 'syncing')",
    ).run(item.entityType, item.entityId);
  } else {
    db.prepare(
      "DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ? AND operation = ? AND status IN ('pending', 'failed', 'syncing')",
    ).run(item.entityType, item.entityId, item.operation);
  }

  db.prepare(
    `INSERT INTO sync_outbox
      (entity_type, entity_id, operation, payload_snapshot, status, retry_count, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, NULL, ?, ?)`,
  ).run(item.entityType, item.entityId, item.operation, JSON.stringify(item.payload), timestamp, timestamp);
}

export async function enqueueSyncOutboxItem(
  entityType: "category" | "active" | "img" | "special_page",
  entityId: number,
  operation: "create" | "update" | "delete",
) {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id
       FROM sync_outbox
       WHERE entity_type = ?
         AND entity_id = ?
         AND operation = ?
         AND status IN ('pending', 'failed', 'syncing')
       LIMIT 1`,
    )
    .get(entityType, entityId, operation);

  if (existing) {
    return false;
  }

  queueOutbox(db, {
    entityType,
    entityId,
    operation,
    payload: { id: entityId },
  });
  return true;
}

async function ensureSyncQueueFromLocalChanges() {
  const db = getDb();

  cleanupOrphanedOutboxRows(db);

  // 如果当前没有活跃的同步锁，把卡在 syncing 状态的记录重置为 pending
  const hasLock = db
    .prepare("SELECT 1 FROM sync_runtime_lock WHERE name = ? LIMIT 1")
    .get(SYNC_LOCK_NAME);
  if (!hasLock) {
    db.prepare(
      "UPDATE sync_outbox SET status = 'pending', updated_at = ? WHERE status = 'syncing'",
    ).run(now());
  }

  const hasActiveOutbox = (
    entityType: SyncEntityType,
    entityId: number,
    operation?: OutboxOperation,
  ) => {
    const row = db
      .prepare(
        `SELECT id
         FROM sync_outbox
         WHERE entity_type = ?
           AND entity_id = ?
           ${operation ? "AND operation = ?" : ""}
           AND status IN ('pending', 'failed', 'syncing')
         LIMIT 1`,
      )
      .get(...(operation ? [entityType, entityId, operation] : [entityType, entityId]));

    return Boolean(row);
  };

  db.transaction(() => {
    const categories = db
      .prepare(
        "SELECT id, sync_status, deleted_at FROM categories WHERE deleted_at IS NOT NULL OR sync_status != 'synced'",
      )
      .all() as Array<{ id: number; sync_status: SyncStatus; deleted_at: string | null }>;

    categories.forEach((row) => {
      const operation = row.deleted_at ? "delete" : row.sync_status === "pending_create" ? "create" : "update";

      if (hasActiveOutbox("category", row.id, operation)) {
        return;
      }

      queueOutbox(db, {
        entityType: "category",
        entityId: row.id,
        operation,
        payload: { id: row.id },
      });
    });

    const actives = db
      .prepare(
        "SELECT id, sync_status, deleted_at FROM actives WHERE deleted_at IS NOT NULL OR sync_status != 'synced'",
      )
      .all() as Array<{ id: number; sync_status: SyncStatus; deleted_at: string | null }>;

    actives.forEach((row) => {
      const operation = row.deleted_at ? "delete" : row.sync_status === "pending_create" ? "create" : "update";

      if (hasActiveOutbox("active", row.id, operation)) {
        return;
      }

      queueOutbox(db, {
        entityType: "active",
        entityId: row.id,
        operation,
        payload: { id: row.id },
      });
    });

    const imgs = db
      .prepare(
        "SELECT id, remote_id, sync_status, deleted_at, file_sync_status FROM imgs WHERE deleted_at IS NOT NULL OR sync_status != 'synced' OR file_sync_status != 'synced'",
      )
      .all() as Array<{
      id: number;
      remote_id: number | null;
      sync_status: SyncStatus;
      deleted_at: string | null;
      file_sync_status: FileSyncStatus;
    }>;

    imgs.forEach((row) => {
      if (row.deleted_at && !row.remote_id) {
        return;
      }

      const recordOperation = row.deleted_at ? "delete" : row.sync_status === "pending_create" ? "create" : "update";

      if (row.file_sync_status === "draft" && !row.deleted_at) {
        return;
      }

      if (
        !row.deleted_at &&
        row.file_sync_status === "pending_upload" &&
        !hasActiveOutbox("img_file", row.id, "upload")
      ) {
        queueOutbox(db, {
          entityType: "img_file",
          entityId: row.id,
          operation: "upload",
          payload: { id: row.id },
        });
      }

      if (hasActiveOutbox("img", row.id, recordOperation)) {
        return;
      }

      queueOutbox(db, {
        entityType: "img",
        entityId: row.id,
        operation: recordOperation,
        payload: { id: row.id },
      });
    });

    const specialPages = db
      .prepare(
        "SELECT id, sync_status, deleted_at FROM special_pages WHERE deleted_at IS NOT NULL OR sync_status != 'synced'",
      )
      .all() as Array<{ id: number; sync_status: SyncStatus; deleted_at: string | null }>;

    specialPages.forEach((row) => {
      const operation = row.deleted_at ? "delete" : row.sync_status === "pending_create" ? "create" : "update";

      if (hasActiveOutbox("special_page", row.id, operation)) {
        return;
      }

      queueOutbox(db, {
        entityType: "special_page",
        entityId: row.id,
        operation,
        payload: { id: row.id },
      });
    });
  })();
}

function cleanupOrphanedOutboxRows(db: Database.Database) {
  let removedCount = 0;

  removedCount += db
    .prepare(
      `DELETE FROM sync_outbox
       WHERE entity_type = 'category'
         AND NOT EXISTS (
           SELECT 1 FROM categories WHERE categories.id = sync_outbox.entity_id
         )`,
    )
    .run().changes;

  removedCount += db
    .prepare(
      `DELETE FROM sync_outbox
       WHERE entity_type = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM actives WHERE actives.id = sync_outbox.entity_id
         )`,
    )
    .run().changes;

  removedCount += db
    .prepare(
      `DELETE FROM sync_outbox
       WHERE entity_type IN ('img', 'img_file')
         AND NOT EXISTS (
           SELECT 1 FROM imgs WHERE imgs.id = sync_outbox.entity_id
         )`,
    )
    .run().changes;

  removedCount += db
    .prepare(
      `DELETE FROM sync_outbox
       WHERE entity_type = 'special_page'
         AND NOT EXISTS (
           SELECT 1 FROM special_pages WHERE special_pages.id = sync_outbox.entity_id
         )`,
    )
    .run().changes;

  return removedCount;
}

export async function ensureLocalSyncIntegrity(): Promise<LocalSyncIntegritySnapshot> {
  const db = getDb();

  const removedOrphanOutboxCount = db.transaction(() =>
    cleanupOrphanedOutboxRows(db),
  )();

  const orphanCategories = db
    .prepare(
      `SELECT c.id, c.parent_id, c.remote_id, c.sync_status, c.deleted_at
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE c.parent_id IS NOT NULL
         AND p.id IS NULL
       ORDER BY c.id ASC`,
    )
    .all() as LocalSyncIntegritySnapshot["orphan_categories"];

  const orphanImgs = db
    .prepare(
      `SELECT i.id, i.category_id, i.active_id, i.remote_id, i.sync_status, i.deleted_at
       FROM imgs i
       LEFT JOIN categories c ON c.id = i.category_id
       LEFT JOIN actives a ON a.id = i.active_id
       WHERE c.id IS NULL OR a.id IS NULL
       ORDER BY i.id ASC`,
    )
    .all() as LocalSyncIntegritySnapshot["orphan_imgs"];

  const orphanImgSources = db
    .prepare(
      `SELECT s.id, s.category_id
       FROM img_sources s
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE c.id IS NULL
       ORDER BY s.id ASC`,
    )
    .all() as LocalSyncIntegritySnapshot["orphan_img_sources"];

  return {
    removed_orphan_outbox_count: removedOrphanOutboxCount,
    orphan_categories: orphanCategories,
    orphan_imgs: orphanImgs,
    orphan_img_sources: orphanImgSources,
  };
}

function assertCategoryConstraints(input: CategoryInput, currentId?: number) {
  const db = getDb();

  if (input.parent_id === null) {
    return;
  }

  let level = 1;
  let cursorId: number | null = input.parent_id;

  while (cursorId !== null) {
    if (currentId && cursorId === currentId) {
      throw new Error("分类不能将自己或自己的子级设为上级。");
    }

    const parent = db
      .prepare(
        "SELECT id, parent_id FROM categories WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      )
      .get(cursorId) as { id: number; parent_id: number | null } | undefined;

    if (!parent) {
      throw new Error("上级分类不存在。");
    }

    level += 1;
    if (level > 3) {
      throw new Error("当前最多只支持三级分类。");
    }

    cursorId = parent.parent_id;
  }
}

function assertImgSourceReferences(input: ImgSourceInput) {
  const category = getDb()
    .prepare("SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .get(input.category_id) as { id: number } | undefined;

  if (!category) {
    throw new Error("分类不存在。");
  }

  const imageUrl = input.image_url?.trim() || "";
  const localFilePath = input.local_file_path?.trim() || "";
  const hasFile = Boolean(imageUrl && localFilePath);
  const hasPrompt = Boolean(
    input.prompt_key?.trim() &&
      input.prompt_group?.trim() &&
      input.prompt_text_zh?.trim() &&
      input.prompt_text_en?.trim(),
  );

  if ((imageUrl && !localFilePath) || (!imageUrl && localFilePath)) {
    throw new Error("原始图地址和本地文件路径必须同时提供。");
  }
}

function assertImgReferences(input: ImgInput, currentId?: number) {
  const db = getDb();
  const category = db
    .prepare("SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .get(input.category_id) as { id: number } | undefined;

  if (!category) {
    throw new Error("分类不存在。");
  }

  const active = db
    .prepare("SELECT id FROM actives WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .get(input.active_id) as { id: number } | undefined;

  if (!active) {
    throw new Error("功能不存在。");
  }

  if (!input.image_url.trim()) {
    throw new Error("图片地址不能为空。");
  }

  if (!input.image_url_card.trim()) {
    throw new Error("卡片图地址不能为空。");
  }

  if (currentId && input.slug?.trim()) {
    const slugRow = db
      .prepare(
        `SELECT id
         FROM imgs
         WHERE slug = ?
           AND deleted_at IS NULL
           AND id != ?
         LIMIT 1`,
      )
      .get(input.slug.trim(), currentId) as { id: number } | undefined;

    if (slugRow) {
      throw new Error("图片 Slug 已存在。");
    }
  }
}

function normalizeImgDifficulty(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  const numeric = Number(value);
  if (numeric === 1 || numeric === 2 || numeric === 3) {
    return numeric;
  }

  throw new Error("难度只能是 Easy、Medium、Hard 或留空。");
}

function getCategoryRowById(id: number, includeDeleted = false) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        categories.*,
        category_pin_publish_cycles.cycle_id AS pin_publish_cycle_id,
        category_video_publish_cycles.cycle_id AS video_publish_cycle_id
       FROM categories
       LEFT JOIN category_pin_publish_cycles
        ON category_pin_publish_cycles.category_id = categories.id
       LEFT JOIN category_video_publish_cycles
        ON category_video_publish_cycles.category_id = categories.id
       WHERE categories.id = ? ${includeDeleted ? "" : "AND categories.deleted_at IS NULL"}
       LIMIT 1`,
    )
    .get(id) as CategoryRow | undefined;

  return row ?? null;
}

function getActiveRowById(id: number, includeDeleted = false) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM actives WHERE id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"} LIMIT 1`,
    )
    .get(id) as ActiveRow | undefined;

  return row ?? null;
}

function getImgRowById(id: number, includeDeleted = false) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        imgs.*,
        categories.name AS category_name,
        actives.name AS active_name
       FROM imgs
       INNER JOIN categories ON categories.id = imgs.category_id
       INNER JOIN actives ON actives.id = imgs.active_id
       WHERE imgs.id = ? ${includeDeleted ? "" : "AND imgs.deleted_at IS NULL"}
       LIMIT 1`,
    )
    .get(id) as ImgRow | undefined;

  return row ?? null;
}

function getImgSourceRowById(id: number) {
  const row = getDb()
    .prepare(
      `SELECT
        img_sources.*,
        categories.name AS category_name,
        categories.slug AS category_slug
       FROM img_sources
       INNER JOIN categories ON categories.id = img_sources.category_id
       WHERE img_sources.id = ?
       LIMIT 1`,
    )
    .get(id) as ImgSourceRow | undefined;

  return row ?? null;
}

function listImgSourceRowsByCategoryId(categoryId: number) {
  return getDb()
    .prepare(
      `SELECT
        img_sources.*,
        categories.name AS category_name,
        categories.slug AS category_slug
       FROM img_sources
       INNER JOIN categories ON categories.id = img_sources.category_id
       WHERE img_sources.category_id = ?
       ORDER BY img_sources.id ASC`,
    )
    .all(categoryId) as ImgSourceRow[];
}

function getPoseSourceRowById(id: number) {
  return getDb()
    .prepare(
      `SELECT
        img_source_poses.*,
        categories.name AS category_name,
        categories.slug AS category_slug,
        category_pin_publish_cycles.cycle_id AS pin_publish_cycle_id,
        category_video_publish_cycles.cycle_id AS video_publish_cycle_id
       FROM img_source_poses
       INNER JOIN categories ON categories.id = img_source_poses.category_id
       LEFT JOIN category_pin_publish_cycles
        ON category_pin_publish_cycles.category_id = img_source_poses.category_id
        AND category_pin_publish_cycles.pose_id = img_source_poses.id
       LEFT JOIN category_video_publish_cycles
        ON category_video_publish_cycles.category_id = img_source_poses.category_id
        AND category_video_publish_cycles.pose_id = img_source_poses.id
       WHERE img_source_poses.id = ?
       LIMIT 1`,
    )
    .get(id) as PoseSourceRow | undefined;
}

function listPoseSourceRowsByCategoryId(categoryId: number) {
  return getDb()
    .prepare(
      `SELECT
        img_source_poses.*,
        categories.name AS category_name,
        categories.slug AS category_slug,
        category_pin_publish_cycles.cycle_id AS pin_publish_cycle_id,
        category_video_publish_cycles.cycle_id AS video_publish_cycle_id
       FROM img_source_poses
       INNER JOIN categories ON categories.id = img_source_poses.category_id
       LEFT JOIN category_pin_publish_cycles
        ON category_pin_publish_cycles.category_id = img_source_poses.category_id
        AND category_pin_publish_cycles.pose_id = img_source_poses.id
       LEFT JOIN category_video_publish_cycles
        ON category_video_publish_cycles.category_id = img_source_poses.category_id
        AND category_video_publish_cycles.pose_id = img_source_poses.id
       WHERE img_source_poses.category_id = ?
       ORDER BY img_source_poses.sort_order ASC, img_source_poses.id ASC`,
    )
    .all(categoryId) as PoseSourceRow[];
}

function getSourceRowGeneratedImgIds(row: ImgSourceRow | null) {
  if (!row) {
    return [];
  }

  return parseGeneratedImgIds((row as Record<string, unknown>).generated_img_ids);
}

function createEmptyPoseGroup(poseKey: string, sourceRow?: ImgSourceRow | null): PoseSourceGroup {
  const timestamp = sourceRow?.created_at || now();
  return {
    pose_key: poseKey,
    pose_title: null,
    pose_title_zh: null,
    sort_order: sourceRow?.sort_order ?? 0,
    created_at: timestamp,
    updated_at: sourceRow?.updated_at || timestamp,
    color: null,
    outline: null,
    scene_color: null,
  };
}

function applyPoseTitlesFromSource(group: PoseSourceGroup, row: ImgSourceRow) {
  const nextTitle = extractPoseTitleEnFromPromptTexts(row.prompt_group, row.prompt_text_en);
  const nextTitleZh = extractPoseTitleZhFromPromptTexts(row.prompt_text_zh, row.prompt_text_en);

  if (!group.pose_title && nextTitle) {
    group.pose_title = nextTitle;
  }

  if (!group.pose_title_zh && nextTitleZh) {
    group.pose_title_zh = nextTitleZh;
  }

  group.sort_order = Math.min(group.sort_order, row.sort_order);
  group.created_at =
    group.created_at.localeCompare(row.created_at) <= 0 ? group.created_at : row.created_at;
  group.updated_at =
    group.updated_at.localeCompare(row.updated_at) >= 0 ? group.updated_at : row.updated_at;
}

function buildNextPoseKey(usedKeys: Set<string>) {
  let nextIndex = 1;
  while (usedKeys.has(`pose-${nextIndex}`)) {
    nextIndex += 1;
  }
  const nextKey = `pose-${nextIndex}`;
  usedKeys.add(nextKey);
  return nextKey;
}

function buildPoseGroupsFromSourceRows(rows: ImgSourceRow[]) {
  const sortedRows = rows
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
  const groupsByKey = new Map<string, PoseSourceGroup>();
  const usedKeys = new Set(
    sortedRows
      .map((row) => getPoseSourceBaseKey(row.prompt_key))
      .filter((value) => Boolean(value)),
  );
  let openManualGroup: PoseSourceGroup | null = null;

  const assignRowToGroup = (group: PoseSourceGroup, row: ImgSourceRow) => {
    if (row.source_kind === "scene_color") {
      group.scene_color = row;
    } else if (row.source_kind === "color") {
      group.color = row;
    } else {
      group.outline = row;
    }
    applyPoseTitlesFromSource(group, row);
  };

  sortedRows.forEach((row) => {
    const baseKey = getPoseSourceBaseKey(row.prompt_key);
    if (baseKey) {
      let targetKey = baseKey;
      let group = groupsByKey.get(targetKey);

      while (group && group[row.source_kind]) {
        let suffix = 2;
        let nextKey = `${baseKey}-${suffix}`;
        while (groupsByKey.has(nextKey)) {
          suffix += 1;
          nextKey = `${baseKey}-${suffix}`;
        }
        targetKey = nextKey;
        usedKeys.add(targetKey);
        group = groupsByKey.get(targetKey);
      }

      if (!group) {
        group = createEmptyPoseGroup(targetKey, row);
        groupsByKey.set(targetKey, group);
      }

      assignRowToGroup(group, row);
      return;
    }

    if (!openManualGroup || openManualGroup[row.source_kind]) {
      const manualKey = buildNextPoseKey(usedKeys);
      openManualGroup = createEmptyPoseGroup(manualKey, row);
      groupsByKey.set(manualKey, openManualGroup);
    }

    assignRowToGroup(openManualGroup, row);
  });

  return Array.from(groupsByKey.values())
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.pose_key.localeCompare(right.pose_key),
    )
    .map((group, index) => ({
      ...group,
      pose_title: group.pose_title?.trim() || `Pose ${index + 1}`,
      pose_title_zh: group.pose_title_zh?.trim() || `姿态${index + 1}`,
    }));
}

function deletePoseSourceRowsByCategory(categoryId: number) {
  getDb().prepare("DELETE FROM img_source_poses WHERE category_id = ?").run(categoryId);
  invalidateDevCache(`pose-sources:list:${categoryId}`);
}

function upsertPoseSourceRowGeneratedIds(sourceId: number, imgIds: number[]) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, category_id, color_source_id, outline_source_id, scene_color_source_id
       FROM img_source_poses
       WHERE color_source_id = ? OR outline_source_id = ? OR scene_color_source_id = ?
       LIMIT 1`,
    )
    .get(sourceId, sourceId, sourceId) as
    | {
        id: number;
        category_id: number;
        color_source_id: number | null;
        outline_source_id: number | null;
        scene_color_source_id: number | null;
      }
    | undefined;

  if (!row) {
    return;
  }

  const fieldName =
    row.color_source_id === sourceId
      ? "color_generated_img_ids"
      : row.outline_source_id === sourceId
        ? "outline_generated_img_ids"
        : "scene_color_generated_img_ids";

  db.prepare(`UPDATE img_source_poses SET ${fieldName} = ?, updated_at = ? WHERE id = ?`).run(
    stringifyGeneratedImgIds(imgIds),
    now(),
    row.id,
  );

  invalidateDevCache(`pose-sources:list:${row.category_id}`);
}

function syncPoseSourceRowsForCategory(categoryId: number) {
  const db = getDb();
  const sourceRows = listImgSourceRowsByCategoryId(categoryId);

  if (sourceRows.length === 0) {
    deletePoseSourceRowsByCategory(categoryId);
    invalidateDevCache(`pose-sources:list:${categoryId}`);
    return [];
  }

  const groups = buildPoseGroupsFromSourceRows(sourceRows);
  const existingRows = db
    .prepare("SELECT id, pose_key FROM img_source_poses WHERE category_id = ?")
    .all(categoryId) as Array<{ id: number; pose_key: string }>;
  const existingByKey = new Map(existingRows.map((row) => [row.pose_key, row.id]));
  const timestamp = now();
  const updatePromptKeyStatement = db.prepare(
    "UPDATE img_sources SET prompt_key = ?, updated_at = ? WHERE id = ?",
  );
  const insertStatement = db.prepare(
    `INSERT INTO img_source_poses
      (
        category_id,
        pose_key,
        pose_title,
        pose_title_zh,
        sort_order,
        color_source_id,
        color_image_url,
        color_local_file_path,
        color_generated_img_ids,
        outline_source_id,
        outline_image_url,
        outline_local_file_path,
        outline_generated_img_ids,
        scene_color_source_id,
        scene_color_image_url,
        scene_color_local_file_path,
        scene_color_generated_img_ids,
        created_at,
        updated_at
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = db.prepare(
    `UPDATE img_source_poses
     SET pose_title = ?,
         pose_title_zh = ?,
         sort_order = ?,
         color_source_id = ?,
         color_image_url = ?,
         color_local_file_path = ?,
         color_generated_img_ids = ?,
         outline_source_id = ?,
         outline_image_url = ?,
         outline_local_file_path = ?,
         outline_generated_img_ids = ?,
         scene_color_source_id = ?,
         scene_color_image_url = ?,
         scene_color_local_file_path = ?,
         scene_color_generated_img_ids = ?,
         created_at = ?,
         updated_at = ?
     WHERE id = ?`,
  );

  db.transaction(() => {
    groups.forEach((group) => {
      POSE_SOURCE_KINDS.forEach((kind) => {
        const sourceRow = group[kind];
        if (!sourceRow) {
          return;
        }

        const nextPromptKey = `${group.pose_key}:${kind}`;
        if ((sourceRow.prompt_key?.trim() || "") !== nextPromptKey) {
          updatePromptKeyStatement.run(nextPromptKey, timestamp, sourceRow.id);
        }
      });

      const recordId = existingByKey.get(group.pose_key);
      const values = [
        group.pose_title,
        group.pose_title_zh,
        group.sort_order,
        group.color?.id ?? null,
        group.color?.image_url?.trim() || "",
        group.color?.local_file_path?.trim() || "",
        stringifyGeneratedImgIds(getSourceRowGeneratedImgIds(group.color)),
        group.outline?.id ?? null,
        group.outline?.image_url?.trim() || "",
        group.outline?.local_file_path?.trim() || "",
        stringifyGeneratedImgIds(getSourceRowGeneratedImgIds(group.outline)),
        group.scene_color?.id ?? null,
        group.scene_color?.image_url?.trim() || "",
        group.scene_color?.local_file_path?.trim() || "",
        stringifyGeneratedImgIds(getSourceRowGeneratedImgIds(group.scene_color)),
        group.created_at,
        group.updated_at,
      ];

      if (recordId) {
        updateStatement.run(...values, recordId);
        return;
      }

      insertStatement.run(categoryId, group.pose_key, ...values);
    });

    if (groups.length === 0) {
      db.prepare("DELETE FROM img_source_poses WHERE category_id = ?").run(categoryId);
      return;
    }

    db.prepare(
      `DELETE FROM img_source_poses
       WHERE category_id = ?
         AND pose_key NOT IN (${groups.map(() => "?").join(", ")})`,
    ).run(categoryId, ...groups.map((group) => group.pose_key));
  })();

  invalidateDevCache(`pose-sources:list:${categoryId}`);
  return groups;
}

function listCategoryImageHostRows(includeDeleted = false) {
  return getDb()
    .prepare(
      `SELECT id, parent_id, slug, cover_image
       FROM categories
       WHERE cover_image IS NOT NULL ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
    )
    .all() as Array<Pick<CategoryRow, "id" | "parent_id" | "slug"> & {
      cover_image: string | null;
    }>;
}

function buildUniqueProductPackageSlug(rawValue: string, excludeId?: number) {
  const db = getDb();
  const baseSlug = normalizeSlug(rawValue);
  let nextSlug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = db
      .prepare(
        `SELECT id
         FROM product_packages
         WHERE slug = ?
           ${excludeId ? "AND id != ?" : ""}
         LIMIT 1`,
      )
      .get(...(excludeId ? [nextSlug, excludeId] : [nextSlug])) as
      | { id: number }
      | undefined;

    if (!existing) {
      return nextSlug;
    }

    counter += 1;
    nextSlug = `${baseSlug}-${counter}`;
  }
}

function buildUniqueSpecialPageSlug(rawValue: string, excludeId?: number) {
  const db = getDb();
  const baseSlug = normalizeSlug(rawValue);
  let nextSlug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = db
      .prepare(
        `SELECT id
         FROM special_pages
         WHERE slug = ?
           AND deleted_at IS NULL
           ${excludeId ? "AND id != ?" : ""}
         LIMIT 1`,
      )
      .get(...(excludeId ? [nextSlug, excludeId] : [nextSlug])) as
      | { id: number }
      | undefined;

    if (!existing) {
      return nextSlug;
    }

    counter += 1;
    nextSlug = `${baseSlug}-${counter}`;
  }
}

function normalizeSpecialPageContentJson(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '{"items":[]}';
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { items?: unknown }).items)
    ) {
      throw new Error("专题内容 JSON 必须包含 items 数组。");
    }
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    if (error instanceof Error && error.message.includes("items")) {
      throw error;
    }
    throw new Error("专题内容 JSON 格式无效。");
  }
}

function normalizeSpecialPageInput(input: SpecialPageInput, excludeId?: number) {
  const title = input.title?.trim();
  if (!title) {
    throw new Error("请输入专题标题。");
  }

  return {
    title,
    slug: buildUniqueSpecialPageSlug(input.slug?.trim() || title, excludeId),
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    seo_title: input.seo_title?.trim() || null,
    seo_description: input.seo_description?.trim() || null,
    hero_image_url: input.hero_image_url?.trim() || null,
    card_image_url: input.card_image_url?.trim() || null,
    theme_color: /^#[0-9A-F]{6}$/i.test(input.theme_color?.trim() || "")
      ? String(input.theme_color).trim().toUpperCase()
      : "#7ADDE8",
    status: normalizeSpecialPageStatus(input.status),
    sort_order: input.sort_order ?? 0,
    content_json: normalizeSpecialPageContentJson(input.content_json),
  };
}

function listProductPackageItemRows(packageId: number) {
  return getDb()
    .prepare(
      `SELECT
        product_package_items.*,
        categories.name AS category_name,
        categories.slug AS category_slug,
        img_source_poses.pose_key AS pose_key,
        img_source_poses.pose_title AS pose_title,
        img_source_poses.pose_title_zh AS pose_title_zh
       FROM product_package_items
       INNER JOIN categories ON categories.id = product_package_items.category_id
       INNER JOIN img_source_poses ON img_source_poses.id = product_package_items.pose_id
       WHERE product_package_items.package_id = ?
       ORDER BY product_package_items.sort_order ASC, product_package_items.id ASC`,
    )
    .all(packageId) as ProductPackageItemRow[];
}

function getProductPackageRowById(id: number) {
  return getDb()
    .prepare(
      `SELECT
        product_packages.*,
        categories.name AS parent_category_name,
        categories.slug AS parent_category_slug,
        COUNT(product_package_items.id) AS item_count
       FROM product_packages
       INNER JOIN categories ON categories.id = product_packages.parent_category_id
       LEFT JOIN product_package_items ON product_package_items.package_id = product_packages.id
       WHERE product_packages.id = ?
       GROUP BY product_packages.id
       LIMIT 1`,
    )
    .get(id) as ProductPackageRow | undefined;
}

function getProductPackageByIdSync(id: number): ProductPackageRecord | null {
  const row = getProductPackageRowById(id);
  if (!row) {
    return null;
  }

  return {
    ...mapProductPackage(row),
    items: listProductPackageItemRows(id).map(mapProductPackageItem),
  };
}

function normalizeProductPackageItems(items: ProductPackageItemInput[]) {
  const seen = new Set<number>();
  const normalized = items
    .map((item, index) => ({
      category_id: Number(item.category_id),
      pose_id: Number(item.pose_id),
      day_index:
        item.day_index === null || item.day_index === undefined
          ? index
          : Number(item.day_index),
      sort_order: Number(item.sort_order ?? index),
      display_name: item.display_name?.trim() || null,
    }))
    .filter((item) => Number.isInteger(item.category_id) && Number.isInteger(item.pose_id));

  const uniqueItems: typeof normalized = [];
  for (const item of normalized) {
    if (seen.has(item.category_id)) {
      continue;
    }
    seen.add(item.category_id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function assertProductPackageInput(input: ProductPackageInput) {
  const parent = getCategoryRowById(Number(input.parent_category_id));
  if (!parent) {
    throw new Error("二级类目不存在。");
  }

  const items = normalizeProductPackageItems(input.items);
  if (items.length < 2) {
    throw new Error("请至少选择 2 个三级类目。");
  }

  const db = getDb();
  const categoryStatement = db.prepare(
    "SELECT id, parent_id, name FROM categories WHERE id = ? AND deleted_at IS NULL LIMIT 1",
  );
  const poseStatement = db.prepare(
    "SELECT id, category_id FROM img_source_poses WHERE id = ? LIMIT 1",
  );

  items.forEach((item) => {
    const category = categoryStatement.get(item.category_id) as
      | Pick<CategoryRow, "id" | "parent_id" | "name">
      | undefined;
    if (!category || Number(category.parent_id) !== Number(parent.id)) {
      throw new Error("所选三级类目必须属于当前二级类目。");
    }

    const pose = poseStatement.get(item.pose_id) as
      | { id: number; category_id: number }
      | undefined;
    if (!pose || Number(pose.category_id) !== Number(category.id)) {
      throw new Error(`${category.name} 的姿态选择无效。`);
    }
  });

  return { parent, items };
}

const PRODUCT_PACKAGE_SUBTITLE = "No Prep Fine Motor, Puzzle & Cut-and-Paste Printables";
const PRODUCT_PACKAGE_AUDIENCE =
  "Designed for Kindergarten. Also great for Pre-K review, 1st grade early finishers, homeschool, centers, and morning work.";
const PRODUCT_PACKAGE_SKILLS = [
  "Fine motor control",
  "Pencil control",
  "Scissor skills",
  "Visual discrimination",
  "Spatial reasoning",
  "Number order",
  "Independent work",
  "Theme vocabulary",
  "Early writing",
];
const PRODUCT_PACKAGE_ACTIVITY_TYPES = [
  { key: "coloring", label: "Creative Coloring Activity" },
  { key: "fine_motor", label: "Fine Motor Line Practice" },
  { key: "cut_paste", label: "Cut and Paste Matching Activity" },
  { key: "visual_puzzle", label: "Visual Thinking Puzzle" },
  { key: "number_order", label: "Number Order / Spatial Reasoning Puzzle" },
];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function buildProductPackageCopy(input: {
  parentName: string;
  itemNames: string[];
  title: string;
  subtitle: string;
  audienceNote: string;
}) {
  const { parentName, itemNames, title, subtitle, audienceNote } = input;
  const displayNames = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  }).format(itemNames);
  const weeklyFlow = itemNames.map((name, index) => ({
    day: WEEKDAY_NAMES[index] ?? `Day ${index + 1}`,
    focus: name,
    activities:
      index % 2 === 0
        ? ["Creative Coloring Activity", "Fine Motor Line Practice"]
        : ["Cut and Paste Matching Activity", "Visual Thinking Puzzle"],
  }));

  return {
    title,
    subtitle,
    audienceNote,
    teacherNotes: `This ${parentName} activity pack is designed for kindergarten learners and includes no prep printable pages featuring ${displayNames}. Use these pages for morning work, centers, fine motor practice, early finishers, homeschool, quiet time, or sub plans.`,
    skills: PRODUCT_PACKAGE_SKILLS,
    weeklyFlow,
    tptDescription: `Make your ${parentName} theme easy with this no prep kindergarten activity pack. This printable resource includes activities for ${displayNames}, with fine motor practice, cut-and-paste pages, visual puzzles, number order activities, vocabulary, and simple writing prompts.`,
    usage: [
      "Morning work",
      "Centers",
      "Early finishers",
      "Homeschool",
      "Quiet time",
      "Sub plans",
    ],
  };
}

function buildProductPackagePagePlan(input: {
  parentName: string;
  title: string;
  items: ProductPackageItemRecord[];
}) {
  const pages: Array<Record<string, unknown>> = [
    { type: "cover", title: input.title, parent_category: input.parentName },
    { type: "teacher_notes" },
    { type: "skills_covered" },
    { type: "weekly_flow" },
    { type: "activity_checklist" },
  ];

  input.items.forEach((item) => {
    PRODUCT_PACKAGE_ACTIVITY_TYPES.forEach((activity) => {
      pages.push({
        type: "activity",
        category_id: item.category_id,
        category_name: item.display_name || item.category_name,
        pose_id: item.pose_id,
        pose_key: item.pose_key,
        activity_key: activity.key,
        activity_title: `${item.display_name || item.category_name} ${activity.label}`,
      });
    });
  });

  pages.push(
    { type: "bonus", key: "vocabulary_cards", title: `${input.parentName} Vocabulary Cards` },
    { type: "bonus", key: "label_the_theme", title: `Label the ${input.parentName}` },
    { type: "bonus", key: "favorite_item", title: `My Favorite ${input.parentName} Page` },
    { type: "bonus", key: "review_page", title: `${input.parentName} Review Page` },
    { type: "bonus", key: "writing_prompt", title: `${input.parentName} Writing Prompt` },
    { type: "terms", title: "Terms of Use" },
  );

  return pages;
}

function refreshProductPackageGeneratedFields(packageId: number) {
  const item = getProductPackageByIdSync(packageId);
  if (!item) {
    throw new Error("产品包不存在。");
  }

  const itemNames = item.items.map((row) => row.display_name || row.category_name);
  const copy = buildProductPackageCopy({
    parentName: item.parent_category_name,
    itemNames,
    title: item.title,
    subtitle: item.subtitle || PRODUCT_PACKAGE_SUBTITLE,
    audienceNote: item.audience_note || PRODUCT_PACKAGE_AUDIENCE,
  });
  const pagePlan = buildProductPackagePagePlan({
    parentName: item.parent_category_name,
    title: item.title,
    items: item.items,
  });
  const timestamp = now();

  getDb()
    .prepare("UPDATE product_packages SET copy_json = ?, page_plan_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(copy, null, 2), JSON.stringify(pagePlan, null, 2), timestamp, packageId);
}

export async function listProductPackages() {
  const rows = getDb()
    .prepare(
      `SELECT
        product_packages.*,
        categories.name AS parent_category_name,
        categories.slug AS parent_category_slug,
        COUNT(product_package_items.id) AS item_count
       FROM product_packages
       INNER JOIN categories ON categories.id = product_packages.parent_category_id
       LEFT JOIN product_package_items ON product_package_items.package_id = product_packages.id
       GROUP BY product_packages.id
       ORDER BY product_packages.updated_at DESC, product_packages.id DESC`,
    )
    .all() as ProductPackageRow[];

  return { items: rows.map(mapProductPackage) };
}

export async function getProductPackageById(id: number) {
  return getProductPackageByIdSync(id);
}

export async function createProductPackage(input: ProductPackageInput) {
  const { parent, items } = assertProductPackageInput(input);
  const timestamp = now();
  const title = input.title?.trim() || `${parent.name} Kindergarten Activity Pack`;
  const slug = buildUniqueProductPackageSlug(input.slug?.trim() || title);
  const subtitle = input.subtitle?.trim() || PRODUCT_PACKAGE_SUBTITLE;
  const audienceNote = input.audience_note?.trim() || PRODUCT_PACKAGE_AUDIENCE;
  const targetLabel = input.target_label?.trim() || "Kindergarten";
  const status = normalizeProductPackageStatus(input.status);
  const db = getDb();

  const packageId = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO product_packages
          (parent_category_id, title, slug, subtitle, target_label, audience_note, status, cover_image_url, pdf_file_path, preview_file_path, copy_json, page_plan_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        parent.id,
        title,
        slug,
        subtitle,
        targetLabel,
        audienceNote,
        status,
        input.cover_image_url?.trim() || null,
        input.pdf_file_path?.trim() || null,
        input.preview_file_path?.trim() || null,
        timestamp,
        timestamp,
      );
    const packageId = Number(result.lastInsertRowid);
    const insertItem = db.prepare(
      `INSERT INTO product_package_items
        (package_id, category_id, pose_id, day_index, sort_order, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    items.forEach((item, index) => {
      insertItem.run(
        packageId,
        item.category_id,
        item.pose_id,
        item.day_index ?? index,
        item.sort_order,
        item.display_name,
        timestamp,
        timestamp,
      );
    });
    return packageId;
  })();

  refreshProductPackageGeneratedFields(packageId);
  return getProductPackageById(packageId);
}

export async function updateProductPackage(id: number, input: ProductPackageInput) {
  const existing = getProductPackageRowById(id);
  if (!existing) {
    throw new Error("产品包不存在。");
  }

  const { parent, items } = assertProductPackageInput(input);
  const timestamp = now();
  const title = input.title?.trim() || `${parent.name} Kindergarten Activity Pack`;
  const slug = buildUniqueProductPackageSlug(input.slug?.trim() || title, id);
  const subtitle = input.subtitle?.trim() || PRODUCT_PACKAGE_SUBTITLE;
  const audienceNote = input.audience_note?.trim() || PRODUCT_PACKAGE_AUDIENCE;
  const targetLabel = input.target_label?.trim() || "Kindergarten";
  const status = normalizeProductPackageStatus(input.status);
  const db = getDb();

  db.transaction(() => {
    db.prepare(
      `UPDATE product_packages
       SET parent_category_id = ?, title = ?, slug = ?, subtitle = ?, target_label = ?, audience_note = ?, status = ?, cover_image_url = ?, pdf_file_path = ?, preview_file_path = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      parent.id,
      title,
      slug,
      subtitle,
      targetLabel,
      audienceNote,
      status,
      input.cover_image_url?.trim() || null,
      input.pdf_file_path?.trim() || null,
      input.preview_file_path?.trim() || null,
      timestamp,
      id,
    );
    db.prepare("DELETE FROM product_package_items WHERE package_id = ?").run(id);
    const insertItem = db.prepare(
      `INSERT INTO product_package_items
        (package_id, category_id, pose_id, day_index, sort_order, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    items.forEach((item, index) => {
      insertItem.run(
        id,
        item.category_id,
        item.pose_id,
        item.day_index ?? index,
        item.sort_order,
        item.display_name,
        timestamp,
        timestamp,
      );
    });
  })();

  refreshProductPackageGeneratedFields(id);
  return getProductPackageById(id);
}

export async function deleteProductPackage(id: number) {
  getDb().prepare("DELETE FROM product_packages WHERE id = ?").run(id);
}

export async function listSpecialPages() {
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM special_pages
       WHERE deleted_at IS NULL
       ORDER BY sort_order ASC, updated_at DESC, id DESC`,
    )
    .all() as SpecialPageRow[];

  return { items: rows.map(mapSpecialPage) };
}

export async function getSpecialPageById(id: number) {
  const row = getDb()
    .prepare("SELECT * FROM special_pages WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .get(id) as SpecialPageRow | undefined;

  return row ? mapSpecialPage(row) : null;
}

export async function createSpecialPage(input: SpecialPageInput) {
  const normalized = normalizeSpecialPageInput(input);
  const timestamp = now();
  const db = getDb();

  const id = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO special_pages
          (
            remote_id,
            title,
            slug,
            subtitle,
            description,
            seo_title,
            seo_description,
            hero_image_url,
            card_image_url,
            theme_color,
            status,
            sort_order,
            content_json,
            created_at,
            updated_at,
            sync_status,
            local_updated_at,
            remote_updated_at_snapshot,
            last_synced_at,
            deleted_at
          )
         VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
      )
      .run(
        normalized.title,
        normalized.slug,
        normalized.subtitle,
        normalized.description,
        normalized.seo_title,
        normalized.seo_description,
        normalized.hero_image_url,
        normalized.card_image_url,
        normalized.theme_color,
        normalized.status,
        normalized.sort_order,
        normalized.content_json,
        timestamp,
        timestamp,
        timestamp,
      );
    return Number(result.lastInsertRowid);
  })();

  queueOutbox(db, {
    entityType: "special_page",
    entityId: id,
    operation: "create",
    payload: { id },
  });

  invalidateDevCache("special-pages:list");
  return getSpecialPageById(id);
}

export async function updateSpecialPage(id: number, input: SpecialPageInput) {
  const existing = getDb()
    .prepare("SELECT * FROM special_pages WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .get(id) as SpecialPageRow | undefined;
  if (!existing) {
    throw new Error("专题页不存在。");
  }

  const normalized = normalizeSpecialPageInput(input, id);
  const timestamp = now();
  const nextSyncStatus: SyncStatus =
    existing.sync_status === "pending_create" ? "pending_create" : "pending_update";
  const db = getDb();

  db.transaction(() => {
    db.prepare(
      `UPDATE special_pages
       SET title = ?,
           slug = ?,
           subtitle = ?,
           description = ?,
           seo_title = ?,
           seo_description = ?,
           hero_image_url = ?,
           card_image_url = ?,
           theme_color = ?,
           status = ?,
           sort_order = ?,
           content_json = ?,
           updated_at = ?,
           local_updated_at = ?,
           sync_status = ?
       WHERE id = ?`,
    ).run(
      normalized.title,
      normalized.slug,
      normalized.subtitle,
      normalized.description,
      normalized.seo_title,
      normalized.seo_description,
      normalized.hero_image_url,
      normalized.card_image_url,
      normalized.theme_color,
      normalized.status,
      normalized.sort_order,
      normalized.content_json,
      timestamp,
      timestamp,
      nextSyncStatus,
      id,
    );
    queueOutbox(db, {
      entityType: "special_page",
      entityId: id,
      operation: "update",
      payload: { id },
    });
  })();

  invalidateDevCache("special-pages:list");
  return getSpecialPageById(id);
}

export async function deleteSpecialPage(id: number) {
  const existing = getDb()
    .prepare("SELECT id, sync_status FROM special_pages WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .get(id) as Pick<SpecialPageRow, "id" | "sync_status"> | undefined;
  if (!existing) {
    return;
  }

  const timestamp = now();
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `UPDATE special_pages
       SET deleted_at = ?,
           updated_at = ?,
           local_updated_at = ?,
           sync_status = 'pending_delete'
       WHERE id = ?`,
    ).run(timestamp, timestamp, timestamp, id);
    queueOutbox(db, {
      entityType: "special_page",
      entityId: id,
      operation: "delete",
      payload: { id },
    });
  })();

  invalidateDevCache("special-pages:list");
}

export async function getRawSpecialPageById(id: number) {
  return (
    getDb()
      .prepare("SELECT * FROM special_pages WHERE id = ? LIMIT 1")
      .get(id) as SpecialPageRow | undefined
  ) ?? null;
}

export async function markSpecialPageSynced(id: number, remoteId: number, remoteUpdatedAt: string) {
  getDb()
    .prepare(
      `UPDATE special_pages
       SET remote_id = ?,
           sync_status = 'synced',
           remote_updated_at_snapshot = ?,
           last_synced_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(remoteId, remoteUpdatedAt, now(), remoteUpdatedAt, id);
  invalidateDevCache("special-pages:list");
}

export async function purgeDeletedSpecialPage(id: number) {
  getDb().prepare("DELETE FROM special_pages WHERE id = ? AND deleted_at IS NOT NULL").run(id);
  invalidateDevCache("special-pages:list");
}

export function getLocalDatabase() {
  return getDb();
}

export async function resolveCategoryImageObjectKey(imageId: string, options?: { includeDeleted?: boolean }) {
  const rows = listCategoryImageHostRows(options?.includeDeleted ?? false);
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  for (const row of rows) {
    if (!collectReferencedCategoryImageIds({ cover_image: row.cover_image }).includes(imageId)) {
      continue;
    }

    return buildCategoryImageObjectKeyForCategory({
      categoryId: row.id,
      imageId,
      isCoverImage: true,
      rowsById,
    });
  }

  return buildLegacyRemoteCategoryImageKey(imageId);
}

export async function listCategories() {
  return withDevCache("categories:list", async () => {
    const rows = getDb()
      .prepare(
        `SELECT
          categories.*,
          category_pin_publish_cycles.cycle_id AS pin_publish_cycle_id,
          category_video_publish_cycles.cycle_id AS video_publish_cycle_id
         FROM categories
         LEFT JOIN category_pin_publish_cycles
          ON category_pin_publish_cycles.category_id = categories.id
         LEFT JOIN category_video_publish_cycles
          ON category_video_publish_cycles.category_id = categories.id
         WHERE categories.deleted_at IS NULL
         ORDER BY CASE WHEN categories.parent_id IS NULL THEN 0 ELSE 1 END, categories.sort_order ASC, categories.id ASC`,
      )
      .all() as CategoryRow[];
    const flat = rows.map(mapCategory);

    return {
      flat,
      tree: buildCategoryTree(flat),
    };
  });
}

export async function createCategory(input: CategoryInput) {
  assertCategoryConstraints(input);

  const db = getDb();
  const timestamp = now();
  const slug = buildUniqueSlug("categories", input.slug?.trim() || input.name);
  const coverImageId = normalizeCategoryImageId(input.cover_image);
  const nextImageIds = collectReferencedCategoryImageIds({
    cover_image: input.cover_image,
  });
  if (coverImageId) {
    await assertPendingCategoryImageFiles(coverImageId);
  }
  const result = db.transaction(() => {
    const insert = db
      .prepare(
        `INSERT INTO categories
          (
            remote_id,
            parent_id,
            name,
            slug,
            description,
            name_zh,
            pose_prompt_specs,
            cover_image,
            seo_image_url,
            sort_order,
            is_active,
            created_at,
            updated_at,
            sync_status,
            local_updated_at,
            remote_updated_at_snapshot,
            last_synced_at,
            deleted_at
          )
         VALUES (
            NULL,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'pending_create',
            ?,
            NULL,
            NULL,
            NULL
          )`,
      )
      .run(
        input.parent_id,
        input.name.trim(),
        slug,
        input.description?.trim() || null,
        input.name_zh === undefined
          ? null
          : input.name_zh === null
            ? null
            : input.name_zh.trim() || null,
        input.pose_prompt_specs === undefined
          ? null
          : input.pose_prompt_specs === null
            ? null
            : input.pose_prompt_specs.trim() || null,
        coverImageId,
        null,
        input.sort_order ?? 0,
        input.is_active === false ? 0 : 1,
        timestamp,
        timestamp,
        timestamp,
      );
    const categoryId = Number(insert.lastInsertRowid);
    if (coverImageId) {
      const categoryPathRows = db
        .prepare("SELECT id, parent_id, slug FROM categories")
        .all() as Array<Pick<CategoryRow, "id" | "parent_id" | "slug">>;
      const categoryRowsById = new Map(categoryPathRows.map((row) => [row.id, row]));
      const seoImageObjectKey = buildCategorySeoImageObjectKey({
        categoryId,
        imageId: coverImageId,
        rowsById: categoryRowsById,
      });
      db.prepare("UPDATE categories SET seo_image_url = ? WHERE id = ?").run(
        seoImageObjectKey,
        categoryId,
      );
    }
    queueOutbox(db, {
      entityType: "category",
      entityId: categoryId,
      operation: "create",
      payload: { id: categoryId },
    });
    deleteQueuedCategoryImageDeletes(db, nextImageIds);
    return categoryId;
  })();

  if (nextImageIds.length > 0) {
    const categoryPathRows = db
      .prepare("SELECT id, parent_id, slug FROM categories")
      .all() as Array<Pick<CategoryRow, "id" | "parent_id" | "slug">>;
    const categoryRowsById = new Map(categoryPathRows.map((row) => [row.id, row]));

    await Promise.all(
      nextImageIds.map((imageId) =>
        ensureCategoryImageMirrorFiles({
          imageId,
          nextObjectKeys: buildCategoryImageObjectKeysForCategory({
            categoryId: result,
            imageId,
            rowsById: categoryRowsById,
          }),
        }),
      ),
    );
  }

  invalidateDevCache("categories:list", "categories:summary");
  return getCategoryById(result);
}

export async function updateCategory(id: number, input: CategoryInput) {
  assertCategoryConstraints(input, id);
  const existing = getCategoryRowById(id);

  if (!existing) {
    throw new Error("分类不存在。");
  }

  const db = getDb();
  const timestamp = now();
  const nextName = input.name.trim();
  const nextDescription = input.description?.trim() || null;
  const nextSortOrder = input.sort_order ?? 0;
  const nextIsActive = input.is_active === false ? 0 : 1;
  const slug = buildUniqueSlug("categories", input.slug?.trim() || input.name || existing.name, id);
  const currentCoverImage = normalizeCategoryImageId((existing as Record<string, unknown>).cover_image);
  const nextCoverImage = input.cover_image === undefined
    ? currentCoverImage
    : normalizeCategoryImageId(input.cover_image);
  const currentSeoImageUrl =
    (existing as Record<string, unknown>).seo_image_url === null ||
    (existing as Record<string, unknown>).seo_image_url === undefined
      ? null
      : String((existing as Record<string, unknown>).seo_image_url).trim() || null;
  const currentNameZh =
    (existing as Record<string, unknown>).name_zh === null ||
    (existing as Record<string, unknown>).name_zh === undefined
      ? null
      : String((existing as Record<string, unknown>).name_zh).trim() || null;
  const nextNameZh =
    input.name_zh === undefined
      ? currentNameZh
      : input.name_zh === null
        ? null
        : input.name_zh.trim() || null;
  const currentPosePromptSpecs =
    (existing as Record<string, unknown>).pose_prompt_specs === null ||
    (existing as Record<string, unknown>).pose_prompt_specs === undefined
      ? null
      : String((existing as Record<string, unknown>).pose_prompt_specs).trim() || null;
  const nextPosePromptSpecs =
    input.pose_prompt_specs === undefined
      ? currentPosePromptSpecs
      : input.pose_prompt_specs === null
        ? null
        : input.pose_prompt_specs.trim() || null;
  const currentImageIds = collectReferencedCategoryImageIds({
    cover_image: currentCoverImage,
  });
  const nextImageIds = collectReferencedCategoryImageIds({
    cover_image: nextCoverImage,
  });
  const removedImageIds = currentImageIds.filter((imageId) => !nextImageIds.includes(imageId));
  const splitDeletes = splitCategoryImageDeletes(removedImageIds);
  const localOnlyIds = existing.remote_id ? splitDeletes.localOnlyIds : removedImageIds;
  const remoteIds = existing.remote_id ? splitDeletes.remoteIds : [];
  const categoryPathRows = db
    .prepare("SELECT id, parent_id, slug FROM categories")
    .all() as Array<Pick<CategoryRow, "id" | "parent_id" | "slug">>;
  const categoryRowsById = new Map(categoryPathRows.map((row) => [row.id, row]));
  const currentCoverImageObjectKeys = currentCoverImage
    ? buildCategoryImageObjectKeysForCategory({
        categoryId: existing.id,
        imageId: currentCoverImage,
        rowsById: categoryRowsById,
      })
    : [];
  const currentCoverImageObjectKey = currentCoverImageObjectKeys[0]?.objectKey ?? null;
  const nextCategoryRowsById = new Map(categoryRowsById);
  nextCategoryRowsById.set(existing.id, {
    id: existing.id,
    parent_id: input.parent_id,
    slug,
  });
  const nextCoverImageObjectKeys = nextCoverImage
    ? buildCategoryImageObjectKeysForCategory({
        categoryId: existing.id,
        imageId: nextCoverImage,
        rowsById: nextCategoryRowsById,
      })
    : [];
  const nextCoverImageObjectKey = nextCoverImageObjectKeys[0]?.objectKey ?? null;
  const nextSeoImageObjectKey = nextCoverImage
    ? buildCategorySeoImageObjectKey({
        categoryId: existing.id,
        imageId: nextCoverImage,
        rowsById: nextCategoryRowsById,
      })
    : null;
  const remoteDeleteKeys = new Map(
    remoteIds.map((imageId) => [
      imageId,
      buildCategoryImageObjectKeysForCategory({
        categoryId: existing.id,
        imageId,
        rowsById: categoryRowsById,
      }).map((item) => item.objectKey),
    ]),
  );
  const hasPendingCurrentCoverImage = currentCoverImage
    ? hasPendingCategoryImageFile(currentCoverImage)
    : false;
  const shouldQueueCurrentCoverPathDelete =
    Boolean(existing.remote_id) &&
    currentCoverImage === nextCoverImage &&
    currentCoverImageObjectKey !== null &&
    nextCoverImageObjectKey !== null &&
    currentCoverImageObjectKey !== nextCoverImageObjectKey &&
    !hasPendingCurrentCoverImage;
  const syncRelevantChanged =
    existing.parent_id !== input.parent_id ||
    existing.name !== nextName ||
    existing.slug !== slug ||
    (existing.description ?? null) !== nextDescription ||
    currentCoverImage !== nextCoverImage ||
    currentSeoImageUrl !== nextSeoImageObjectKey ||
    existing.sort_order !== nextSortOrder ||
    (existing.is_active ? 1 : 0) !== nextIsActive ||
    remoteIds.length > 0 ||
    shouldQueueCurrentCoverPathDelete;

  // Prepare and verify the complete upload source before changing the database reference.
  // This prevents a stale edit page from restoring an image id whose files were already removed.
  if (nextCoverImage && nextCoverImageObjectKey && currentCoverImage !== nextCoverImage) {
    await assertCategoryImageSources({
      imageId: nextCoverImage,
      nextObjectKeys: nextCoverImageObjectKeys,
    });
    await ensureCategoryImageMirrorFiles({
      imageId: nextCoverImage,
      nextObjectKeys: nextCoverImageObjectKeys,
    });
  } else if (
    nextCoverImage &&
    nextCoverImageObjectKey &&
    currentCoverImage === nextCoverImage &&
    currentCoverImageObjectKey !== nextCoverImageObjectKey
  ) {
    await assertCategoryImageSources({
      imageId: nextCoverImage,
      currentObjectKeys: currentCoverImageObjectKeys,
      nextObjectKeys: nextCoverImageObjectKeys,
    });
    await ensureCategoryImageMirrorFiles({
      imageId: nextCoverImage,
      currentObjectKeys: currentCoverImageObjectKeys,
      nextObjectKeys: nextCoverImageObjectKeys,
    });
  }

  db.transaction(() => {
    const nextSyncStatus: SyncStatus =
      syncRelevantChanged
        ? existing.sync_status === "pending_create"
          ? "pending_create"
          : "pending_update"
        : existing.sync_status;

    db.prepare(
      `UPDATE categories
       SET parent_id = ?, name = ?, slug = ?, description = ?, name_zh = ?, pose_prompt_specs = ?, cover_image = ?, seo_image_url = ?, sort_order = ?, is_active = ?, updated_at = ?, local_updated_at = ?, sync_status = ?
       WHERE id = ?`,
    ).run(
      input.parent_id,
      nextName,
      slug,
      nextDescription,
      nextNameZh,
      nextPosePromptSpecs,
      nextCoverImage,
      nextSeoImageObjectKey,
      nextSortOrder,
      nextIsActive,
      timestamp,
      timestamp,
      nextSyncStatus,
      id,
    );
    if (syncRelevantChanged) {
      queueOutbox(db, {
        entityType: "category",
        entityId: id,
        operation: "update",
        payload: { id },
      });
    }
    deleteQueuedCategoryImageDeletes(
      db,
      [...nextImageIds, ...localOnlyIds],
    );
    remoteIds.forEach((imageId) => {
      queueCategoryImageKeySetDelete(
        db,
        imageId,
        remoteDeleteKeys.get(imageId) ?? [buildLegacyRemoteCategoryImageKey(imageId)],
      );
    });
    if (shouldQueueCurrentCoverPathDelete && currentCoverImage) {
      queueCategoryImageKeySetDelete(
        db,
        currentCoverImage,
        currentCoverImageObjectKeys.map((item) => item.objectKey),
      );
    }
  })();

  await Promise.all(
    removedImageIds.map((imageId) =>
      deleteCategoryImageLocalFiles(imageId, [
        ...(imageId === currentCoverImage ? currentCoverImageObjectKeys.map((item) => item.objectKey) : []),
        ...(imageId === nextCoverImage ? nextCoverImageObjectKeys.map((item) => item.objectKey) : []),
      ]),
    ),
  );

  if (
    currentCoverImage === nextCoverImage &&
    currentCoverImageObjectKey &&
    nextCoverImageObjectKey &&
    currentCoverImageObjectKey !== nextCoverImageObjectKey
  ) {
    await Promise.all(currentCoverImageObjectKeys.map((item) => deleteManagedFile(item.objectKey)));
  }

  invalidateDevCache("categories:list", "categories:summary");
  return getCategoryById(id);
}

export async function updateCategoryPosePromptSpecsLocal(
  id: number,
  posePromptSpecs: string | null,
) {
  const existing = getCategoryRowById(id);

  if (!existing || existing.deleted_at) {
    throw new Error("分类不存在。");
  }

  const db = getDb();
  const timestamp = now();
  const normalizedValue =
    posePromptSpecs === null ? null : posePromptSpecs.trim() || null;

  db.prepare(
    `UPDATE categories
     SET pose_prompt_specs = ?, updated_at = ?, local_updated_at = ?
     WHERE id = ?`,
  ).run(normalizedValue, timestamp, timestamp, id);

  invalidateDevCache("categories:list", "categories:summary");
  return getCategoryById(id);
}

export async function updateCategoryPublishToPinLocal(
  id: number,
  publishToPin: boolean,
) {
  const existing = getCategoryRowById(id);

  if (!existing || existing.deleted_at) {
    throw new Error("分类不存在。");
  }

  const db = getDb();
  const timestamp = now();

  db.prepare(
    `UPDATE categories
     SET publish_to_pin = ?, updated_at = ?, local_updated_at = ?
     WHERE id = ?`,
  ).run(publishToPin ? 1 : 0, timestamp, timestamp, id);

  invalidateDevCache("categories:list", "categories:summary");
  return getCategoryById(id);
}

const PIN_PUBLISH_TIMES = ["20:00", "22:30", "01:00", "03:30", "06:00", "08:30"];

function getCategoryDepthFromRows(categoryId: number) {
  const rows = getDb()
    .prepare("SELECT id, parent_id FROM categories WHERE deleted_at IS NULL")
    .all() as Array<{ id: number; parent_id: number | null }>;
  const map = new Map(rows.map((row) => [row.id, row]));
  let depth = 1;
  let cursorId = map.get(categoryId)?.parent_id ?? null;

  while (cursorId !== null) {
    const parent = map.get(cursorId);
    if (!parent) {
      break;
    }
    depth += 1;
    cursorId = parent.parent_id;
  }

  return depth;
}

function assertPinPublishCycleExists(cycleId: number) {
  const row = getDb()
    .prepare("SELECT id FROM pin_publish_cycles WHERE id = ? LIMIT 1")
    .get(cycleId) as { id: number } | undefined;

  if (!row) {
    throw new Error("Pin 图发布周期不存在。");
  }
}

export type PinPublishCycleInput = {
  name?: string;
  start_date: string;
  end_date?: string;
};

function addDaysToIsoDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("开始日期格式无效。");
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function getInclusiveDateRangeDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("日期格式无效。");
  }
  if (start > end) {
    throw new Error("开始日期不能晚于结束日期。");
  }

  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export async function listPinPublishCycles() {
  const rows = getDb()
    .prepare(
      `SELECT
        pin_publish_cycles.*,
        COUNT(DISTINCT pin_publish_cycle_categories.id) AS category_count,
        COUNT(DISTINCT pin_publish_schedule_items.id) AS item_count,
        COUNT(DISTINCT
          CASE
            WHEN pin_publish_schedule_items.image_url IS NOT NULL
              AND pin_publish_schedule_items.image_url != ''
              AND pin_publish_schedule_items.title IS NOT NULL
              AND pin_publish_schedule_items.title != ''
              AND pin_publish_schedule_items.description IS NOT NULL
              AND pin_publish_schedule_items.description != ''
            THEN pin_publish_schedule_items.id ELSE NULL
          END
        ) AS filled_item_count
       FROM pin_publish_cycles
       LEFT JOIN pin_publish_cycle_categories
        ON pin_publish_cycle_categories.cycle_id = pin_publish_cycles.id
       LEFT JOIN pin_publish_schedule_items
        ON pin_publish_schedule_items.cycle_id = pin_publish_cycles.id
       GROUP BY pin_publish_cycles.id
       ORDER BY pin_publish_cycles.id DESC`,
    )
    .all() as PinPublishCycleRow[];

  return { items: rows.map(mapPinPublishCycle) };
}

export async function getPinPublishCycle(id: number) {
  const row = getDb()
    .prepare(
      `SELECT
        pin_publish_cycles.*,
        COUNT(DISTINCT pin_publish_cycle_categories.id) AS category_count,
        COUNT(DISTINCT pin_publish_schedule_items.id) AS item_count,
        COUNT(DISTINCT
          CASE
            WHEN pin_publish_schedule_items.image_url IS NOT NULL
              AND pin_publish_schedule_items.image_url != ''
              AND pin_publish_schedule_items.title IS NOT NULL
              AND pin_publish_schedule_items.title != ''
              AND pin_publish_schedule_items.description IS NOT NULL
              AND pin_publish_schedule_items.description != ''
            THEN pin_publish_schedule_items.id ELSE NULL
          END
        ) AS filled_item_count
       FROM pin_publish_cycles
       LEFT JOIN pin_publish_cycle_categories
        ON pin_publish_cycle_categories.cycle_id = pin_publish_cycles.id
       LEFT JOIN pin_publish_schedule_items
        ON pin_publish_schedule_items.cycle_id = pin_publish_cycles.id
       WHERE pin_publish_cycles.id = ?
       GROUP BY pin_publish_cycles.id
       LIMIT 1`,
    )
    .get(id) as PinPublishCycleRow | undefined;

  return row ? mapPinPublishCycle(row) : null;
}

export async function createPinPublishCycle(input: PinPublishCycleInput) {
  const startDate = input.start_date.trim();
  if (!startDate) {
    throw new Error("请选择开始日期。");
  }
  const endDate = input.end_date?.trim() || addDaysToIsoDate(startDate, 6);
  const name = input.name?.trim() || `Pin ${startDate}`;

  if (getInclusiveDateRangeDays(startDate, endDate) < 7) {
    throw new Error("图片周期至少需要 7 天。");
  }

  const timestamp = now();
  const result = getDb()
    .prepare(
      `INSERT INTO pin_publish_cycles (name, start_date, end_date, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending_upload', ?, ?)`,
    )
    .run(name, startDate, endDate, timestamp, timestamp);

  return getPinPublishCycle(Number(result.lastInsertRowid));
}

export async function updatePinPublishCycle(id: number, input: PinPublishCycleInput) {
  assertPinPublishCycleExists(id);
  const startDate = input.start_date.trim();
  if (!startDate) {
    throw new Error("请选择开始日期。");
  }
  const endDate = input.end_date?.trim() || addDaysToIsoDate(startDate, 6);
  const name = input.name?.trim() || `Pin ${startDate}`;

  if (startDate > endDate) {
    throw new Error("开始日期不能晚于结束日期。");
  }
  if (getInclusiveDateRangeDays(startDate, endDate) < 7) {
    throw new Error("图片周期至少需要 7 天。");
  }

  getDb()
    .prepare("UPDATE pin_publish_cycles SET name = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?")
    .run(name, startDate, endDate, now(), id);

  return getPinPublishCycle(id);
}

export async function deletePinPublishCycle(id: number) {
  assertPinPublishCycleExists(id);
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM category_pin_publish_cycles WHERE cycle_id = ?").run(id);
    db.prepare("DELETE FROM pin_publish_category_items WHERE cycle_id = ?").run(id);
    db.prepare("DELETE FROM pin_publish_schedule_items WHERE cycle_id = ?").run(id);
    db.prepare("DELETE FROM pin_publish_cycle_categories WHERE cycle_id = ?").run(id);
    db.prepare("DELETE FROM pin_publish_cycles WHERE id = ?").run(id);
  })();
  invalidateDevCache("categories:list", "categories:summary", "pose-sources:list:*");
}

export async function listPinPublishCycleCategories(cycleId: number) {
  assertPinPublishCycleExists(cycleId);
  const rows = getDb()
    .prepare(
      `SELECT
        pin_publish_cycle_categories.*,
        categories.name AS category_name,
        categories.name_zh AS category_name_zh,
        categories.slug AS category_slug,
        img_source_poses.pose_key AS pose_key,
        img_source_poses.pose_title AS pose_title,
        img_source_poses.pose_title_zh AS pose_title_zh
       FROM pin_publish_cycle_categories
       INNER JOIN categories ON categories.id = pin_publish_cycle_categories.category_id
       LEFT JOIN img_source_poses ON img_source_poses.id = pin_publish_cycle_categories.pose_id
       WHERE pin_publish_cycle_categories.cycle_id = ?
       ORDER BY pin_publish_cycle_categories.day_index ASC`,
    )
    .all(cycleId) as PinPublishCycleCategoryRow[];

  return { items: rows.map(mapPinPublishCycleCategory) };
}

export async function listPinPublishScheduleItems(cycleId: number) {
  assertPinPublishCycleExists(cycleId);
  const rows = getDb()
    .prepare(
      `SELECT
        pin_publish_schedule_items.*,
        COALESCE(pin_publish_schedule_items.board, pin_publish_category_items.board) AS board,
        COALESCE(pin_publish_schedule_items.section, pin_publish_category_items.section) AS section,
        COALESCE(pin_publish_schedule_items.alt_text, pin_publish_category_items.alt_text) AS alt_text,
        COALESCE(pin_publish_schedule_items.tags, pin_publish_category_items.tags) AS tags,
        COALESCE(pin_publish_schedule_items.variant_key, pin_publish_category_items.variant_key) AS variant_key,
        COALESCE(pin_publish_schedule_items.label, pin_publish_category_items.label) AS label,
        categories.name AS source_category_name,
        categories.name_zh AS source_category_name_zh,
        img_source_poses.pose_key AS source_pose_key,
        img_source_poses.pose_title AS source_pose_title,
        img_source_poses.pose_title_zh AS source_pose_title_zh
       FROM pin_publish_schedule_items
       INNER JOIN categories ON categories.id = pin_publish_schedule_items.source_category_id
       LEFT JOIN img_source_poses ON img_source_poses.id = pin_publish_schedule_items.source_pose_id
       LEFT JOIN pin_publish_category_items
        ON pin_publish_category_items.cycle_id = pin_publish_schedule_items.cycle_id
        AND pin_publish_category_items.category_id = pin_publish_schedule_items.source_category_id
        AND (
          pin_publish_schedule_items.source_pose_id IS NULL
          OR pin_publish_category_items.pose_id = pin_publish_schedule_items.source_pose_id
        )
        AND pin_publish_category_items.image_url = pin_publish_schedule_items.image_url
       WHERE pin_publish_schedule_items.cycle_id = ?
       ORDER BY pin_publish_schedule_items.day_index ASC, pin_publish_schedule_items.slot_index ASC`,
    )
    .all(cycleId) as PinPublishScheduleItemRow[];

  return { items: rows.map(mapPinPublishScheduleItem) };
}

export async function setPinPublishCycleCategories(cycleId: number, categoryIds: number[]) {
  assertPinPublishCycleExists(cycleId);
  const uniqueIds = Array.from(new Set(categoryIds.map(Number))).filter((id) => Number.isInteger(id) && id > 0);
  if (uniqueIds.length !== 7) {
    throw new Error("一个 Pin 图发布周期必须选择固定 7 个三级类型。");
  }

  uniqueIds.forEach((categoryId) => {
    const row = getCategoryRowById(categoryId);
    if (!row || getCategoryDepthFromRows(categoryId) !== 3) {
      throw new Error(`分类 ${categoryId} 不是有效的三级类型。`);
    }
  });

  const db = getDb();
  const timestamp = now();
  db.transaction(() => {
    db.prepare("DELETE FROM pin_publish_schedule_items WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM pin_publish_cycle_categories WHERE cycle_id = ?").run(cycleId);
    const insertCategory = db.prepare(
      `INSERT INTO pin_publish_cycle_categories
        (cycle_id, day_index, category_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const insertItem = db.prepare(
      `INSERT INTO pin_publish_schedule_items
        (cycle_id, day_index, slot_index, source_category_id, publish_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    uniqueIds.forEach((categoryId, index) => {
      insertCategory.run(cycleId, index, categoryId, timestamp, timestamp);
    });

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
        const sourceCategoryId = uniqueIds[(dayIndex * 6 + slotIndex) % uniqueIds.length];
        insertItem.run(cycleId, dayIndex, slotIndex, sourceCategoryId, PIN_PUBLISH_TIMES[slotIndex], timestamp, timestamp);
      }
    }

    db.prepare("UPDATE pin_publish_cycles SET status = 'pending_upload', updated_at = ? WHERE id = ?").run(timestamp, cycleId);
  })();

  return {
    categories: await listPinPublishCycleCategories(cycleId),
    items: await listPinPublishScheduleItems(cycleId),
  };
}

export type PinPublishCategoryItemInput = {
  variant_key: string;
  label: string;
  image_url: string;
  title?: string | null;
  description?: string | null;
  link?: string | null;
  board?: string | null;
  section?: string | null;
  alt_text?: string | null;
  tags?: string[] | string | null;
};

function getCycleCategoryRows(cycleId: number) {
  const rows = getDb()
    .prepare(
      `SELECT category_id, pose_id
       FROM pin_publish_cycle_categories
       WHERE cycle_id = ?
       ORDER BY day_index ASC`,
    )
    .all(cycleId) as Array<{ category_id: number; pose_id: number | null }>;

  return rows.map((row) => ({
    category_id: Number(row.category_id),
    pose_id: row.pose_id === null || row.pose_id === undefined ? null : Number(row.pose_id),
  }));
}

function rebuildPinPublishSchedule(cycleId: number) {
  const db = getDb();
  const timestamp = now();
  const cycleRows = getCycleCategoryRows(cycleId);

  db.prepare("DELETE FROM pin_publish_schedule_items WHERE cycle_id = ?").run(cycleId);

  if (cycleRows.length === 0) {
    return;
  }

  const itemsByCategory = new Map<number, Array<{
    category_id: number;
    pose_id: number | null;
    slot_index: number;
    image_url: string;
    title: string | null;
    description: string | null;
    link: string | null;
    board: string | null;
    section: string | null;
    alt_text: string | null;
    tags: string | null;
    variant_key: string | null;
    label: string | null;
  }>>();
  const rows = db
    .prepare(
      `SELECT category_id, pose_id, slot_index, image_url, title, description, link, board, section, alt_text, tags, variant_key, label
       FROM pin_publish_category_items
       WHERE cycle_id = ?
       ORDER BY category_id ASC, slot_index ASC`,
    )
    .all(cycleId) as Array<{
      category_id: number;
      pose_id: number | null;
      slot_index: number;
      image_url: string;
      title: string | null;
      description: string | null;
      link: string | null;
      board: string | null;
      section: string | null;
      alt_text: string | null;
      tags: string | null;
      variant_key: string | null;
      label: string | null;
    }>;

  rows.forEach((row) => {
    const list = itemsByCategory.get(row.category_id) ?? [];
    list.push(row);
    itemsByCategory.set(row.category_id, list);
  });

  const insert = db.prepare(
    `INSERT INTO pin_publish_schedule_items
      (cycle_id, day_index, slot_index, source_category_id, source_pose_id, publish_time, image_url, title, description, pin_url, board, section, alt_text, tags, variant_key, label, uploaded, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  );

  cycleRows.forEach((cycleRow, categoryIndex) => {
    const categoryItems = (itemsByCategory.get(cycleRow.category_id) ?? []).slice(0, 6);
    categoryItems.forEach((categoryItem, variantIndex) => {
      const dayIndex = (categoryIndex + variantIndex) % cycleRows.length;
      insert.run(
        cycleId,
        dayIndex,
        variantIndex,
        cycleRow.category_id,
        categoryItem.pose_id,
        PIN_PUBLISH_TIMES[variantIndex],
        categoryItem.image_url,
        categoryItem.title,
        categoryItem.description,
        categoryItem.link,
        categoryItem.board,
        categoryItem.section,
        categoryItem.alt_text,
        categoryItem.tags,
        categoryItem.variant_key,
        categoryItem.label,
        timestamp,
        timestamp,
      );
    });
  });
}

function getCycleDayCountByTable(tableName: "pin_publish_cycles" | "video_publish_cycles", cycleId: number) {
  const row = getDb()
    .prepare(`SELECT start_date, end_date FROM ${tableName} WHERE id = ? LIMIT 1`)
    .get(cycleId) as { start_date: string; end_date: string } | undefined;
  if (!row) {
    throw new Error("周期不存在。");
  }

  return getInclusiveDateRangeDays(row.start_date, row.end_date);
}

function assertPoseBelongsToCategory(poseId: number, categoryId: number) {
  const pose = getDb()
    .prepare("SELECT category_id FROM img_source_poses WHERE id = ? LIMIT 1")
    .get(poseId) as { category_id: number } | undefined;
  if (!pose || Number(pose.category_id) !== categoryId) {
    throw new Error("姿态不存在或不属于当前三级类型。");
  }
}

function getNextPinCycleDayIndex(cycleId: number) {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM pin_publish_cycle_categories WHERE cycle_id = ?")
    .get(cycleId) as { count: number };

  return Number(row.count);
}

function syncPinCycleDayIndexes(cycleId: number) {
  const rows = getDb()
    .prepare(
      `SELECT category_id
       FROM pin_publish_cycle_categories
       WHERE cycle_id = ?
       ORDER BY day_index ASC, id ASC`,
    )
    .all(cycleId) as Array<{ category_id: number }>;

  const update = getDb().prepare(
    "UPDATE pin_publish_cycle_categories SET day_index = ? WHERE cycle_id = ? AND category_id = ?",
  );
  rows.forEach((row, index) => update.run(index, cycleId, row.category_id));
}

export async function saveCategoryPinItemsToCycle(
  categoryId: number,
  cycleId: number,
  poseId: number,
  items: PinPublishCategoryItemInput[],
) {
  const category = getCategoryRowById(categoryId);
  if (!category || getCategoryDepthFromRows(categoryId) !== 3) {
    throw new Error("只能给三级类型生成 Pin。");
  }
  assertPinPublishCycleExists(cycleId);
  assertPoseBelongsToCategory(poseId, categoryId);
  if (items.length === 0) {
    throw new Error("没有可保存的 Pin 图文。");
  }

  const capacity = getCycleDayCountByTable("pin_publish_cycles", cycleId);
  const db = getDb();
  const timestamp = now();
  const cyclesToRebuild = new Set<number>([cycleId]);

  db.transaction(() => {
    const existingBinding = db
      .prepare("SELECT cycle_id FROM category_pin_publish_cycles WHERE category_id = ? LIMIT 1")
      .get(categoryId) as { cycle_id: number } | undefined;
    if (existingBinding && Number(existingBinding.cycle_id) !== cycleId) {
      const oldCycleId = Number(existingBinding.cycle_id);
      cyclesToRebuild.add(oldCycleId);
      db.prepare("DELETE FROM pin_publish_category_items WHERE cycle_id = ? AND category_id = ?").run(oldCycleId, categoryId);
      db.prepare("DELETE FROM pin_publish_schedule_items WHERE cycle_id = ? AND source_category_id = ?").run(oldCycleId, categoryId);
      db.prepare("DELETE FROM pin_publish_cycle_categories WHERE cycle_id = ? AND category_id = ?").run(oldCycleId, categoryId);
      syncPinCycleDayIndexes(oldCycleId);
    }
    const existingCycleCategory = db
      .prepare("SELECT day_index FROM pin_publish_cycle_categories WHERE cycle_id = ? AND category_id = ? LIMIT 1")
      .get(cycleId, categoryId) as { day_index: number } | undefined;

    if (!existingCycleCategory) {
      const nextDayIndex = getNextPinCycleDayIndex(cycleId);
      if (nextDayIndex >= capacity) {
        throw new Error(`当前图片周期已经满了，需要 ${capacity} 个三级类型。`);
      }
      db.prepare(
        `INSERT INTO pin_publish_cycle_categories (cycle_id, day_index, category_id, pose_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(cycleId, nextDayIndex, categoryId, poseId, timestamp, timestamp);
    } else {
      db.prepare(
        "UPDATE pin_publish_cycle_categories SET pose_id = ?, updated_at = ? WHERE cycle_id = ? AND category_id = ?",
      ).run(poseId, timestamp, cycleId, categoryId);
    }

    db.prepare(
      `INSERT INTO category_pin_publish_cycles (category_id, cycle_id, pose_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(category_id)
       DO UPDATE SET cycle_id = excluded.cycle_id, pose_id = excluded.pose_id, updated_at = excluded.updated_at`,
    ).run(categoryId, cycleId, poseId, timestamp, timestamp);

    db.prepare("DELETE FROM pin_publish_category_items WHERE cycle_id = ? AND category_id = ?").run(cycleId, categoryId);
    const insertItem = db.prepare(
      `INSERT INTO pin_publish_category_items
        (cycle_id, category_id, pose_id, slot_index, variant_key, label, image_url, title, description, link, board, section, alt_text, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    items.slice(0, 6).forEach((item, index) => {
      const tags = Array.isArray(item.tags) ? item.tags.join(", ") : item.tags;
      insertItem.run(
        cycleId,
        categoryId,
        poseId,
        index,
        item.variant_key.trim() || `pin-${index + 1}`,
        item.label.trim() || `Pin ${index + 1}`,
        item.image_url,
        item.title?.trim() || null,
        item.description?.trim() || null,
        item.link?.trim() || null,
        item.board?.trim() || null,
        item.section?.trim() || null,
        item.alt_text?.trim() || null,
        tags?.trim() || null,
        timestamp,
        timestamp,
      );
    });

    db.prepare(
      `UPDATE categories
       SET publish_to_pin = 1, updated_at = ?, local_updated_at = ?
       WHERE id = ?`,
    ).run(timestamp, timestamp, categoryId);

    cyclesToRebuild.forEach((id) => rebuildPinPublishSchedule(id));
    db.prepare("UPDATE pin_publish_cycles SET status = 'pending_upload', updated_at = ? WHERE id = ?").run(timestamp, cycleId);
  })();

  invalidateDevCache("categories:list", "categories:summary", `pose-sources:list:${categoryId}`);
  return {
    category: await getCategoryById(categoryId),
    items: await listPinPublishScheduleItems(cycleId),
  };
}

export async function cancelCategoryPinItems(categoryId: number) {
  const db = getDb();
  const affectedCycles = db
    .prepare(
      `SELECT DISTINCT cycle_id
       FROM pin_publish_category_items
       WHERE category_id = ?
       UNION
       SELECT DISTINCT cycle_id
       FROM pin_publish_cycle_categories
       WHERE category_id = ?`,
    )
    .all(categoryId, categoryId) as Array<{ cycle_id: number }>;
  const timestamp = now();

  db.transaction(() => {
    db.prepare("DELETE FROM pin_publish_category_items WHERE category_id = ?").run(categoryId);
    db.prepare("DELETE FROM pin_publish_schedule_items WHERE source_category_id = ?").run(categoryId);
    db.prepare("DELETE FROM pin_publish_cycle_categories WHERE category_id = ?").run(categoryId);
    db.prepare("DELETE FROM category_pin_publish_cycles WHERE category_id = ?").run(categoryId);
    db.prepare(
      `UPDATE categories
       SET publish_to_pin = 0, updated_at = ?, local_updated_at = ?
       WHERE id = ?`,
    ).run(timestamp, timestamp, categoryId);

    affectedCycles.forEach((row) => {
      syncPinCycleDayIndexes(Number(row.cycle_id));
      rebuildPinPublishSchedule(Number(row.cycle_id));
    });
  })();

  invalidateDevCache("categories:list", "categories:summary", `pose-sources:list:${categoryId}`);
  return getCategoryById(categoryId);
}

export async function removeCategoryFromPinPublishCycle(cycleId: number, categoryId: number) {
  assertPinPublishCycleExists(cycleId);
  const db = getDb();
  const timestamp = now();

  db.transaction(() => {
    db.prepare("DELETE FROM pin_publish_category_items WHERE cycle_id = ? AND category_id = ?").run(cycleId, categoryId);
    db.prepare("DELETE FROM pin_publish_schedule_items WHERE cycle_id = ? AND source_category_id = ?").run(cycleId, categoryId);
    db.prepare("DELETE FROM pin_publish_cycle_categories WHERE cycle_id = ? AND category_id = ?").run(cycleId, categoryId);
    db.prepare("DELETE FROM category_pin_publish_cycles WHERE category_id = ? AND cycle_id = ?").run(categoryId, cycleId);

    const remainingBinding = db
      .prepare("SELECT cycle_id FROM category_pin_publish_cycles WHERE category_id = ? LIMIT 1")
      .get(categoryId) as { cycle_id: number } | undefined;
    if (!remainingBinding) {
      db.prepare(
        `UPDATE categories
         SET publish_to_pin = 0, updated_at = ?, local_updated_at = ?
         WHERE id = ?`,
      ).run(timestamp, timestamp, categoryId);
    }

    syncPinCycleDayIndexes(cycleId);
    rebuildPinPublishSchedule(cycleId);
    db.prepare("UPDATE pin_publish_cycles SET status = 'pending_upload', updated_at = ? WHERE id = ?").run(timestamp, cycleId);
  })();

  invalidateDevCache("categories:list", "categories:summary", `pose-sources:list:${categoryId}`);
  return {
    categories: await listPinPublishCycleCategories(cycleId),
    items: await listPinPublishScheduleItems(cycleId),
  };
}

export type PinPublishScheduleItemInput = {
  publish_time?: string;
  image_url?: string | null;
  title?: string | null;
  description?: string | null;
  pin_url?: string | null;
  uploaded?: boolean;
};

export async function updatePinPublishScheduleItem(id: number, input: PinPublishScheduleItemInput) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM pin_publish_schedule_items WHERE id = ? LIMIT 1")
    .get(id) as PinPublishScheduleItemRow | undefined;
  if (!existing) {
    throw new Error("排期记录不存在。");
  }

  const timestamp = now();
  db.prepare(
    `UPDATE pin_publish_schedule_items
     SET publish_time = ?, image_url = ?, title = ?, description = ?, pin_url = ?, uploaded = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.publish_time?.trim() || existing.publish_time,
    input.image_url === undefined ? existing.image_url : input.image_url?.trim() || null,
    input.title === undefined ? existing.title : input.title?.trim() || null,
    input.description === undefined ? existing.description : input.description?.trim() || null,
    input.pin_url === undefined ? existing.pin_url : input.pin_url?.trim() || null,
    input.uploaded === undefined ? (existing.uploaded ? 1 : 0) : input.uploaded ? 1 : 0,
    timestamp,
    id,
  );

  return listPinPublishScheduleItems(Number(existing.cycle_id));
}

export async function completePinPublishCycle(id: number) {
  assertPinPublishCycleExists(id);
  getDb().prepare("UPDATE pin_publish_cycles SET status = 'uploaded', updated_at = ? WHERE id = ?").run(now(), id);
  return getPinPublishCycle(id);
}

export async function bindCategoryPinPublishCycle(categoryId: number, cycleId: number | null) {
  const category = getCategoryRowById(categoryId);
  if (!category || getCategoryDepthFromRows(categoryId) !== 3) {
    throw new Error("只能给三级类型绑定 Pin 图发布周期。");
  }

  const db = getDb();
  const timestamp = now();
  if (cycleId === null) {
    db.prepare("DELETE FROM category_pin_publish_cycles WHERE category_id = ?").run(categoryId);
    db.prepare(
      `UPDATE categories
       SET publish_to_pin = 0, updated_at = ?, local_updated_at = ?
       WHERE id = ?`,
    ).run(timestamp, timestamp, categoryId);
  } else {
    assertPinPublishCycleExists(cycleId);
    db.prepare(
      `INSERT INTO category_pin_publish_cycles (category_id, cycle_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(category_id)
       DO UPDATE SET cycle_id = excluded.cycle_id, updated_at = excluded.updated_at`,
    ).run(categoryId, cycleId, timestamp, timestamp);
    db.prepare(
      `UPDATE categories
       SET publish_to_pin = 1, updated_at = ?, local_updated_at = ?
       WHERE id = ?`,
    ).run(timestamp, timestamp, categoryId);
  }

  invalidateDevCache("categories:list", "categories:summary");
  return getCategoryById(categoryId);
}

function assertVideoPublishCycleExists(cycleId: number) {
  const row = getDb()
    .prepare("SELECT id FROM video_publish_cycles WHERE id = ? LIMIT 1")
    .get(cycleId) as { id: number } | undefined;

  if (!row) {
    throw new Error("视频发布周期不存在。");
  }
}

export type VideoPublishCycleInput = {
  name?: string;
  start_date: string;
  end_date?: string;
};

export async function listVideoPublishCycles() {
  const rows = getDb()
    .prepare(
      `SELECT
        video_publish_cycles.*,
        COUNT(DISTINCT category_video_publish_cycles.category_id) AS category_count,
        COUNT(DISTINCT generated_videos.id) AS video_count
       FROM video_publish_cycles
       LEFT JOIN category_video_publish_cycles
        ON category_video_publish_cycles.cycle_id = video_publish_cycles.id
       LEFT JOIN generated_videos
        ON generated_videos.cycle_id = video_publish_cycles.id
       GROUP BY video_publish_cycles.id
       ORDER BY video_publish_cycles.id DESC`,
    )
    .all() as VideoPublishCycleRow[];

  return { items: rows.map(mapVideoPublishCycle) };
}

export async function getVideoPublishCycle(id: number) {
  const row = getDb()
    .prepare(
      `SELECT
        video_publish_cycles.*,
        COUNT(DISTINCT category_video_publish_cycles.category_id) AS category_count,
        COUNT(DISTINCT generated_videos.id) AS video_count
       FROM video_publish_cycles
       LEFT JOIN category_video_publish_cycles
        ON category_video_publish_cycles.cycle_id = video_publish_cycles.id
       LEFT JOIN generated_videos
        ON generated_videos.cycle_id = video_publish_cycles.id
       WHERE video_publish_cycles.id = ?
       GROUP BY video_publish_cycles.id
       LIMIT 1`,
    )
    .get(id) as VideoPublishCycleRow | undefined;

  return row ? mapVideoPublishCycle(row) : null;
}

export async function createVideoPublishCycle(input: VideoPublishCycleInput) {
  const startDate = input.start_date.trim();
  if (!startDate) {
    throw new Error("请选择开始日期。");
  }

  const endDate = input.end_date?.trim() || addDaysToIsoDate(startDate, 1);
  if (getInclusiveDateRangeDays(startDate, endDate) < 2) {
    throw new Error("视频周期至少需要 2 天。");
  }
  const name = input.name?.trim() || `Video ${startDate}`;
  const timestamp = now();
  const result = getDb()
    .prepare(
      `INSERT INTO video_publish_cycles (name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(name, startDate, endDate, timestamp, timestamp);

  return getVideoPublishCycle(Number(result.lastInsertRowid));
}

export async function updateVideoPublishCycle(id: number, input: VideoPublishCycleInput) {
  assertVideoPublishCycleExists(id);
  const startDate = input.start_date.trim();
  if (!startDate) {
    throw new Error("请选择开始日期。");
  }

  const endDate = input.end_date?.trim() || addDaysToIsoDate(startDate, 1);
  if (getInclusiveDateRangeDays(startDate, endDate) < 2) {
    throw new Error("视频周期至少需要 2 天。");
  }
  const name = input.name?.trim() || `Video ${startDate}`;

  getDb()
    .prepare("UPDATE video_publish_cycles SET name = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?")
    .run(name, startDate, endDate, now(), id);

  return getVideoPublishCycle(id);
}

export async function deleteVideoPublishCycle(id: number) {
  assertVideoPublishCycleExists(id);
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM generated_videos WHERE cycle_id = ?").run(id);
    db.prepare("DELETE FROM category_video_publish_cycles WHERE cycle_id = ?").run(id);
    db.prepare("DELETE FROM video_publish_cycles WHERE id = ?").run(id);
  })();
  invalidateDevCache("categories:list", "categories:summary", "pose-sources:list:*");
}

export type GeneratedVideoInput = {
  cycle_id: number;
  category_id: number;
  /** 按姿态生成时必填，与 ux_generated_videos_cycle_pose 对应 */
  pose_id: number | null;
  local_file_path: string;
  asset_color_path: string;
  asset_outline_path: string;
  asset_scene_color_path: string;
  template_version: string;
  status?: "generated" | "failed";
  error_message?: string | null;
};

function syncVideoGeneratedSlots(cycleId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT category_id
       FROM category_video_publish_cycles
       WHERE cycle_id = ?
       ORDER BY created_at ASC, category_id ASC`,
    )
    .all(cycleId) as Array<{ category_id: number }>;
  const update = db.prepare(
    "UPDATE generated_videos SET day_index = ?, slot_index = ?, updated_at = ? WHERE cycle_id = ? AND category_id = ?",
  );
  const timestamp = now();
  rows.forEach((row, index) => {
    update.run(index, 0, timestamp, cycleId, Number(row.category_id));
  });
}

export async function saveGeneratedVideoToCycle(input: GeneratedVideoInput) {
  const category = getCategoryRowById(input.category_id);
  if (!category || getCategoryDepthFromRows(input.category_id) !== 3) {
    throw new Error("只能给三级类型生成视频。");
  }

  if (input.pose_id !== null && input.pose_id !== undefined) {
    const poseRow = getDb()
      .prepare("SELECT category_id FROM img_source_poses WHERE id = ? LIMIT 1")
      .get(input.pose_id) as { category_id: number } | undefined;
    if (!poseRow || poseRow.category_id !== input.category_id) {
      throw new Error("姿态不属于当前分类。");
    }
  }

  assertVideoPublishCycleExists(input.cycle_id);

  const db = getDb();
  const timestamp = now();
  const capacity = getCycleDayCountByTable("video_publish_cycles", input.cycle_id);
  const cyclesToSync = new Set<number>([input.cycle_id]);
  db.transaction(() => {
    const existingBinding = db
      .prepare("SELECT cycle_id FROM category_video_publish_cycles WHERE category_id = ? LIMIT 1")
      .get(input.category_id) as { cycle_id: number } | undefined;
    const existingInCycle = db
      .prepare("SELECT category_id FROM category_video_publish_cycles WHERE cycle_id = ? AND category_id = ? LIMIT 1")
      .get(input.cycle_id, input.category_id) as { category_id: number } | undefined;

    if (!existingInCycle) {
      const countRow = db
        .prepare("SELECT COUNT(*) AS count FROM category_video_publish_cycles WHERE cycle_id = ?")
        .get(input.cycle_id) as { count: number };
      if (Number(countRow.count) >= capacity && existingBinding?.cycle_id !== input.cycle_id) {
        throw new Error(`当前视频周期已经满了，需要 ${capacity} 个三级类型。`);
      }
    }

    if (existingBinding && Number(existingBinding.cycle_id) !== input.cycle_id) {
      cyclesToSync.add(Number(existingBinding.cycle_id));
      db.prepare("DELETE FROM generated_videos WHERE cycle_id = ? AND category_id = ?").run(
        Number(existingBinding.cycle_id),
        input.category_id,
      );
      db.prepare("DELETE FROM category_video_publish_cycles WHERE category_id = ?").run(input.category_id);
    }

    db.prepare(
      `INSERT INTO category_video_publish_cycles (category_id, cycle_id, pose_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(category_id)
       DO UPDATE SET cycle_id = excluded.cycle_id, pose_id = excluded.pose_id, updated_at = excluded.updated_at`,
    ).run(input.category_id, input.cycle_id, input.pose_id, timestamp, timestamp);

    const orderRows = db
      .prepare(
        `SELECT category_id
         FROM category_video_publish_cycles
         WHERE cycle_id = ?
         ORDER BY created_at ASC, category_id ASC`,
      )
      .all(input.cycle_id) as Array<{ category_id: number }>;
    const orderIndex = Math.max(
      0,
      orderRows.findIndex((row) => Number(row.category_id) === input.category_id),
    );
    const dayIndex = orderIndex;
    const slotIndex = 0;

    const poseId = input.pose_id;
    db.prepare("DELETE FROM generated_videos WHERE cycle_id = ? AND category_id = ?").run(
      input.cycle_id,
      input.category_id,
    );

    db.prepare(
      `INSERT INTO generated_videos
        (
          cycle_id,
          category_id,
          pose_id,
          day_index,
          slot_index,
          local_file_path,
          asset_color_path,
          asset_outline_path,
          asset_scene_color_path,
          template_version,
          status,
          error_message,
          created_at,
          updated_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.cycle_id,
      input.category_id,
      poseId,
      dayIndex,
      slotIndex,
      input.local_file_path.trim(),
      input.asset_color_path.trim(),
      input.asset_outline_path.trim(),
      input.asset_scene_color_path.trim(),
      input.template_version.trim(),
      input.status ?? "generated",
      input.error_message?.trim() || null,
      timestamp,
      timestamp,
    );
    cyclesToSync.forEach((id) => syncVideoGeneratedSlots(id));
  })();
  invalidateDevCache("categories:list", "categories:summary", `pose-sources:list:${input.category_id}`);

  const dbAfter = getDb();
  const row = dbAfter
    .prepare(
      `SELECT
        generated_videos.*,
        categories.name AS category_name,
        categories.name_zh AS category_name_zh,
        grandparent_categories.slug AS category_level1_slug,
        parent_categories.slug AS category_level2_slug,
        categories.slug AS category_level3_slug,
        img_source_poses.pose_key AS pose_key,
        img_source_poses.pose_title AS pose_title,
        img_source_poses.pose_title_zh AS pose_title_zh
       FROM generated_videos
       INNER JOIN categories ON categories.id = generated_videos.category_id
       LEFT JOIN categories parent_categories ON parent_categories.id = categories.parent_id
       LEFT JOIN categories grandparent_categories ON grandparent_categories.id = parent_categories.parent_id
       LEFT JOIN img_source_poses ON img_source_poses.id = generated_videos.pose_id
       WHERE generated_videos.cycle_id = ?
         AND generated_videos.category_id = ?
       ORDER BY generated_videos.id DESC
       LIMIT 1`,
    )
    .get(input.cycle_id, input.category_id) as GeneratedVideoRow | undefined;

  if (!row) {
    throw new Error("视频记录保存失败。");
  }

  return mapGeneratedVideo(row);
}

export async function listGeneratedVideos(cycleId?: number) {
  const db = getDb();
  const where = cycleId ? "WHERE generated_videos.cycle_id = ?" : "";
  const params = cycleId ? [cycleId] : [];
  const rows = db
    .prepare(
      `SELECT
        generated_videos.*,
        categories.name AS category_name,
        categories.name_zh AS category_name_zh,
        grandparent_categories.slug AS category_level1_slug,
        parent_categories.slug AS category_level2_slug,
        categories.slug AS category_level3_slug,
        img_source_poses.pose_key AS pose_key,
        img_source_poses.pose_title AS pose_title,
        img_source_poses.pose_title_zh AS pose_title_zh
       FROM generated_videos
       INNER JOIN categories ON categories.id = generated_videos.category_id
       LEFT JOIN categories parent_categories ON parent_categories.id = categories.parent_id
       LEFT JOIN categories grandparent_categories ON grandparent_categories.id = parent_categories.parent_id
       LEFT JOIN img_source_poses ON img_source_poses.id = generated_videos.pose_id
       ${where}
       ORDER BY
        generated_videos.day_index ASC,
        generated_videos.slot_index ASC,
        generated_videos.id ASC`,
    )
    .all(...params) as GeneratedVideoRow[];

  return { items: rows.map(mapGeneratedVideo) };
}

export type GeneratedVideoUpdateInput = {
  uploaded?: boolean;
};

export async function updateGeneratedVideo(id: number, input: GeneratedVideoUpdateInput) {
  const db = getDb();
  const existing = db
    .prepare("SELECT id, cycle_id, uploaded FROM generated_videos WHERE id = ? LIMIT 1")
    .get(id) as { id: number; cycle_id: number; uploaded: number } | undefined;

  if (!existing) {
    throw new Error("视频数据不存在。");
  }

  db.prepare("UPDATE generated_videos SET uploaded = ?, updated_at = ? WHERE id = ?").run(
    input.uploaded === undefined ? (existing.uploaded ? 1 : 0) : input.uploaded ? 1 : 0,
    now(),
    id,
  );

  return listGeneratedVideos(Number(existing.cycle_id));
}

export async function deleteGeneratedVideo(id: number) {
  const db = getDb();
  const row = db
    .prepare("SELECT cycle_id, category_id, local_file_path FROM generated_videos WHERE id = ? LIMIT 1")
    .get(id) as { cycle_id: number; category_id: number; local_file_path?: string } | undefined;

  if (!row) {
    throw new Error("视频数据不存在。");
  }

  db.transaction(() => {
    db.prepare("DELETE FROM generated_videos WHERE id = ?").run(id);
    db.prepare("DELETE FROM category_video_publish_cycles WHERE cycle_id = ? AND category_id = ?").run(
      row.cycle_id,
      row.category_id,
    );
    syncVideoGeneratedSlots(row.cycle_id);
  })();
  invalidateDevCache("categories:list", "categories:summary", `pose-sources:list:${row.category_id}`);
  await deleteManagedFile(row.local_file_path);
}

export async function deleteCategory(id: number) {
  const db = getDb();
  const subtreeRows = collectCategorySubtreeRows(id);

  if (subtreeRows.length === 0) {
    throw new Error("分类不存在。");
  }
  const categoryIds = subtreeRows.map((row) => row.id);
  const imgRows = db
    .prepare(
      `SELECT id
       FROM imgs
       WHERE deleted_at IS NULL
         AND category_id IN (${categoryIds.map(() => "?").join(", ")})`,
    )
    .all(...categoryIds) as Array<{ id: number }>;
  const imgIds = imgRows.map((row) => row.id);

  if (imgIds.length > 0) {
    await deleteImgsBatch(imgIds);
  }

  const timestamp = now();
  const categoryPathRows = db
    .prepare("SELECT id, parent_id, slug FROM categories")
    .all() as Array<Pick<CategoryRow, "id" | "parent_id" | "slug">>;
  const categoryRowsById = new Map(categoryPathRows.map((row) => [row.id, row]));

  for (const row of subtreeRows) {
    await deleteImgSourcesByCategory(row.id);
  }

  const localCategoryDeletes: Array<{
    imageIds: string[];
    objectKeys: Array<string | null>;
  }> = [];

  db.transaction(() => {
    subtreeRows.forEach((row) => {
      const currentCoverImage = normalizeCategoryImageId(
        (row as Record<string, unknown>).cover_image,
      );
      const deletedImageIds = collectReferencedCategoryImageIds({
        cover_image: currentCoverImage,
      });
      const splitDeletes = splitCategoryImageDeletes(deletedImageIds);
      const localOnlyIds = row.remote_id ? splitDeletes.localOnlyIds : deletedImageIds;
      const remoteIds = row.remote_id ? splitDeletes.remoteIds : [];
      const currentCoverImageObjectKey = currentCoverImage
        ? buildCategoryImageObjectKeysForCategory({
            categoryId: row.id,
            imageId: currentCoverImage,
            rowsById: categoryRowsById,
          })
        : [];
      const remoteDeleteKeys = new Map(
        remoteIds.map((imageId) => [
          imageId,
          buildCategoryImageObjectKeysForCategory({
            categoryId: row.id,
            imageId,
            rowsById: categoryRowsById,
          }).map((item) => item.objectKey),
        ]),
      );

      db.prepare(
        "UPDATE categories SET deleted_at = ?, updated_at = ?, local_updated_at = ?, sync_status = 'pending_delete' WHERE id = ?",
      ).run(timestamp, timestamp, timestamp, row.id);
      queueOutbox(db, {
        entityType: "category",
        entityId: row.id,
        operation: "delete",
        payload: { id: row.id },
      });
      deleteQueuedCategoryImageDeletes(db, localOnlyIds);
      remoteIds.forEach((imageId) => {
        queueCategoryImageKeySetDelete(
          db,
          imageId,
          remoteDeleteKeys.get(imageId) ?? [buildLegacyRemoteCategoryImageKey(imageId)],
        );
      });
      localCategoryDeletes.push({
        imageIds: deletedImageIds,
        objectKeys: currentCoverImageObjectKey.map((item) => item.objectKey),
      });
    });
  })();

  await Promise.all(
    localCategoryDeletes.flatMap(({ imageIds, objectKeys }) =>
      imageIds.map((imageId) => deleteCategoryImageLocalFiles(imageId, objectKeys)),
    ),
  );

  invalidateDevCache("categories:list", "categories:summary");
}

export async function getCategoryById(id: number) {
  const row = getCategoryRowById(id);
  return row ? mapCategory(row) : null;
}

export async function getCategorySlugPathSegments(categoryId: number) {
  const segments: string[] = [];
  let cursorId: number | null = categoryId;

  while (cursorId !== null) {
    const row = getCategoryRowById(cursorId);

    if (!row) {
      throw new Error("分类不存在。");
    }

    segments.unshift(row.slug);
    cursorId = row.parent_id;
  }

  return segments;
}

export async function listBacklinkExchanges() {
  return withDevCache("backlinks:list", async () => {
    const rows = getDb()
      .prepare(
        `SELECT *
         FROM backlink_exchanges
         ORDER BY
          CASE status
            WHEN 'uncontacted' THEN 1
            WHEN 'email_sent' THEN 2
            WHEN 'communicating' THEN 3
            WHEN 'contacted' THEN 4
            ELSE 1
          END ASC,
          priority ASC,
          updated_at DESC,
          id ASC`,
      )
      .all() as BacklinkExchangeRow[];

    return {
      items: rows.map(mapBacklinkExchange),
    };
  });
}

export async function getBacklinkExchangeById(id: number) {
  const row = getDb()
    .prepare("SELECT * FROM backlink_exchanges WHERE id = ?")
    .get(id) as BacklinkExchangeRow | undefined;

  return row ? mapBacklinkExchange(row) : null;
}

export async function createBacklinkExchange(input: BacklinkExchangeInput) {
  const domain = normalizeDomain(input.domain);
  const siteName = input.site_name?.trim() || domain;

  if (!domain) {
    throw new Error("域名不能为空。");
  }

  if (!siteName) {
    throw new Error("网站名称不能为空。");
  }

  const timestamp = now();
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO backlink_exchanges (
        domain, site_name, website_url, contact_name, contact_email, contact_url, facebook_url, status, priority,
        topical_fit, pitch_angle, target_url, anchor_text, offered_asset, outreach_email, last_contacted_at,
        next_follow_up_at, response_summary, backlink_url, image_urls, copy_texts, link_type, backlinks, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      domain,
      siteName,
      normalizeWebsiteUrl(domain, input.website_url),
      nullableTrim(input.contact_name),
      nullableTrim(input.contact_email),
      nullableTrim(input.contact_url),
      nullableTrim(input.facebook_url),
      normalizeBacklinkStatus(input.status),
      Number(input.priority ?? 3),
      nullableTrim(input.topical_fit),
      nullableTrim(input.pitch_angle),
      nullableTrim(input.target_url),
      nullableTrim(input.anchor_text),
      nullableTrim(input.offered_asset),
      nullableTrim(input.outreach_email),
      nullableTrim(input.last_contacted_at),
      nullableTrim(input.next_follow_up_at),
      nullableTrim(input.response_summary),
      nullableTrim(input.backlink_url),
      JSON.stringify(normalizeStringList(input.image_urls)),
      JSON.stringify(normalizeStringList(input.copy_texts)),
      normalizeBacklinkLinkType(input.link_type),
      JSON.stringify(normalizeBacklinks(input.backlinks)),
      nullableTrim(input.notes),
      timestamp,
      timestamp,
    );

  invalidateDevCache("backlinks:list");
  return getBacklinkExchangeById(Number(result.lastInsertRowid));
}

export async function updateBacklinkExchange(id: number, input: BacklinkExchangeInput) {
  const existing = await getBacklinkExchangeById(id);

  if (!existing) {
    throw new Error("外链台账不存在。");
  }

  const domain = normalizeDomain(input.domain);
  const siteName = input.site_name?.trim() || domain;

  if (!domain) {
    throw new Error("域名不能为空。");
  }

  if (!siteName) {
    throw new Error("网站名称不能为空。");
  }

  getDb()
    .prepare(
      `UPDATE backlink_exchanges
       SET domain = ?,
        site_name = ?,
        website_url = ?,
        contact_name = ?,
        contact_email = ?,
        contact_url = ?,
        facebook_url = ?,
        status = ?,
        priority = ?,
        topical_fit = ?,
        pitch_angle = ?,
        target_url = ?,
        anchor_text = ?,
        offered_asset = ?,
        outreach_email = ?,
        last_contacted_at = ?,
        next_follow_up_at = ?,
        response_summary = ?,
        backlink_url = ?,
        image_urls = ?,
        copy_texts = ?,
        link_type = ?,
        backlinks = ?,
        notes = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .run(
      domain,
      siteName,
      normalizeWebsiteUrl(domain, input.website_url),
      nullableTrim(input.contact_name),
      nullableTrim(input.contact_email),
      nullableTrim(input.contact_url),
      nullableTrim(input.facebook_url),
      normalizeBacklinkStatus(input.status),
      Number(input.priority ?? 3),
      nullableTrim(input.topical_fit),
      nullableTrim(input.pitch_angle),
      nullableTrim(input.target_url),
      nullableTrim(input.anchor_text),
      nullableTrim(input.offered_asset),
      nullableTrim(input.outreach_email),
      nullableTrim(input.last_contacted_at),
      nullableTrim(input.next_follow_up_at),
      nullableTrim(input.response_summary),
      nullableTrim(input.backlink_url),
      JSON.stringify(normalizeStringList(input.image_urls)),
      JSON.stringify(normalizeStringList(input.copy_texts)),
      normalizeBacklinkLinkType(input.link_type),
      JSON.stringify(normalizeBacklinks(input.backlinks)),
      nullableTrim(input.notes),
      now(),
      id,
    );

  invalidateDevCache("backlinks:list");
  return getBacklinkExchangeById(id);
}

export async function deleteBacklinkExchange(id: number) {
  getDb().prepare("DELETE FROM backlink_exchanges WHERE id = ?").run(id);
  invalidateDevCache("backlinks:list");
}

export async function listActives() {
  return withDevCache("actives:list", async () => {
    const rows = getDb()
      .prepare(
        `SELECT
          actives.*
         FROM actives
         WHERE actives.deleted_at IS NULL
         ORDER BY actives.sort_order ASC, actives.id ASC`,
      )
      .all() as ActiveListRow[];

    return {
      items: rows.map(mapActiveListItem),
    };
  });
}

export async function getActiveById(id: number) {
  const row = getActiveRowById(id);
  return row ? mapActive(row) : null;
}

export async function createActive(input: ActiveInput) {
  if (!input.name.trim()) {
    throw new Error("功能名称不能为空。");
  }

  const db = getDb();
  const timestamp = now();
  const slug = buildUniqueSlug("actives", input.slug?.trim() || input.name);
  const result = db.transaction(() => {
    const insert = db
      .prepare(
        `INSERT INTO actives
          (remote_id, name, slug, description, sort_order, colored_label, created_at, updated_at, sync_status, local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
      )
      .run(
        input.name.trim(),
        slug,
        input.description?.trim() || null,
        input.sort_order ?? 0,
        input.colored_label === true ? 1 : 0,
        timestamp,
        timestamp,
        timestamp,
      );
    const activeId = Number(insert.lastInsertRowid);
    queueOutbox(db, {
      entityType: "active",
      entityId: activeId,
      operation: "create",
      payload: { id: activeId },
    });
    return activeId;
  })();

  invalidateDevCache("actives:list");
  return getActiveById(result);
}

export async function updateActive(id: number, input: ActiveInput) {
  const existing = getActiveRowById(id);

  if (!existing) {
    throw new Error("功能不存在。");
  }

  if (!input.name.trim()) {
    throw new Error("功能名称不能为空。");
  }

  const db = getDb();
  const timestamp = now();
  const slug = buildUniqueSlug("actives", input.slug?.trim() || input.name || existing.name, id);

  db.transaction(() => {
    const nextSyncStatus: SyncStatus =
      existing.sync_status === "pending_create" ? "pending_create" : "pending_update";

    db.prepare(
      `UPDATE actives
       SET name = ?, slug = ?, description = ?, sort_order = ?, colored_label = ?, updated_at = ?, local_updated_at = ?, sync_status = ?
       WHERE id = ?`,
    ).run(
      input.name.trim(),
      slug,
      input.description?.trim() || null,
      input.sort_order ?? 0,
      input.colored_label === true ? 1 : 0,
      timestamp,
      timestamp,
      nextSyncStatus,
      id,
    );
    queueOutbox(db, {
      entityType: "active",
      entityId: id,
      operation: "update",
      payload: { id },
    });
  })();

  invalidateDevCache("actives:list");
  return getActiveById(id);
}

export async function deleteActive(id: number) {
  const db = getDb();
  const imgCount = db
    .prepare("SELECT COUNT(*) AS count FROM imgs WHERE active_id = ? AND deleted_at IS NULL")
    .get(id) as { count: number };
  const existing = getActiveRowById(id);

  if (!existing) {
    throw new Error("功能不存在。");
  }

  if (Number(imgCount.count) > 0) {
    throw new Error("当前功能已关联图片，无法删除。");
  }

  const timestamp = now();
  db.transaction(() => {
    db.prepare(
      "UPDATE actives SET deleted_at = ?, updated_at = ?, local_updated_at = ?, sync_status = 'pending_delete' WHERE id = ?",
    ).run(timestamp, timestamp, timestamp, id);
    queueOutbox(db, {
      entityType: "active",
      entityId: id,
      operation: "delete",
      payload: { id },
    });
  })();

  invalidateDevCache("actives:list");
}

export async function listImgs(filters: ImgFilters = {}) {
  return withDevCache(
    `imgs:list:${filters.category_id ?? "*"}:${filters.active_id ?? "*"}:${filters.is_active === undefined ? "*" : String(filters.is_active)}:${filters.keyword ?? ""}`,
    async () => {
      const conditions = ["imgs.deleted_at IS NULL"];
      const values: Array<string | number> = [];

      if (filters.category_id) {
        conditions.push("imgs.category_id = ?");
        values.push(filters.category_id);
      }

      if (filters.active_id) {
        conditions.push("imgs.active_id = ?");
        values.push(filters.active_id);
      }

      if (typeof filters.is_active === "boolean") {
        conditions.push("imgs.is_active = ?");
        values.push(filters.is_active ? 1 : 0);
      }

      if (filters.keyword?.trim()) {
        conditions.push(
          "(COALESCE(imgs.title, '') LIKE ? OR COALESCE(imgs.slug, '') LIKE ? OR COALESCE(imgs.description, '') LIKE ?)",
        );
        values.push(
          `%${filters.keyword.trim()}%`,
          `%${filters.keyword.trim()}%`,
          `%${filters.keyword.trim()}%`,
        );
      }

      const rows = getDb()
        .prepare(
          `SELECT
            imgs.*,
            categories.name AS category_name,
            actives.name AS active_name
           FROM imgs
           INNER JOIN categories ON categories.id = imgs.category_id
           INNER JOIN actives ON actives.id = imgs.active_id
           WHERE ${conditions.join(" AND ")}
           ORDER BY imgs.sort_order ASC, imgs.id DESC`,
        )
        .all(...values) as ImgRow[];

      return {
        items: rows.map(mapImg),
      };
    },
  );
}

export async function getImgById(id: number) {
  const row = getImgRowById(id);
  return row ? mapImg(row) : null;
}

export async function getImgFormOptions() {
  const [categories, actives] = await Promise.all([
    listCategories(),
    listActives(),
  ]);

  return {
    categories: categories.flat,
    actives: actives.items,
  };
}

export async function createImg(input: ImgInput) {
  assertImgReferences(input);

  const db = getDb();
  const timestamp = now();
  const slug = input.slug?.trim() ? buildUniqueSlug("imgs", input.slug.trim()) : null;
  const difficulty = normalizeImgDifficulty(input.difficulty);
  const isManualUploadDraft =
    input.manual_upload_pending === true &&
    !input.local_file_path?.trim() &&
    !input.local_file_path_card?.trim();
  const result = db.transaction(() => {
    const insert = db
      .prepare(
        `INSERT INTO imgs
          (remote_id, category_id, active_id, image_url, image_url_card, local_file_path, local_file_path_card, answer_image_url, answer_local_file_path, remote_file_key, remote_file_key_card, previous_remote_file_key, previous_remote_file_key_card, file_sync_status, file_hash, title, slug, description, difficulty, sort_order, is_active, created_at, updated_at, sync_status, local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      )
      .run(
        input.category_id,
        input.active_id,
        input.image_url.trim(),
        input.image_url_card.trim(),
        input.local_file_path?.trim() || null,
        input.local_file_path_card?.trim() || null,
        input.answer_image_url?.trim() || null,
        input.answer_local_file_path?.trim() || null,
        isManualUploadDraft
          ? "draft"
          : input.local_file_path?.trim() ||
              input.local_file_path_card?.trim() ||
              input.answer_local_file_path?.trim()
            ? "pending_upload"
            : "synced",
        input.title?.trim() || null,
        slug,
        input.description?.trim() || null,
        difficulty,
        input.sort_order ?? 0,
        input.is_active === false ? 0 : 1,
        timestamp,
        timestamp,
        isManualUploadDraft ? "synced" : "pending_create",
        timestamp,
      );
    const imgId = Number(insert.lastInsertRowid);
    if (!isManualUploadDraft) {
      queueOutbox(db, {
        entityType: "img",
        entityId: imgId,
        operation: "create",
        payload: { id: imgId },
      });
    }
    if (!isManualUploadDraft && (input.local_file_path?.trim() || input.local_file_path_card?.trim())) {
      queueOutbox(db, {
        entityType: "img_file",
        entityId: imgId,
        operation: "upload",
        payload: { id: imgId },
      });
    }
    return imgId;
  })();

  invalidateDevCache("imgs:list*", "actives:list", "categories:list", "categories:summary");
  return getImgById(result);
}

export async function updateImg(id: number, input: ImgInput) {
  const existing = getImgRowById(id);

  if (!existing) {
    throw new Error("图片不存在。");
  }

  assertImgReferences(input, id);

  const db = getDb();
  const timestamp = now();
  const slug = input.slug?.trim()
    ? buildUniqueSlug("imgs", input.slug.trim(), id)
    : null;
  const nextLocalFilePath =
    input.local_file_path !== undefined
      ? input.local_file_path?.trim() || null
      : existing.local_file_path;
  const nextLocalFilePathCard =
    input.local_file_path_card !== undefined
      ? input.local_file_path_card?.trim() || null
      : existing.local_file_path_card;
  const nextImageUrl = input.image_url.trim();
  const nextImageUrlCard = input.image_url_card.trim();
  const nextAnswerImageUrl =
    input.answer_image_url !== undefined
      ? input.answer_image_url?.trim() || null
      : existing.answer_image_url;
  const nextAnswerLocalFilePath =
    input.answer_local_file_path !== undefined
      ? input.answer_local_file_path?.trim() || null
      : existing.answer_local_file_path;
  const nextDifficulty =
    input.difficulty === undefined
      ? existing.difficulty
      : normalizeImgDifficulty(input.difficulty);
  const nextRemoteFileKey = existing.remote_file_key && existing.remote_file_key === existing.image_url
    ? nextImageUrl
    : existing.remote_file_key;
  const nextRemoteFileKeyCard =
    existing.remote_file_key_card && existing.remote_file_key_card === existing.image_url_card
      ? nextImageUrlCard
      : existing.remote_file_key_card;
  const nextPreviousRemoteFileKey =
    existing.remote_file_key && existing.remote_file_key !== nextImageUrl
      ? existing.remote_file_key
      : existing.previous_remote_file_key;
  const nextPreviousRemoteFileKeyCard =
    existing.remote_file_key_card && existing.remote_file_key_card !== nextImageUrlCard
      ? existing.remote_file_key_card
      : existing.previous_remote_file_key_card;
  const nextFileSyncStatus: FileSyncStatus =
    (nextLocalFilePath &&
      (nextLocalFilePath !== existing.local_file_path || nextImageUrl !== existing.image_url)) ||
    (nextLocalFilePathCard &&
      (nextLocalFilePathCard !== existing.local_file_path_card ||
        nextImageUrlCard !== existing.image_url_card)) ||
    (nextAnswerLocalFilePath &&
      (nextAnswerLocalFilePath !== existing.answer_local_file_path ||
        nextAnswerImageUrl !== existing.answer_image_url))
      ? "pending_upload"
      : existing.file_sync_status === "draft" &&
          !nextLocalFilePath &&
          !nextLocalFilePathCard
        ? "draft"
      : nextLocalFilePath || nextLocalFilePathCard || nextAnswerLocalFilePath
        ? existing.file_sync_status
        : (existing.remote_file_key && existing.remote_file_key !== nextImageUrl) ||
            (existing.remote_file_key_card && existing.remote_file_key_card !== nextImageUrlCard)
          ? "pending_delete"
          : "synced";

  db.transaction(() => {
    const nextSyncStatus: SyncStatus =
      nextFileSyncStatus === "draft"
        ? "synced"
        : existing.sync_status === "pending_create" || existing.remote_id === null
          ? "pending_create"
          : "pending_update";

    db.prepare(
      `UPDATE imgs
       SET category_id = ?, active_id = ?, image_url = ?, image_url_card = ?, local_file_path = ?, local_file_path_card = ?, answer_image_url = ?, answer_local_file_path = ?, remote_file_key = ?, remote_file_key_card = ?, previous_remote_file_key = ?, previous_remote_file_key_card = ?, file_sync_status = ?, title = ?, slug = ?, description = ?, difficulty = ?, sort_order = ?, is_active = ?, updated_at = ?, local_updated_at = ?, sync_status = ?
       WHERE id = ?`,
    ).run(
      input.category_id,
      input.active_id,
      nextImageUrl,
      nextImageUrlCard,
      nextLocalFilePath,
      nextLocalFilePathCard,
      nextAnswerImageUrl,
      nextAnswerLocalFilePath,
      nextRemoteFileKey,
      nextRemoteFileKeyCard,
      nextPreviousRemoteFileKey,
      nextPreviousRemoteFileKeyCard,
      nextFileSyncStatus,
      input.title?.trim() || null,
      slug,
      input.description?.trim() || null,
      nextDifficulty,
      input.sort_order ?? 0,
      input.is_active === false ? 0 : 1,
      timestamp,
      timestamp,
      nextSyncStatus,
      id,
    );
    if (nextSyncStatus !== "synced") {
      queueOutbox(db, {
        entityType: "img",
        entityId: id,
        operation: existing.remote_id === null ? "create" : "update",
        payload: { id },
      });
    }
    if (nextFileSyncStatus === "pending_upload") {
      queueOutbox(db, {
        entityType: "img_file",
        entityId: id,
        operation: "upload",
        payload: { id },
      });
    }
  })();

  if (existing.local_file_path && existing.local_file_path !== nextLocalFilePath) {
    await releaseStagedImageFile(existing.local_file_path);
  }

  if (existing.local_file_path_card && existing.local_file_path_card !== nextLocalFilePathCard) {
    await releaseStagedImageFile(existing.local_file_path_card);
  }

  if (
    existing.answer_local_file_path &&
    existing.answer_local_file_path !== nextAnswerLocalFilePath
  ) {
    await releaseStagedImageFile(existing.answer_local_file_path);
  }

  invalidateDevCache("imgs:list*", "actives:list", "categories:list", "categories:summary");
  return getImgById(id);
}

const IMG_SOFT_DELETE_SQL =
  "UPDATE imgs SET deleted_at = ?, updated_at = ?, local_updated_at = ?, sync_status = 'pending_delete', previous_remote_file_key = COALESCE(remote_file_key, image_url), previous_remote_file_key_card = COALESCE(remote_file_key_card, image_url_card), file_sync_status = CASE WHEN remote_file_key IS NOT NULL OR remote_file_key_card IS NOT NULL THEN 'pending_delete' ELSE file_sync_status END WHERE id = ?";

/** 批量软删除；跳过不存在或已删行，返回实际删除条数 */
export async function deleteImgsBatch(ids: number[]) {
  const uniqueIds = [
    ...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)),
  ];
  if (uniqueIds.length === 0) {
    return { deleted: 0 };
  }

  const toDelete: ImgRow[] = [];
  for (const id of uniqueIds) {
    const existing = getImgRowById(id);
    if (existing) {
      toDelete.push(existing);
    }
  }

  if (toDelete.length === 0) {
    return { deleted: 0 };
  }

  const db = getDb();
  const timestamp = now();
  const softDeleteStmt = db.prepare(IMG_SOFT_DELETE_SQL);
  const hardDeleteStmt = db.prepare("DELETE FROM imgs WHERE id = ?");
  const clearPendingImgOutboxStmt = db.prepare(
    "DELETE FROM sync_outbox WHERE entity_type IN ('img', 'img_file') AND entity_id = ? AND status IN ('pending', 'failed', 'syncing')",
  );

  db.transaction(() => {
    for (const existing of toDelete) {
      if (existing.remote_id) {
        softDeleteStmt.run(timestamp, timestamp, timestamp, existing.id);
        queueOutbox(db, {
          entityType: "img",
          entityId: existing.id,
          operation: "delete",
          payload: { id: existing.id },
        });
      } else {
        clearPendingImgOutboxStmt.run(existing.id);
        hardDeleteStmt.run(existing.id);
      }
    }
  })();

  for (const existing of toDelete) {
    if (existing.local_file_path) {
      await deleteManagedFile(existing.local_file_path);
    }
    if (existing.local_file_path_card) {
      await deleteManagedFile(existing.local_file_path_card);
    }
  }

  await removeGeneratedImgIdsFromSources(toDelete.map((item) => item.id));

  invalidateDevCache("imgs:list*", "categories:summary");
  return { deleted: toDelete.length };
}

export async function deleteImg(id: number) {
  const { deleted } = await deleteImgsBatch([id]);
  if (deleted === 0) {
    throw new Error("图片不存在。");
  }
}

export async function clearCategoryImgAssets(categoryId: number) {
  const category = getCategoryRowById(categoryId);

  if (!category || category.deleted_at) {
    throw new Error("分类不存在。");
  }

  const imgRows = getDb()
    .prepare(
      `SELECT id
       FROM imgs
       WHERE deleted_at IS NULL
         AND category_id = ?`,
    )
    .all(categoryId) as Array<{ id: number }>;
  const imgIds = imgRows.map((row) => row.id);
  const imgDeleteResult =
    imgIds.length > 0 ? await deleteImgsBatch(imgIds) : { deleted: 0 };
  const sourceDeleteResult = await deleteImgSourcesByCategory(categoryId);

  invalidateDevCache("imgs:list*", `img-sources:list:${categoryId}`, "img-sources:list:all", "categories:summary");

  return {
    deleted_img_count: imgDeleteResult.deleted,
    deleted_img_source_count: sourceDeleteResult.deleted,
  };
}

export async function clearCategoryGeneratedImgs(categoryId: number) {
  const category = getCategoryRowById(categoryId);

  if (!category || category.deleted_at) {
    throw new Error("分类不存在。");
  }

  const imgRows = getDb()
    .prepare(
      `SELECT id
       FROM imgs
       WHERE deleted_at IS NULL
         AND category_id = ?`,
    )
    .all(categoryId) as Array<{ id: number }>;
  const imgIds = imgRows.map((row) => row.id);
  const imgDeleteResult =
    imgIds.length > 0 ? await deleteImgsBatch(imgIds) : { deleted: 0 };

  invalidateDevCache("imgs:list*", `img-sources:list:${categoryId}`, "img-sources:list:all", "categories:summary");

  return {
    deleted_img_count: imgDeleteResult.deleted,
  };
}

export async function clearCategoryImgSources(categoryId: number) {
  const category = getCategoryRowById(categoryId);

  if (!category || category.deleted_at) {
    throw new Error("分类不存在。");
  }

  const sourceDeleteResult = await deleteImgSourcesByCategory(categoryId);

  invalidateDevCache(`img-sources:list:${categoryId}`, "img-sources:list:all", "categories:summary");

  return {
    deleted_img_source_count: sourceDeleteResult.deleted,
  };
}

function getCategoryAncestorNames(categoryId: number) {
  const rows = getDb()
    .prepare("SELECT id, parent_id, name FROM categories WHERE deleted_at IS NULL")
    .all() as Array<{ id: number; parent_id: number | null; name: string }>;
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const names: string[] = [];
  let cursorId = rowMap.get(categoryId)?.parent_id ?? null;

  while (cursorId !== null) {
    const row = rowMap.get(cursorId);
    if (!row) {
      break;
    }
    names.unshift(row.name);
    cursorId = row.parent_id;
  }

  return names;
}

function serializePosePromptSpecs(
  rows: Array<{
    pose_key: string;
    pose_title: string | null;
    pose_title_zh: string | null;
  }>,
) {
  return JSON.stringify(
    rows.map((row) => {
      const titleEn = row.pose_title?.trim() || row.pose_title_zh?.trim() || "";
      const titleZh = row.pose_title_zh?.trim() || row.pose_title?.trim() || "";
      return {
        key: row.pose_key,
        titleZh,
        titleEn,
      };
    }),
  );
}

function getPoseSourceRowByPoseKey(categoryId: number, poseKey: string) {
  return getDb()
    .prepare(
      `SELECT
        img_source_poses.*,
        categories.name AS category_name,
        categories.slug AS category_slug
       FROM img_source_poses
       INNER JOIN categories ON categories.id = img_source_poses.category_id
       WHERE img_source_poses.category_id = ?
         AND img_source_poses.pose_key = ?
       LIMIT 1`,
    )
    .get(categoryId, poseKey) as PoseSourceRow | undefined;
}

export async function listPoseSourcesByCategory(categoryId: number) {
  const category = getCategoryRowById(categoryId);

  if (!category || category.deleted_at) {
    throw new Error("分类不存在。");
  }

  syncPoseSourceRowsForCategory(categoryId);
  const sourceRows = listImgSourceRowsByCategoryId(categoryId);
  const sourceMap = new Map(sourceRows.map((row) => [row.id, row]));
  const poseRows = listPoseSourceRowsByCategoryId(categoryId);

  return {
    items: poseRows.map((row) => mapPoseSource(row, sourceMap)),
  };
}

export async function getPoseSourceById(id: number) {
  const row = getPoseSourceRowById(id);
  if (!row) {
    return null;
  }

  syncPoseSourceRowsForCategory(row.category_id);
  const freshRow = getPoseSourceRowById(id);
  if (!freshRow) {
    return null;
  }
  const sourceRows = listImgSourceRowsByCategoryId(freshRow.category_id);
  return mapPoseSource(freshRow, new Map(sourceRows.map((item) => [item.id, item])));
}

export async function createPoseSource(categoryId: number) {
  const category = getCategoryRowById(categoryId);

  if (!category || category.deleted_at) {
    throw new Error("分类不存在。");
  }

  syncPoseSourceRowsForCategory(categoryId);
  const currentRows = listPoseSourceRowsByCategoryId(categoryId);
  const usedKeys = new Set(currentRows.map((row) => row.pose_key));
  const nextPoseKey = buildNextPoseKey(usedKeys);
  const nextIndex = currentRows.length + 1;
  const nextSpecsJson = serializePosePromptSpecs([
    ...currentRows.map((row) => ({
      pose_key: row.pose_key,
      pose_title: row.pose_title,
      pose_title_zh: row.pose_title_zh,
    })),
    {
      pose_key: nextPoseKey,
      pose_title: `Pose ${nextIndex}`,
      pose_title_zh: `姿态${nextIndex}`,
    },
  ]);

  await updateCategoryPosePromptSpecsLocal(categoryId, nextSpecsJson);
  const promptPlans = buildPromptPlansFromCategory(
    category.name,
    getCategoryAncestorNames(categoryId),
    nextSpecsJson,
  );
  await syncCategoryPosePromptImgSources(categoryId, promptPlans, {
    replaceExisting: false,
  });

  const createdRow = getPoseSourceRowByPoseKey(categoryId, nextPoseKey);
  if (!createdRow) {
    throw new Error("创建姿态记录失败。");
  }

  return getPoseSourceById(createdRow.id);
}

export async function updatePoseSource(
  id: number,
  input: {
    pose_title?: string | null;
    pose_title_zh?: string | null;
    source_kind?: PoseSourceKind;
    image_url?: string | null;
    local_file_path?: string | null;
  },
) {
  const existing = await getPoseSourceById(id);

  if (!existing) {
    throw new Error("姿态记录不存在。");
  }

  if (input.source_kind) {
    const sourceId =
      input.source_kind === "color"
        ? existing.color.source_id
        : input.source_kind === "outline"
          ? existing.outline.source_id
          : existing.scene_color.source_id;

    if (!sourceId) {
      throw new Error("当前姿态缺少对应的原始图记录。");
    }

    const source = await getImgSourceById(sourceId);
    if (!source) {
      throw new Error("原始图不存在。");
    }

    await updateImgSource(sourceId, {
      source_kind: source.source_kind,
      image_url: input.image_url ?? source.image_url,
      local_file_path: input.local_file_path ?? source.local_file_path,
      title: source.title,
      description: source.description,
      prompt_key: source.prompt_key,
      prompt_group: source.prompt_group,
      prompt_text_zh: source.prompt_text_zh,
      prompt_text_en: source.prompt_text_en,
      sort_order: source.sort_order,
      is_active: source.is_active,
    });

    return getPoseSourceById(id);
  }

  syncPoseSourceRowsForCategory(existing.category_id);
  const currentRows = listPoseSourceRowsByCategoryId(existing.category_id);
  const nextSpecs = currentRows.map((row) => {
    const isTarget = row.id === id;
    const nextTitle = isTarget
      ? input.pose_title?.trim() || row.pose_title?.trim() || row.pose_title_zh?.trim() || ""
      : row.pose_title?.trim() || row.pose_title_zh?.trim() || "";
    const nextTitleZh = isTarget
      ? input.pose_title_zh?.trim() || row.pose_title_zh?.trim() || nextTitle
      : row.pose_title_zh?.trim() || row.pose_title?.trim() || "";

    return {
      pose_key: row.pose_key,
      pose_title: nextTitle || null,
      pose_title_zh: nextTitleZh || null,
    };
  });
  const targetSpec = nextSpecs.find((row) => row.pose_key === existing.pose_key);

  if (!targetSpec || !targetSpec.pose_title?.trim()) {
    throw new Error("请先填写姿态词。");
  }

  const nextSpecsJson = serializePosePromptSpecs(nextSpecs);
  const category = getCategoryRowById(existing.category_id);
  if (!category) {
    throw new Error("分类不存在。");
  }

  await updateCategoryPosePromptSpecsLocal(existing.category_id, nextSpecsJson);
  const promptPlans = buildPromptPlansFromCategory(
    category.name,
    getCategoryAncestorNames(existing.category_id),
    nextSpecsJson,
  );
  await syncCategoryPosePromptImgSources(existing.category_id, promptPlans, {
    replaceExisting: false,
  });

  const refreshedRow = getPoseSourceRowByPoseKey(existing.category_id, existing.pose_key);
  return refreshedRow ? getPoseSourceById(refreshedRow.id) : null;
}

export async function deletePoseSource(id: number) {
  const existing = await getPoseSourceById(id);

  if (!existing) {
    throw new Error("姿态记录不存在。");
  }

  syncPoseSourceRowsForCategory(existing.category_id);
  const currentRows = listPoseSourceRowsByCategoryId(existing.category_id);
  const nextSpecs = currentRows
    .filter((row) => row.id !== id)
    .map((row) => ({
      pose_key: row.pose_key,
      pose_title: row.pose_title,
      pose_title_zh: row.pose_title_zh,
    }));

  await updateCategoryPosePromptSpecsLocal(
    existing.category_id,
    nextSpecs.length > 0 ? serializePosePromptSpecs(nextSpecs) : null,
  );

  const sourceIds = [
    existing.color.source_id,
    existing.outline.source_id,
    existing.scene_color.source_id,
  ].filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0);

  for (const sourceId of sourceIds) {
    await deleteImgSource(sourceId);
  }

  syncPoseSourceRowsForCategory(existing.category_id);
}

export async function listImgSourcesByCategory(categoryId: number) {
  return withDevCache(`img-sources:list:${categoryId}`, async () => {
    const rows = getDb()
      .prepare(
        `SELECT
          img_sources.*,
          categories.name AS category_name,
          categories.slug AS category_slug
         FROM img_sources
         INNER JOIN categories ON categories.id = img_sources.category_id
         WHERE img_sources.category_id = ?
         ORDER BY img_sources.id DESC`,
      )
      .all(categoryId) as ImgSourceRow[];

    return {
      items: rows.map(mapImgSource),
    };
  });
}

export async function listAllImgSources() {
  return withDevCache("img-sources:list:all", async () => {
    const rows = getDb()
      .prepare(
        `SELECT
          img_sources.*,
          categories.name AS category_name,
          categories.slug AS category_slug
         FROM img_sources
         INNER JOIN categories ON categories.id = img_sources.category_id
         WHERE categories.deleted_at IS NULL
         ORDER BY img_sources.category_id ASC, img_sources.sort_order ASC, img_sources.id ASC`,
      )
      .all() as ImgSourceRow[];

    return {
      items: rows.map(mapImgSource),
    };
  });
}

export async function getImgSourceById(id: number) {
  const row = getImgSourceRowById(id);
  return row ? mapImgSource(row) : null;
}

export async function createImgSource(input: ImgSourceInput) {
  assertImgSourceReferences(input);

  const timestamp = now();
  const imageUrl = input.image_url?.trim() || "";
  const localFilePath = input.local_file_path?.trim() || "";
  const result = getDb()
    .prepare(
      `INSERT INTO img_sources
        (
          category_id,
          source_kind,
          image_url,
          local_file_path,
          title,
          description,
          prompt_key,
          prompt_group,
          prompt_text_zh,
          prompt_text_en,
          sort_order,
          is_active,
          created_at,
          updated_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.category_id,
      input.source_kind,
      imageUrl,
      localFilePath,
      input.title?.trim() || null,
      input.description?.trim() || null,
      input.prompt_key?.trim() || null,
      input.prompt_group?.trim() || null,
      input.prompt_text_zh?.trim() || null,
      input.prompt_text_en?.trim() || null,
      input.sort_order ?? 0,
      input.is_active === false ? 0 : 1,
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);

  syncPoseSourceRowsForCategory(input.category_id);
  invalidateDevCache(`img-sources:list:${input.category_id}`, "img-sources:list:all", "categories:summary");
  return getImgSourceById(id);
}

export async function updateImgSource(
  id: number,
  input: Omit<ImgSourceInput, "category_id"> & {
    image_url?: string | null;
    local_file_path?: string | null;
  },
) {
  const existing = getImgSourceRowById(id);

  if (!existing) {
    throw new Error("原始图不存在。");
  }

  const timestamp = now();
  const nextImageUrl =
    input.image_url !== undefined
      ? input.image_url?.trim() || ""
      : existing.image_url ?? "";
  const nextLocalFilePath =
    input.local_file_path !== undefined
      ? input.local_file_path?.trim() || ""
      : existing.local_file_path ?? "";
  getDb()
    .prepare(
      `UPDATE img_sources
       SET source_kind = ?, image_url = ?, local_file_path = ?, title = ?, description = ?, prompt_key = ?, prompt_group = ?, prompt_text_zh = ?, prompt_text_en = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.source_kind,
      nextImageUrl,
      nextLocalFilePath,
      input.title?.trim() || null,
      input.description?.trim() || null,
      input.prompt_key?.trim() || null,
      input.prompt_group?.trim() || null,
      input.prompt_text_zh?.trim() || null,
      input.prompt_text_en?.trim() || null,
      input.sort_order ?? 0,
      input.is_active === false ? 0 : 1,
      timestamp,
      id,
    );

  if (
    existing.local_file_path &&
    existing.local_file_path !== nextLocalFilePath
  ) {
    await deleteManagedFile(existing.local_file_path);
  }

  syncPoseSourceRowsForCategory(existing.category_id);
  invalidateDevCache(`img-sources:list:${existing.category_id}`, "img-sources:list:all", "categories:summary");
  return getImgSourceById(id);
}

export async function updateImgSourcePromptGroup(id: number, promptGroup: string | null) {
  const existing = getImgSourceRowById(id);

  if (!existing) {
    throw new Error("原始图不存在。");
  }

  const normalizedNextPromptGroup = promptGroup?.trim() || null;
  const normalizedCurrentPromptGroup = existing.prompt_group?.trim() || null;
  const normalizedPromptBaseKey = getPoseSourceBaseKey(existing.prompt_key);
  const timestamp = now();
  const db = getDb();

  if (normalizedPromptBaseKey) {
    db.prepare(
      `UPDATE img_sources
       SET prompt_group = ?, updated_at = ?
       WHERE category_id = ?
         AND (prompt_key = ? OR prompt_key LIKE ?)`,
    ).run(
      normalizedNextPromptGroup,
      timestamp,
      existing.category_id,
      normalizedPromptBaseKey,
      `${normalizedPromptBaseKey}:%`,
    );
  } else if (normalizedCurrentPromptGroup) {
    db.prepare(
      `UPDATE img_sources
       SET prompt_group = ?, updated_at = ?
       WHERE category_id = ?
         AND TRIM(COALESCE(prompt_group, '')) = ?`,
    ).run(normalizedNextPromptGroup, timestamp, existing.category_id, normalizedCurrentPromptGroup);
  } else {
    db.prepare("UPDATE img_sources SET prompt_group = ?, updated_at = ? WHERE id = ?").run(
      normalizedNextPromptGroup,
      timestamp,
      id,
    );
  }

  syncPoseSourceRowsForCategory(existing.category_id);
  invalidateDevCache(`img-sources:list:${existing.category_id}`, "img-sources:list:all", "categories:summary");
  return getImgSourceById(id);
}

export async function syncCategoryPosePromptImgSources(
  categoryId: number,
  plans: ImgSourcePromptPlanInput[],
  options?: {
    replaceExisting?: boolean;
  },
) {
  const db = getDb();
  const category = db
    .prepare("SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .get(categoryId) as { id: number } | undefined;

  if (!category) {
    throw new Error("分类不存在。");
  }

  const normalizedPlans = plans.map((plan, index) => ({
    ...plan,
    category_id: categoryId,
    prompt_key: plan.prompt_key.trim(),
    prompt_group: plan.prompt_group.trim(),
    title: plan.title.trim(),
    description: plan.description?.trim() || null,
    prompt_text_zh: plan.prompt_text_zh.trim(),
    prompt_text_en: plan.prompt_text_en.trim(),
    sort_order: plan.sort_order ?? index * 10,
    is_active: plan.is_active !== false,
  }));

  if (options?.replaceExisting) {
    const existingImgs = await listImgs({ category_id: categoryId });
    const existingImgIds = existingImgs.items.map((item) => item.id);
    if (existingImgIds.length > 0) {
      await deleteImgsBatch(existingImgIds);
    }
    await deleteImgSourcesByCategory(categoryId);
  }

  const nextExistingRows = options?.replaceExisting
    ? []
    : listImgSourceRowsByCategoryId(categoryId);
  const existingByPromptKey = new Map(
    nextExistingRows
      .filter((row) => row.prompt_key)
      .map((row) => [row.prompt_key as string, row]),
  );
  const timestamp = now();

  const insertStatement = db.prepare(
    `INSERT INTO img_sources
      (
        category_id,
        source_kind,
        image_url,
        local_file_path,
        generated_img_ids,
        title,
        description,
        prompt_key,
        prompt_group,
        prompt_text_zh,
        prompt_text_en,
        sort_order,
        is_active,
        created_at,
        updated_at
      )
     VALUES (?, ?, '', '', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = db.prepare(
    `UPDATE img_sources
     SET source_kind = ?,
         title = ?,
         description = ?,
         prompt_group = ?,
         prompt_text_zh = ?,
         prompt_text_en = ?,
         sort_order = ?,
         is_active = ?,
         updated_at = ?
     WHERE id = ?`,
  );

  const transaction = db.transaction(() => {
    normalizedPlans.forEach((plan) => {
      const existing = existingByPromptKey.get(plan.prompt_key);
      if (existing) {
        updateStatement.run(
          plan.source_kind,
          plan.title,
          plan.description,
          plan.prompt_group,
          plan.prompt_text_zh,
          plan.prompt_text_en,
          plan.sort_order,
          plan.is_active ? 1 : 0,
          timestamp,
          existing.id,
        );
        return;
      }

      insertStatement.run(
        categoryId,
        plan.source_kind,
        plan.title,
        plan.description,
        plan.prompt_key,
        plan.prompt_group,
        plan.prompt_text_zh,
        plan.prompt_text_en,
        plan.sort_order,
        plan.is_active ? 1 : 0,
        timestamp,
        timestamp,
      );
    });
  });

  transaction();
  syncPoseSourceRowsForCategory(categoryId);
  invalidateDevCache(`img-sources:list:${categoryId}`, "img-sources:list:all", "categories:summary");
  return listImgSourcesByCategory(categoryId);
}

export async function setImgSourceGeneratedImgIds(id: number, imgIds: number[]) {
  const existing = getImgSourceRowById(id);

  if (!existing) {
    throw new Error("原始图不存在。");
  }

  getDb()
    .prepare("UPDATE img_sources SET generated_img_ids = ?, updated_at = ? WHERE id = ?")
    .run(stringifyGeneratedImgIds(imgIds), now(), id);
  upsertPoseSourceRowGeneratedIds(id, imgIds);
  invalidateDevCache(`img-sources:list:${existing.category_id}`, "img-sources:list:all", "categories:summary");
  return getImgSourceById(id);
}

async function removeGeneratedImgIdsFromSources(imgIds: number[]) {
  if (imgIds.length === 0) {
    return;
  }

  const idSet = new Set(imgIds);
  const rows = getDb()
    .prepare("SELECT id, category_id, generated_img_ids FROM img_sources WHERE generated_img_ids IS NOT NULL")
    .all() as Array<{ id: number; category_id: number; generated_img_ids: string | null }>;

  rows.forEach((row) => {
    const currentIds = parseGeneratedImgIds(row.generated_img_ids);
    const nextIds = currentIds.filter((id) => !idSet.has(id));

    if (nextIds.length === currentIds.length) {
      return;
    }

    getDb()
      .prepare("UPDATE img_sources SET generated_img_ids = ?, updated_at = ? WHERE id = ?")
      .run(stringifyGeneratedImgIds(nextIds), now(), row.id);
    upsertPoseSourceRowGeneratedIds(row.id, nextIds);
    invalidateDevCache(`img-sources:list:${row.category_id}`, "img-sources:list:all", "categories:summary");
  });
}

export async function deleteImgSource(id: number) {
  const existing = getImgSourceRowById(id);

  if (!existing) {
    throw new Error("原始图不存在。");
  }

  getDb().prepare("DELETE FROM img_sources WHERE id = ?").run(id);
  if (existing.local_file_path) {
    await deleteManagedFile(existing.local_file_path);
  }
  syncPoseSourceRowsForCategory(existing.category_id);
  invalidateDevCache(`img-sources:list:${existing.category_id}`, "img-sources:list:all", "categories:summary");
}

async function deleteImgSourcesByCategory(categoryId: number) {
  const rows = listImgSourceRowsByCategoryId(categoryId);

  if (rows.length === 0) {
    return { deleted: 0 };
  }

  getDb().prepare("DELETE FROM img_sources WHERE category_id = ?").run(categoryId);

  await Promise.all(
    rows
      .map((row) => row.local_file_path)
      .filter((row): row is string => Boolean(row))
      .map((row) => deleteManagedFile(row)),
  );

  deletePoseSourceRowsByCategory(categoryId);
  invalidateDevCache(`img-sources:list:${categoryId}`, "img-sources:list:all", "categories:summary");
  return { deleted: rows.length };
}

export async function getHomepageConfig() {
  return withDevCache("homepage-config", async () => {
    const row = getHomepageConfigRow();

    if (!row) {
      const db = getDb();
      db.prepare(
        `INSERT INTO homepage_config
          (title, description, hero_image_url, seo_title, seo_description, footer_paragraph, category_printable_counts, total_printable_count, created_at, updated_at)
         VALUES ('', '', '', '', '', '', '{}', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).run();
      const nextRow = getHomepageConfigRow();
      if (!nextRow) {
        throw new Error("首页配置初始化失败。");
      }
      return mapHomepageConfig(nextRow);
    }

    return mapHomepageConfig(row);
  });
}

export async function updateHomepageConfig(input: HomepageConfigInput) {
  const db = getDb();
  const existing = getHomepageConfigRow();
  const timestamp = now();
  let homepageId = existing?.id ?? 0;
  const previousHeroImageUrl = existing?.hero_image_url?.trim() ?? "";
  const nextHeroImageUrl = input.hero_image_url.trim();

  db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE homepage_config
         SET title = ?, description = ?, hero_image_url = ?, seo_title = ?, seo_description = ?, footer_paragraph = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.title.trim(),
        input.description.trim(),
        nextHeroImageUrl,
        input.seo_title.trim(),
        input.seo_description.trim(),
        input.footer_paragraph.trim(),
        timestamp,
        existing.id,
      );
      homepageId = existing.id;
      queueOutbox(db, {
        entityType: "homepage",
        entityId: existing.id,
        operation: "update",
        payload: { id: existing.id },
      });
      return;
    }

    const result = db.prepare(
      `INSERT INTO homepage_config
        (title, description, hero_image_url, seo_title, seo_description, footer_paragraph, category_printable_counts, total_printable_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '{}', 0, ?, ?)`,
    ).run(
      input.title.trim(),
      input.description.trim(),
      nextHeroImageUrl,
      input.seo_title.trim(),
      input.seo_description.trim(),
      input.footer_paragraph.trim(),
      timestamp,
      timestamp,
    );
    homepageId = Number(result.lastInsertRowid);
    queueOutbox(db, {
      entityType: "homepage",
      entityId: homepageId,
      operation: "create",
      payload: { id: homepageId },
    });
  })();

  if (
    previousHeroImageUrl &&
    previousHeroImageUrl !== nextHeroImageUrl &&
    !/^(https?:)?\/\//i.test(previousHeroImageUrl)
  ) {
    await deleteManagedFile(previousHeroImageUrl);
  }

  invalidateDevCache("homepage-config");
  const row = getHomepageConfigRow();
  if (!row) {
    throw new Error("保存首页配置失败。");
  }
  return mapHomepageConfig(row);
}

export async function updateHomepagePrintableStats(input: {
  category_printable_counts: string;
  total_printable_count: number;
}) {
  const db = getDb();
  const timestamp = now();
  const existing = getHomepageConfigRow();

  if (existing) {
    db.prepare(
      `UPDATE homepage_config
       SET category_printable_counts = ?, total_printable_count = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.category_printable_counts,
      input.total_printable_count,
      timestamp,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO homepage_config
        (title, description, hero_image_url, seo_title, seo_description, footer_paragraph, category_printable_counts, total_printable_count, created_at, updated_at)
       VALUES ('', '', '', '', '', '', ?, ?, ?, ?)`,
    ).run(
      input.category_printable_counts,
      input.total_printable_count,
      timestamp,
      timestamp,
    );
  }

  invalidateDevCache("homepage-config");
}

export async function listSyncQueue(statuses: OutboxStatus[] = ["pending", "failed"]) {
  await ensureSyncQueueFromLocalChanges();
  const placeholders = statuses.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT * FROM sync_outbox WHERE status IN (${placeholders}) ORDER BY created_at ASC, id ASC`,
    )
    .all(...statuses) as SyncQueueItem[];

  return rows;
}

export async function getSyncSummary() {
  await ensureSyncQueueFromLocalChanges();
  const db = getDb();
  const [
    pendingRow,
    failedRow,
    lastCategorySyncRow,
    lastActiveSyncRow,
    lastImgSyncRow,
    lastHomepageSyncRow,
    categoryRow,
    activeRow,
    imgRow,
    imgFileRow,
    categoryImageDeleteRow,
  ] = [
    db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'").get() as { count: number },
    db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'failed'").get() as { count: number },
    db.prepare("SELECT MAX(last_synced_at) AS value FROM categories").get() as { value: string | null },
    db.prepare("SELECT MAX(last_synced_at) AS value FROM actives").get() as { value: string | null },
    db.prepare("SELECT MAX(last_synced_at) AS value FROM imgs").get() as { value: string | null },
    db.prepare("SELECT MAX(updated_at) AS value FROM sync_outbox WHERE entity_type = 'homepage' AND status = 'synced'").get() as {
      value: string | null;
    },
    db.prepare("SELECT COUNT(*) AS count FROM categories WHERE sync_status != 'synced' OR deleted_at IS NOT NULL").get() as { count: number },
    db.prepare("SELECT COUNT(*) AS count FROM actives WHERE sync_status != 'synced' OR deleted_at IS NOT NULL").get() as { count: number },
    db.prepare("SELECT COUNT(*) AS count FROM imgs WHERE sync_status != 'synced' OR deleted_at IS NOT NULL").get() as { count: number },
    db.prepare(
      "SELECT COUNT(*) AS count FROM imgs WHERE file_sync_status NOT IN ('synced', 'draft')",
    ).get() as { count: number },
    db.prepare("SELECT COUNT(*) AS count FROM category_image_delete_queue").get() as { count: number },
  ];
  const lastSyncedAt = [
    lastCategorySyncRow.value,
    lastActiveSyncRow.value,
    lastImgSyncRow.value,
    lastHomepageSyncRow.value,
  ]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const pendingDeleteCount = Number(categoryImageDeleteRow.count);

  return {
    pending_count: Number(pendingRow.count) + pendingDeleteCount,
    failed_count: Number(failedRow.count),
    last_synced_at: lastSyncedAt,
    categories_pending: Number(categoryRow.count),
    actives_pending: Number(activeRow.count),
    imgs_pending: Number(imgRow.count),
    files_pending: pendingDeleteCount + Number(imgFileRow.count),
  };
}

export async function markOutboxSyncing(id: number) {
  const result = getDb()
    .prepare(
      "UPDATE sync_outbox SET status = 'syncing', updated_at = ?, last_error = NULL WHERE id = ? AND status IN ('pending', 'failed')",
    )
    .run(now(), id);

  return result.changes > 0;
}

export async function markOutboxFailed(id: number, errorMessage: string) {
  getDb()
    .prepare(
      "UPDATE sync_outbox SET status = 'failed', retry_count = retry_count + 1, last_error = ?, updated_at = ? WHERE id = ?",
    )
    .run(errorMessage, now(), id);
}

export async function markOutboxSynced(id: number) {
  getDb()
    .prepare("UPDATE sync_outbox SET status = 'synced', updated_at = ?, last_error = NULL WHERE id = ?")
    .run(now(), id);
}

export async function retryFailedOutbox() {
  getDb()
    .prepare("UPDATE sync_outbox SET status = 'pending', updated_at = ?, last_error = NULL WHERE status = 'failed'")
    .run(now());
}

async function acquireRuntimeLock(
  name: string,
  owner: string,
  staleAfterMs = 10 * 60 * 1000,
) {
  const db = getDb();
  const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();

  db.prepare("DELETE FROM sync_runtime_lock WHERE name = ? AND locked_at < ?").run(
    name,
    staleBefore,
  );

  try {
    db.prepare("INSERT INTO sync_runtime_lock (name, owner, locked_at) VALUES (?, ?, ?)").run(
      name,
      owner,
      now(),
    );
    return true;
  } catch {
    return false;
  }
}

async function releaseRuntimeLock(name: string, owner: string) {
  getDb()
    .prepare("DELETE FROM sync_runtime_lock WHERE name = ? AND owner = ?")
    .run(name, owner);
}

export async function acquireSyncRuntimeLock(owner: string, staleAfterMs = 10 * 60 * 1000) {
  return acquireRuntimeLock(SYNC_LOCK_NAME, owner, staleAfterMs);
}

export async function releaseSyncRuntimeLock(owner: string) {
  return releaseRuntimeLock(SYNC_LOCK_NAME, owner);
}

export async function recoverAbandonedSyncRuntimeLock() {
  const db = getDb();

  return db.transaction(() => {
    const releasedLocks = db
      .prepare("DELETE FROM sync_runtime_lock WHERE name = ?")
      .run(SYNC_LOCK_NAME).changes;
    const resetOutboxItems = db
      .prepare("UPDATE sync_outbox SET status = 'pending', updated_at = ? WHERE status = 'syncing'")
      .run(now()).changes;

    return {
      released_locks: releasedLocks,
      reset_outbox_items: resetOutboxItems,
    };
  })();
}

function markEntitySynced(table: "categories" | "actives" | "imgs", id: number, data: {
  remote_id: number | null;
  remote_updated_at_snapshot: string | null;
}) {
  const timestamp = now();
  getDb()
    .prepare(
      `UPDATE ${table}
       SET remote_id = ?, sync_status = 'synced', remote_updated_at_snapshot = ?, last_synced_at = ?, updated_at = COALESCE(updated_at, ?)
       WHERE id = ?`,
    )
    .run(data.remote_id, data.remote_updated_at_snapshot, timestamp, timestamp, id);
}

export async function markCategorySynced(id: number, remoteId: number | null, remoteUpdatedAt: string | null) {
  markEntitySynced("categories", id, {
    remote_id: remoteId,
    remote_updated_at_snapshot: remoteUpdatedAt,
  });
  invalidateDevCache("categories:list", "categories:summary");
}

export async function markActiveSynced(id: number, remoteId: number | null, remoteUpdatedAt: string | null) {
  markEntitySynced("actives", id, {
    remote_id: remoteId,
    remote_updated_at_snapshot: remoteUpdatedAt,
  });
  invalidateDevCache("actives:list");
}

export async function markImgSynced(id: number, remoteId: number | null, remoteUpdatedAt: string | null) {
  markEntitySynced("imgs", id, {
    remote_id: remoteId,
    remote_updated_at_snapshot: remoteUpdatedAt,
  });
  invalidateDevCache("imgs:list*", "categories:summary");
}

export async function markImgFileSynced(
  id: number,
  remoteFileKey: string,
  remoteFileKeyCard?: string | null,
) {
  getDb()
    .prepare(
      "UPDATE imgs SET remote_file_key = ?, remote_file_key_card = ?, previous_remote_file_key = NULL, previous_remote_file_key_card = NULL, file_sync_status = 'synced', updated_at = ? WHERE id = ?",
    )
    .run(remoteFileKey, remoteFileKeyCard ?? remoteFileKey, now(), id);
  invalidateDevCache("imgs:list*", "categories:summary");
}

export async function listQueuedCategoryImageDeletes() {
  return getDb()
    .prepare("SELECT image_id, object_key FROM category_image_delete_queue ORDER BY created_at ASC, image_id ASC")
    .all() as Array<{ image_id: string; object_key: string | null }>;
}

export async function removeQueuedCategoryImageDelete(imageId: string) {
  getDb().prepare("DELETE FROM category_image_delete_queue WHERE image_id = ?").run(imageId);
}

export async function releaseStagedImageFile(localFilePath: string) {
  const db = getDb();
  const imgReferenceCount = db
    .prepare("SELECT COUNT(*) AS count FROM imgs WHERE local_file_path = ?")
    .get(localFilePath) as { count: number };
  const imgCardReferenceCount = db
    .prepare("SELECT COUNT(*) AS count FROM imgs WHERE local_file_path_card = ?")
    .get(localFilePath) as { count: number };
  const imgAnswerReferenceCount = db
    .prepare("SELECT COUNT(*) AS count FROM imgs WHERE answer_local_file_path = ?")
    .get(localFilePath) as { count: number };

  const categoryRows = db
    .prepare(
      "SELECT cover_image FROM categories WHERE cover_image IS NOT NULL AND deleted_at IS NULL",
    )
    .all() as Array<{ cover_image: string | null }>;
  const categoryReferenceCount = categoryRows.reduce((count, row) => {
    return count + collectReferencedCategoryImageIds({ cover_image: row.cover_image }).filter(
      (imageId) => buildPendingCategoryImagePath(imageId) === localFilePath,
    ).length;
  }, 0);
  const homepageConfig = db
    .prepare("SELECT hero_image_url FROM homepage_config ORDER BY id DESC LIMIT 1")
    .get() as { hero_image_url: string | null } | undefined;
  const homepageReferenceCount =
    homepageConfig?.hero_image_url &&
    !/^https?:\/\//i.test(homepageConfig.hero_image_url) &&
    buildPendingHomepageImagePath(homepageConfig.hero_image_url) === localFilePath
      ? 1
      : 0;

  if (
    Number(imgReferenceCount.count) > 0 ||
    Number(imgCardReferenceCount.count) > 0 ||
    Number(imgAnswerReferenceCount.count) > 0 ||
    categoryReferenceCount > 0 ||
    homepageReferenceCount > 0
  ) {
    return false;
  }

  const pendingCategoryImageId = getPendingCategoryImageIdFromPath(localFilePath);
  if (pendingCategoryImageId) {
    await Promise.all(
      CATEGORY_IMAGE_SIZES.map((size) =>
        deleteManagedFile(buildPendingCategoryImagePath(pendingCategoryImageId, size)),
      ),
    );
    return true;
  }

  await deleteManagedFile(localFilePath);
  return true;
}

export async function cleanupOrphanedStagedFiles(maxAgeMs = 30 * 60 * 1000) {
  const db = getDb();
  const referenced = new Set<string>();
  (
    db
      .prepare("SELECT local_file_path, local_file_path_card, answer_local_file_path FROM imgs WHERE local_file_path IS NOT NULL OR local_file_path_card IS NOT NULL OR answer_local_file_path IS NOT NULL")
      .all() as Array<{
        local_file_path: string | null;
        local_file_path_card: string | null;
        answer_local_file_path: string | null;
      }>
  ).forEach((item) => {
    if (item.local_file_path) {
      referenced.add(item.local_file_path);
    }
    if (item.local_file_path_card) {
      referenced.add(item.local_file_path_card);
    }
    if (item.answer_local_file_path) {
      referenced.add(item.answer_local_file_path);
    }
  });
  const categoryRows = db
    .prepare(
      "SELECT cover_image FROM categories WHERE cover_image IS NOT NULL AND deleted_at IS NULL",
    )
    .all() as Array<{ cover_image: string | null }>;
  categoryRows.forEach((row) => {
    collectReferencedCategoryImageIds({ cover_image: row.cover_image }).forEach((coverImageId) => {
      CATEGORY_IMAGE_SIZES.forEach((size) => {
        referenced.add(buildPendingCategoryImagePath(coverImageId, size));
      });
    });
  });
  const homepageConfig = db
    .prepare("SELECT hero_image_url FROM homepage_config ORDER BY id DESC LIMIT 1")
    .get() as { hero_image_url: string | null } | undefined;
  if (homepageConfig?.hero_image_url && !/^https?:\/\//i.test(homepageConfig.hero_image_url)) {
    referenced.add(buildPendingHomepageImagePath(homepageConfig.hero_image_url));
  }
  const files = await listPendingManagedFiles();
  let deletedCount = 0;

  for (const file of files) {
    if (referenced.has(file.relative_path)) {
      continue;
    }

    if (Date.now() - file.modified_at_ms < maxAgeMs) {
      continue;
    }

    await deleteManagedFile(file.relative_path);
    deletedCount += 1;
  }

  return deletedCount;
}

export async function getRawCategoryById(id: number) {
  return getCategoryRowById(id, true);
}

export async function getRawActiveById(id: number) {
  return getActiveRowById(id, true);
}

export async function getRawImgById(id: number) {
  return getImgRowById(id, true);
}

export async function listRawCategories() {
  return getDb()
    .prepare("SELECT * FROM categories ORDER BY id ASC")
    .all() as CategoryRow[];
}

export async function listRawActives() {
  return getDb()
    .prepare("SELECT * FROM actives ORDER BY id ASC")
    .all() as ActiveRow[];
}

export async function listRawImgs() {
  return getDb()
    .prepare(
      `SELECT
        imgs.*,
        categories.name AS category_name,
        actives.name AS active_name
       FROM imgs
       INNER JOIN categories ON categories.id = imgs.category_id
       INNER JOIN actives ON actives.id = imgs.active_id
       ORDER BY imgs.id ASC`,
    )
    .all() as ImgRow[];
}

export async function getRawHomepageConfigById(id: number) {
  return getDb()
    .prepare("SELECT * FROM homepage_config WHERE id = ? LIMIT 1")
    .get(id) as HomepageConfigRow | undefined;
}

export async function purgeDeletedCategory(id: number) {
  getDb().prepare("DELETE FROM categories WHERE id = ?").run(id);
  invalidateDevCache("categories:list", "categories:summary");
}

export async function purgeDeletedActive(id: number) {
  getDb().prepare("DELETE FROM actives WHERE id = ?").run(id);
  invalidateDevCache("actives:list");
}

export async function purgeDeletedImg(id: number) {
  getDb().prepare("DELETE FROM imgs WHERE id = ?").run(id);
  invalidateDevCache("imgs:list*", "categories:summary");
}


/**
 * Lightweight summary for category list page.
 * Returns per-category pending sync status and asset counts
 * without loading full imgs/img_sources records.
 */
export async function getCategorySummary() {
  return withDevCache("categories:summary", async () => {
    const db = getDb();

    // Categories with pending img changes (sync_status != synced OR file_sync_status != synced)
    const pendingImgRows = db
      .prepare(
        `SELECT DISTINCT category_id FROM imgs
         WHERE deleted_at IS NULL
           AND (sync_status != 'synced' OR file_sync_status != 'synced')`,
      )
      .all() as Array<{ category_id: number }>;
    const pendingImgCategoryIds = new Set(pendingImgRows.map((r) => r.category_id));

    // Per-category img_source counts (color sources with/without uploaded images)
    const sourceCountRows = db
      .prepare(
        `SELECT
          category_id,
          COUNT(*) AS total,
          SUM(CASE WHEN image_url IS NOT NULL AND image_url != '' AND local_file_path IS NOT NULL AND local_file_path != '' THEN 1 ELSE 0 END) AS uploaded
         FROM img_sources
         WHERE source_kind = 'color'
         GROUP BY category_id`,
      )
      .all() as Array<{ category_id: number; total: number; uploaded: number }>;
    const sourceCountMap: Record<number, { total: number; uploaded: number }> = {};
    for (const r of sourceCountRows) {
      sourceCountMap[r.category_id] = { total: Number(r.total), uploaded: Number(r.uploaded) };
    }

    // Per-category generated img counts
    const imgCountRows = db
      .prepare(
        `SELECT category_id, COUNT(*) AS count FROM imgs WHERE deleted_at IS NULL GROUP BY category_id`,
      )
      .all() as Array<{ category_id: number; count: number }>;
    const imgCountMap: Record<number, number> = {};
    for (const r of imgCountRows) {
      imgCountMap[r.category_id] = Number(r.count);
    }

    return {
      pending_img_category_ids: [...pendingImgCategoryIds],
      source_counts: sourceCountMap,
      img_counts: imgCountMap,
    };
  });
}
