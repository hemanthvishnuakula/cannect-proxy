import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import Animated, { 
  FadeInUp, 
  FadeOutDown, 
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { RefreshCw } from 'lucide-react-native';

interface PWAUpdaterProps {
  /** Check for updates interval in milliseconds (default: 60000 = 1 minute) */
  checkInterval?: number;
}

/**
 * PWAUpdater - Handles graceful Service Worker updates
 * 
 * Shows a toast when a new version is available, allowing users to update
 * without experiencing broken UI from cache/code mismatches.
 * 
 * Edge cases handled:
 * - Zombie tabs (old SW running in background tabs)
 * - Partial cache (new HTML, old CSS)
 * - Double reload problem
 * - First install (no toast shown)
 */
export function PWAUpdater({ checkInterval = 60000 }: PWAUpdaterProps) {
  const [showToast, setShowToast] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // 💎 Fix 3: Guard against infinite reload loops
  const hasReloadedRef = useRef(false);
  
  // Animation for the refresh icon
  const rotation = useSharedValue(0);
  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // =====================================================
  // Setup Service Worker Listeners
  // =====================================================
  useEffect(() => {
    // Only run on web
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const setupServiceWorker = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          handleRegistration(reg);
        }
      } catch (error) {
        console.error('[PWAUpdater] Error getting registration:', error);
      }
    };

    setupServiceWorker();

    // Listen for controller changes (new SW activated)
    const handleControllerChange = () => {
      // 💎 Fix 3: Guard against multiple reloads
      if (hasReloadedRef.current) {
        console.warn('[PWAUpdater] Reload already triggered, ignoring');
        return;
      }
      hasReloadedRef.current = true;
      
      console.log('[PWAUpdater] Controller changed - reloading');
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  // =====================================================
  // Periodic Update Check
  // =====================================================
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!registration) return;

    const interval = setInterval(() => {
      console.log('[PWAUpdater] Checking for updates...');
      registration.update().catch(console.error);
    }, checkInterval);

    return () => clearInterval(interval);
  }, [registration, checkInterval]);

  // =====================================================
  // Handle Registration State
  // =====================================================
  const handleRegistration = useCallback((reg: ServiceWorkerRegistration) => {
    setRegistration(reg);

    // Check if there's already a waiting worker
    if (reg.waiting) {
      console.log('[PWAUpdater] Update already waiting');
      
      // 💎 Fix 5: Check if this is a critical force update
      const handleForceUpdateCheck = (event: MessageEvent) => {
        if (event.data?.type === 'FORCE_UPDATE_RESULT') {
          navigator.serviceWorker.removeEventListener('message', handleForceUpdateCheck);
          
          if (event.data.shouldForce) {
            console.log('[PWAUpdater] Force update required for version:', event.data.version);
            reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
            // Will reload via controllerchange
            return;
          }
          
          // 💎 Fix 4: Don't show if already dismissed this session
          const dismissed = sessionStorage.getItem('pwa_update_dismissed');
          if (dismissed !== 'true') {
            setShowToast(true);
          }
        }
      };
      
      navigator.serviceWorker.addEventListener('message', handleForceUpdateCheck);
      reg.waiting.postMessage({ type: 'CHECK_FORCE_UPDATE' });
      return;
    }

    // Listen for new installations
    const handleUpdateFound = () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      console.log('[PWAUpdater] New worker installing...');

      const handleStateChange = () => {
        if (newWorker.state === 'installed') {
          // Only show toast if there's an existing controller (not first install)
          if (navigator.serviceWorker.controller) {
            console.log('[PWAUpdater] New version ready');
            setShowToast(true);
          }
        }
      };

      newWorker.addEventListener('statechange', handleStateChange);
    };

    reg.addEventListener('updatefound', handleUpdateFound);
  }, []);

  // =====================================================
  // Trigger Update
  // =====================================================
  const handleUpdate = useCallback(() => {
    if (!registration?.waiting) return;

    setIsUpdating(true);
    
    // Animate the refresh icon
    rotation.value = withSpring(rotation.value + 360, {
      damping: 10,
      stiffness: 100,
    });

    // Tell the waiting worker to skip waiting and take control
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // The 'controllerchange' event will trigger a reload
  }, [registration, rotation]);

  // =====================================================
  // Dismiss Toast (user can update later)
  // =====================================================
  const handleDismiss = useCallback(() => {
    setShowToast(false);
    
    // 💎 Fix 4: Remember dismissal in this session so we don't nag
    // But it will show again on next session/tab
    sessionStorage.setItem('pwa_update_dismissed', 'true');
  }, []);

  // Don't render on non-web platforms
  if (Platform.OS !== 'web') return null;
  if (!showToast) return null;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(15)}
      exiting={FadeOutDown.springify().damping(15)}
      style={styles.container}
    >
      <View style={styles.toast}>
        {/* Icon */}
        <Animated.View style={animatedIconStyle}>
          <RefreshCw size={24} color="#10B981" />
        </Animated.View>

        {/* Text */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.subtitle}>
            Tap to refresh and get the latest features
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <Pressable
            onPress={handleDismiss}
            style={styles.laterButton}
          >
            <Text style={styles.laterText}>Later</Text>
          </Pressable>
          
          <Pressable
            onPress={handleUpdate}
            disabled={isUpdating}
            style={[styles.updateButton, isUpdating && styles.updateButtonDisabled]}
          >
            <Text style={styles.updateText}>
              {isUpdating ? 'Updating...' : 'Update'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // Above tab bar
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  toast: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  title: {
    color: '#FAFAFA',
    fontWeight: '600',
    fontSize: 15,
  },
  subtitle: {
    color: '#A1A1AA',
    fontSize: 13,
    marginTop: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  laterButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  laterText: {
    color: '#71717A',
    fontWeight: '500',
  },
  updateButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  updateButtonDisabled: {
    opacity: 0.7,
  },
  updateText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default PWAUpdater;
