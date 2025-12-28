/**
 * PostActions - Unified action buttons with built-in optimistic mutations
 * 
 * Single source of truth for all post interaction buttons:
 * - Like/Unlike
 * - Repost/Unrepost
 * - Reply
 * - Share
 * - Options menu
 * 
 * Built-in:
 * - Optimistic updates via mutation hooks
 * - Toggle logic (like → unlike, repost → unrepost)
 * - Visual feedback for active states
 */

import { View, Text, Pressable, Share as RNShare, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  MoreHorizontal,
} from 'lucide-react-native';
import { memo, useCallback, useState } from 'react';
import { useLikePost, useUnlikePost, useRepost, useDeleteRepost } from '../../lib/hooks';
import type { AppBskyFeedDefs } from '@atproto/api';

type PostView = AppBskyFeedDefs.PostView;

interface PostActionsProps {
  /** The post to show actions for */
  post: PostView;
  /** Visual variant: compact for feed, expanded for thread detail */
  variant?: 'compact' | 'expanded';
  /** Called when options button is pressed (for delete, report, etc.) */
  onOptionsPress?: () => void;
  /** Called when repost button is pressed - if provided, shows menu instead of direct repost */
  onRepostPress?: (post: PostView) => void;
  /** Hide reply count (for some layouts) */
  hideReplyCounts?: boolean;
}

