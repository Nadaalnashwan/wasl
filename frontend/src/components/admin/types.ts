/* Response shapes of the admin API (backend/app/routers/admin.py + app/monitoring/metrics.py).
 * Nullable numbers mean "no data" and must render as N/A — never as 0. */

export type Days = 1 | 7 | 30 | 90;

export type Filters = { days: Days; provider: string | null; model: string | null; task: string | null };

export type Health = {
  checked_at: string;
  backend: string;
  environment?: string | null; // optional: not every backend version exposes it
  database: { ok: boolean; engine: string; error: string | null };
  monitoring: { last_http_event: string | null; last_ai_event: string | null; has_data: boolean };
  auth_mode: string;
  ai_providers_configured: string[];
  privacy: { personal_min_privacy: string; pii_redaction: boolean; groq_zdr_attested: boolean; gemini_paid_tier_attested: boolean };
  alerts: SchedulerStatus;
  registry_version: string;
};

export type SchedulerStatus = { running: boolean; last_run: string | null; last_error: string | null; interval_minutes: number; channel: Channel };
export type Channel = "slack" | "webhook" | "disabled";

export type ModelStat = {
  provider: string;
  model: string;
  returned_models: Record<string, number>;
  attempts: number;
  success_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  est_cost_usd: number | null;
  fallback_successes: number;
};

export type CostGroup = { key: string; est_cost_usd: number | null; priced_attempts: number; unpriced_attempts: number; tokens: number };

export type ClaimStage = {
  outputs: number;
  claims_checked: number;
  unsupported: number;
  contradicted: number;
  ambiguous: number;
  needs_confirmation: number;
  unavailable: number;
  outputs_with_unsupported: number;
  unsupported_rate: number | null;
  acknowledged: number;
  by_task: Record<string, { claims_checked: number; unsupported: number }>;
};

export type FiringAlert = {
  level: "critical" | "warning";
  key: string;
  title: string;
  value: number;
  threshold: number;
  sample_size: number;
  investigate: string;
};

export type RouteStat = { route: string; count: number; errors_5xx: number; p95_ms: number | null };

export type Metrics = {
  window_days: number;
  generated_at: string;
  scope: string;
  filters: { provider: string | null; model: string | null; task: string | null };
  options: { providers: string[]; models: string[]; tasks: string[] };
  models: ModelStat[];
  cost: {
    basis: string;
    total_est_usd: number | null;
    priced_attempts: number;
    unpriced_attempts: number;
    retry_and_fallback_share_usd: number | null;
    by_task: CostGroup[];
    by_model: CostGroup[];
    by_provider: CostGroup[];
    by_key_source: CostGroup[];
    daily: { day: string; est_cost_usd: number }[];
    pricing_versions: string[];
  };
  latency_by_task: { task: string; attempt_p50_ms: number | null; attempt_p95_ms: number | null; e2e_p95_ms: number | null; requests: number }[];
  workflow_duration: { task: string; count: number; p50_ms: number | null; p95_ms: number | null }[];
  ai: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    failure_rate: number;
    attempts: number;
    attempt_error_rate: number;
    rate_limit_errors: number;
    timeout_errors: number;
    privacy_blocked_requests: number;
    redacted_requests: number;
    retried_requests: number;
    fallback_requests: number;
    fallback_rate: number;
    latency_ms: { avg: number | null; p50: number | null; p95: number | null; p99: number | null };
    e2e_latency_ms: { p50: number | null; p95: number | null };
    error_types: Record<string, number>;
    tokens_by_provider: { provider: string; prompt: number; completion: number }[];
    tokens_by_task: { task: string; prompt: number; completion: number }[];
    total_tokens: number;
    providers: { provider: string; attempts: number; success_rate: number; avg_latency_ms: number | null; p95_latency_ms: number | null }[];
    tasks: { task: string; requests: number; success_rate: number }[];
    timeseries: { bucket: string; requests: number; failed: number; p95_ms: number | null; tokens: number }[];
  };
  http: {
    requests: number;
    error_rate_5xx: number;
    client_errors_4xx: number;
    p50_ms: number | null;
    p95_ms: number | null;
    routes: RouteStat[];
    status_distribution: Record<string, number>;
    slowest_routes: RouteStat[];
  };
  quality: {
    claims_by_stage: { raw: ClaimStage; final: ClaimStage; approved: ClaimStage };
    unsupported_blocked: number;
    unsupported_escaped: number;
    verifier_versions: string[];
    unsupported_claim_rate: number | null;
    claims_checked: number;
    unsupported_claims: number;
    outputs_checked: number;
    outputs_with_unsupported: number;
    cv_decisions: { accepted: number; edited: number; rejected: number };
    cv_acceptance_rate: number | null;
    achievement_feedback: { confirmed: number; rejected: number };
    extraction_precision: number | null;
    task_completion: { task: string; completed: number; failed: number; rate: number }[];
    task_success_rate: number | null;
    publish: Record<string, number>;
    injection_flags: number;
  };
  alerts: FiringAlert[];
  latest_eval: EvalRunSummary | null;
  recent_ai_failures: AiFailure[];
};

