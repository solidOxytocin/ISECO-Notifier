import { normalizeOutages } from "./normalize.ts";
import type { DistrictId } from "./ilocos-sur-districts.ts";

export const PARSER_VERSION = "2.3.0-emergency";
// 2.0-flash has limit:0 on free tier; use 2.5-flash-lite (free) or override via GEMINI_MODEL
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export const SYSTEM_PROMPT = `You are a data extraction assistant for Ilocos Sur Electric Cooperative (ISECO) power outage notices.

ISECO posts two kinds of outage notices:

A) SCHEDULED — fixed poster template:
- Red header: "NOTICE OF POWER INTERRUPTION"
- Three columns: "Date and Time", "Areas Affected", "Purpose/s"
- Footer with MCO assistance numbers (ignore these)
- Extract EVERY scheduled interruption row. One image may contain multiple date/time rows.
- Set outage_type: "scheduled" with both start_time and end_time.

B) EMERGENCY (unscheduled) — often Facebook caption text with a photo (image may NOT be a poster):
- Title: "Emergency Power Interruption" or "ISECO ... Power Advisory"
- Date of event
- "As of {time}" — use as start_time; there is NO end time (end_time: null)
- Areas Affected — barangay/location list; "Parts of ..." / "Northern parts of ..." → partial_areas
- "Reason:" line → purpose field
- Feeder/substation headers (e.g. "Feeder 1 Vigan Sub Station") are HEADERS — do NOT put in areas
- Set outage_type: "emergency"
- Details may be in the Facebook caption even when the image is unrelated

If the post is NOT an outage notice (holiday advisory, office closure, PR/celebration, billing notice, job posting), return {"outages": []}.

Rules:
1. Return ONLY valid JSON matching the schema below. No markdown, no explanation.
2. Use 24-hour time format HH:MM (e.g. "08:30", "17:00"). Convert "12:00nn" to "12:00", "05:00pm" to "17:00", "5:30 am" to "05:30", "4:59 Pm" to "16:59".
3. Dates as ISO YYYY-MM-DD. Infer year from caption if missing from image.
4. Ilocos Sur has TWO districts (do not use is_district_wide):
   - 1st District: Vigan City, Bantay, Cabugao, Caoayan, Magsingal, San Ildefonso, San Juan, San Vicente, Santa Catalina, Santo Domingo, Sinait
   - 2nd District: Candon City, Alilem, Banayoyo, Burgos, Cervantes, Galimuyod, Gregorio del Pilar, Lidlidda, Nagbukel, Narvacan, Quirino, Salcedo, San Emilio, San Esteban, Santa, Santa Cruz, Santa Lucia, Santa Maria, Santiago, Sigay, Sugpon, Suyo, Tagudin
   - "Whole 1st District EXCEPT Puro, Caoayan" → district: "1st", exclusions: ["Puro, Caoayan"], areas: [] (or additional specific bullets only)
   - "Whole 2nd District" → district: "2nd"
   - "Whole Area of Vigan" / "Whole Area of Vigan City" → district: null, areas: ["Vigan City"] (municipality-wide, not a district)
   - exclusions: ONLY EXCEPT locations — NEVER in areas. Always "Barangay, Municipality" (e.g. "Puerto, Sto. Domingo")
   - areas: include municipality (e.g. "SIVED to CALAY-AB, Sto. Domingo"). Strip (except …) from areas
   - partial_areas: ONLY "Some parts of:" or "Parts of ..." locations — qualify with municipality. NEVER in areas
   - areas_raw: copy each bullet exactly as written (including full EXCEPT line and "Some parts of:" lines)
5. For barangay-only outages (no whole district): district: null.
   - "Barangays of VIGAN CITY" is a HEADER — do NOT put it in areas. Only list actual barangays.
   - Always qualify barangays: "Baluarte, Vigan City" not bare "Baluarte".
   - Multiple time slots same day = separate outage rows (scheduled only).
6. purpose: scheduled → Purpose/s column; emergency → Reason line.
7. confidence: "high", "medium", or "low" based on text clarity.
8. If caption provides date range context, use it to resolve ambiguous dates.

Example — Whole 1st District EXCEPT + specific area:
  outage_type: "scheduled"
  district: "1st"
  areas: ["Nagpanaoan, Santa"]
  exclusions: ["Puro, Caoayan"]
  areas_raw: ["Whole 1st District of Ilocos Sur EXCEPT Puro, Caoayan", "Nagpanaoan, Santa"]

Example — inline (except) within a municipality:
  outage_type: "scheduled"
  district: null
  areas: ["SIVED to CALAY-AB, Sto. Domingo"]
  exclusions: ["Puerto, Sto. Domingo"]
  areas_raw: ["SIVED to CALAY-AB (except Puerto), Sto. Domingo"]

Example — whole municipality (not whole district):
  outage_type: "scheduled"
  district: null
  areas: ["Vigan City"]
  exclusions: []
  areas_raw: ["Whole Area of Vigan"]

Example — full areas + some parts (same row):
  outage_type: "scheduled"
  district: null
  areas: ["Darapidap, Candon City", "Caterman, Candon City"]
  partial_areas: ["San Jose, Candon City", "San Agustin (way to Darapidap), Candon City"]
  exclusions: []
  areas_raw: [
    "Darapidap, Caterman, Tamurong 1st & 2nd, Candon City",
    "Some parts of: San Jose, San Juan, San Agustin (way to Darapidap), Candon City"
  ]

Example — Emergency Power Interruption (caption text):
  outage_type: "emergency"
  outage_date: "2026-06-10"
  start_time: "16:59"
  end_time: null
  district: null
  areas: ["Amianance, Vigan City", "Pagpartian, Vigan City"]
  partial_areas: ["Barangay 3, Vigan City", "Cuta, Vigan City"]
  purpose: "Cut off Jumper at Liberation Boulevard."
  areas_raw: ["Feeder 1 Vigan Sub Station", "Amianance", "Parts of Brgy 3", "Northern parts of Cuta"]

JSON schema:
{
  "outages": [
    {
      "outage_type": "scheduled",
      "outage_date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "district": null,
      "areas": ["string"],
      "partial_areas": ["string"],
      "areas_raw": ["string"],
      "exclusions": ["string"],
      "purpose": "string",
      "confidence": "high"
    }
  ]
}

For emergency outages: outage_type "emergency", end_time null.`;

