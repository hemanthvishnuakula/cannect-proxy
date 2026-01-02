/**
 * PostCard - Modern Card Stack Design
 *
 * Concept 1: Instagram/Pinterest inspired floating cards
 * - Avatar + header at top (not side-by-side)
 * - Text section with breathing room
 * - Full-width media
 * - Actions in bottom row
 * - Gap between cards
 *
 * Used in:
 * - Feed tabs (Global, Local, Following)
 * - Profile tabs (Posts, Reposts, Replies, Likes)
 * - Search results
 * - Thread replies
 */

import { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Repeat2 } from 'lucide-react-native';
import { PostEmbeds } from './PostEmbeds';
import { PostActions } from './PostActions';
import { RichText } from './RichText';
import { getOptimizedAvatarUrl } from '../../lib/utils/avatar';
import type { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
type PostView = AppBskyFeedDefs.PostView;

// Maximum lines of text before truncation
const MAX_TEXT_LINES = 6;
// Approximate characters that fit in 6 lines
const TRUNCATION_THRESHOLD = 280;

interface PostCardProps {
  /** The feed item (includes reason for reposts) - preferred */
  item?: FeedViewPost;
  /** Raw post view for thread replies and other simple cases */
  post?: PostView;
  /** Called when the post card is tapped */
  onPress?: () => void;
  /** Called when an image is pressed for fullscreen viewing */
  onImagePress?: (images: string[], index: number) => void;
  /** Show as card with margin (default: true) */
  showAsCard?: boolean;
}

// Format relative time
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

export function PostCard({
  item,
  post: rawPost,
  onPress,
  onImagePress,
  showAsCard = true,
}: PostCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  // Support both FeedViewPost (item) and raw PostView (post)
  const post = item?.post ?? rawPost;

  // Guard: must have either item or post
  if (!post) {
    console.warn('PostCard: Neither item nor post provided');
    return null;
  }

  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;

  // Check if text needs truncation
  const textLength = record.text?.length || 0;
  const needsTruncation = textLength > TRUNCATION_THRESHOLD;
  const shouldTruncate = needsTruncation && !isExpanded;

  // Stop event propagation helper
  const stopEvent = useCallback((e: any) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
  }, []);

  // Handle "Show more" tap
  const handleShowMore = useCallback(
    (e: any) => {
      stopEvent(e);
      setIsExpanded(true);
    },
    [stopEvent]
  );

  // Check if this is a repost
  const isRepost = !!item?.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost';
  const repostBy = isRepost ? (item!.reason as any).by : null;

  // Check if cannect user
  const isCannectUser = author.handle.endsWith('.cannect.space');

  // Default navigation handler
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      const uriParts = post.uri.split('/');
      const rkey = uriParts[uriParts.length - 1];
      router.push(`/post/${post.author.did}/${rkey}`);
    }
  };

  // Navigate to author profile
  const handleAuthorPress = () => {
    router.push(`/user/${author.handle}`);
  };

  // Card wrapper styles
  const cardStyles = showAsCard
    ? 'mx-3 my-2 bg-surface rounded-2xl border border-border overflow-hidden'
    : 'border-b border-border';

  return (
    <Pressable onPress={handlePress} className={cardStyles}>
      {/* Repost indicator - outside card header */}
      {isRepost && repostBy && (
        <View className="flex-row items-center px-4 pt-3 pb-1">
          <Repeat2 size={14} color="#6B7280" />
          <Text className="text-text-muted text-xs ml-2 flex-1" numberOfLines={1}>
            Reposted by {repostBy.displayName || repostBy.handle}
          </Text>
        </View>
      )}

      {/* Header Section - Avatar, Name, Handle, Time */}
      <View className="flex-row items-center px-4 pt-4 pb-2">
        {/* Avatar */}
        <Pressable
          onPressIn={stopEvent}
          onPress={(e) => {
            stopEvent(e);
            handleAuthorPress();
          }}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {author.avatar ? (
            <Image
              source={{ uri: getOptimizedAvatarUrl(author.avatar, 48) }}
              className="w-12 h-12 rounded-full bg-surface-elevated"
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              recyclingKey={author.avatar}
            />
          ) : (
            <View className="w-12 h-12 rounded-full bg-surface-elevated items-center justify-center">
              <Text className="text-text-muted text-xl font-medium">
                {author.handle[0].toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Name and Handle */}
        <Pressable
          onPressIn={stopEvent}
          onPress={(e) => {
            stopEvent(e);
            handleAuthorPress();
          }}
          className="flex-1 ml-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <View className="flex-row items-center">
            <Text className="font-semibold text-text-primary text-base" numberOfLines={1}>
              {author.displayName || author.handle}
            </Text>
            {/* Network badge */}
            {isCannectUser ? (
              <View className="ml-2 px-2 py-0.5 rounded-full bg-primary/20">
                <Text className="text-primary text-xs font-medium">cannect</Text>
              </View>
            ) : (
              <View className="ml-2 px-2 py-0.5 rounded-full bg-surface-elevated">
                <Text className="text-text-muted text-xs font-medium">global</Text>
              </View>
            )}
          </View>
          <Text className="text-text-muted text-sm mt-0.5" numberOfLines={1}>
            @{author.handle.replace('.bsky.social', '').replace('.cannect.space', '')}
          </Text>
        </Pressable>

        {/* Time */}
        <Text className="text-text-muted text-sm">{formatTime(record.createdAt)}</Text>
      </View>

      {/* Text Content Section */}
      {record.text && (
        <View className="px-4 py-2">
          <RichText
            text={record.text}
            facets={record.facets}
            numberOfLines={shouldTruncate ? MAX_TEXT_LINES : undefined}
            className="text-base leading-relaxed"
          />

          {/* Show more button */}
          {shouldTruncate && (
            <Pressable
              onPressIn={stopEvent}
              onPress={handleShowMore}
              className="mt-2 self-start"
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-primary font-medium">Show more</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Media/Embeds Section - Full width */}
      {post.embed && (
        <View className="mt-1">
          <PostEmbeds embed={post.embed} onImagePress={onImagePress} fullWidth />
        </View>
      )}

      {/* Actions Section */}
      <View className="px-3 pb-3">
        <PostActions post={post} variant="compact" />
      </View>
    </Pressable>
  );
}
