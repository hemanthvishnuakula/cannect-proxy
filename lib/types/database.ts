/**
 * Database Types - Re-exports from generated Supabase types + helper types
 * 
 * This file re-exports the auto-generated Supabase types and adds
 * helper types for common patterns like posts with authors.
 */

// Re-export generated types from Supabase CLI
export type { Database, Json } from "./supabase";
export type { Database as DB } from "./supabase";

import type { Database } from "./supabase";

// =====================================================
// Table row types (shortcuts)
// =====================================================
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Post = Database["public"]["Tables"]["posts"]["Row"];
export type Like = Database["public"]["Tables"]["likes"]["Row"];
export type Repost = Database["public"]["Tables"]["reposts"]["Row"];
export type Follow = Database["public"]["Tables"]["follows"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

// Notification reason type (matches AT Protocol pattern)
export type NotificationReason = Notification["reason"];

// =====================================================
// Extended types with relations
// =====================================================

/** Metadata for externally sourced (federated) content */
export interface ExternalMetadata {
  content?: string;
  author?: {
    id?: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
    handle?: string;
    did?: string;
  };
  media_urls?: string[];
  created_at?: string;
  likes_count?: number;
  reposts_count?: number;
  replies_count?: number;
}

/** Parent post context for thread display */
export interface ParentPostContext {
  author?: {
    username?: string;
    display_name?: string;
  };
}

/** Repost record with reposter info */
export interface RepostWithReposter extends Repost {
  reposter?: Profile;
}

/** Base post with author relation */
export interface BasePostWithAuthor extends Post {
  author: Profile;
  is_liked?: boolean;
  is_reposted_by_me?: boolean;
  // For feed: who reposted this (if shown via repost)
  reposted_by?: Profile | null;
  reposted_at?: string | null;
  // Quoted post (for type='quote')
  quoted_post?: (Post & { 
    author: Profile;
  }) | null;
  // Parent post context for replies
  parent_post?: ParentPostContext | null;
}

/** Local Cannect post (native content) */
export interface LocalPost extends BasePostWithAuthor {
  is_federated?: false;
}

/** 
 * Federated post from external source (e.g., Bluesky)
 * Uses Omit + intersection to properly override external_metadata type
 */
export type FederatedPost = Omit<BasePostWithAuthor, 'external_metadata'> & {
  is_federated: true;
  external_id: string | null;
  external_source: string | null;
  external_metadata: ExternalMetadata | null;
};

/** Discriminated union for all post types */
export type PostWithAuthor = LocalPost | FederatedPost;

/** Type guard for federated posts */
export function isFederatedPost(post: PostWithAuthor): post is FederatedPost {
  return 'is_federated' in post && post.is_federated === true;
}

/** Type guard for posts with external metadata (shadow reposts) */
export function hasExternalMetadata(post: PostWithAuthor): post is FederatedPost {
  return 'external_id' in post && 'external_metadata' in post && 
    post.external_id != null && post.external_metadata != null;
}

/** Notification with actor profile */
export type NotificationWithActor = Notification & {
  actor: Profile;
  post?: Post;
};

// =====================================================
// Legacy aliases for backward compatibility
// =====================================================

/** @deprecated Use thread_parent_id instead */
export type LegacyReplyToId = string | null;

/** @deprecated Use replies_count instead */
export type LegacyCommentsCount = number;

/** @deprecated Use reason instead of type for notifications */
export type LegacyNotificationType = "like" | "follow" | "comment" | "repost" | "mention";