export type OutageType = "scheduled" | "emergency";

export interface ParsedOutage {
  outage_type: OutageType;
  outage_date: string;
  start_time: string;
  end_time: string | null;
  district: DistrictId | null;
  areas: string[];
  partial_areas: string[];
  areas_raw: string[];
  exclusions: string[];
  purpose: string;
  confidence: string;
}

export function buildDedupKey(params: {
  sourcePostId: string;
  imageIndex: number;
  outageDate: string;
  startTime: string;
  endTime: string | null;
  outageType?: OutageType;
  areas: string[];
  partial_areas?: string[];
  district?: DistrictId | null;
  exclusions?: string[];
}): string {
  const areasHash = [...params.areas].sort().join("|").toLowerCase();
  const partialHash = [...(params.partial_areas ?? [])].sort().join("|").toLowerCase();
  const exclHash = [...(params.exclusions ?? [])].sort().join("|").toLowerCase();
  const districtPart = params.district ? `d:${params.district}` : "";
  const typePart = params.outageType === "emergency" ? "emergency" : "scheduled";
  const endPart = params.endTime ?? "ongoing";
  return `${params.sourcePostId}:${params.imageIndex}:${typePart}:${params.outageDate}:${params.startTime}:${endPart}:${districtPart}:${areasHash}:p:${partialHash}:${exclHash}`;
}

function userPrompt(caption: string): string {
  return caption
    ? `Facebook caption:\n${caption}\n\nExtract all scheduled or emergency power outages from this ISECO post (image and/or caption).`
    : "Extract all scheduled or emergency power outages from this ISECO post.";
}

function parseJsonResponse(text: string): { outages: ParsedOutage[] } {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}

