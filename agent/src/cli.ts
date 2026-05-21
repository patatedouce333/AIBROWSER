#!/usr/bin/env node
import { runTask } from './agent';

const API_KEY = process.env.INCEPTION_API_KEY || '';
const [,, task, url] = process.argv;

if (!task || !url) {
  console.error('Usage: node dist/cli.js "<task>" "<url>"');
  console.error('  INCEPTION_API_KEY=sk_... node dist/cli.js "search for bananas" "https://google.com"');
  process.exit(1);
}

if (!API_KEY) {
  console.error('Error: INCEPTION_API_KEY environment variable required');
  process.exit(1);
}

(async () => {
  const result = await runTask(task, url, { apiKey: API_KEY });

  if (!result.success) {
    console.error('\nTask failed:', result.error || 'some steps failed');
    process.exit(1);
  }

  console.log('\nResult:', JSON.stringify(result, null, 2));
})().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
