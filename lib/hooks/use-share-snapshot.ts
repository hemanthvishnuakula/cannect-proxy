import { useRef, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';

/**
 * useShareSnapshot - Hook for capturing and sharing post cards as images
 * 
 * This hook provides:
 * 1. A ref to attach to the hidden share card component
 * 2. A function to capture the card and open the native share sheet
 * 
 * Usage:
 * ```tsx
 * const { shareRef, captureAndShare } = useShareSnapshot();
 * 
 * // In render:
 * <View ref={shareRef} collapsable={false}>
 *   <PostShareCard post={post} />
 * </View>
 * 
 * // On share button press:
 * <Button onPress={captureAndShare} />
 * ```
 */
export function useShareSnapshot() {
  const shareRef = useRef<any>(null);

  const captureAndShare = useCallback(async () => {
    // Skip on web - use different share mechanism
    if (Platform.OS === 'web') {
      // Web fallback: Could use navigator.share() or clipboard
      Alert.alert('Sharing', 'Share functionality coming soon for web!');
      return;
    }

    try {
      // 1. Tactile feedback for the start of the process
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // 2. Ensure ref is available
      if (!shareRef.current) {
        console.warn('Share ref not available');
        return;
      }

      // 3. Capture the hidden component as PNG
      const uri = await captureRef(shareRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      // 4. Check if sharing is available on this device
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
        return;
      }

      // 5. Open Native Share Sheet
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share to Stories',
        UTI: 'public.png',
      });

      // 6. Success haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    } catch (error) {
      console.error('Snapshot failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Share Failed', 'Unable to create share image. Please try again.');
    }
  }, []);

  return { shareRef, captureAndShare };
}
