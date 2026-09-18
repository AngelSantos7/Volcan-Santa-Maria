import type { AvatarPreset } from './profile-types';

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  'mountain',
  'volcano',
  'pine',
  'compass',
  'hiking',
  'sunrise',
  'forest',
  'summit',
];

export const AVATAR_PRESET_GLYPHS: Record<AvatarPreset, string> = {
  mountain: '▲',
  volcano: '△',
  pine: '⌃',
  compass: '✣',
  hiking: '↗',
  sunrise: '◒',
  forest: '∧∧',
  summit: '◆',
};

export const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function getInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toLocaleUpperCase() || '?';
}

export function getShortName(
  firstName: string,
  lastName: string,
  email = ''
): string {
  const first = firstName.trim().split(/\s+/u)[0] ?? '';
  const last = lastName.trim().split(/\s+/u)[0] ?? '';
  return `${first} ${last}`.trim() || email;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(5, local.length));
  return `${visible}${local.length > visible.length ? '…' : ''}@${domain}`;
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = sourceUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function processAvatarImage(file: File): Promise<Blob> {
  if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
    throw new Error('unsupported_type');
  }
  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error('file_too_large');
  }

  const image = await loadImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const sourceSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = (sourceWidth - sourceSize) / 2;
  const sourceY = (sourceHeight - sourceSize) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('processing_failed');

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    512,
    512
  );
  if ('close' in image && typeof image.close === 'function') image.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.86)
  );
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('processing_failed');
  }
  return blob;
}
