export type User = { id: string; email: string; full_name: string; headline: string; locale: "en" | "ar"; created_at: string };

export type Evidence = { quote?: string; source?: string; verified?: boolean; repo?: string; url?: string };

export type Achievement = {
  id: string;
  title: string;
  description: string;
  category: "project" | "certification" | "experience" | "award" | "education";
  source: "manual" | "github" | "upload";
  source_ref?: string | null;
  technologies: string[];
  skills: string[];
  impact: string;
  evidence: Evidence[];
  status: "pending" | "confirmed" | "rejected";
  contribution_note: string;
  needs_contribution_confirmation: boolean;
  confidence: number;
  occurred_on: string;
  created_at: string;
  duplicate_of?: { id: string | null; title: string } | null;
  contribution_question?: string;
  dropped_terms?: string[];
  unverified_quotes?: number;
};

export type ClaimCheck = {
  claims_checked: number;
  unsupported: { type: string; value: string }[];
  unsupported_count: number;
  unsupported_rate: number;
  passed: boolean;
  revisions?: number;
  provider?: string;
  model?: string;
  fallback_used?: boolean;
  edited_by_user?: boolean;
};

export type Post = {
  id: string;
  achievement_id: string | null;
  content: string;
  tone: string;
  language: "en" | "ar";
  hashtags: string[];
  status: "draft" | "publishing" | "published" | "failed" | "uncertain";
  linkedin_post_urn: string | null;
  publish_error: string | null;
  published_at: string | null;
  claim_check: ClaimCheck;
  created_at: string;
  updated_at: string;
};

export type Experience = { id: string; title: string; organization: string; location: string; start: string; end: string; bullets: string[] };
export type Education = { id: string; degree: string; institution: string; start: string; end: string; details: string };
export type Project = { id: string; name: string; description: string; technologies: string[]; bullets: string[]; link: string; achievement_id?: string | null };
export type Certification = { id: string; name: string; issuer: string; date: string; achievement_id?: string | null };
export type Award = { id: string; title: string; issuer: string; date: string; description: string; achievement_id?: string | null };

export type CVData = {
  contact: { full_name: string; headline: string; email: string; phone: string; location: string; links: string[] };
  summary: string;
  experience: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  awards: Award[];
  skills: string[];
  languages: string[];
};

export type CV = { id: string; kind: "master" | "tailored"; title: string; data: CVData; version: number; created_at: string; updated_at: string; job_analysis_id?: string | null };

export type Change = { section: string; action: string; summary: string; item_id?: string; bullet?: string; skills?: string[]; reason?: string };

export type Suggestion = {
  id: string;
  cv_id: string;
  achievement_id: string | null;
  base_version: number;
  draft_data: CVData;
  changes: Change[];
  rationale: string;
  status: "pending" | "accepted" | "edited" | "rejected" | "stale";
  created_at: string;
};

export type CVUpdateResult = { status: "created" | "duplicate" | "no_cv" | "no_changes" | "exists" | "ai_unavailable"; suggestion?: Suggestion; reason?: string; rationale?: string };

export type SkillMatch = { skill: string; status: "verified" | "unverified" | "missing"; sources: string[]; explanation: string };

export type Score = {
  score: number;
  formula: string;
  points: number;
  max_points: number;
  must_have: Record<string, number>;
  nice_to_have: Record<string, number>;
};

export type LearningStep = { skill: string; priority: "high" | "medium" | "low"; why: string; resources: string[]; practice_project: string; evidence_to_add: string; est_weeks: number };

export type Analysis = {
  id: string;
  kind: "tailor" | "gap";
  job_title: string;
  company: string;
  match_score: number | null;
  requirements: { job_title: string; company: string; seniority: string; must_have: { skill: string; kind: string }[]; nice_to_have: { skill: string; kind: string }[]; responsibilities: string[] };
  result: {
    must: SkillMatch[];
    nice: SkillMatch[];
    score: Score;
    enforcement?: { kept_original: { field: string }[]; rejected_bullets: number; accepted_bullets: number; unknown_ids: string[]; claims_checked: number; unsupported_found: number };
    notes?: string[];
    highlighted_item_ids?: string[];
    roadmap?: { overview: string; steps: LearningStep[]; quick_wins: string[] };
    injection_flags?: string[];
  };
  created_at: string;
  tailored?: { id: string; title: string; data: CVData };
  original?: CVData | null;
};

export type IntegrationStatus = {
  configured_on_server: boolean;
  connected: boolean;
  status: string;
  account_name: string | null;
  scopes: string | null;
  connected_at: string | null;
  expires_at: string | null;
};

/* ------------------------------------------------------------ job recommendations */
export type JobLevel = "internship" | "entry" | "mid" | "senior";
export type TrackStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export type JobScorePart =
  | { key: "skills"; score: number; weight: number; matched: number; total: number }
  | { key: "experience"; score: number; weight: number; job_level: JobLevel | "unknown"; user_level: JobLevel; min_years: number | null; user_years: number }
  | { key: "title"; score: number; weight: number; target: string }
  | { key: "freshness"; score: number; weight: number; days: number | null };

export type JobMatch = {
  score: number;
  confidence: "high" | "medium" | "low";
  breakdown: JobScorePart[];
  matching_skills: string[];
  missing_skills: string[];
  missing_nice: string[];
};

export type Job = {
  id: string;
  title: string;
  company: string;
  company_logo: string;
  city: string;
  location: string;
  employment_type: "" | "full_time" | "part_time" | "contract" | "internship";
  is_remote: boolean;
  posted_at: string | null;
  apply_url: string;
  apply_options: { title: string; link: string }[];
  salary: string;
  publisher: string;
  providers: string[];
  level: JobLevel | "unknown";
  education: string;
  min_years: number | null;
  requirements_source: "ai" | "rules";
};

export type JobItem = Job & { match: JobMatch; saved: { id: string; status: TrackStatus } | null };

export type ProviderUsage = { configured: boolean; used: number; limit: number; remaining: number };

export type JobsResponse = {
  state: "ok" | "empty" | "no_cv" | "needs_refresh";
  items: JobItem[];
  total: number;
  offset?: number;
  limit?: number;
  facets?: { cities: { value: string; count: number }[]; types: { value: string; count: number }[]; levels: { value: string; count: number }[]; remote: number };
  profile?: { target_titles: string[]; seniority: JobLevel; key_skills: string[]; include_internships: boolean; rationale: string; years: number; level: JobLevel; source: "ai" | "rules" };
  cv_changed?: boolean;
  last_refreshed_at?: string | null;
  can_refresh?: boolean;
  refresh_blocked?: "cooldown" | "daily_limit" | null;
  usage: Record<"jsearch" | "serpapi", ProviderUsage>;
  providers_configured: string[];
  refresh?: { found: number; calls: Record<string, number>; cache_hits: number; skipped: { provider: string; reason: string }[]; errors: { provider: string; reason: string }[]; ai_enriched: number };
};

export type SavedJob = {
  id: string;
  listing_id: string | null;
  status: TrackStatus;
  notes: string;
  match_score: number | null;
  applied_at: string | null;
  tailored_cv_id: string | null;
  created_at: string;
  updated_at: string;
  job: Job;
  expired: boolean;
};
