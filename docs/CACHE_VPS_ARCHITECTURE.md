# Cannect Unified VPS Architecture

## Executive Summary

A **new KVM 4 VPS** that consolidates all backend services into a single, clean infrastructure. This replaces both the Feed VPS and Push VPS with one unified system.

**Domain:** `api.cannect.space`

**Goals:**
- App fetches from ONE API
- Server handles all complexity
- Real-time updates via WebSocket
- Push notifications included
- Dramatically simplified client code

---

## Before & After

```
BEFORE (Current - 2 VPS)                 AFTER (New - 1 VPS)
────────────────────────                 ───────────────────

┌───────────────────────┐                ┌─────────────────────────────────┐
│     FEED VPS          │                │      NEW CACHE VPS              │
│   72.62.132.157       │                │      (KVM 4 - Fresh)            │
│                       │                │                                 │
│  • cannect-feed       │                │  ┌─────────────────────────┐   │
│  • following-timeline │                │  │     PostgreSQL          │   │
│  • SQLite + In-memory │   ────────▶    │  └─────────────────────────┘   │
└───────────────────────┘   Replaced     │              │                 │
                            by           │  ┌───────────┴───────────┐     │
┌───────────────────────┐                │  │                       │     │
│     PUSH VPS          │                │  ▼                       ▼     │
│   72.60.26.75         │                │  ┌─────────────┐ ┌───────────┐ │
│                       │                │  │ jetstream-  │ │ api-      │ │
│  • push-server        │   ────────▶    │  │ indexer     │ │ server    │ │
│  • Supabase for subs  │   Replaced     │  └─────────────┘ └───────────┘ │
└───────────────────────┘   by           │                                 │
                                         │  Handles EVERYTHING:            │
                                         │  • All feeds                    │
                                         │  • Profiles                     │
                                         │  • Actions                      │
                                         │  • WebSocket                    │
                                         │  • Push notifications           │
                                         └─────────────────────────────────┘

Old VPS: Shut down after migration
```

---

## Comparison

