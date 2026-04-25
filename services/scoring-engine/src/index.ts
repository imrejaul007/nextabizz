import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { calculateSupplierScore, runMonthlyScoring, SupplierScore } from './calculator';

// Environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

/**
 * Create Supabase client with service role key
 */
function createSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * CLI runner for the scoring engine
 */
async function main(): Promise<void> {
  console.log('Starting Scoring Engine...');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const supabase = createSupabaseClient();

  try {
    const result = await runMonthlyScoring(supabase);
    console.log(`\nScoring Engine completed successfully:`);
    console.log(`  - Suppliers scored: ${result.scored}`);
  } catch (error) {
    console.error('Scoring Engine failed:', error);
    process.exit(1);
  }

  console.log('Scoring Engine exiting...');
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}

// Export for use as a module
export { createSupabaseClient, main };
export { calculateSupplierScore, runMonthlyScoring };
export type { SupplierScore } from './calculator';
