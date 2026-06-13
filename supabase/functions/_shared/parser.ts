export const PARSER_VERSION = "2.0.0-gemini-flash";
export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

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

export interface ParsedOutage {
  outage_date: string;
  start_time: string;
  end_time: string;
  areas: string[];
  areas_raw: string[];
  exclusions: string[];
  is_district_wide: boolean;
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
}): string {
  const areasHash = [...params.areas].sort().join("|").toLowerCase();
  return `${params.sourcePostId}:${params.imageIndex}:${params.outageDate}:${params.startTime}:${params.endTime}:${areasHash}`;
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
    o.areas_raw = o.areas_raw ?? o.areas;
    o.exclusions = o.exclusions ?? [];
    o.is_district_wide = o.is_district_wide ?? false;
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
      return { outages: parsed.outages, raw_response: lastRaw };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) break;
    }
  }

  throw lastError ?? new Error("Gemini parsing failed");
}