| Aspect | Current (2 VPS) | New (1 VPS) |
|--------|-----------------|-------------|
| VPS count | 2 | 1 |
| Jetstream connections | 2 | 1 |
| Database | SQLite + Supabase | PostgreSQL only |
| Push subscriptions | Supabase (external) | PostgreSQL (internal) |
| Data sources for app | 3 (Bluesky + Feed + Push) | 1 (api-server) |
| Caching | Client-side | Server-side |
| Real-time | None | WebSocket |
| Client code | ~2000+ lines | ~200 lines |
| Monthly cost | 2 VPS | 1 VPS |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         NEW CACHE VPS (KVM 4)                                │
│                         api.cannect.space                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                          Docker Network                                 │  │
│  │                                                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │  │
│  │  │                        PostgreSQL                                 │  │  │
│  │  │                        (postgres)                                 │  │  │
│  │  │                                                                   │  │  │
│  │  │  Tables:                                                          │  │  │
│  │  │  • posts              • likes             • notifications         │  │  │
│  │  │  • profiles           • reposts           • push_subscriptions    │  │  │
│  │  │  • follows            • user_state                                │  │  │
│  │  │                                                                   │  │  │
│  │  │  Port: 5432 (internal only)                                       │  │  │
│  │  │  LISTEN/NOTIFY for real-time pub/sub                              │  │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │  │
│  │                                    ▲                                    │  │
│  │                                    │                                    │  │
│  │          ┌─────────────────────────┴─────────────────────────┐         │  │
│  │          │                                                   │         │  │
│  │          ▼                                                   ▼         │  │
│  │  ┌───────────────────────────────┐    ┌───────────────────────────────┐│  │
│  │  │     jetstream-indexer         │    │     api-server                ││  │
│  │  │                               │    │                               ││  │
│  │  │  Listens to Bluesky Jetstream │    │  REST API:                    ││  │
│  │  │                               │    │  • GET  /api/feed/*           ││  │
│  │  │  Writes to PostgreSQL:        │    │  • GET  /api/post/*           ││  │
│  │  │  • Index cannabis posts       │    │  • GET  /api/profile/*        ││  │
│  │  │  • Index cannect.space posts  │    │  • POST /api/like, /follow... ││  │
│  │  │  • Track follows              │    │  • GET  /api/notifications    ││  │
│  │  │  • Update like/repost counts  │    │  • POST /api/push/subscribe   ││  │
│  │  │  • Create notifications       │    │                               ││  │
│  │  │  • Send push notifications    │    │  WebSocket:                   ││  │
│  │  │                               │    │  • Real-time post updates     ││  │
│  │  │  No external port             │    │  • Real-time notifications    ││  │
│  │  └───────────────────────────────┘    │                               ││  │
│  │                                       │  Port: 3000 (public)          ││  │
│  │                                       └───────────────────────────────┘│  │
│  │                                                                         │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │   Cannect App   │
                                │                 │
                                │  REST: fetch    │
                                │  WS: subscribe  │
                                └─────────────────┘
```

---

## The 3 Containers

### 1. PostgreSQL

| Attribute | Value |
|-----------|-------|
| Image | `postgres:16-alpine` |
| Port | 5432 (internal only) |
| Memory | 4-6 GB |
| Storage | 50+ GB NVMe |

**Purpose**: Single source of truth for all data + pub/sub via NOTIFY/LISTEN

---

### 2. Jetstream Indexer

| Attribute | Value |
|-----------|-------|
| Image | Custom Node.js (Alpine) |
| Port | None (internal) |
| Memory | 512 MB - 1 GB |

**Purpose**: Listen to Bluesky Jetstream, write to PostgreSQL, send push notifications

**Handles:**
- Cannabis hashtag posts → Global/Local feed
- Posts from cannect.space users → Local feed  
- Posts from followed accounts → Following feed
- Likes/Reposts → Update counts, create notifications
- Follows → Track relationships
- Push notifications → Send via web-push

---

### 3. API Server

| Attribute | Value |
|-----------|-------|
| Image | Custom Node.js (Alpine) |
| Port | 3000 (public) |
| Memory | 1-2 GB |

**Purpose**: Serve REST API + WebSocket to app

**Handles:**
- All feed endpoints
- All profile endpoints
- All action endpoints (proxy to Bluesky, update DB)
- Push subscription management
- WebSocket connections for real-time updates

---

## Database Schema

```sql
-- ============================================
-- POSTS
-- ============================================
CREATE TABLE posts (
  uri TEXT PRIMARY KEY,
  cid TEXT NOT NULL,
  author_did TEXT NOT NULL,
  text TEXT,
  created_at TIMESTAMP NOT NULL,
  indexed_at TIMESTAMP DEFAULT NOW(),
  
  -- Reply structure
  reply_parent_uri TEXT,
  reply_root_uri TEXT,
  
  -- Engagement counts
  like_count INT DEFAULT 0,
  repost_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  
  -- Content
  embed JSONB,
  facets JSONB,
  labels JSONB,
  
  -- Feed filtering
  has_cannabis_hashtag BOOLEAN DEFAULT FALSE,
  is_cannect_user BOOLEAN DEFAULT FALSE,
  
  -- Full record
  raw_record JSONB
);

CREATE INDEX idx_posts_author ON posts(author_did, created_at DESC);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_cannabis ON posts(created_at DESC) WHERE has_cannabis_hashtag = TRUE;
CREATE INDEX idx_posts_cannect ON posts(created_at DESC) WHERE is_cannect_user = TRUE;
CREATE INDEX idx_posts_reply_parent ON posts(reply_parent_uri) WHERE reply_parent_uri IS NOT NULL;

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE profiles (
  did TEXT PRIMARY KEY,
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT,
  description TEXT,
  avatar_cid TEXT,
  banner_cid TEXT,
  followers_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  posts_count INT DEFAULT 0,
  is_cannect_user BOOLEAN DEFAULT FALSE,
  indexed_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_profiles_handle ON profiles(handle);

-- ============================================
-- FOLLOWS
-- ============================================
CREATE TABLE follows (
  uri TEXT PRIMARY KEY,
  follower_did TEXT NOT NULL,
  following_did TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_follows_follower ON follows(follower_did);
CREATE INDEX idx_follows_following ON follows(following_did);

-- ============================================
-- LIKES
-- ============================================
CREATE TABLE likes (
  uri TEXT PRIMARY KEY,
  actor_did TEXT NOT NULL,
  subject_uri TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_likes_actor ON likes(actor_did, created_at DESC);
CREATE INDEX idx_likes_subject ON likes(subject_uri);

-- ============================================
-- REPOSTS
-- ============================================
CREATE TABLE reposts (
  uri TEXT PRIMARY KEY,
  actor_did TEXT NOT NULL,
  subject_uri TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reposts_actor ON reposts(actor_did, created_at DESC);
CREATE INDEX idx_reposts_subject ON reposts(subject_uri);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  recipient_did TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'like', 'repost', 'follow', 'reply', 'mention', 'quote'
  actor_did TEXT NOT NULL,
  subject_uri TEXT,
  reason_uri TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_did, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(recipient_did) WHERE read = FALSE;

-- ============================================
-- USER STATE (viewer personalization)
-- ============================================
CREATE TABLE user_post_state (
  user_did TEXT NOT NULL,
  post_uri TEXT NOT NULL,
  liked BOOLEAN DEFAULT FALSE,
  like_uri TEXT,
  reposted BOOLEAN DEFAULT FALSE,
  repost_uri TEXT,
  PRIMARY KEY (user_did, post_uri)
);

CREATE TABLE user_follow_state (
  user_did TEXT NOT NULL,
  target_did TEXT NOT NULL,
  following BOOLEAN DEFAULT FALSE,
  follow_uri TEXT,
  followed_by BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_did, target_did)
);

-- ============================================
-- PUSH SUBSCRIPTIONS (moved from Supabase)
-- ============================================
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_did TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_did);
```

---

## API Endpoints

### Feeds

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/feed/global` | Cannabis community feed |
| GET | `/api/feed/local` | Cannect network feed |
| GET | `/api/feed/following` | Posts from followed accounts |

### Posts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/post/:uri` | Single post |
| GET | `/api/post/:uri/thread` | Full thread (parents + replies) |
| GET | `/api/post/:uri/replies` | Paginated replies |
| POST | `/api/post` | Create post |
| POST | `/api/reply` | Create reply |
| DELETE | `/api/post/:uri` | Delete post |

### Profiles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile/:handle` | Profile info |
| GET | `/api/profile/:handle/posts` | User's posts |
| GET | `/api/profile/:handle/replies` | User's replies |
| GET | `/api/profile/:handle/media` | Posts with media |
| GET | `/api/profile/:handle/likes` | Liked posts |
| GET | `/api/profile/:did/followers` | Followers list |
| GET | `/api/profile/:did/following` | Following list |

### Actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/like` | Like a post |
| POST | `/api/unlike` | Unlike a post |
| POST | `/api/repost` | Repost |
| POST | `/api/unrepost` | Remove repost |
| POST | `/api/follow` | Follow user |
| POST | `/api/unfollow` | Unfollow user |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=&type=` | Search users/posts |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | User's notifications |
| POST | `/api/notifications/read` | Mark as read |
| GET | `/api/notifications/count` | Unread count |

### Push Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/push/subscribe` | Register push subscription |
| DELETE | `/api/push/subscribe` | Unregister subscription |
| POST | `/api/push/broadcast` | Admin broadcast (protected) |

---

## WebSocket Protocol

### Connection

```javascript
const ws = new WebSocket('wss://api.cannect.space/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'auth', token: 'user_jwt' }));
};
```

### Server → Client Events

```javascript
// Post updated (counts changed)
{ type: 'post_updated', post: { uri, likeCount, repostCount, replyCount } }

// New reply to a post being viewed
{ type: 'reply_added', parentUri: '...', reply: {...} }

// New notification for this user
{ type: 'notification', notification: { type: 'like', actor: {...}, ... } }

// Profile updated
{ type: 'profile_updated', profile: { did, followersCount, ... } }

// Post deleted
{ type: 'post_deleted', uri: '...' }
```

---

## Client Code (Simplified)

### Before (~2000+ lines)

```typescript
// Complex hooks with optimistic updates
export function useLikePost() {
  const queryClient = useQueryClient();
  const optimistic = createOptimisticContext(queryClient);

  return useMutation({
    mutationFn: async ({ uri, cid }) => atproto.likePost(uri, cid),
    onMutate: async ({ uri }) => {
      await optimistic.cancel();
      const snapshots = optimistic.snapshot();
      optimistic.updatePost(uri, postUpdaters.like);
      return snapshots;
    },
    onError: (err, variables, context) => {
      if (context) optimistic.restore(context);
    },
  });
}
```

### After (~200 lines)

```typescript
// Simple fetch, no optimistic updates needed
const API = 'https://api.cannect.space';

export const useFeed = (type: string) =>
  useQuery(['feed', type], () => 
    fetch(`${API}/api/feed/${type}`).then(r => r.json())
  );

export const useLike = () =>
  useMutation((uri: string) =>
    fetch(`${API}/api/like`, {
      method: 'POST',
      body: JSON.stringify({ uri }),
    }).then(r => r.json())
  );

// WebSocket handles real-time updates
export function useRealtime() {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const ws = new WebSocket('wss://api.cannect.space/ws');
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'post_updated') {
        queryClient.setQueryData(['post', data.post.uri], data.post);
      }
    };
    return () => ws.close();
  }, []);
}
```

### Files to Delete After Migration

| File | Lines |
|------|-------|
| `lib/hooks/optimistic-updates.ts` | 275 |
| `lib/hooks/use-atp-feed.ts` | 586 |
| `lib/hooks/use-atp-profile.ts` | ~300 |
| Most of `lib/atproto/agent.ts` | ~600 |
| Cache sync logic scattered around | ~200 |

**Total removed: ~2000+ lines**

---

## Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: cannect
      POSTGRES_USER: cannect
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cannect"]
      interval: 10s
      timeout: 5s
      retries: 5

  jetstream-indexer:
    build: ./jetstream-indexer
    container_name: jetstream-indexer
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://cannect:${POSTGRES_PASSWORD}@postgres:5432/cannect
      JETSTREAM_URL: wss://jetstream2.us-east.bsky.network/subscribe
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}
      VAPID_EMAIL: ${VAPID_EMAIL}

  api-server:
    build: ./api-server
    container_name: api-server
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://cannect:${POSTGRES_PASSWORD}@postgres:5432/cannect
      PORT: 3000
      JWT_SECRET: ${JWT_SECRET}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  pgdata:
```

---

## Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name api.cannect.space;

    ssl_certificate /etc/letsencrypt/live/api.cannect.space/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.cannect.space/privkey.pem;

    # REST API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

---

## Migration Plan

### Strategy: Fresh VPS, Parallel Operation, Zero Risk

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   OLD (Keep Running Until Confident)       NEW (Build Fresh)            │
│   ──────────────────────────────────       ─────────────────            │
│                                                                         │
│   Feed VPS (72.62.132.157)                 New Cache VPS (KVM 4)        │
│   ├── cannect-feed                         ├── postgres                 │
│   └── following-timeline                   ├── jetstream-indexer        │
│                                            └── api-server               │
│   Push VPS (72.60.26.75)                                                │
│   └── push-server                          Domain: api.cannect.space  │
│                                                                         │
│   App points to OLD                        Test with NEW                │
│                                                                         │
│                         When ready: Switch app to NEW                   │
│                         After 2 weeks stable: Shut down OLD             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Infrastructure (Day 1)

- [ ] Purchase new KVM 4 VPS from Hostinger
- [ ] Point `api.cannect.space` to new VPS IP
- [ ] Install Docker & Docker Compose
- [ ] Set up SSH access (`cannect-cache` alias)
- [ ] Configure firewall (allow 22, 80, 443, 3000)
- [ ] Install nginx & certbot for SSL

**Old VPS**: ✅ Running, serving app

---

### Phase 2: Database (Day 1-2)

- [ ] Create `/root/cache-vps/` directory
- [ ] Create `docker-compose.yml`
- [ ] Create `init.sql` with full schema
- [ ] Start PostgreSQL container
- [ ] Verify database connectivity
- [ ] Create `.env` with secrets

**Old VPS**: ✅ Running, serving app

---

### Phase 3: Jetstream Indexer (Days 2-4)

- [ ] Create `jetstream-indexer/` directory
- [ ] Implement Jetstream connection
- [ ] Implement post indexing (cannabis hashtags + cannect users)
- [ ] Implement follow tracking
- [ ] Implement like/repost count updates
- [ ] Implement notification creation
- [ ] Implement push notification sending
- [ ] Test: Verify data populating in PostgreSQL
- [ ] Run for 24+ hours, verify stability

**Old VPS**: ✅ Running, serving app

---

### Phase 4: API Server (Days 4-6)

- [ ] Create `api-server/` directory
- [ ] Implement health endpoint
- [ ] Implement feed endpoints
- [ ] Implement post endpoints
- [ ] Implement profile endpoints
- [ ] Implement action endpoints (proxy to Bluesky)
- [ ] Implement push subscription endpoints
- [ ] Implement WebSocket server
- [ ] Connect PostgreSQL NOTIFY to WebSocket
- [ ] Test all endpoints manually with curl

**Old VPS**: ✅ Running, serving app

---

### Phase 5: App Integration (Days 6-8)

- [ ] Create `lib/api-v2.ts` (new API client)
- [ ] Create new hooks in `lib/hooks-v2/`
- [ ] Add environment variable: `NEXT_PUBLIC_CACHE_API_URL`
- [ ] Create feature flag or separate build
- [ ] Test locally pointing to new VPS
- [ ] Deploy to staging/preview

**Old VPS**: ✅ Running, serving production app

---

### Phase 6: Switchover (Day 8-9)

- [ ] Configure nginx on new VPS
- [ ] Test SSL/HTTPS works
- [ ] Update production app to use new API
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Keep old VPS running as fallback

**Old VPS**: ✅ Still running (fallback)
**New VPS**: ✅ Serving production app

---

### Phase 7: Monitoring (Days 9-21)

- [ ] Monitor for 1-2 weeks
- [ ] Watch error rates
- [ ] Watch response times
- [ ] Watch WebSocket connection stability
- [ ] Watch push notification delivery
- [ ] Fix any issues

**Old VPS**: ✅ Still running (can rollback instantly)

---

### Phase 8: Cleanup (After 2+ Weeks Stable)

- [ ] Stop containers on Feed VPS
- [ ] Stop containers on Push VPS  
- [ ] Cancel/delete old VPS subscriptions
- [ ] Delete old client code (`optimistic-updates.ts`, old hooks)
- [ ] Update documentation
- [ ] 🎉 Done!

---

## Rollback Plan

At any point before cleanup:

```bash
# Instant rollback (app-side)
# Change environment variable back to old endpoints
# Deploy app

# Old VPS containers still running
# Zero downtime
```

---

## Environment Variables

### On New VPS (`.env`)

```env
# Database
POSTGRES_PASSWORD=<secure_random_64_chars>

# API Server
JWT_SECRET=<secure_random_64_chars>

# Push Notifications (same keys as current Push VPS)
VAPID_PUBLIC_KEY=BAI3bEJEd2lT72s7H-ahFjYcPpMn6cbxDIXMWHZnwsSGevLbWFvGCqHmhm0gyjjNgHkOh_0kcBvZCV90Y-5-stg
VAPID_PRIVATE_KEY=<your_private_key>
VAPID_EMAIL=mailto:hello@cannect.space
```

---

## Directory Structure on New VPS

```
/root/cache-vps/
├── docker-compose.yml
├── .env
├── init.sql
├── jetstream-indexer/
│   ├── Dockerfile
│   ├── package.json
│   ├── index.js
│   └── ...
└── api-server/
    ├── Dockerfile
    ├── package.json
    ├── index.js
    └── ...
```

---

## Monitoring & Health

### Health Endpoints

- `GET /health` - API server status
- `GET /health/db` - Database connectivity
- `GET /health/ws` - WebSocket connections count
- `GET /health/indexer` - Jetstream connection status

### Logs

```bash
# All containers
docker-compose logs -f

# Specific container
docker-compose logs -f api-server
docker-compose logs -f jetstream-indexer
docker-compose logs -f postgres
```

### Metrics to Track

- API response times (p50, p95, p99)
- WebSocket connection count
- Jetstream lag (seconds behind real-time)
- Push notification delivery rate
- Database query times
- Error rates by endpoint

---

## Success Criteria

- [ ] All feeds load from new api-server
- [ ] All profiles load correctly
- [ ] Like/repost/follow actions work
- [ ] Push notifications deliver
- [ ] WebSocket receives real-time updates
- [ ] No optimistic update code in client
- [ ] Response times < 100ms (p95)
- [ ] Zero downtime during migration
- [ ] Old VPS can be shut down

---

## Summary

| Question | Answer |
|----------|--------|
| New VPS or upgrade existing? | **New VPS** (clean start) |
| Domain? | `api.cannect.space` |
| Keep old VPS running? | **Yes**, until new is proven (2+ weeks) |
| Include push notifications? | **Yes**, consolidates everything |
| Push subscriptions storage? | **PostgreSQL** (no more Supabase) |
| How many containers? | **3** (postgres, jetstream-indexer, api-server) |
| How many Jetstream connections? | **1** (down from 2) |
| Client code reduction? | **~2000 lines → ~200 lines** |

---

## Cost Analysis

| Current | After |
|---------|-------|
| Feed VPS (KVM 1): ~$5-10/mo | New Cache VPS (KVM 4): ~$20/mo |
| Push VPS (KVM 1): ~$5-10/mo | - |
| Supabase (push subs): Free tier | - |
| **Total: ~$10-20/mo** | **Total: ~$20/mo** |

Similar cost, but:
- Consolidated infrastructure
- Better performance (KVM 4)
- No external dependencies (Supabase)
- Simpler to manage
- One place for everything

---

*Document created: December 30, 2025*
*Ready to start: Tomorrow*
