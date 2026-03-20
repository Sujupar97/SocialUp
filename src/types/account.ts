// Account Types
export type Platform = 'tiktok' | 'instagram' | 'youtube';

export interface Account {
  id: string;
  platform: Platform;
  username: string;
  display_name: string | null;
  profile_photo_url: string | null;
  bio: string | null;
  access_token: string | null;
  refresh_token: string | null;
  is_active: boolean;
  user_id: string | null; // SaaS Tenant ID
  proxy_url: string | null;
  proxy_username: string | null;
  proxy_password: string | null;
  user_agent: string | null;
  channel_id: string | null; // YouTube channel ID
  instagram_user_id: string | null; // Instagram Business Account ID
  facebook_page_id: string | null; // Linked Facebook Page ID
  created_at: string;
  updated_at: string;
}

export interface AccountCreateInput {
  platform: Platform;
  username: string;
  display_name?: string;
  profile_photo_url?: string;
  bio?: string;
}
