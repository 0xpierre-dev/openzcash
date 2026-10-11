export type AccountProfile = {
  nick: string;
  displayName: string | null;
  avatarUrl: string | null;
  shareProfileInDiscussion: boolean;
};

export const MAX_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_ACCOUNT_SETTINGS_BODY_BYTES = MAX_AVATAR_UPLOAD_BYTES + 64 * 1024;
export const MAX_AVATAR_PIXELS = 16_000_000;
export const MAX_AVATAR_DIMENSION = 256;
export const MAX_AVATAR_OUTPUT_BYTES = 128 * 1024;

export type AccountProfileUpdate = {
  displayName: string;
  username?: string;
  shareProfileInDiscussion: boolean;
  avatar?: { bytes: Uint8Array; mimeType: string };
  removeAvatar?: boolean;
};
