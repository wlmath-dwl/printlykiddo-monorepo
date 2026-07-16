export type SyncStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete"
  | "conflict";

export type FileSyncStatus =
  | "synced"
  | "draft"
  | "pending_upload"
  | "pending_delete"
  | "failed";

export type LocalChangeType = "created" | "updated" | "conflict" | null;

export type CategoryRecord = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  /** 分类中文短译名，仅本地 SQLite，不同步 D1 */
  name_zh: string | null;
  /** 三级分类姿态信息 JSON，仅本地 SQLite，不同步 D1 */
  pose_prompt_specs: string | null;
  /** 是否发布到 Pinterest，仅本地 SQLite，不同步 D1 */
  publish_to_pin: boolean;
  /** 绑定的 Pin 图发布周期，仅本地 SQLite，不同步 D1 */
  pin_publish_cycle_id: number | null;
  /** 绑定的视频发布周期，仅本地 SQLite，不同步 D1 */
  video_publish_cycle_id: number | null;
  cover_image: string | null;
  /** 三级页主图 / OG 图，通常选用带背景彩图原始图并同步到 D1 */
  seo_image_url: string | null;
  sort_order: number;
  is_active: boolean;
  local_change_type: LocalChangeType;
  created_at: string;
  updated_at: string;
};

export type PinPublishCycleStatus = "pending_upload" | "uploaded" | "completed";

export type PinPublishCycleRecord = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: PinPublishCycleStatus;
  category_count: number;
  item_count: number;
  filled_item_count: number;
  created_at: string;
  updated_at: string;
};

export type PinPublishCycleCategoryRecord = {
  id: number;
  cycle_id: number;
  day_index: number;
  category_id: number;
  pose_id: number | null;
  category_name: string;
  category_name_zh: string | null;
  category_slug: string;
  pose_key: string | null;
  pose_title: string | null;
  pose_title_zh: string | null;
  created_at: string;
  updated_at: string;
};

export type PinPublishScheduleItemRecord = {
  id: number;
  cycle_id: number;
  day_index: number;
  slot_index: number;
  source_category_id: number;
  source_pose_id: number | null;
  source_category_name: string;
  source_category_name_zh: string | null;
  source_pose_key: string | null;
  source_pose_title: string | null;
  source_pose_title_zh: string | null;
  publish_time: string;
  image_url: string | null;
  title: string | null;
  description: string | null;
  pin_url: string | null;
  board: string | null;
  section: string | null;
  alt_text: string | null;
  tags: string | null;
  variant_key: string | null;
  label: string | null;
  uploaded: boolean;
  created_at: string;
  updated_at: string;
};

export type VideoPublishCycleRecord = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  category_count: number;
  video_count: number;
  created_at: string;
  updated_at: string;
};

export type GeneratedVideoStatus = "generated" | "failed";

export type GeneratedVideoRecord = {
  id: number;
  cycle_id: number;
  category_id: number;
  /** 对应 img_source_poses.id；按姿态生成视频时使用 */
  pose_id: number | null;
  day_index: number | null;
  slot_index: number | null;
  category_name: string;
  category_name_zh: string | null;
  category_slug_path: string[];
  pose_key: string | null;
  pose_title: string | null;
  pose_title_zh: string | null;
  local_file_path: string;
  asset_color_path: string;
  asset_outline_path: string;
  asset_scene_color_path: string;
  template_version: string;
  status: GeneratedVideoStatus;
  error_message: string | null;
  uploaded: boolean;
  created_at: string;
  updated_at: string;
};

export type BacklinkExchangeStatus =
  | "uncontacted"
  | "email_sent"
  | "communicating"
  | "contacted";

export type BacklinkLinkType = "nofollow" | "dofollow";

export type BacklinkItem = {
  url: string;
  link_type: BacklinkLinkType;
};