export type AiFailure = {
  at: string;
  task: string;
  provider: string;
  model: string;
  error_type: string | null;
  http_status: number | null;
  attempt: number;
  latency_ms: number;
};

export type ErrorsResponse = {
  recent_errors: { id: string; at: string; route: string; type: string; message: string }[];
  recent_ai_failures: AiFailure[];
};

export type EvalKind = "deterministic" | "live" | "benchmark";

export type EvalRunSummary = {
  id: string;
  at: string;
  dataset_version: string;
  kind: EvalKind | string;
  provider: string | null;
  model: string | null;
  verifier_version?: string | null;
  git_sha?: string | null;
  summary: Record<string, unknown>;
};

export type EvalCase = {
  id: string;
  task: string;
  type?: string;
  passed: boolean;
  error?: string | null;
  checks?: Record<string, boolean>;
  seconds?: number;
  [k: string]: unknown;
};

export type EvalRunDetail = EvalRunSummary & { cases: EvalCase[] };

export type RegistryRoute = {
  provider: string;
  model: string;
  privacy_level: "none" | "limited_retention" | "zdr" | string;
  privacy_basis: string;
  eligible: boolean;
  price_per_mtok: { input: number; output: number } | null;
};

export type RegistryTask = {
  name: string;
  tier: string;
  max_tokens: number;
  temperature: number;
  timeout_s: number;
  max_retries: number;
  sensitivity: string;
  capabilities: string[];
  description: string;
  primary: RegistryRoute | null;
  fallbacks: RegistryRoute[];
  routes: RegistryRoute[];
};

export type Registry = {
  registry_version: string;
  pricing_version: string;
  personal_min_privacy: string;
  provider_priority: string[];
  tasks: RegistryTask[];
};

export type Incident = {
  id: string;
  key: string;
  severity: "critical" | "warning" | string;
  title: string;
  status: "open" | "resolved" | string;
  value: number | null;
  threshold: number | null;
  sample_size: number | null;
  investigate: string | null;
  opened_at: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
  notify_status: "pending" | "sent" | "failed" | "disabled" | string;
  notify_attempts: number;
  notified_at: string | null;
  recovery_notified: boolean | null;
  last_error: string | null;
};

export type AlertsResponse = {
  channel: Channel;
  scheduler: SchedulerStatus;
  thresholds: Record<string, number>;
  incidents: Incident[];
};

export type EvaluateResult = { evaluated_at: string; firing: string[]; opened: string[]; resolved: string[]; notified: number; channel: Channel };
export type TestAlertResult = { delivered: boolean; error: string | null; channel: Channel };

export type AuditRow = { at: string; action: string; actor: string; target_user_id: string | null; details: Record<string, unknown> | null };