function validateOutages(data: { outages: ParsedOutage[] }) {
  if (!data?.outages || !Array.isArray(data.outages)) {
    throw new Error("Response missing outages array");
  }
  for (const o of data.outages) {
    if (!o.outage_date || !o.start_time) {
      throw new Error(`Outage missing required date/time: ${JSON.stringify(o)}`);
    }

    if (o.outage_type === "emergency" || o.end_time == null || o.end_time === "") {
      o.outage_type = "emergency";
      o.end_time = null;
    } else {
      o.outage_type = "scheduled";
      if (!o.end_time) {
        throw new Error(`Scheduled outage missing end_time: ${JSON.stringify(o)}`);
      }
    }

    o.areas = o.areas ?? [];
    o.partial_areas = o.partial_areas ?? [];
    o.areas_raw = o.areas_raw ?? o.areas;
    o.exclusions = o.exclusions ?? [];
    o.district = o.district === "1st" || o.district === "2nd" ? o.district : null;
    o.confidence = o.confidence ?? "medium";
  }
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GeminiContent = { role: string; parts: GeminiPart[] };

/**
 * Base class for transient Gemini failures (rate limits, server overload).
 * Callers should treat these as retryable: stop the run and leave the post
 * unprocessed so it's retried next time, rather than recording a permanent
 * failure. `reason` is a short machine-readable tag for the run summary.
 */
export class TransientGeminiError extends Error {
  readonly retryAfterSec: number;
  readonly reason: string;
  constructor(message: string, retryAfterSec: number, reason: string) {
    super(message);
    this.name = "TransientGeminiError";
    this.retryAfterSec = retryAfterSec;
    this.reason = reason;
  }
}

/** Gemini 429 RESOURCE_EXHAUSTED (quota / rate limit exceeded). */
export class RateLimitError extends TransientGeminiError {
  constructor(message: string, retryDelaySec: number) {
    super(message, retryDelaySec, "rate_limited");
    this.name = "RateLimitError";
  }
}

/** Gemini 5xx (e.g. 503 UNAVAILABLE — model overloaded, temporary). */
export class ServiceUnavailableError extends TransientGeminiError {
  constructor(message: string, retryAfterSec: number) {
    super(message, retryAfterSec, "service_unavailable");
    this.name = "ServiceUnavailableError";
  }
}

function parseRetryDelaySec(errText: string): number {
  const m = errText.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.ceil(parseFloat(m[1])) : 0;
}

async function callGemini(
  apiKey: string,
  model: string,
  contents: GeminiContent[],
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (res.status === 429) {
    const errText = await res.text();
    throw new RateLimitError(
      `Gemini rate limit (429): ${errText.slice(0, 200)}`,
      parseRetryDelaySec(errText),
    );
  }

  // 5xx = Gemini-side problem (overload/outage); transient and worth retrying.
  if (res.status >= 500) {
    const errText = await res.text();
    const retryAfter = Number(res.headers.get("retry-after") ?? "0");
    throw new ServiceUnavailableError(
      `Gemini API ${res.status}: ${errText.slice(0, 200)}`,
      Number.isFinite(retryAfter) ? retryAfter : 0,
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini returned no text: ${JSON.stringify(data)}`);
  }
  return text.trim();
}

/**
 * Calls Gemini with a few short backoff retries on transient (429/5xx) errors.
 * If they persist, the TransientGeminiError bubbles up so the caller can stop
 * and resume on the next run.
 */
async function callGeminiWithTransientRetry(
  apiKey: string,
  model: string,
  contents: GeminiContent[],
  maxTransientRetries = 2,
): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      return await callGemini(apiKey, model, contents);
    } catch (err) {
      if (err instanceof TransientGeminiError && i < maxTransientRetries) {
        const waitSec = Math.min(err.retryAfterSec || 2 * (i + 1), 10);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }
}

async function runParse(
  userParts: GeminiPart[],
  apiKey: string,
  model: string,
  maxRetries: number,
): Promise<{ outages: ParsedOutage[]; raw_response: string }> {
  let lastRaw = "";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const contents: GeminiContent[] =
        attempt === 0
          ? [{ role: "user", parts: userParts }]
          : [
              { role: "user", parts: userParts },
              { role: "model", parts: [{ text: lastRaw }] },
              {
                role: "user",
                parts: [{
                  text:
                    "Your previous response was invalid JSON. Return ONLY the corrected JSON object matching the schema. No markdown fences.",
                }],
              },
            ];

      lastRaw = await callGeminiWithTransientRetry(apiKey, model, contents);
      const parsed = parseJsonResponse(lastRaw);
      validateOutages(parsed);
      const normalized = normalizeOutages(parsed);
      return { outages: normalized.outages, raw_response: lastRaw };
    } catch (err) {
      // Transient (rate limit / overload) errors are not bad responses — don't
      // burn the JSON-repair retries on them; let the caller stop and resume.
      if (err instanceof TransientGeminiError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) break;
    }
  }

  throw lastError ?? new Error("Gemini parsing failed");
}

function imageToBase64(imageBytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < imageBytes.length; i += chunk) {
    binary += String.fromCharCode(...imageBytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function parseOutageFromImage(
  imageBytes: Uint8Array,
  mediaType: string,
  caption: string,
  apiKey: string,
  maxRetries = 2,
): Promise<{ outages: ParsedOutage[]; raw_response: string }> {
  const model = Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
  const userParts: GeminiPart[] = [
    { inline_data: { mime_type: mediaType, data: imageToBase64(imageBytes) } },
    { text: userPrompt(caption) },
  ];
  return runParse(userParts, apiKey, model, maxRetries);
}

/** Parse outages from caption text only (for posts with no usable image). */
export async function parseOutageFromCaption(
  caption: string,
  apiKey: string,
  maxRetries = 2,
): Promise<{ outages: ParsedOutage[]; raw_response: string }> {
  const model = Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
  const userParts: GeminiPart[] = [{ text: userPrompt(caption) }];
  return runParse(userParts, apiKey, model, maxRetries);
}