export type BacklinkExchangeRecord = {
  id: number;
  domain: string;
  site_name: string;
  website_url: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_url: string | null;
  facebook_url: string | null;
  status: BacklinkExchangeStatus;
  priority: number;
  topical_fit: string | null;
  pitch_angle: string | null;
  target_url: string | null;
  anchor_text: string | null;
  offered_asset: string | null;
  outreach_email: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  response_summary: string | null;
  backlink_url: string | null;
  backlinks: BacklinkItem[];
  image_urls: string[];
  copy_texts: string[];
  link_type: BacklinkLinkType;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CategoryTreeNode = CategoryRecord & {
  children: CategoryTreeNode[];
};

export type CategorySummaryRecord = {
  pending_img_category_ids: number[];
  source_counts: Record<number, { total: number; uploaded: number }>;
  img_counts: Record<number, number>;
};

export type ActiveRecord = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  colored_label: boolean;
  local_change_type: LocalChangeType;
  created_at: string;
  updated_at: string;
};

export type ActiveListItem = ActiveRecord;

export type ImgRecord = {
  id: number;
  category_id: number;
  active_id: number;
  image_url: string;
  image_url_card: string;
  local_file_path: string | null;
  local_file_path_card: string | null;
  answer_image_url: string | null;
  answer_local_file_path: string | null;
  difficulty: number | null;
  file_sync_status: FileSyncStatus;
  title: string | null;
  slug: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  local_change_type: LocalChangeType;
  created_at: string;
  updated_at: string;
};

export type ImgListItem = ImgRecord & {
  category_name: string;
  active_name: string;
};

export type ImgSourceRecord = {
  id: number;
  category_id: number;
  source_kind: "outline" | "color" | "scene_color";
  image_url: string | null;
  local_file_path: string | null;
  generated_img_ids: number[];
  title: string | null;
  description: string | null;
  prompt_key: string | null;
  prompt_group: string | null;
  prompt_text_zh: string | null;
  prompt_text_en: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ImgSourceListItem = ImgSourceRecord & {
  category_name: string;
  category_slug: string;
};

export type PoseSourceKindRecord = {
  source_id: number | null;
  image_url: string | null;
  local_file_path: string | null;
  generated_img_ids: number[];
  prompt_key: string | null;
  prompt_group: string | null;
  prompt_text_zh: string | null;
  prompt_text_en: string | null;
};

export type PoseSourceRecord = {
  id: number;
  category_id: number;
  pose_key: string;
  pose_title: string | null;
  pose_title_zh: string | null;
  pin_publish_cycle_id: number | null;
  video_publish_cycle_id: number | null;
  sort_order: number;
  color: PoseSourceKindRecord;
  outline: PoseSourceKindRecord;
  scene_color: PoseSourceKindRecord;
  created_at: string;
  updated_at: string;
};

export type PoseSourceListItem = PoseSourceRecord & {
  category_name: string;
  category_slug: string;
};

export type ProductPackageStatus = "draft" | "ready" | "archived";

export type ProductPackageItemRecord = {
  id: number;
  package_id: number;
  category_id: number;
  pose_id: number;
  day_index: number | null;
  sort_order: number;
  display_name: string | null;
  category_name: string;
  category_slug: string;
  pose_key: string;
  pose_title: string | null;
  pose_title_zh: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductPackageRecord = {
  id: number;
  parent_category_id: number;
  parent_category_name: string;
  parent_category_slug: string;
  title: string;
  slug: string;
  subtitle: string | null;
  target_label: string;
  audience_note: string | null;
  status: ProductPackageStatus;
  cover_image_url: string | null;
  pdf_file_path: string | null;
  preview_file_path: string | null;
  copy_json: string | null;
  page_plan_json: string | null;
  item_count: number;
  items: ProductPackageItemRecord[];
  created_at: string;
  updated_at: string;
};

export type ProductPackageListItem = Omit<ProductPackageRecord, "items">;

export type SpecialPageStatus = "draft" | "published" | "archived";

export type SpecialPageRecord = {
  id: number;
  remote_id: number | null;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  hero_image_url: string | null;
  card_image_url: string | null;
  theme_color: string;
  status: SpecialPageStatus;
  sort_order: number;
  content_json: string;
  local_change_type: LocalChangeType;
  created_at: string;
  updated_at: string;
};

export type SpecialPageListItem = SpecialPageRecord;

export type HomepageConfigRecord = {
  id: number;
  title: string;
  description: string;
  hero_image_url: string;
  seo_title: string;
  seo_description: string;
  footer_paragraph: string;
  category_printable_counts: string;
  total_printable_count: number;
  created_at: string;
  updated_at: string;
};
