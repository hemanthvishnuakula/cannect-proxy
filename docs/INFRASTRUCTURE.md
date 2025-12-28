# Cannect Infrastructure

> See private documentation for IP addresses, credentials, and SSH commands.
> Location: `e:\Projects\New World\cannect-private\INFRASTRUCTURE.md`

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CANNECT INFRASTRUCTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   USERS → cannect.space (Vercel) → Bluesky API                  │
│              ↓                         ↑                         │
│         push.cannect.space ←── Jetstream (notifications)        │
│         feed.cannect.space ←── Jetstream (feeds)                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Services

| Service | Domain | Purpose |
|---------|--------|---------|
| PDS | cannect.space | User accounts, posts, AT Protocol |
| Push | push.cannect.space | Real-time push notifications |
| Feed | feed.cannect.space | Feed aggregation, search, trending |
| Web App | cannect.space | PWA frontend (Vercel) |

## Tech Stack

- **Frontend:** Expo + React Native Web (PWA)
- **Hosting:** Vercel
- **PDS:** Official Bluesky PDS (Ubuntu)
- **Backend Services:** Node.js + Express + SQLite
- **Real-time:** Bluesky Jetstream WebSocket
- **DNS/CDN:** Cloudflare

## Documentation

- [PWA Architecture](./PWA_ARCHITECTURE.md)
- [PWA Troubleshooting](./PWA_TROUBLESHOOTING.md)
- [Federation Testing](./FEDERATION_TESTING.md)

## Private Documentation

Sensitive information (IPs, credentials, SSH keys) stored separately:
- **Local:** `e:\Projects\New World\cannect-private\`
- **NOT committed to git**
