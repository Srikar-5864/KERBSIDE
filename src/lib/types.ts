export type Role='citizen'|'collector'|'admin';
export type Status='reported'|'assigned'|'cleared'|'rejected';
export type Priority='low'|'medium'|'high';

export interface CategoryConfig {
  basePriority: Priority;
  targetHours: number;
  provisional?: boolean;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  'Hazardous or medical waste': { basePriority: 'high', targetHours: 4 },
  'Dead animal': { basePriority: 'high', targetHours: 6 },
  'Overflowing bin': { basePriority: 'medium', targetHours: 24 },
  'Illegal dumping': { basePriority: 'medium', targetHours: 48 },
  'Missed pickup': { basePriority: 'low', targetHours: 24 },
  'Other': { basePriority: 'medium', targetHours: 24, provisional: true },
};

export const CATEGORIES = Object.keys(CATEGORY_CONFIG);

export interface Profile {
  id: string;
  name: string;
  email?: string | null;
  role: Role;
  points: number;
  lat?: number | null;
  lng?: number | null;
  location_at?: string | null;
}

export interface Complaint {
  id: string;
  user_id: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  image_url: string | null;
  status: Status;
  collector_id: string | null;
  resolution_note: string | null;
  done_image_url: string | null;
  upvotes: number; // legacy backwards compatibility
  support: number;
  voters: number;
  base_priority: Priority;
  priority: Priority;
  priority_override: Priority | null;
  override_reason: string | null;
  needs_review: boolean;
  due_at: string;
  cleared_at: string | null;
  created_at: string;
}

export const LABEL: Record<Status, string> = {
  reported: 'Reported',
  assigned: 'Crew on the way',
  cleared: 'Cleared',
  rejected: 'Rejected as fake',
};

export const COLOR: Record<Status, string> = {
  reported: '#c8402f',
  assigned: '#2b6cff',
  cleared: '#2f7d57',
  rejected: '#8892a0',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#c8402f',
  medium: '#d97706',
  low: '#64748b',
};

export const DEPOT: [number, number] = [12.9716, 77.5946];
