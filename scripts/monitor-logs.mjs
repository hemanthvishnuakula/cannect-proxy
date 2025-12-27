/**
 * Live Log Monitor
 * Streams app_logs from Supabase in real-time
 * 
 * Usage: node scripts/monitor-logs.mjs
 */

import { createClient } from '@supabase/supabase-js';

// Load from .env or use directly
const SUPABASE_URL = process.env.EXPO_PUBLIC_LOG_SUPABASE_URL || 'https://fmloudndgtxglvgruyjl.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_LOG_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtbG91ZG5kZ3R4Z2x2Z3J1eWpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MTM3ODgsImV4cCI6MjA4MjM4OTc4OH0.YmbdTjzy32j34iu0nZA3n0fT-cAHAsUBcVtGWXIPNOY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Colors for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function formatLog(log) {
  const time = new Date(log.created_at).toLocaleTimeString();
  
  // Status color
  let statusColor = colors.white;
  if (log.status === 'success') statusColor = colors.green;
  else if (log.status === 'error') statusColor = colors.red;
  else if (log.status === 'start') statusColor = colors.cyan;
  else if (log.status === 'info') statusColor = colors.blue;
  
  // Category color
  let catColor = colors.white;
  if (log.category === 'auth') catColor = colors.magenta;
  else if (log.category === 'push') catColor = colors.yellow;
  else if (log.category === 'post') catColor = colors.cyan;
  else if (log.category === 'error') catColor = colors.red;
  else if (log.category === 'nav') catColor = colors.gray;
  
  const category = `[${log.category}]`.padEnd(8);
  const action = log.action.padEnd(20);
  const status = log.status.padEnd(7);
  
  let output = `${colors.dim}${time}${colors.reset} `;
  output += `${catColor}${category}${colors.reset} `;
  output += `${statusColor}${status}${colors.reset} `;
  output += `${colors.bright}${action}${colors.reset}`;
  
  if (log.message) {
    output += ` ${colors.white}${log.message}${colors.reset}`;
  }
  
  if (log.error) {
    output += ` ${colors.red}ERROR: ${log.error}${colors.reset}`;
  }
  
  if (log.metadata && Object.keys(log.metadata).length > 0) {
    output += ` ${colors.dim}${JSON.stringify(log.metadata)}${colors.reset}`;
  }
  
  return output;
}

async function fetchRecent() {
  console.log(`${colors.cyan}📋 Fetching recent logs...${colors.reset}\n`);
  
  const { data, error } = await supabase
    .from('app_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    console.error(`${colors.red}Error fetching logs:${colors.reset}`, error.message);
    return;
  }
  
  if (data && data.length > 0) {
    console.log(`${colors.dim}── Last ${data.length} logs ──${colors.reset}\n`);
    // Reverse to show oldest first
    data.reverse().forEach(log => {
      console.log(formatLog(log));
    });
    console.log(`\n${colors.dim}── Live stream starting ──${colors.reset}\n`);
  }
}

async function startMonitor() {
  console.clear();
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════╗
║          🔴 CANNECT LIVE LOG MONITOR             ║
╚══════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Supabase: ${SUPABASE_URL}${colors.reset}
${colors.dim}Press Ctrl+C to stop${colors.reset}
`);

  // Fetch recent logs first
  await fetchRecent();

  // Subscribe to realtime inserts
  const channel = supabase
    .channel('app_logs_realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'app_logs',
      },
      (payload) => {
        console.log(formatLog(payload.new));
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`${colors.green}✓ Connected to realtime stream${colors.reset}\n`);
      } else if (status === 'CHANNEL_ERROR') {
        console.log(`${colors.red}✗ Realtime connection error${colors.reset}`);
      }
    });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Disconnecting...${colors.reset}`);
    supabase.removeChannel(channel);
    process.exit(0);
  });
}

startMonitor();
