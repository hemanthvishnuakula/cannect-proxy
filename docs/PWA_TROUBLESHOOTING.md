# Cannect PWA Troubleshooting & Implementation Guide

> Practical solutions to common PWA issues, especially for iOS Safari.

## Quick Diagnostics

### Health Check Endpoints

```bash
# Push VPS status
curl https://push.cannect.space/health
# Expected: {"status":"ok","jetstream":"connected","subscribedUsers":N}

# Test push notification
curl -X POST https://push.cannect.space/api/push/send \
  -H "Content-Type: application/json" \
  -d '{"did":"did:plc:xxx","title":"Test","body":"Hello"}'
```

### Log Monitoring

```bash
# Stream live logs from Supabase
node scripts/monitor-logs.mjs

# VPS logs
ssh root@push.cannect.space "journalctl -u cannect-push -f"
```

---

## Common Issues & Solutions

### 1. Push Notifications Not Working

#### Symptom: Toggle stuck on "Checking..."

**Cause**: Service Worker not in `active` state.

**Debug**:
```javascript
// In browser console
const reg = await navigator.serviceWorker.getRegistration();
console.log({
  active: reg?.active?.state,
  waiting: reg?.waiting?.state,
  installing: reg?.installing?.state
});
```

**Fix**: Ensure `skipWaiting()` is always called:
```javascript
// sw.js install event
self.skipWaiting();  // Always, unconditionally
```

#### Symptom: "Permission denied" on iOS

**Cause**: iOS requires PWA to be installed to home screen.

**Fix**: Show install prompt before push prompt:
```tsx
if (isIOSInstalledPWA()) {
  // Safe to request push permission
  await requestPushPermission();
} else {
  // Show iOS install instructions
  showIOSInstallPrompt();
}
```

#### Symptom: Notifications work on desktop, not iOS

**Cause**: iOS 16.4+ required, or not running as PWA.

**Check**:
```javascript
// In browser console on iOS
console.log({
  isStandalone: window.navigator.standalone,
  displayMode: window.matchMedia('(display-mode: standalone)').matches
});
// Both should be true for iOS PWA
```

---

### 2. Service Worker Issues

#### Symptom: Old version persists after deploy

**Cause**: SW cached in browser, not updating.

**Fix**: Increment version and ensure no-cache headers:
```javascript
// sw.js
const CACHE_VERSION = 'v1.5.1';  // Bump this
```

```json
// vercel.json
{
  "headers": [{
    "source": "/sw.js",
    "headers": [
      { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
    ]
  }]
}
```

**Nuclear option** (clear everything):
```javascript
// Run in browser console
const regs = await navigator.serviceWorker.getRegistrations();
await Promise.all(regs.map(r => r.unregister()));
const caches = await caches.keys();
await Promise.all(caches.map(c => caches.delete(c)));
location.reload();
```

#### Symptom: SW in "waiting" state forever

**Cause**: `skipWaiting()` not called, or old tab blocking.

**Fix**: Always call `skipWaiting()` + use `clients.claim()`:
```javascript
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
```

---

### 3. Jetstream Connection Issues

#### Symptom: Health check shows `"jetstream":"disconnected"`

**Cause**: WebSocket connection failed.

**Debug**:
```bash
ssh root@push.cannect.space "journalctl -u cannect-push -n 50"
# Look for: [Jetstream] Connected to Bluesky firehose
```

**Common causes**:
1. **Wrong endpoint**: Use `us-west` not `us-east`
   ```javascript
   const JETSTREAM_URL = 'wss://jetstream2.us-west.bsky.network/subscribe';
   ```

2. **Firewall blocking outbound WebSocket**: Check VPS firewall rules

3. **No subscribed users**: Jetstream won't connect if no DIDs to track
   ```bash
   curl https://push.cannect.space/health
   # Check "subscribedUsers" > 0
   ```

#### Symptom: Events received but notifications not sent

**Debug**:
```bash
# Add logging to handleJetstreamEvent
console.log(`[Jetstream] Event: ${collection} from ${actorDid} -> ${targetDid}`);
console.log(`[Jetstream] Is subscribed: ${subscribedDids.has(targetDid)}`);
```

**Common causes**:
1. **DID mismatch**: Ensure stored DID matches exactly (with `did:plc:` prefix)
2. **Duplicate prevention**: Event already in `sent_notifications` table

---

### 4. iOS-Specific Issues

#### Symptom: App icon not updating

**Fix**: iOS caches icons aggressively.
1. Delete app from home screen
2. Clear Safari cache: Settings → Safari → Clear History and Website Data
3. Reinstall from Safari

#### Symptom: Safe area not working (content under notch)

**Fix**: Use proper CSS:
```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

And in React Native:
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const insets = useSafeAreaInsets();
<View style={{ paddingTop: insets.top }} />
```

#### Symptom: Haptic feedback crashes app

