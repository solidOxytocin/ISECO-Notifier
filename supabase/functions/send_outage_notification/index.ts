import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { GoogleAuth } from "npm:google-auth-library@9";
import { shouldNotifyUser } from "../_shared/filter.ts";
import { isOutagePassed } from "../_shared/outage_time.ts";

const FIREBASE_SERVICE_ACCOUNT = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const FCM_TOPIC = "iseco_outages";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function loadServiceAccount(): ServiceAccount | null {
  if (!FIREBASE_SERVICE_ACCOUNT) return null;
  try {
    const parsed = JSON.parse(FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const serviceAccount = loadServiceAccount();

const auth = serviceAccount
  ? new GoogleAuth({
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  })
  : null;

async function getAccessToken(): Promise<string | null> {
  if (!auth) return null;
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token ?? null;
}

function fcmEndpoint(): string {
  return `https://fcm.googleapis.com/v1/projects/${serviceAccount!.project_id}/messages:send`;
}

interface OutagePayload {
  outage_id?: string;
  status?: "active" | "cancelled";
  outage_type?: "scheduled" | "emergency";
  outage_date: string;
  start_time: string;
  end_time?: string | null;
  areas: string[];
  partial_areas?: string[];
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
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.warn("FIREBASE_SERVICE_ACCOUNT not set; skipping notification");
    return { skipped: true };
  }

  const res = await fetch(fcmEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        topic: FCM_TOPIC,
        notification: { title, body },
        data,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM error ${res.status}: ${text}`);
  }

  return res.json();
}

async function sendToToken(
  token: string,
  accessToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<{ ok: boolean; unregistered: boolean }> {
  const res = await fetch(fcmEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
      },
    }),
  });

  if (res.ok) return { ok: true, unregistered: false };

  // 404 UNREGISTERED / 400 INVALID_ARGUMENT => token is dead and should be pruned.
  const errText = await res.text();
  const unregistered = res.status === 404 ||
    errText.includes("UNREGISTERED") ||
    errText.includes("registration-token-not-registered");
  console.warn(`FCM token send failed ${res.status}: ${errText}`);
  return { ok: false, unregistered };
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

  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.warn("FIREBASE_SERVICE_ACCOUNT not set; skipping notification");
    return { skipped: true };
  }

  // FCM v1 has no multicast endpoint; send per token with bounded concurrency.
  const concurrency = 50;
  let sent = 0;
  const deadTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += concurrency) {
    const batch = tokens.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((token) => sendToToken(token, accessToken, title, body, data)),
    );
    results.forEach((r, idx) => {
      if (r.ok) sent += 1;
      else if (r.unregistered) deadTokens.push(batch[idx]);
    });
  }

  if (deadTokens.length > 0) {
    await supabase.from("devices").delete().in("fcm_token", deadTokens);
  }

  return { sent, pruned: deadTokens.length };
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

    const isCancelled = outage.status === "cancelled";

    // Never broadcast an active outage that has already ended.
    if (!isCancelled && isOutagePassed(outage)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "outage_passed" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const areasPreview = (outage.areas ?? []).slice(0, 2).join(", ");
    const partialPreview = (outage.partial_areas ?? []).slice(0, 1).join(", ");
    const more = (outage.areas?.length ?? 0) > 2 ? "..." : "";
    const partialNote = partialPreview ? " (some parts)" : "";
    const districtNote = !areasPreview && outage.district
      ? `${outage.district === "1st" ? "1st" : "2nd"} District`
      : areasPreview;

    const isEmergency = outage.outage_type === "emergency";

    let title: string;
    let body: string;

    if (isCancelled) {
      title = "ISECO Outage Cancelled";
      const timePart = outage.end_time
        ? `${formatTime(outage.start_time)}–${formatTime(outage.end_time)}`
        : formatTime(outage.start_time);
      body =
        `The ${isEmergency ? "emergency" : "scheduled"} power interruption on ${formatDate(outage.outage_date)} ${timePart} for ${districtNote}${more} has been cancelled.`;
    } else if (isEmergency) {
      title = "ISECO Emergency Outage";
      const reason = outage.purpose ? ` — ${outage.purpose}` : "";
      body =
        `${formatDate(outage.outage_date)} as of ${formatTime(outage.start_time)} — ${areasPreview}${more}${partialNote}${reason}`;
    } else {
      title = "ISECO Power Interruption";
      body =
        `${formatDate(outage.outage_date)} ${formatTime(outage.start_time)}–${formatTime(outage.end_time!)} — ${areasPreview}${more}${partialNote}`;
    }

    const data = {
      outage_id: outage.outage_id ?? "",
      outage_date: outage.outage_date,
      outage_type: outage.outage_type ?? "scheduled",
      status: outage.status ?? "active",
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
