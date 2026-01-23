// Account Types
export interface Account {
  id: string;
  platform: 'tiktok' | 'instagram';
  username: string;
  display_name: string | null;
  profile_photo_url: string | null;
  bio: string | null;
  access_token: string | null;
  refresh_token: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountCreateInput {
  platform: 'tiktok' | 'instagram';
  username: string;
  display_name?: string;
  profile_photo_url?: string;
  bio?: string;
}
