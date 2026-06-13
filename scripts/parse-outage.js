#!/usr/bin/env node
/**
 * Phase 1: Parse a single ISECO outage image with Gemini Flash.
 *
 * Usage:
 *   node parse-outage.js <image-path> [--caption "post caption text"]
 *
 * Requires GEMINI_API_KEY in .env (project root or scripts folder).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseOutageImage } from './gemini-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

function parseArgs(argv) {
  const args = { imagePath: null, caption: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--caption' && argv[i + 1]) {
      args.caption = argv[++i];
    } else if (!argv[i].startsWith('--')) {
      args.imagePath = argv[i];
    }
  }
  return args;
}

async function main() {
  const { imagePath, caption } = parseArgs(process.argv);

  if (!imagePath) {
    console.error('Usage: node parse-outage.js <image-path> [--caption "text"]');
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY. Get one at https://aistudio.google.com/apikey');
    process.exit(1);
  }

  const resolved = path.resolve(imagePath);
  console.log(`Parsing: ${resolved}`);
  if (caption) console.log(`Caption: ${caption}`);

  const result = await parseOutageImage({
    imagePath: resolved,
    caption,
    apiKey,
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(`\nExtracted ${result.outages.length} outage(s) via ${result.model}.`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
