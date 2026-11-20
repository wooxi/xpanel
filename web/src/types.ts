export interface SessionInfo {
  user: string;
  base: string;
}

export interface OverviewData {
  nodes: number;
  nodes_enabled: number;
  users: number;
  users_active: number;
  traffic_total: number;
  traffic_today: number;
  trend: Array<{ day: string; total: number }>;
}

export interface NodeItem {
  id: number;
  name: string;
  host: string;
  port: number;
  sni: string;
  insecure: number;
  obfs: string;
  obfs_password: string;
  up_mbps: number;
  down_mbps: number;
  port_hopping: string;
  protocol: string;
  flow: string;
  network: string;
  ws_path: string;
  ws_host: string;
  tls_mode: number;
  reality_dest: string;
  reality_server_names: string;
  reality_private_key: string;
  reality_public_key: string;
  reality_short_ids: string;
  cert_path: string;
  key_path: string;
  token: string;
  enabled: number;
  sort: number;
  last_report_at: number | null;
  last_status: string;
  created_at: number;
  online: boolean;
}

export interface UserItem {
  id: number;
  name: string;
  uuid: string;
  sub_token: string;
  sub_url: string;
  expires_at: number | null;
  expires_date: string;
  traffic_limit: number | null;
  traffic_limit_gb: number | null;
  used: number;
  used_gb: number;
  remaining_gb: number | null;
  speed_limit: number;
  device_limit: number;
  banned: number;
  active: boolean;
  expired: boolean;
  over_limit: boolean;
  last_online_at: number | null;
  created_at: number;
  node_ids: number[];
}

export interface LogItem {
  id: number;
  ts: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  action: string;
  message: string;
  meta: string | null;
  ip: string | null;
}

export interface LogsResponse {
  rows: LogItem[];
  total: number;
  sources: Array<{ source: string; c: number }>;
  limit: number;
  offset: number;
}

export interface SettingsData {
  panel_url?: string;
  sub_name?: string;
  pull_interval?: string;
  push_interval?: string;
  admin_user?: string;
}

export interface TemplateData {
  content: string;
  isDefault: boolean;
}

export interface TemplatePreviewData {
  content: string;
  lines: number;
  nodes: number;
  user: string;
}
