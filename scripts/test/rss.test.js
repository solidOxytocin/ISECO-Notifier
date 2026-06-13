/**
 * RSS parser smoke test (no network).
 * Run: node test/rss.test.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Inline minimal parser test — mirrors supabase/functions/_shared/rss.ts logic
function extractImageUrls(block) {
  const urls = [];
  const enclosureRe = /<enclosure[^>]+url="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = enclosureRe.exec(block)) !== null) {
    if (m[1].match(/\.(jpg|jpeg|png|webp)/i)) urls.push(m[1]);
  }
  return [...new Set(urls)];
}

const sampleRss = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title>ISECO outage</title>
  <link>https://facebook.com/posts/123456</link>
  <guid>fb-123456</guid>
  <description>Scheduled interruption</description>
  <enclosure url="https://example.com/outage1.jpg" type="image/jpeg"/>
  <enclosure url="https://example.com/outage2.png" type="image/png"/>
</item>
</channel></rss>`;

const item = sampleRss.match(/<item[\s\S]*?<\/item>/i)[0];
const urls = extractImageUrls(item);

if (urls.length !== 2) {
  console.error('Expected 2 image URLs, got', urls.length);
  process.exit(1);
}

console.log('rss parser test passed');
