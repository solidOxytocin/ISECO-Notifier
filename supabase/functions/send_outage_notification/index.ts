import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { shouldNotifyUser } from "../_shared/filter.ts";

const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const FCM_TOPIC = "iseco_outages";

interface OutagePayload {
  outage_id?: string;
  outage_date: string;
  start_time: string;
  end_time: string;
  areas: string[];
  purpose?: string;
  exclusions?: string[];
  district?: string | null;
  use_barangay_filter?: boolean;
}

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(d: string): string {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function sendToTopic(title: string, body: string, data: Record<string, string>) {
  if (!FCM_SERVER_KEY) {
    console.warn("FCM_SERVER_KEY not set; skipping notification");
    return { skipped: true };
  }

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=${FCM_SERVER_KEY}`,
    },
    body: JSON.stringify({
      to: `/topics/${FCM_TOPIC}`,
      notification: { title, body },
      data,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM error ${res.status}: ${text}`);
  }

  return res.json();
}

async function sendToFilteredDevices(
  outage: OutagePayload,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: devices } = await supabase
    .from("devices")
    .select("fcm_token, barangays");

  if (!devices?.length) return { sent: 0 };

  const tokens = devices
    .filter((d) => shouldNotifyUser(outage, d.barangays ?? []))
    .map((d) => d.fcm_token);

  if (tokens.length === 0) return { sent: 0, filtered: true };

  if (!FCM_SERVER_KEY) {
    console.warn("FCM_SERVER_KEY not set; skipping notification");
    return { skipped: true };
  }

  // FCM legacy API supports up to 1000 tokens per multicast
  const batchSize = 500;
  let sent = 0;

  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        registration_ids: batch,
        notification: { title, body },
        data,
      }),
    });

    if (res.ok) sent += batch.length;
  }

  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const outage: OutagePayload = await req.json();

    const areasPreview = (outage.areas ?? []).slice(0, 2).join(", ");
    const more = (outage.areas?.length ?? 0) > 2 ? "..." : "";

    const title = "ISECO Power Interruption";
    const body = `${formatDate(outage.outage_date)} ${formatTime(outage.start_time)}–${formatTime(outage.end_time)} — ${areasPreview}${more}`;

    const data = {
      outage_id: outage.outage_id ?? "",
      outage_date: outage.outage_date,
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    };

    let result;

    if (outage.use_barangay_filter) {
      result = await sendToFilteredDevices(outage, title, body, data);
    } else {
      result = await sendToTopic(title, body, data);
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
