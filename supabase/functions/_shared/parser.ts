import { normalizeOutages } from "./normalize.ts";
import type { DistrictId } from "./ilocos-sur-districts.ts";

export const PARSER_VERSION = "2.2.0-partial";
// 2.0-flash has limit:0 on free tier; use 2.5-flash-lite (free) or override via GEMINI_MODEL
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export const SYSTEM_PROMPT = `You are a data extraction assistant for Ilocos Sur Electric Cooperative (ISECO) power outage notices.

ISECO posts Facebook images with a fixed poster template:
- Red header: "NOTICE OF POWER INTERRUPTION"
- Three columns: "Date and Time", "Areas Affected", "Purpose/s"
- Footer with MCO assistance numbers (ignore these)

Extract EVERY scheduled interruption row from the image. One image may contain multiple date/time rows.

If the image is NOT an ISECO "Notice of Power Interruption" poster (e.g. holiday advisory, office closure, PR/celebration post, billing notice, job posting), return {"outages": []}.

Rules:
1. Return ONLY valid JSON matching the schema below. No markdown, no explanation.
2. Use 24-hour time format HH:MM (e.g. "08:30", "17:00"). Convert "12:00nn" to "12:00", "05:00pm" to "17:00", "5:30 am" to "05:30".
3. Dates as ISO YYYY-MM-DD. Infer year from caption if missing from image.
4. Ilocos Sur has TWO districts (do not use is_district_wide):
   - 1st District: Vigan City, Bantay, Cabugao, Caoayan, Magsingal, San Ildefonso, San Juan, San Vicente, Santa Catalina, Santo Domingo, Sinait
   - 2nd District: Candon City, Alilem, Banayoyo, Burgos, Cervantes, Galimuyod, Gregorio del Pilar, Lidlidda, Nagbukel, Narvacan, Quirino, Salcedo, San Emilio, San Esteban, Santa, Santa Cruz, Santa Lucia, Santa Maria, Santiago, Sigay, Sugpon, Suyo, Tagudin
   - "Whole 1st District EXCEPT Puro, Caoayan" → district: "1st", exclusions: ["Puro, Caoayan"], areas: [] (or additional specific bullets only)
   - "Whole 2nd District" → district: "2nd"
   - "Whole Area of Vigan" / "Whole Area of Vigan City" → district: null, areas: ["Vigan City"] (municipality-wide, not a district)
   - exclusions: ONLY EXCEPT locations — NEVER in areas. Always "Barangay, Municipality" (e.g. "Puerto, Sto. Domingo")
   - areas: include municipality (e.g. "SIVED to CALAY-AB, Sto. Domingo"). Strip (except …) from areas
   - partial_areas: ONLY "Some parts of:" locations — qualify with municipality. NEVER in areas
   - areas_raw: copy each bullet exactly as written (including full EXCEPT line and "Some parts of:" lines)
5. For barangay-only outages (no whole district): district: null.
   - "Barangays of VIGAN CITY" is a HEADER — do NOT put it in areas. Only list actual barangays.
   - Always qualify barangays: "Baluarte, Vigan City" not bare "Baluarte".
   - Multiple time slots same day = separate outage rows.
6. purpose: the reason text from the Purpose/s column.
7. confidence: "high", "medium", or "low" based on text clarity.
8. If caption provides date range context, use it to resolve ambiguous dates.

Example — Whole 1st District EXCEPT + specific area:
  district: "1st"
  areas: ["Nagpanaoan, Santa"]
  exclusions: ["Puro, Caoayan"]
  areas_raw: ["Whole 1st District of Ilocos Sur EXCEPT Puro, Caoayan", "Nagpanaoan, Santa"]

Example — inline (except) within a municipality:
  district: null
  areas: ["SIVED to CALAY-AB, Sto. Domingo"]
  exclusions: ["Puerto, Sto. Domingo"]
  areas_raw: ["SIVED to CALAY-AB (except Puerto), Sto. Domingo"]

Example — whole municipality (not whole district):
  district: null
  areas: ["Vigan City"]
  exclusions: []
  areas_raw: ["Whole Area of Vigan"]

Example — full areas + some parts (same row):
  district: null
  areas: ["Darapidap, Candon City", "Caterman, Candon City"]
  partial_areas: ["San Jose, Candon City", "San Agustin (way to Darapidap), Candon City"]
  exclusions: []
  areas_raw: [
    "Darapidap, Caterman, Tamurong 1st & 2nd, Candon City",
    "Some parts of: San Jose, San Juan, San Agustin (way to Darapidap), Candon City"
  ]

JSON schema:
{
  "outages": [
    {
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
}`;

export interface ParsedOutage {
  outage_date: string;
  start_time: string;
  end_time: string;
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
  endTime: string;
  areas: string[];
  partial_areas?: string[];
  district?: DistrictId | null;
  exclusions?: string[];
}): string {
  const areasHash = [...params.areas].sort().join("|").toLowerCase();
  const partialHash = [...(params.partial_areas ?? [])].sort().join("|").toLowerCase();
  const exclHash = [...(params.exclusions ?? [])].sort().join("|").toLowerCase();
  const districtPart = params.district ? `d:${params.district}` : "";
  return `${params.sourcePostId}:${params.imageIndex}:${params.outageDate}:${params.startTime}:${params.endTime}:${districtPart}:${areasHash}:p:${partialHash}:${exclHash}`;
}

function userPrompt(caption: string): string {
  return caption
    ? `Facebook caption:\n${caption}\n\nExtract all outage schedules from this ISECO notice image.`
    : "Extract all outage schedules from this ISECO notice image.";
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
    if (!o.outage_date || !o.start_time || !o.end_time) {
      throw new Error(`Outage missing required date/time: ${JSON.stringify(o)}`);
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

export async function parseOutageFromImage(
  imageBytes: Uint8Array,
  mediaType: string,
  caption: string,
  apiKey: string,
  maxRetries = 2,
): Promise<{ outages: ParsedOutage[]; raw_response: string }> {
  const model = Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;

  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < imageBytes.length; i += chunk) {
    binary += String.fromCharCode(...imageBytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const prompt = userPrompt(caption);

  const userParts: GeminiPart[] = [
    { inline_data: { mime_type: mediaType, data: base64 } },
    { text: prompt },
  ];

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

      lastRaw = await callGemini(apiKey, model, contents);
      const parsed = parseJsonResponse(lastRaw);
      validateOutages(parsed);
      const normalized = normalizeOutages(parsed);
      return { outages: normalized.outages, raw_response: lastRaw };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) break;
    }
  }

  throw lastError ?? new Error("Gemini parsing failed");
}
