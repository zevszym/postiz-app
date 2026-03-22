export const PLATFORM_ASPECT_RATIOS: Record<string, string> = {
  instagram: '1:1',
  facebook: '1:1',
  x: '16:9',
  twitter: '16:9',
  linkedin: '1:1',
  pinterest: '2:3',
  tiktok: '9:16',
  youtube: '16:9',
  threads: '1:1',
  bluesky: '16:9',
};

export function resolveAspectRatio(
  explicit?: string,
  platform?: string
): string | undefined {
  return explicit || (platform ? PLATFORM_ASPECT_RATIOS[platform.toLowerCase()] : undefined);
}
