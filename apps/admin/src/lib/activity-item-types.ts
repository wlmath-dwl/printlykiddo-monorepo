export const TOPIC_STATUSES = ["draft", "published"] as const;
export const ITEM_STATUSES = ["draft", "published", "archived"] as const;
export const ASSET_TYPES = ["icon", "card", "illustration"] as const;
export const ASSET_STATUSES = ["uploaded", "reviewing", "approved", "rejected"] as const;

export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export type ActivityImageVariants = {
  size_128?: string;
  size_256?: string;
  size_512?: string;
};

export type ActivityTopic = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  cover_path: string | null;
  cover_variants: ActivityImageVariants;
  sort_order: number;
  status: TopicStatus;
  item_count: number;
  item_ids: number[];
  tag_id: number | null;
  tag_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityAsset = {
  id: number;
  item_id: number;
  item_name: string;
  type: AssetType;
  path: string;
  variants: ActivityImageVariants;
  status: AssetStatus;
  created_at: string;
  updated_at: string;
};

export type ActivityItem = {
  id: number;
  name: string;
  slug: string;
  word: string;
  description: string | null;
  related_words: string[];
  status: ItemStatus;
  topic_ids: number[];
  topic_names: string[];
  assets: ActivityAsset[];
  icon: ActivityAsset | null;
  created_at: string;
  updated_at: string;
};

export type ActivityTopicInput = {
  name: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  sort_order?: number;
  status?: TopicStatus;
  item_ids?: number[];
  tag_id?: number | null;
};

export type ActivityItemInput = {
  name: string;
  slug?: string;
  word: string;
  description?: string | null;
  related_words?: string[];
  status?: ItemStatus;
  topic_ids?: number[];
};

export type ActivityTag = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  topic_count: number;
};

export type ActivityTagInput = {
  name: string;
  slug?: string;
  description?: string | null;
  sort_order?: number;
};

export type ActivityAssetInput = {
  item_id: number;
  type: AssetType;
  status?: AssetStatus;
};
