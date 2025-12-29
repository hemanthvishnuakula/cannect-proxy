/**
 * Profile Skeleton
 *
 * Animated loading placeholder for profile pages.
 */

import { View } from 'react-native';
import { Skeleton, SkeletonAvatar } from './Skeleton';

/**
 * ProfileSkeleton - Loading state for profile pages
 */
export function ProfileSkeleton() {
  return (
    <View className="flex-1">
      {/* Banner skeleton */}
      <Skeleton width="100%" height={128} radius={0} />

      <View className="px-4 -mt-12">
        {/* Avatar skeleton */}
        <View className="border-4 border-background rounded-full">
          <Skeleton width={96} height={96} radius="full" />
        </View>

        {/* Name skeleton */}
        <Skeleton width={160} height={24} radius="sm" className="mt-3" />
        <Skeleton width={128} height={16} radius="sm" className="mt-2" />

        {/* Bio skeleton */}
        <Skeleton width="100%" height={16} radius="sm" className="mt-3" />
        <Skeleton width="75%" height={16} radius="sm" className="mt-1" />

        {/* Stats skeleton */}
        <View className="flex-row gap-4 mt-3">
          <Skeleton width={80} height={16} radius="sm" />
          <Skeleton width={80} height={16} radius="sm" />
          <Skeleton width={64} height={16} radius="sm" />
        </View>
      </View>

      {/* Tabs skeleton */}
      <View className="flex-row border-b border-border mt-4 px-4">
        <View className="flex-1 py-3 items-center">
          <Skeleton width={48} height={16} radius="sm" />
        </View>
        <View className="flex-1 py-3 items-center">
          <Skeleton width={56} height={16} radius="sm" />
        </View>
        <View className="flex-1 py-3 items-center">
          <Skeleton width={56} height={16} radius="sm" />
        </View>
      </View>
    </View>
  );
}
