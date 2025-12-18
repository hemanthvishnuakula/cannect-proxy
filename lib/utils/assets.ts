/**
 * ✅ Gold Standard Asset Guard
 * Standardizes aspect ratios to prevent layout shifting.
 * Ensures vertical connector lines in Infinite Pivot threads stay aligned.
 */

export const ASSET_RATIOS = {
  SQUARE: 1,
  VIDEO: 16 / 9,
  PORTRAIT: 4 / 5,
  WIDE: 2.35 / 1,
} as const;

/**
 * BlurHash placeholders for different content contexts.
 * These provide immediate visual feedback before images load.
 * Generated with 4x3 component grid for proper validation.
 */
export const BLURHASH_PLACEHOLDERS = {
  // Neutral dark gray gradient - works with any content (matches #0A0A0A background)
  NEUTRAL: "L00000fQfQfQfQfQfQfQfQfQfQfQ",
  // Slightly blue tint - ideal for Global federated content
  GLOBAL: "L03+~pfQfQfQfQfQfQfQfQfQfQfQ",
  // Greenish tint - matches Cannect branding (#10B981)
  CANNECT: "L02rs:fQfQfQfQfQfQfQfQfQfQfQ",
} as const;

/**
 * Determines optimal aspect ratio based on media count.
 * Single images get 16:9 (VIDEO), multiple get 1:1 (SQUARE) for grid layout.
 */
export function getOptimalRatio(mediaCount: number = 0): number {
  if (mediaCount >= 2) return ASSET_RATIOS.SQUARE; // Grid style for multiple images
  return ASSET_RATIOS.VIDEO; // Default for single images/previews
}

/**
 * Selects appropriate blurhash placeholder based on content origin.
 */
export function getPlaceholder(isFederated: boolean = false): string {
  return isFederated ? BLURHASH_PLACEHOLDERS.GLOBAL : BLURHASH_PLACEHOLDERS.NEUTRAL;
}
