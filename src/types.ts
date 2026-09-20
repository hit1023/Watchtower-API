export type WatchRow = {
  id: string;
  url: string;
  instruction: string;
  interval_minutes: number;
  importance_threshold: number;
  enabled: number;
  next_run_at: string;
  created_at: string;
  updated_at: string;
};

export type SnapshotRow = {
  id: string;
  watch_id: string;
  observed_at: string;
  final_url: string;
  status_code: number;
  content_type: string;
  content_hash: string;
  normalized_text: string;
  truncated: number;
  etag: string | null;
  last_modified: string | null;
};

export type EventRow = {
  id: string;
  watch_id: string;
  snapshot_id: string;
  previous_snapshot_id: string | null;
  event_type: string;
  importance: number;
  category: string;
  summary: string;
  details_json: string;
  created_at: string;
};

export type Analysis = {
  importance: number;
  category: string;
  summary: string;
  changes: Array<{ before: string; after: string }>;
};
