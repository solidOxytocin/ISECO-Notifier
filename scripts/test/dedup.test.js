import { buildDedupKey } from '../gemini-parser.js';
import assert from 'assert';

const key1 = buildDedupKey({
  sourcePostId: 'fb_123',
  imageIndex: 0,
  outageDate: '2026-06-15',
  startTime: '05:30',
  endTime: '13:30',
  areas: ['Nagpanaoan, Santa', 'Whole 1st District'],
});

const key2 = buildDedupKey({
  sourcePostId: 'fb_123',
  imageIndex: 0,
  outageDate: '2026-06-15',
  startTime: '05:30',
  endTime: '13:30',
  areas: ['Whole 1st District', 'Nagpanaoan, Santa'],
});

assert.strictEqual(key1, key2, 'areas order should not affect dedup key');

const key3 = buildDedupKey({
  sourcePostId: 'fb_123',
  imageIndex: 1,
  outageDate: '2026-06-15',
  startTime: '05:30',
  endTime: '13:30',
  areas: ['Whole 1st District'],
});

assert.notStrictEqual(key1, key3, 'different image index should differ');

console.log('dedup tests passed');
