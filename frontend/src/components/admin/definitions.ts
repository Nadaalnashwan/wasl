/* How each metric is calculated (English-first operational copy, mirrors backend/app/monitoring/metrics.py). */

export const DEFS = {
  logical_requests:
    "Logical requests: one per user-facing AI call. All provider attempts that share a request id (retries and fallbacks) count as a single logical request.",
  provider_attempts: "Provider attempts: every individual call sent to an AI provider, including retries and fallbacks.",
  failure_rate: "Request failure rate = logical requests with no successful attempt ÷ all logical requests.",
  attempt_error_rate: "Attempt error rate = failed provider attempts ÷ all provider attempts. Higher than the request failure rate when retries/fallbacks recover.",
  fallback_rate: "Fallback rate = successful logical requests answered by a fallback provider ÷ successful logical requests.",
  retried: "Retried requests = logical requests that needed more than one provider attempt.",
  attempt_latency: "Provider-attempt latency: duration of each successful provider call on its own (p50/p95/p99 across successful attempts).",
  e2e_latency: "End-to-end latency: sum of every attempt in a successful logical request — what the user waited for the AI step, including retries and fallbacks.",
  workflow_duration: "Workflow duration: wall-clock time of the whole user task (validation, AI, verification, DB writes) from task_completed events.",
  rate_limits: "Rate-limit errors: provider attempts that failed with error type rate_limit.",
  timeouts: "Timeouts: provider attempts that failed with error type timeout or deadline.",
  privacy_blocked: "Privacy-blocked: attempts refused because no provider met the privacy level required for personal data.",
  redacted: "Redacted requests: logical requests where personal identifiers were removed before sending to a provider.",
  http_5xx: "5xx rate = HTTP responses with status ≥ 500 ÷ all recorded HTTP responses.",
  http_latency: "HTTP latency: server-side time per API request (p50/p95 across all recorded requests).",
  raw_unsupported:
    "Raw unsupported rate = unsupported claims ÷ claims checked in model output BEFORE enforcement. Measures how often models invent; users are protected by the next stages.",
  final_unsupported: "Post-enforcement unsupported rate = unsupported claims ÷ claims checked in what users actually receive (after revise / removal).",
  approved_unsupported: "Approved-stage rate = unsupported claims ÷ claims checked in output the user approved or published.",
  blocked: "Blocked by enforcement = raw unsupported claims − post-enforcement unsupported claims.",
  escaped:
    "Escaped = unacknowledged unsupported claims in approved/published output (plus any flagged in a tailored CV's final re-check). Any value above 0 is a quality incident.",
  claims_checked: "Claims checked: individual factual statements extracted from AI output and compared against the user's evidence.",
  cv_acceptance: "CV suggestion acceptance = (accepted + edited) ÷ (accepted + edited + rejected) AI-drafted CV changes.",
  extraction_precision: "Extraction precision (proxy) = achievements users confirmed ÷ (confirmed + rejected) among AI-discovered achievements.",
  task_success: "Task success rate = task_completed ÷ (task_completed + task_failed) events — end to end, not just the LLM call.",
  injection_flags: "Prompt-injection flags: suspicious instruction patterns detected and neutralised in uploads or inputs.",
  est_cost:
    "Estimated cost = list price × tokens for every provider attempt, retries and fallbacks included. It is an estimate, not the billed amount.",
  unpriced: "Unpriced attempts: attempts with token usage but no list price for that model — excluded from the estimate.",
  retry_share: "Retry & fallback share: estimated cost of attempts that were retries (attempt > 1) or fallbacks.",
  key_source: "BYOK = the user's own provider key; platform = Wasl's keys. BYOK spend is billed to the user, not the platform.",
  returned_model: "Requested model is what Wasl asked for; returned model is the identifier the provider reported in its response. A mismatch means the provider routed or aliased the request.",
  privacy_level:
    "Privacy level Wasl can guarantee for that provider with platform keys: zdr (zero data retention) > limited_retention > none. Personal-data tasks need at least the configured minimum.",
  sample: "n = the sample size the rate or percentile is computed from.",
} as const;

export type DefKey = keyof typeof DEFS;
