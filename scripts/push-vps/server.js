/**
 * Cannect Web Push Server + Jetstream Listener
 * Handles push subscriptions and real-time AT Protocol notifications
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const WebSocket = require('ws');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'push.db');

// Jetstream config - official Bluesky firehose
const JETSTREAM_URL = 'wss://jetstream2.us-west.bsky.network/subscribe';
const WANTED_COLLECTIONS = [
  'app.bsky.feed.like',
  'app.bsky.feed.repost', 
  'app.bsky.graph.follow',
  'app.bsky.feed.post', // For replies
];

// VAPID setup
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:hello@cannect.space',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Database
let db;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_did TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_did ON subscriptions(user_did)`);
  
  // Track sent notifications to prevent duplicates
  db.run(`
    CREATE TABLE IF NOT EXISTS sent_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Clean old sent notifications (keep last 24 hours)
  db.run(`DELETE FROM sent_notifications WHERE created_at < datetime('now', '-1 day')`);
  
  saveDb();
  console.log('[DB] Initialized');
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Check if user has push subscription
function hasSubscription(userDid) {
  const result = db.exec('SELECT 1 FROM subscriptions WHERE user_did = ? LIMIT 1', [userDid]);
  return result.length > 0 && result[0].values.length > 0;
}

// Get all subscribed DIDs for fast lookup
function getSubscribedDids() {
  const result = db.exec('SELECT DISTINCT user_did FROM subscriptions');
  if (!result.length) return new Set();
  return new Set(result[0].values.map(row => row[0]));
}

// Check if we already sent this notification
function alreadySent(eventId) {
  const result = db.exec('SELECT 1 FROM sent_notifications WHERE event_id = ?', [eventId]);
  return result.length > 0 && result[0].values.length > 0;
}

// Mark notification as sent
function markSent(eventId) {
  try {
    db.run('INSERT OR IGNORE INTO sent_notifications (event_id) VALUES (?)', [eventId]);
    saveDb();
  } catch (e) {
    // Ignore duplicates
  }
}

// Send push to a specific user
async function sendPushToUser(userDid, notification) {
  const rows = db.exec('SELECT endpoint, keys_p256dh, keys_auth FROM subscriptions WHERE user_did = ?', [userDid]);
  
  if (!rows.length || !rows[0].values.length) {
    return { sent: 0, failed: 0 };
  }

  const payload = JSON.stringify(notification);
  let sent = 0;
  let failed = 0;

  for (const [endpoint, p256dh, auth] of rows[0].values) {
    try {
      await webpush.sendNotification({
        endpoint,
        keys: { p256dh, auth }
      }, payload);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired, remove it
        db.run('DELETE FROM subscriptions WHERE endpoint = ?', [endpoint]);
        saveDb();
        console.log(`[Push] Removed expired subscription for ${userDid}`);
      } else {
        console.error(`[Push] Failed to send to ${userDid}:`, err.message);
      }
    }
  }

  return { sent, failed };
}

// =====================================================
// JETSTREAM - AT Protocol Real-time Listener
// =====================================================

let jetstreamWs = null;
let jetstreamReconnectTimer = null;
let subscribedDids = new Set();

function refreshSubscribedDids() {
  subscribedDids = getSubscribedDids();
  console.log(`[Jetstream] Tracking ${subscribedDids.size} subscribed users`);
}

function connectJetstream() {
  // Refresh the list of users we're tracking
  refreshSubscribedDids();
  
  if (subscribedDids.size === 0) {
    console.log('[Jetstream] No subscribed users, will retry in 60s');
    jetstreamReconnectTimer = setTimeout(connectJetstream, 60000);
    return;
  }

  const params = new URLSearchParams();
  WANTED_COLLECTIONS.forEach(c => params.append('wantedCollections', c));
  
  const url = `${JETSTREAM_URL}?${params.toString()}`;
  console.log('[Jetstream] Connecting to:', url);

  jetstreamWs = new WebSocket(url);

  jetstreamWs.on('open', () => {
    console.log('[Jetstream] Connected to Bluesky firehose');
  });

  jetstreamWs.on('message', async (data) => {
    try {
      const event = JSON.parse(data.toString());
      await handleJetstreamEvent(event);
    } catch (err) {
      // Ignore parse errors
    }
  });

  jetstreamWs.on('error', (err) => {
    console.error('[Jetstream] WebSocket error:', err.message);
  });

  jetstreamWs.on('close', () => {
    console.log('[Jetstream] Connection closed, reconnecting in 5s...');
    jetstreamWs = null;
    jetstreamReconnectTimer = setTimeout(connectJetstream, 5000);
  });
}

async function handleJetstreamEvent(event) {
  // Only handle commit events (new records)
  if (event.kind !== 'commit' || event.commit?.operation !== 'create') {
    return;
  }

  const { did: actorDid, commit } = event;
  const { collection, record, rkey } = commit;
  
  if (!record) return;

  let targetDid = null;
  let notificationType = null;
  let notificationData = {};

  // =====================================================
  // LIKE: Someone liked a post
  // =====================================================
  if (collection === 'app.bsky.feed.like') {
    // record.subject.uri = at://did:plc:xxx/app.bsky.feed.post/yyy
    const subjectUri = record.subject?.uri;
    if (!subjectUri) return;
    
    // Extract the DID of the post author
    const match = subjectUri.match(/at:\/\/(did:[^/]+)/);
    if (!match) return;
    
    targetDid = match[1];
    notificationType = 'like';
    notificationData = {
      title: '❤️ New Like',
      body: 'Someone liked your post',
      data: {
        type: 'like',
        postUri: subjectUri,
        actorDid,
      }
    };
  }
  
  // =====================================================
  // REPOST: Someone reposted
  // =====================================================
  else if (collection === 'app.bsky.feed.repost') {
    const subjectUri = record.subject?.uri;
    if (!subjectUri) return;
    
    const match = subjectUri.match(/at:\/\/(did:[^/]+)/);
    if (!match) return;
    
    targetDid = match[1];
    notificationType = 'repost';
    notificationData = {
      title: '🔁 Reposted',
      body: 'Someone reposted your post',
      data: {
        type: 'repost',
        postUri: subjectUri,
        actorDid,
      }
    };
  }
  
  // =====================================================
  // FOLLOW: Someone followed
  // =====================================================
  else if (collection === 'app.bsky.graph.follow') {
    targetDid = record.subject;
    if (!targetDid) return;
    
    notificationType = 'follow';
    notificationData = {
      title: '👤 New Follower',
      body: 'Someone started following you',
      data: {
        type: 'follow',
        actorDid,
      }
    };
  }
  
  // =====================================================
  // REPLY: Someone replied to a post
  // =====================================================
  else if (collection === 'app.bsky.feed.post') {
    // Check if this is a reply
    const replyParent = record.reply?.parent?.uri;
    if (!replyParent) return; // Not a reply
    
    const match = replyParent.match(/at:\/\/(did:[^/]+)/);
    if (!match) return;
    
    targetDid = match[1];
    
    // Don't notify for self-replies
    if (targetDid === actorDid) return;
    
    notificationType = 'reply';
    notificationData = {
      title: '💬 New Reply',
      body: record.text?.substring(0, 100) || 'Someone replied to your post',
      data: {
        type: 'reply',
        postUri: `at://${actorDid}/${collection}/${rkey}`,
        parentUri: replyParent,
        actorDid,
      }
    };
  }

  // =====================================================
  // Send notification if target is subscribed
  // =====================================================
  if (targetDid && notificationType && subscribedDids.has(targetDid)) {
    // Don't notify yourself
    if (targetDid === actorDid) return;
    
    // Create unique event ID
    const eventId = `${collection}:${actorDid}:${rkey}`;
    
    // Check for duplicate
    if (alreadySent(eventId)) return;
    
    console.log(`[Jetstream] ${notificationType} for ${targetDid.substring(0, 20)}... from ${actorDid.substring(0, 20)}...`);
    
    // Mark as sent first (prevent race conditions)
    markSent(eventId);
    
    // Send the push
    const result = await sendPushToUser(targetDid, notificationData);
    console.log(`[Jetstream] Push result: ${result.sent} sent, ${result.failed} failed`);
  }
}

// Periodically refresh subscribed DIDs (in case new users subscribe)
setInterval(refreshSubscribedDids, 60000);

// =====================================================
// EXPRESS ROUTES
// =====================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    jetstream: jetstreamWs?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
    subscribedUsers: subscribedDids.size
  });
});

// Get VAPID public key
app.get('/api/push/vapid-key', (req, res) => {
  console.log('[VAPID] Key requested');
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY,
    enabled: true
  });
});

// Subscribe to push
app.post('/api/push/subscribe', (req, res) => {
  console.log('[Subscribe] Request body:', JSON.stringify(req.body));
  try {
    const { userDid, subscription } = req.body;

    if (!userDid || !subscription?.endpoint || !subscription?.keys) {
      console.log('[Subscribe] Missing fields:', { userDid: !!userDid, endpoint: !!subscription?.endpoint, keys: !!subscription?.keys });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Upsert subscription
    db.run(`
      INSERT OR REPLACE INTO subscriptions (user_did, endpoint, keys_p256dh, keys_auth)
      VALUES (?, ?, ?, ?)
    `, [userDid, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
    
    saveDb();
    
    // Refresh the subscribed DIDs set
    refreshSubscribedDids();
    
    console.log(`[Push] Subscribed: ${userDid}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Subscribe error:', err);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe
app.delete('/api/push/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }

    db.run('DELETE FROM subscriptions WHERE endpoint = ?', [endpoint]);
    saveDb();
    refreshSubscribedDids();
    
    console.log('[Push] Unsubscribed');
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Unsubscribe error:', err);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Send push to user (manual/internal API)
app.post('/api/push/send', async (req, res) => {
  try {
    const { userDid, title, body, url, icon, data } = req.body;

    if (!userDid || !title) {
      return res.status(400).json({ error: 'Missing userDid or title' });
    }

    const notification = {
      title,
      body: body || '',
      url: url || 'https://cannect.space',
      icon: icon || '/icon-192.png',
      data: data || {}
    };

    const result = await sendPushToUser(userDid, notification);
    console.log(`[Push] Manual send to ${userDid}: ${result.sent} success, ${result.failed} failed`);
    res.json(result);
  } catch (err) {
    console.error('[Push] Send error:', err);
    res.status(500).json({ error: 'Failed to send' });
  }
});

// Stats
app.get('/api/push/stats', (req, res) => {
  try {
    const totalResult = db.exec('SELECT COUNT(*) FROM subscriptions');
    const usersResult = db.exec('SELECT COUNT(DISTINCT user_did) FROM subscriptions');
    res.json({
      totalSubscriptions: totalResult[0]?.values[0]?.[0] || 0,
      uniqueUsers: usersResult[0]?.values[0]?.[0] || 0,
      jetstreamConnected: jetstreamWs?.readyState === WebSocket.OPEN
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// =====================================================
// START SERVER
// =====================================================

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] Cannect Push running on port ${PORT}`);
    
    // Start Jetstream listener after a short delay
    setTimeout(connectJetstream, 2000);
  });
}).catch(err => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
