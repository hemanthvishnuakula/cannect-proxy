# Cannect PWA Architecture - Gold Standard Reference

> A comprehensive guide to building production-grade Progressive Web Apps with iOS support, real-time push notifications, and AT Protocol federation.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Service Worker Lifecycle](#service-worker-lifecycle)
3. [Push Notification System](#push-notification-system)
4. [Remote Logging System](#remote-logging-system)
5. [iOS PWA Considerations](#ios-pwa-considerations)
6. [AT Protocol Integration](#at-protocol-integration)
7. [Deployment Architecture](#deployment-architecture)
8. [Key Design Decisions](#key-design-decisions)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CANNECT PWA ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐     │
│  │   iOS Safari    │      │   Android/Web   │      │  React Native   │     │
│  │   PWA (16.4+)   │      │   PWA/Browser   │      │  Android App    │     │
│  └────────┬────────┘      └────────┬────────┘      └────────┬────────┘     │
│           │                        │                        │               │
│           └────────────────┬───────┴────────────────────────┘               │
│                            ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Expo Router + React Native Web                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │  Auth Store │  │  Feed/Post  │  │  Profile    │  │   Search   │  │   │
│  │  │  (Zustand)  │  │  Components │  │  Components │  │  Discovery │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                            │                                                 │
│           ┌────────────────┼────────────────┐                               │
│           ▼                ▼                ▼                               │
│  ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐                   │
│  │  Service Worker │ │   Logger    │ │   Web Push      │                   │
│  │  (sw.js)        │ │  (Remote)   │ │   Hook          │                   │
│  └────────┬────────┘ └──────┬──────┘ └────────┬────────┘                   │
│           │                 │                  │                            │
└───────────┼─────────────────┼──────────────────┼────────────────────────────┘
            │                 │                  │
            ▼                 ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐
│    Vercel       │  │    Supabase     │  │         Push VPS                │
│  (Static Host)  │  │  (Logging DB)   │  │    (push.cannect.space)         │
│                 │  │                 │  │                                 │
│  • Next.js SSR  │  │  • app_logs     │  │  ┌─────────────────────────┐   │
│  • Edge CDN     │  │  • Real-time    │  │  │   Express + web-push    │   │
│  • Auto Deploy  │  │  • PostgreSQL   │  │  │   + SQLite              │   │
└─────────────────┘  └─────────────────┘  │  └───────────┬─────────────┘   │
                                          │              │                  │
                                          │              ▼                  │
                                          │  ┌─────────────────────────┐   │
                                          │  │    Jetstream Listener   │   │
                                          │  │    (WebSocket Client)   │   │
                                          │  └───────────┬─────────────┘   │
                                          │              │                  │
                                          └──────────────┼──────────────────┘
                                                         │
                                                         ▼
                                          ┌─────────────────────────────────┐
                                          │       Bluesky Firehose          │
                                          │  (jetstream2.us-west.bsky.net)  │
                                          │                                 │
                                          │  Real-time events:              │
                                          │  • app.bsky.feed.like           │
                                          │  • app.bsky.feed.repost         │
                                          │  • app.bsky.graph.follow        │
                                          │  • app.bsky.feed.post (replies) │
                                          └─────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Expo + React Native Web | Cross-platform UI |
| **Routing** | Expo Router | File-based navigation |
| **State** | Zustand | Lightweight state management |
| **Styling** | NativeWind (Tailwind) | Utility-first CSS |
| **Hosting** | Vercel | Edge CDN + Auto-deploy |
| **Push Server** | Node.js + Express | Push subscription management |
| **Real-time** | Bluesky Jetstream | AT Protocol event stream |
| **Logging** | Supabase | Remote debugging |
| **Protocol** | AT Protocol | Decentralized social |

---

## Service Worker Lifecycle

### The Problem with Service Workers

Service Workers are notoriously difficult because:
1. They don't update immediately by default
2. The `waiting` state can persist indefinitely
3. iOS Safari has unique quirks (16.4+ required for push)
4. Zombie tabs can block activation

### Our Solution: Atomic Versioning + Aggressive Activation

```javascript
// sw.js - Core Strategy
const CACHE_VERSION = 'v1.5.0';  // INCREMENT ON EVERY DEPLOY
const CACHE_NAME = `cannect-atomic-${CACHE_VERSION}`;

// Install: Always skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cacheAssets(cache);
      
      // 💎 CRITICAL: Always activate immediately
      self.skipWaiting();
    })()
  );
});

// Activate: Purge all old caches + claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete ALL caches except current
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
      
      // 💎 CRITICAL: Take control of all open tabs
      await self.clients.claim();
    })()
  );
});
```

### PWAUpdater Component Pattern

The React component that manages SW updates must handle a critical timing issue:

```tsx
// ❌ BUG: useEffect with [] never re-runs when isMounted changes
useEffect(() => {
  if (!isMounted) return;  // This check is useless with []
  setupServiceWorker();
}, []);

// ✅ FIX: Include isMounted in dependency array
useEffect(() => {
  if (!isMounted) return;
  setupServiceWorker();
}, [isMounted]);  // Re-run when mounted
```

### Cache Strategy

| Asset Type | Strategy | Rationale |
|------------|----------|-----------|
| App Shell (`/`, `/offline.html`) | Cache First | Instant loading |
| Icons (`/icon-*.png`) | Cache First | Rarely changes |
| API calls (`/api/*`, `supabase.co`) | Network Only | Must be fresh |
| CDN media (`imagedelivery.net`) | Network Only | Avoid stale media |

---

## Push Notification System

### Architecture Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        PUSH NOTIFICATION FLOW                               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1️⃣ SUBSCRIPTION (User enables push)                                        │
│                                                                             │
│  ┌─────────┐    Request      ┌─────────┐    Store     ┌─────────────────┐ │
│  │ Browser │ ──Permission──▶ │   SW    │ ──────────▶  │   Push VPS      │ │
│  │         │ ◀──Granted───── │         │              │   (SQLite)      │ │
│  └─────────┘                 └────┬────┘              └─────────────────┘ │
│                                   │                                        │
│                                   ▼                                        │
│                          PushSubscription {                                │
│                            endpoint: "https://fcm.googleapis.com/...",     │
│                            keys: { p256dh, auth }                          │
│                          }                                                 │
│                                                                             │
│  2️⃣ REAL-TIME TRIGGER (Something happens on Bluesky)                        │
│                                                                             │
│  ┌──────────────┐                                                          │
│  │   Bluesky    │                                                          │
│  │   Network    │  User B likes User A's post                              │
│  └──────┬───────┘                                                          │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────┐  WebSocket   ┌─────────────────┐                         │
│  │  Jetstream   │ ───────────▶ │   Push VPS      │                         │
│  │  Firehose    │              │                 │                         │
│  └──────────────┘              │  1. Parse event │                         │
│                                │  2. Extract DID │                         │
│                                │  3. Check subs  │                         │
│                                │  4. Send push   │                         │
│                                └────────┬────────┘                         │
│                                         │                                   │
│  3️⃣ DELIVERY                             │                                   │
│                                         ▼                                   │
│  ┌─────────┐    Push Event   ┌─────────┐    Show     ┌─────────────────┐  │
│  │ Browser │ ◀─────────────── │   SW    │ ──────────▶│  Notification   │  │
│  │         │                 │  (push  │             │  (iOS/Android)  │  │
│  └─────────┘                 │  event) │             └─────────────────┘  │
│                              └─────────┘                                   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Jetstream Event Handling

```javascript
// server.js - Event mapping
async function handleJetstreamEvent(event) {
  if (event.kind !== 'commit' || event.commit?.operation !== 'create') return;

  const { did: actorDid, commit } = event;
  const { collection, record } = commit;

  switch (collection) {
    case 'app.bsky.feed.like':
      // record.subject.uri = "at://did:plc:xxx/app.bsky.feed.post/yyy"
      targetDid = extractDid(record.subject.uri);
      notification = { title: '❤️ New Like', body: 'Someone liked your post' };
      break;

    case 'app.bsky.feed.repost':
      targetDid = extractDid(record.subject.uri);
      notification = { title: '🔁 Reposted', body: 'Someone reposted your post' };
      break;

    case 'app.bsky.graph.follow':
      targetDid = record.subject;  // Direct DID reference
      notification = { title: '👤 New Follower', body: `@${actorHandle} followed you` };
      break;

    case 'app.bsky.feed.post':
      if (record.reply?.parent?.uri) {
        targetDid = extractDid(record.reply.parent.uri);
        notification = { title: '💬 New Reply', body: record.text?.slice(0, 100) };
      }
      break;
  }

  if (targetDid && subscribedDids.has(targetDid)) {
    await sendPushToUser(targetDid, notification);
  }
}
```

### VAPID Configuration

```bash
# Generate VAPID keys
npx web-push generate-vapid-keys

# Store in .env
VAPID_PUBLIC_KEY=BLxxx...
VAPID_PRIVATE_KEY=xxx...
VAPID_EMAIL=mailto:hello@example.com
```

---

## Remote Logging System

### Why Remote Logging?

iOS Safari PWAs have NO developer console access. When debugging:
- You can't attach Safari dev tools
- Console.log goes nowhere
- Errors are invisible

### Solution: Supabase Real-time Logs

```typescript
// logger.ts - Remote logging to Supabase
const LOG_SUPABASE_URL = 'https://xxx.supabase.co';
const LOG_SUPABASE_KEY = 'eyJxxx...';  // Anon key (RLS enabled)

export function log(entry: LogEntry) {
  const fullEntry = {
    ...entry,
    session_id: SESSION_ID,
    platform: getPlatform(),  // 'ios-pwa', 'android-pwa', 'web'
    url: window.location.pathname,
    user_agent: navigator.userAgent,
  };
  
  // Batch logs (send every 2s or 10 entries)
  queueLog(fullEntry);
}

// Usage
logger.info('push', 'subscribe_start', 'User tapped enable');
logger.success('push', 'subscribed', 'Push subscription created');
logger.error('push', 'subscribe_error', error);
```

### Database Schema

```sql
CREATE TABLE app_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  session_id TEXT,
  did TEXT,
  category TEXT,           -- 'auth', 'push', 'sw', 'error'
  action TEXT,
  status TEXT,             -- 'start', 'success', 'error', 'info'
  message TEXT,
  error TEXT,
  url TEXT,
  user_agent TEXT,
  platform TEXT,
  metadata JSONB
);

-- RLS: Anyone can INSERT (anon key), only service role can SELECT
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert_logs" ON app_logs FOR INSERT WITH CHECK (true);
```

### Live Monitoring Script

```javascript
// monitor-logs.mjs - Stream logs in terminal
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

supabase
  .channel('logs')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_logs' }, 
    (payload) => {
      const log = payload.new;
      console.log(`[${log.platform}] ${log.category}/${log.action}: ${log.message}`);
    })
  .subscribe();
```

---

## iOS PWA Considerations

### Requirements for iOS Push

1. **iOS 16.4+** - Earlier versions don't support web push
2. **Installed to Home Screen** - Must be running as standalone PWA
3. **HTTPS** - Required for service workers
4. **User Gesture** - Permission prompt must follow user tap

### Detection Pattern

```typescript
function isIOSInstalledPWA(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = 
    (window.navigator as any).standalone === true ||  // Safari-specific
    window.matchMedia('(display-mode: standalone)').matches;
  
  return isIOS && isStandalone;
}
```

### Viewport Configuration

```html
<!-- Critical for iOS PWA -->
<meta name="viewport" content="width=device-width, initial-scale=1, 
  maximum-scale=1, user-scalable=no, viewport-fit=cover" />

<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black" />
<meta name="apple-mobile-web-app-title" content="Cannect" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

### Safe Area Handling (CSS)

```css
body {
  /* Fill entire viewport including notch area */
  min-height: 100vh;
  min-height: -webkit-fill-available;
  
  /* Use safe area insets for content */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

### iOS Gotchas

| Issue | Solution |
|-------|----------|
| SW never activates | Always call `skipWaiting()` in install event |
| Push permission denied | Show iOS install prompt BEFORE push prompt |
| Icon not updating | Delete PWA from home screen, clear Safari cache, reinstall |
| Haptics crash on web | Wrap haptic calls with platform check |
| 300ms tap delay | Use `touch-action: manipulation` CSS |

---

## AT Protocol Integration

### Authentication Flow

```
┌─────────┐         ┌─────────────┐         ┌─────────────┐
│  User   │         │   Cannect   │         │  Bluesky    │
│         │         │   (Client)  │         │   PDS       │
└────┬────┘         └──────┬──────┘         └──────┬──────┘
     │                     │                       │
     │  Enter handle       │                       │
     │ ──────────────────▶ │                       │
     │                     │  Resolve DID          │
     │                     │ ─────────────────────▶│
     │                     │ ◀─────────────────────│
     │                     │  DID + PDS URL        │
     │                     │                       │
     │                     │  createSession        │
     │                     │ ─────────────────────▶│
     │                     │ ◀─────────────────────│
     │                     │  { accessJwt,         │
     │  Logged in!         │    refreshJwt, did }  │
     │ ◀────────────────── │                       │
     │                     │                       │
```

### Client Setup

```typescript
// lib/atproto/client.ts
import { BskyAgent } from '@atproto/api';

const agent = new BskyAgent({ service: 'https://bsky.social' });

// Login
await agent.login({ identifier: handle, password });

// Store session
const session = agent.session;  // { did, accessJwt, refreshJwt }
```

---

## Deployment Architecture

### Vercel (Frontend)

```json
// vercel.json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
        { "key": "Service-Worker-Allowed", "value": "/" }
      ]
    }
  ]
}
```

### Push VPS Setup

```bash
# /opt/cannect-push/
├── server.js        # Express + Jetstream
├── push.db          # SQLite (subscriptions)
├── .env             # VAPID keys
└── package.json

# Systemd service
[Unit]
Description=Cannect Web Push Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cannect-push
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Caddy reverse proxy (auto HTTPS)
push.cannect.space {
    reverse_proxy localhost:3000
}
```

---

## Key Design Decisions

### 1. Why Jetstream over Polling?

| Approach | Latency | Cost | Complexity |
|----------|---------|------|------------|
| Polling API every 30s | 0-30s | High API calls | Low |
| WebSocket to our server | ~1s | Low | Medium |
| **Jetstream (firehose)** | **<100ms** | **Zero API calls** | Medium |

### 2. Why SQLite on VPS?

- No external database dependency
- Survives VPS restarts (persisted to disk)
- Simple backup (copy file)
- Fast for 1000s of subscriptions

### 3. Why Separate Logging Supabase?

- Isolates logging from production data
- Can delete/reset without affecting app
- Anon key is safe to expose (INSERT only via RLS)
- Real-time subscriptions for live monitoring

### 4. Why Always `skipWaiting()`?

- iOS Safari can leave SW in "waiting" state forever
- Users can't manually trigger activation
- Controlled via `PWAUpdater` toast for UX

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `public/sw.js` | Service Worker - caching, push handling |
| `public/manifest.json` | PWA manifest - icons, theme, shortcuts |
| `app/+html.tsx` | HTML template - meta tags, iOS config |
| `components/PWAUpdater.tsx` | SW registration and update toast |
| `lib/hooks/use-web-push.ts` | Push subscription hook |
| `lib/utils/logger.ts` | Remote logging to Supabase |
| `scripts/vps/server.js` | Push VPS + Jetstream listener |
| `scripts/monitor-logs.mjs` | Live log streaming |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-27 | Initial Gold Standard release |

---

*This architecture has been battle-tested on iOS 17+ PWA, Android Chrome, and desktop browsers.*
