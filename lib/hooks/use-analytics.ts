/**
 * Analytics Hook - PostHog Event Tracking
 * 
 * Centralized analytics for tracking user behavior.
 * Uses PostHog for product analytics.
 */

import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

/**
 * Analytics events we track
 */
export type AnalyticsEvent = 
  // Auth events
  | 'user_signed_up'
  | 'user_logged_in'
  | 'user_logged_out'
  // Post events
  | 'post_created'
  | 'post_liked'
  | 'post_unliked'
  | 'post_reposted'
  | 'post_unreposted'
  | 'post_deleted'
  | 'post_viewed'
  // Feed events
  | 'feed_viewed'
  | 'feed_refreshed'
  | 'feed_scrolled_to_end'
  // Profile events
  | 'profile_viewed'
  | 'profile_edited'
  | 'user_followed'
  | 'user_unfollowed'
  // Engagement
  | 'reply_created'
  | 'media_uploaded'
  // PWA events
  | 'pwa_installed'
  | 'push_enabled'
  | 'push_disabled';

/**
 * Hook for tracking analytics events
 */
export function useAnalytics() {
  const posthog = usePostHog();

  const track = useCallback((event: AnalyticsEvent, properties?: Record<string, any>) => {
    posthog.capture(event, properties);
  }, [posthog]);

  // Convenience methods for common events
  const trackPostCreated = useCallback((hasMedia: boolean, mediaCount: number) => {
    track('post_created', { has_media: hasMedia, media_count: mediaCount });
  }, [track]);

  const trackPostLiked = useCallback((postUri: string) => {
    track('post_liked', { post_uri: postUri });
  }, [track]);

  const trackPostReposted = useCallback((postUri: string) => {
    track('post_reposted', { post_uri: postUri });
  }, [track]);

  const trackFeedViewed = useCallback((feedType: 'global' | 'local' | 'following') => {
    track('feed_viewed', { feed_type: feedType });
  }, [track]);

  const trackProfileViewed = useCallback((profileDid: string, isOwnProfile: boolean) => {
    track('profile_viewed', { profile_did: profileDid, is_own_profile: isOwnProfile });
  }, [track]);

  return {
    track,
    trackPostCreated,
    trackPostLiked,
    trackPostReposted,
    trackFeedViewed,
    trackProfileViewed,
  };
}
