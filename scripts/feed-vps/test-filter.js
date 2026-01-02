// Test script for filter logic
const { shouldIncludePost } = require('./feed-logic');

const tests = [
  'mmm chem dawg is some good shit, sunshine diesel',
  'time for a blunt then some breakfast',
  'This Wordle #1654 scored 139 out of 420',
  'NASA Northern Lights aurora',
  'Northern Lights strain 24% THC',
  'Sour Diesel from the dispensary',
  'I just smoked some blue dream',
  'purple haze jimi hendrix guitar solo',
  'growing some OG kush in my tent',
  'chemdawg is fire, super dank nugs',
  'just harvested my bubba kush',
  'rolled a blunt of that ice cream cake',
];

console.log('Filter Logic Tests:');
console.log('='.repeat(60));
tests.forEach((t) => {
  const r = shouldIncludePost('test.bsky.social', t);
  console.log(r.include ? '✓ INCLUDE' : '✗ EXCLUDE', `[${r.reason}]`);
  console.log(`  Score: ${r.contextScore}, Text: "${t.substring(0, 60)}"`);
});
