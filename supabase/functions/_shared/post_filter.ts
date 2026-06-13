export interface PostFilterResult {
  skip: boolean;
  reason?: string;
}

const OUTAGE_CAPTION_PATTERNS: RegExp[] = [
  /power\s+interruption/i,
  /notice\s+of\s+power/i,
  /scheduled\s+(?:power\s+)?interruption/i,
  /scheduled\s+brownout/i,
  /maintenance\s+activity/i,
  /technical\s+activity/i,
  /areas?\s+affected/i,
  /\bbrownout\b/i,
];

const NON_OUTAGE_CAPTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /holiday\s+advisory/i, reason: "holiday_advisory" },
  { pattern: /office\s+(?:will\s+be\s+)?closed/i, reason: "office_closure" },
  { pattern: /office\s+operations?\s+(?:will\s+)?resume/i, reason: "office_closure" },
  { pattern: /regular\s+office\s+operations/i, reason: "office_closure" },
  { pattern: /in\s+observance\s+of/i, reason: "holiday_advisory" },
  { pattern: /bill\s+payments?/i, reason: "billing_notice" },
  { pattern: /ec\s*pay/i, reason: "billing_notice" },
  { pattern: /emergency\s+contact/i, reason: "office_closure" },
  { pattern: /in\s+celebration\s+of/i, reason: "celebration" },
  { pattern: /\bcelebrat(?:e|es|ing|ion)\b/i, reason: "celebration" },
  { pattern: /honors?\s+(?:the\s+)?leadership/i, reason: "pr_post" },
  { pattern: /gm'?s?\s+month/i, reason: "pr_post" },
  { pattern: /power\s+progress/i, reason: "pr_post" },
  { pattern: /congratulat/i, reason: "pr_post" },
  { pattern: /(?:we\s+are\s+)?hiring/i, reason: "job_posting" },
  { pattern: /job\s+(?:opening|vacancy)/i, reason: "job_posting" },
  { pattern: /general\s+manager/i, reason: "pr_post" },
];

/**
 * Returns true when a Facebook caption clearly indicates a non-outage ISECO post
 * (holiday advisories, PR/celebration posts, billing notices, etc.).
 *
 * Empty captions are not skipped — the image may still be a power interruption notice.
 */
export function shouldSkipNonOutagePost(caption: string): PostFilterResult {
  const text = caption.trim();
  if (!text) {
    return { skip: false };
  }

  if (OUTAGE_CAPTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return { skip: false };
  }

  for (const { pattern, reason } of NON_OUTAGE_CAPTION_PATTERNS) {
    if (pattern.test(text)) {
      return { skip: true, reason };
    }
  }

  return { skip: false };
}
