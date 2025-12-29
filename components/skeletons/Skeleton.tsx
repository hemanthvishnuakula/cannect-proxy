/**
 * Base Skeleton Component
 *
 * A shimmering placeholder component for loading states.
 * Provides visual feedback that content is loading.
 *
 * Uses isMounted check to prevent hydration mismatch on web.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Animated, Platform, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

interface SkeletonProps extends ViewProps {
  /** Width of the skeleton (number or string like '100%') */
  width?: number | string;
  /** Height of the skeleton */
  height?: number | string;
  /** Border radius */
  radius?: number | 'full' | 'sm' | 'md' | 'lg' | 'xl';
}

// Web doesn't support native driver
const useNativeDriver = Platform.OS !== 'web';

export function Skeleton({
  width = '100%',
  height = 20,
  radius = 'md',
  className,
  style,
  ...props
}: SkeletonProps) {
  // Prevent hydration mismatch on web - start with static, animate after mount
  const [isMounted, setIsMounted] = useState(Platform.OS !== 'web');
  const shimmerAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [isMounted, shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const getBorderRadius = () => {
    if (typeof radius === 'number') return radius;
    switch (radius) {
      case 'full':
        return 9999;
      case 'sm':
        return 4;
      case 'md':
        return 8;
      case 'lg':
        return 12;
      case 'xl':
        return 16;
      default:
        return 8;
    }
  };

  // On web before mount, render static version to match SSR
  if (Platform.OS === 'web' && !isMounted) {
    return (
      <View
        className={cn('bg-muted', className)}
        style={[
          {
            width: width as any,
            height: height as any,
            borderRadius: getBorderRadius(),
            opacity: 0.5,
          },
          style,
        ]}
        {...props}
      />
    );
  }

  return (
    <Animated.View
      className={cn('bg-muted', className)}
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius: getBorderRadius(),
          opacity,
        },
        style,
      ]}
      {...props}
    />
  );
}

/**
 * SkeletonText - Multi-line text placeholder
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <View className="gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </View>
  );
}

/**
 * SkeletonAvatar - Circular avatar placeholder
 */
export function SkeletonAvatar({ size = 48 }: { size?: number }) {
  return <Skeleton width={size} height={size} radius="full" />;
}