**Cause**: `expo-haptics` not available on web.

**Fix**: Use safe wrapper:
```typescript
// lib/utils/haptics.ts
import { Platform } from 'react-native';

export function triggerNotification() {
  if (Platform.OS === 'web') return;  // No-op on web
  
  try {
    const Haptics = require('expo-haptics');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}
```

---

### 5. Logging Issues

#### Symptom: No logs appearing in Supabase

**Check**:
1. Environment variables set:
   ```bash
   echo $EXPO_PUBLIC_LOG_SUPABASE_URL
   echo $EXPO_PUBLIC_LOG_SUPABASE_ANON_KEY
   ```

2. RLS policy allows inserts:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'app_logs';
   -- Should show INSERT policy with "true" check
   ```

3. Supabase project not paused (free tier pauses after inactivity)

#### Symptom: Logs delayed

**Cause**: Batching (2 second delay by default).

**For immediate logs** (debugging):
```typescript
// Temporarily disable batching
await supabase.from('app_logs').insert([entry]);  // Direct insert
```

---

## Deployment Checklist

### Before Deploy

- [ ] Increment `CACHE_VERSION` in `sw.js`
- [ ] Test push subscription flow locally
- [ ] Check manifest.json icons exist
- [ ] Verify environment variables in Vercel

### After Deploy

- [ ] Check Vercel deployment logs
- [ ] Test on fresh browser (incognito)
- [ ] Verify SW version: `navigator.serviceWorker.controller.scriptURL`
- [ ] Test push notification end-to-end
- [ ] Check remote logs in Supabase

### VPS Deploy

```bash
# Upload and restart
scp server.js root@push.cannect.space:/opt/cannect-push/
ssh root@push.cannect.space "systemctl restart cannect-push"

# Verify
curl https://push.cannect.space/health
```

---

## Performance Optimizations

### 1. Reduce Initial Load

```javascript
// Lazy load heavy components
const MediaViewer = lazy(() => import('@/components/ui/MediaViewer'));
```

### 2. Optimize Images

```tsx
// Use Cloudflare Image Delivery
const optimizedUrl = `https://imagedelivery.net/${accountId}/${imageId}/w=400`;
```

### 3. Cache API Responses

```typescript
// TanStack Query with stale-while-revalidate
useQuery({
  queryKey: ['profile', did],
  queryFn: () => fetchProfile(did),
  staleTime: 5 * 60 * 1000,  // 5 minutes
  cacheTime: 30 * 60 * 1000, // 30 minutes
});
```

---

## Security Considerations

### 1. VAPID Keys

- **NEVER** expose `VAPID_PRIVATE_KEY` to frontend
- Store only on VPS in `.env`
- Rotate if compromised

### 2. Supabase Keys

- **Anon key** (safe to expose): Read-only or INSERT-only via RLS
- **Service role key** (NEVER expose): Full database access

### 3. AT Protocol Tokens

- Store `refreshJwt` securely (AsyncStorage on mobile, localStorage on web)
- Tokens auto-refresh, but handle expiration gracefully

---

## Useful Commands

```bash
# Generate new VAPID keys
npx web-push generate-vapid-keys

# Test WebSocket connection to Jetstream
wscat -c "wss://jetstream2.us-west.bsky.network/subscribe?wantedCollections=app.bsky.feed.like"

# Check iOS Safari version (need 16.4+)
# On device: Settings → General → About → Software Version

# Force reload without cache (desktop browsers)
# Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

# Clear all service workers via Chrome DevTools
# Application → Service Workers → Unregister
```

---

## Architecture Decision Records (ADRs)

### ADR-001: Why Jetstream over Relay/Firehose

**Context**: Need real-time notifications for likes, follows, etc.

**Options**:
1. Poll Bluesky API every N seconds
2. Connect to full Firehose (massive data)
3. Use Jetstream (filtered firehose)

**Decision**: Jetstream

**Rationale**:
- Real-time (<100ms latency)
- Pre-filtered by collection type
- Official Bluesky service
- Zero API rate limit concerns

### ADR-002: Why Separate Push VPS

**Context**: Need to send push notifications from server.

**Options**:
1. Vercel Edge Functions
2. Supabase Edge Functions
3. Dedicated VPS

**Decision**: Dedicated VPS

**Rationale**:
- Persistent WebSocket to Jetstream (edge functions are stateless)
- SQLite for simple subscription storage
- Full control over Node.js environment
- Can run 24/7 without cold starts

### ADR-003: Why SQLite over PostgreSQL for Push VPS

**Context**: Need to store push subscriptions.

**Options**:
1. Supabase PostgreSQL
2. SQLite on VPS

**Decision**: SQLite on VPS

**Rationale**:
- No external dependency
- Survives network issues
- Simple backup (copy file)
- Fast enough for <10k subscriptions
- Single-writer model fits our use case

---

*Last updated: December 27, 2025*
