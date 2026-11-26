-- Wasl v2: remove client-role privileges that row-level security cannot restrict. Apply after 0003 and 0004.
-- TRUNCATE ignores RLS; TRIGGER and REFERENCES let a role attach triggers / foreign keys to a table. The Wasl frontend
-- never uses the Data API for these tables (it uses Supabase only for Auth), and the backend connects as a privileged
-- role, so nothing in Wasl uses these grants. Scope: Wasl tables only. Other applications' tables in this project
-- (profiles, resumes, resume_versions, job_applications, workflow_logs) are deliberately not listed.
-- Idempotent and additive: no table, column, row, policy or trigger is changed.
do $$
declare t text;
begin
  foreach t in array array['users','achievements','posts','cvs','cv_versions','cv_suggestions','job_analyses','integrations',
                           'oauth_states','user_api_keys','uploads','repo_snapshots','ai_events','http_events','quality_events',
                           'error_logs','eval_runs','job_listings','job_search_cache','job_api_calls','job_profiles','user_job_feed',
                           'saved_jobs','admin_audit_log','alert_incidents','scheduler_leases']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
