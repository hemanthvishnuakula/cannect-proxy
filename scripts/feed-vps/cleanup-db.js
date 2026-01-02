// Database cleanup script - Re-verify all posts through AI
// Run with: node cleanup-db.js

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `Cannabis feed curator. Answer YES or NO only.

YES = post about cannabis/marijuana:
- Weed, THC, CBD, dispensary, strains
- Smoking, dabbing (cannabis), edibles, vapes
- 420, stoner culture, getting high (on weed)
- Growing cannabis, medical marijuana

NO = not about cannabis:
- "high af" (gaming/emotions), "baked" (tired/cooking)
- "dabbing" (dance move), weather "High: 75°F"
- Sports records, movie titles, Star Wars
- Hybrid cars, joint ventures, hash browns
- Vocaloid/anime (MMJ Rin), fibromyalgia

Context matters: "I'm high" after mentioning weed = YES, after rollercoaster = NO`;

// Rate limiting
const MIN_DELAY_MS = 100;
let lastRequestTime = 0;

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

// Fetch post text from AT Protocol
async function fetchPostText(uri) {
  try {
    // Parse URI: at://did:plc:xxx/app.bsky.feed.post/yyy
    const parts = uri.replace('at://', '').split('/');
    const did = parts[0];
    const rkey = parts[2];
    
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.thread?.post?.record?.text || null;
  } catch (error) {
    return null;
  }
}

async function verifyWithAI(text) {
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set');
    process.exit(1);
  }

  try {
    await waitForRateLimit();
    
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Is this post about cannabis? "${text}"` }
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`API error ${response.status}:`, errorData);
      return { isCannabis: null, error: true };
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim()?.toUpperCase();
    
    return { isCannabis: answer === 'YES', answer, error: false };
  } catch (error) {
    console.error('Request failed:', error.message);
    return { isCannabis: null, error: true };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Cannect Feed Database Cleanup');
  console.log('='.repeat(60));
  
  // Open database
  const dbPath = path.join(__dirname, 'data', 'posts.db');
  const db = new Database(dbPath);
  
  // Get all posts
  const posts = db.prepare('SELECT uri FROM posts ORDER BY indexed_at DESC').all();
  console.log(`\nTotal posts to verify: ${posts.length}`);
  console.log(`Estimated time: ${Math.ceil(posts.length * 0.2 / 60)} minutes`);
  console.log(`Estimated cost: ~$${(posts.length * 0.0002).toFixed(2)}\n`);
  
  // Stats
  let verified = 0;
  let kept = 0;
  let removed = 0;
  let errors = 0;
  let notFound = 0;
  const toRemove = [];
  
  // Process each post
  for (const post of posts) {
    verified++;
    
    // Fetch post text from API
    const text = await fetchPostText(post.uri);
    
    if (!text) {
      // Post deleted or not found - remove it
      notFound++;
      toRemove.push(post.uri);
      console.log(`[${verified}/${posts.length}] NOT FOUND: ${post.uri.substring(0, 60)}...`);
      continue;
    }
    
    const preview = text.substring(0, 50).replace(/\n/g, ' ');
    
    const result = await verifyWithAI(text);
    
    if (result.error) {
      errors++;
      console.log(`[${verified}/${posts.length}] ERROR: ${preview}...`);
      continue;
    }
    
    if (result.isCannabis) {
      kept++;
      // Only log occasionally to reduce noise
      if (verified % 100 === 0) {
        console.log(`[${verified}/${posts.length}] Progress: ${kept} kept, ${removed} to remove, ${notFound} not found`);
      }
    } else {
      removed++;
      toRemove.push(post.uri);
      console.log(`[${verified}/${posts.length}] REMOVE: ${preview}... → ${result.answer}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total verified: ${verified}`);
  console.log(`Kept: ${kept}`);
  console.log(`To remove (false positives): ${removed}`);
  console.log(`Not found (deleted posts): ${notFound}`);
  console.log(`Errors: ${errors}`);
  
  if (toRemove.length > 0) {
    console.log(`\nRemoving ${toRemove.length} posts from database...`);
    
    const deleteStmt = db.prepare('DELETE FROM posts WHERE uri = ?');
    const deleteMany = db.transaction((uris) => {
      for (const uri of uris) {
        deleteStmt.run(uri);
      }
    });
    
    deleteMany(toRemove);
    console.log('Done! Posts removed.');
  } else {
    console.log('\nNo posts to remove. Database is clean!');
  }
  
  // Final count
  const finalCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
  console.log(`\nFinal post count: ${finalCount.count}`);
  
  db.close();
}

main().catch(console.error);