export const PostActions = memo(function PostActions({
  post,
  variant = 'compact',
  onOptionsPress,
  onRepostPress,
  hideReplyCounts = false,
}: PostActionsProps) {
  const router = useRouter();
  
  // Mutation hooks with optimistic updates
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const repostMutation = useRepost();
  const unrepostMutation = useDeleteRepost();

  // Local state for immediate feedback (before optimistic update propagates)
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [isRepostLoading, setIsRepostLoading] = useState(false);

  // Derived state
  const isLiked = !!post.viewer?.like;
  const isReposted = !!post.viewer?.repost;
  const likeCount = post.likeCount || 0;
  const repostCount = post.repostCount || 0;
  const replyCount = post.replyCount || 0;

  // Handle like toggle
  const handleLike = useCallback(async () => {
    if (isLikeLoading) return;
    setIsLikeLoading(true);
    
    try {
      if (isLiked && post.viewer?.like) {
        await unlikeMutation.mutateAsync({
          likeUri: post.viewer.like,
          postUri: post.uri,
        });
      } else {
        await likeMutation.mutateAsync({
          uri: post.uri,
          cid: post.cid,
        });
      }
    } catch (error) {
      console.error('Like action failed:', error);
    } finally {
      setIsLikeLoading(false);
    }
  }, [isLiked, isLikeLoading, post, likeMutation, unlikeMutation]);

  // Handle repost - use callback if provided (for showing menu), otherwise direct toggle
  const handleRepost = useCallback(async () => {
    // If callback provided, let parent show menu (for quote post option)
    if (onRepostPress) {
      onRepostPress(post);
      return;
    }
    
    if (isRepostLoading) return;
    setIsRepostLoading(true);
    
    try {
      if (isReposted && post.viewer?.repost) {
        await unrepostMutation.mutateAsync({
          repostUri: post.viewer.repost,
          postUri: post.uri,
        });
      } else {
        await repostMutation.mutateAsync({
          uri: post.uri,
          cid: post.cid,
        });
      }
    } catch (error) {
      console.error('Repost action failed:', error);
    } finally {
      setIsRepostLoading(false);
    }
  }, [isReposted, isRepostLoading, post, repostMutation, unrepostMutation, onRepostPress]);

  // Handle reply - navigate to compose with reply context
  const handleReply = useCallback(() => {
    // Extract DID and rkey from post URI
    // Format: at://did:plc:xxx/app.bsky.feed.post/rkey
    const parts = post.uri.split('/');
    const did = parts[2];
    const rkey = parts[4];
    
    router.push({
      pathname: '/compose',
      params: { 
        replyTo: post.uri,
        replyToDid: did,
        replyToRkey: rkey,
      },
    } as any);
  }, [post.uri, router]);

  // Handle share
  const handleShare = useCallback(async () => {
    // Build Bluesky web URL
    const parts = post.uri.split('/');
    const did = parts[2];
    const rkey = parts[4];
    const handle = post.author.handle;
    const url = `https://bsky.app/profile/${handle}/post/${rkey}`;
    
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(url);
        // Could show a toast here
      } else {
        await RNShare.share({
          message: url,
          url: url,
        });
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
  }, [post]);

  // Icon sizes based on variant
  const iconSize = variant === 'compact' ? 18 : 22;
  const mutedColor = '#6B7280';
  const likeColor = isLiked ? '#EF4444' : mutedColor;
  const repostColor = isReposted ? '#10B981' : mutedColor;

  // Compact layout (for PostCard in feeds)
  if (variant === 'compact') {
    return (
      <View className="flex-row items-center justify-between mt-3 pr-4">
        {/* Reply */}
        <Pressable 
          onPress={(e) => { e.stopPropagation(); handleReply(); }}
          className="flex-row items-center py-1"
          hitSlop={8}
        >
          <MessageCircle size={iconSize} color={mutedColor} />
          {!hideReplyCounts && replyCount > 0 && (
            <Text className="text-text-muted text-sm ml-1.5">
              {replyCount}
            </Text>
          )}
        </Pressable>

        {/* Repost */}
        <Pressable 
          onPress={(e) => { e.stopPropagation(); handleRepost(); }}
          className="flex-row items-center py-1"
          disabled={isRepostLoading}
          hitSlop={8}
        >
          <Repeat2 size={iconSize} color={repostColor} />
          {repostCount > 0 && (
            <Text className={`text-sm ml-1.5 ${isReposted ? 'text-green-500' : 'text-text-muted'}`}>
              {repostCount}
            </Text>
          )}
        </Pressable>

        {/* Like */}
        <Pressable 
          onPress={(e) => { e.stopPropagation(); handleLike(); }}
          className="flex-row items-center py-1"
          disabled={isLikeLoading}
          hitSlop={8}
        >
          <Heart 
            size={iconSize} 
            color={likeColor}
            fill={isLiked ? '#EF4444' : 'none'}
          />
          {likeCount > 0 && (
            <Text className={`text-sm ml-1.5 ${isLiked ? 'text-red-500' : 'text-text-muted'}`}>
              {likeCount}
            </Text>
          )}
        </Pressable>

        {/* Share */}
        <Pressable 
          onPress={(e) => { e.stopPropagation(); handleShare(); }}
          className="flex-row items-center py-1"
          hitSlop={8}
        >
          <Share size={iconSize} color={mutedColor} />
        </Pressable>

        {/* More Options */}
        {onOptionsPress && (
          <Pressable 
            onPress={(e) => { e.stopPropagation(); onOptionsPress(); }}
            className="flex-row items-center py-1"
            hitSlop={8}
          >
            <MoreHorizontal size={iconSize} color={mutedColor} />
          </Pressable>
        )}
      </View>
    );
  }

  // Expanded layout (for ThreadPost detail view)
  return (
    <View className="flex-row justify-around py-2 border-b border-border mb-4">
      {/* Reply */}
      <Pressable 
        onPress={handleReply}
        className="flex-row items-center p-2"
        hitSlop={8}
      >
        <MessageCircle size={iconSize} color={mutedColor} />
      </Pressable>

      {/* Repost */}
      <Pressable 
        onPress={handleRepost}
        className="flex-row items-center p-2"
        disabled={isRepostLoading}
        hitSlop={8}
      >
        <Repeat2 size={iconSize} color={repostColor} />
      </Pressable>

      {/* Like */}
      <Pressable 
        onPress={handleLike}
        className="flex-row items-center p-2"
        disabled={isLikeLoading}
        hitSlop={8}
      >
        <Heart 
          size={iconSize} 
          color={likeColor}
          fill={isLiked ? '#EF4444' : 'transparent'}
        />
      </Pressable>

      {/* Share */}
      <Pressable 
        onPress={handleShare}
        className="flex-row items-center p-2"
        hitSlop={8}
      >
        <Share size={iconSize} color={mutedColor} />
      </Pressable>
    </View>
  );
});
