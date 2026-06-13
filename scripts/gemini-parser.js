import { GoogleGenerativeAI } from '@google/generative-ai';
import { normalizeOutages } from './normalize-outage.js';
import { SYSTEM_PROMPT } from './parser-prompt.js';
import fs from 'fs';
import path from 'path';

export const PARSER_VERSION = '2.2.0-partial';
// 2.0-flash has limit:0 on free tier; use 2.5-flash-lite (free) or override via GEMINI_MODEL
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';

export { SYSTEM_PROMPT };

function userPrompt(caption) {
  return caption
    ? `Facebook caption:\n${caption}\n\nExtract all outage schedules from this ISECO notice image.`
    : 'Extract all outage schedules from this ISECO notice image.';
}

/**
 * @param {object} options
 * @param {string} options.imagePath
 * @param {string} [options.caption]
 * @param {string} options.apiKey - Gemini API key
 * @param {string} [options.model]
 * @param {number} [options.maxRetries=2]
 */
export async function parseOutageImage({
  imagePath,
  caption = '',
  apiKey,
  model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  maxRetries = 2,
}) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  const base64 = fs.readFileSync(imagePath).toString('base64');
  const prompt = userPrompt(caption);

  const genAI = new GoogleGenerativeAI(apiKey);
  const gemini = genAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  let lastRaw = '';
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let result;

      if (attempt === 0) {
        result = await gemini.generateContent([
          { inlineData: { data: base64, mimeType } },
          { text: prompt },
        ]);
      } else {
        const chat = gemini.startChat({
          history: [
            {
              role: 'user',
              parts: [
                { inlineData: { data: base64, mimeType } },
                { text: prompt },
              ],
            },
            { role: 'model', parts: [{ text: lastRaw }] },
          ],
        });
        result = await chat.sendMessage(
          'Your previous response was invalid JSON. Return ONLY the corrected JSON object matching the schema. No markdown fences.'
        );
      }

      lastRaw = result.response.text().trim();
      const parsed = parseJsonResponse(lastRaw);
      validateOutages(parsed);
      const normalized = normalizeOutages(parsed);

      return {
        parser_version: PARSER_VERSION,
        model,
        outages: normalized.outages,
        raw_response: lastRaw,
      };
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) {
        throw new Error(
          `Gemini parsing failed after ${maxRetries + 1} attempts: ${err.message}`,
          { cause: err }
        );
      }
    }
  }
}

function parseJsonResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(cleaned);
}

function validateOutages(data) {
  if (!data || !Array.isArray(data.outages)) {
    throw new Error('Response missing outages array');
  }

  for (const o of data.outages) {
    if (!o.outage_date || !o.start_time || !o.end_time) {
      throw new Error(`Outage missing required date/time fields: ${JSON.stringify(o)}`);
    }
    if (!Array.isArray(o.areas)) o.areas = [];
    if (!Array.isArray(o.partial_areas)) o.partial_areas = [];
    if (!Array.isArray(o.areas_raw)) o.areas_raw = o.areas;
    if (!Array.isArray(o.exclusions)) o.exclusions = [];
    if (!o.confidence) o.confidence = 'medium';
    if (o.district !== '1st' && o.district !== '2nd') o.district = null;
  }
}

export function buildDedupKey({
  sourcePostId,
  imageIndex,
  outageDate,
  startTime,
  endTime,
  areas,
  partial_areas = [],
  district = null,
  exclusions = [],
}) {
  const areasHash = [...(areas ?? [])].sort().join('|').toLowerCase();
  const partialHash = [...partial_areas].sort().join('|').toLowerCase();
  const exclHash = [...exclusions].sort().join('|').toLowerCase();
  const districtPart = district ? `d:${district}` : '';
  return `${sourcePostId}:${imageIndex}:${outageDate}:${startTime}:${endTime}:${districtPart}:${areasHash}:p:${partialHash}:${exclHash}`;
}
