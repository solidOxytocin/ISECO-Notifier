#!/usr/bin/env node
/**
 * Run all test cases in test-cases/cases.json against Gemini Flash.
 * Skips API calls if GEMINI_API_KEY is not set.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseOutageImage } from './gemini-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const casesPath = path.join(__dirname, 'test-cases', 'cases.json');
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));
const apiKey = process.env.GEMINI_API_KEY;

let passed = 0;
let failed = 0;
let skipped = 0;

for (const tc of cases) {
  const imagePath = path.resolve(__dirname, tc.image);

  if (!fs.existsSync(imagePath)) {
    console.log(`SKIP  ${tc.name} — image not found: ${imagePath}`);
    skipped++;
    continue;
  }

  if (!apiKey) {
    console.log(`SKIP  ${tc.name} — no GEMINI_API_KEY (dry run)`);
    skipped++;
    continue;
  }

  process.stdout.write(`RUN   ${tc.name}... `);

  try {
    const result = await parseOutageImage({
      imagePath,
      caption: tc.caption ?? '',
      apiKey,
    });

    const count = result.outages.length;
    if (tc.expect_min_outages && count < tc.expect_min_outages) {
      throw new Error(`Expected >= ${tc.expect_min_outages} outages, got ${count}`);
    }

    if (tc.expect_fields) {
      const match = result.outages.some((o) =>
        Object.entries(tc.expect_fields).every(([k, v]) => o[k] === v)
      );
      if (!match) {
        throw new Error(
          `No outage matched expected fields: ${JSON.stringify(tc.expect_fields)}`
        );
      }
    }

    console.log(`PASS (${count} outage(s))`);
    passed++;
  } catch (err) {
    console.log(`FAIL — ${err.message}`);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) process.exit(1);
