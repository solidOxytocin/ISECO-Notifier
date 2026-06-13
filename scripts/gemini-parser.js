import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

export const PARSER_VERSION = '2.0.0-gemini-flash';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

export const SYSTEM_PROMPT = `You are a data extraction assistant for Ilocos Sur Electric Cooperative (ISECO) power outage notices.

ISECO posts Facebook images with a fixed poster template:
- Red header: "NOTICE OF POWER INTERRUPTION"
- Three columns: "Date and Time", "Areas Affected", "Purpose/s"
- Footer with MCO assistance numbers (ignore these)

Extract EVERY scheduled interruption row from the image. One image may contain multiple date/time rows.

Rules:
1. Return ONLY valid JSON matching the schema below. No markdown, no explanation.
2. Use 24-hour time format HH:MM (e.g. "08:30", "17:00"). Convert "12:00nn" to "12:00", "05:00pm" to "17:00", "5:30 am" to "05:30".
3. Dates as ISO YYYY-MM-DD. Infer year from caption if missing from image.
4. For "Whole 1st District EXCEPT Puro, Caoayan" set is_district_wide: true and list exclusions separately.
5. areas: list each affected location as a separate string. Include municipality context (e.g. "Baluarte, Vigan City").
6. areas_raw: copy areas exactly as written in the image.
7. purpose: the reason text from the Purpose/s column.
8. confidence: "high", "medium", or "low" based on text clarity.
9. If caption provides date range context, use it to resolve ambiguous dates.

JSON schema:
{
  "outages": [
    {
      "outage_date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "areas": ["string"],
      "areas_raw": ["string"],
      "exclusions": ["string"],
      "is_district_wide": false,
      "purpose": "string",
      "confidence": "high"
    }
  ]
}`;

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

      return {
        parser_version: PARSER_VERSION,
        model,
        outages: parsed.outages,
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
    if (!Array.isArray(o.areas_raw)) o.areas_raw = o.areas;
    if (!Array.isArray(o.exclusions)) o.exclusions = [];
    if (typeof o.is_district_wide !== 'boolean') o.is_district_wide = false;
    if (!o.confidence) o.confidence = 'medium';
  }
}

export function buildDedupKey({
  sourcePostId,
  imageIndex,
  outageDate,
  startTime,
  endTime,
  areas,
}) {
  const areasHash = [...(areas ?? [])].sort().join('|').toLowerCase();
  return `${sourcePostId}:${imageIndex}:${outageDate}:${startTime}:${endTime}:${areasHash}`;
}
