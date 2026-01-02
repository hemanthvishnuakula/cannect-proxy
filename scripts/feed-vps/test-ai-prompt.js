// Test the improved AI prompt
require('dotenv').config();
const { verifyWithAI } = require('./ai-filter');

const tests = [
  // Should be NO (false positives we caught before)
  { text: 'Mega Wendy is high af', expected: false },
  { text: 'Tomorrow I am going to ask a children what dabbing is', expected: false },
  { text: 'i am baked and yall i am so sad about jinx she makes me SO SAD', expected: false },
  { text: 'I bought an Outlander hybrid SUV after my accident', expected: false },
  { text: 'niigo len and mmj rin are quite me core', expected: false },
  { text: 'Watched THE HIGH COMMISSIONER (1968). Rod Taylor, Christopher Plummer', expected: false },
  { text: 'This Sugar Bowl is either drunk or high on speed', expected: false },
  { text: 'RAPID CITY AIRPORT SD Jan 1 Climate: High: 37 Low: 25', expected: false },
  { text: 'half baked idea: instead of a bye the top seeds play teams ranked around the 20s', expected: false },
  { text: 'Yo, my Mom is high AF', expected: false },
  
  // Should be YES (true cannabis content)
  { text: 'Just picked up some OG Kush from the dispensary', expected: true },
  { text: 'Wake and bake with some Blue Dream this morning #420', expected: true },
  { text: 'Finally got my medical card, visiting dispensary tomorrow', expected: true },
  { text: 'I am so stoned right now watching movies with munchies', expected: true },
  { text: 'Growing my first cannabis plant, week 4 of flowering', expected: true },
  { text: 'smoking my last bowl of Super Boof weed', expected: true },
  { text: 'Can we normalize dabbing? Like the actual smoking kind', expected: true },
  { text: '500mg thc San Marzano DOP tomatoes', expected: true },
  { text: ':) joint time #weed #pothead #stoner #smoke', expected: true },
  { text: 'Kinda annoyed at a friend for smoking weed indoors', expected: true },
];

(async () => {
  console.log('='.repeat(60));
  console.log('AI Prompt Test - Improved Cannect Curator');
  console.log('='.repeat(60));
  
  let correct = 0;
  let total = tests.length;
  
  for (let i = 0; i < tests.length; i++) {
    const { text, expected } = tests[i];
    const result = await verifyWithAI(text);
    const passed = result.isCannabis === expected;
    
    if (passed) correct++;
    
    const status = passed ? '✓' : '✗';
    const got = result.isCannabis ? 'YES' : 'NO';
    const exp = expected ? 'YES' : 'NO';
    
    console.log(`[${i+1}/${total}] ${status} Got: ${got} Expected: ${exp} | ${text.substring(0, 40)}...`);
  }
  
  console.log('='.repeat(60));
  console.log(`Results: ${correct}/${total} correct (${Math.round(correct/total*100)}%)`);
  console.log('='.repeat(60));
})();
