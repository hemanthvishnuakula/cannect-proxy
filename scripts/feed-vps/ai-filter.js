// AI-based content filtering using OpenAI API
// Uses gpt-4o-mini for cannabis content classification

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

// Rate limiting - be gentle, no hard limits but good practice
const MIN_DELAY_MS = 100; // 100ms between requests
let lastRequestTime = 0;

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


/**
 * Wait for rate limit if needed
 */
async function waitForRateLimit() {
  const now = Date.now();
  
  // Ensure minimum delay between requests
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Verify if a post is genuinely about cannabis using OpenAI
 * @param {string} text - The post text to analyze
 * @returns {Promise<{isCannabis: boolean, error: boolean}>}
 */
async function verifyWithAI(text) {
  if (!OPENAI_API_KEY) {
    console.error('[AI-Filter] OPENAI_API_KEY not set');
    return { isCannabis: false, error: true };
  }

  try {
    // Wait for rate limit
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
      console.error(`[AI-Filter] API error ${response.status}:`, errorData);
      return { isCannabis: false, error: true };
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim()?.toUpperCase();
    
    const isCannabis = answer === 'YES';
    console.log(`[AI-Filter] "${text.substring(0, 50)}..." → ${answer}`);
    
    return { isCannabis, error: false };
  } catch (error) {
    console.error('[AI-Filter] Request failed:', error.message);
    return { isCannabis: false, error: true };
  }
}

/**
 * Batch verify multiple posts (for future optimization)
 * @param {string[]} texts - Array of post texts
 * @returns {Promise<{results: boolean[], error: boolean}>}
 */
async function verifyBatchWithAI(texts) {
  // For now, just process sequentially with small delay to avoid rate limits
  const results = [];
  for (const text of texts) {
    const result = await verifyWithAI(text);
    results.push(result.isCannabis);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return { results, error: false };
}

module.exports = {
  verifyWithAI,
  verifyBatchWithAI,
};
