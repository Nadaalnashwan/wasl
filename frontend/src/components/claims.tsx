"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, CircleSlash, ShieldAlert, UserCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Claim verification report (backend app/ai/claims.py, verifier "claims-v2").
 * Older rows only carry {claims_checked, unsupported[], passed}; both shapes render.
 */
export type ClaimStatus = "supported" | "unsupported" | "contradicted" | "ambiguous" | "needs_confirmation" | "unavailable";

export type VerifiedClaim = {
  id: string;
  text: string;
  kind: string; // number | skill | credential | role | attribution | timeline | statement
  value?: string;
  status: ClaimStatus;
  reasons: string[];
  evidence: { source: string; quote: string }[];
  method: string;
};

export type ClaimReport = {
  verifier_version?: string;
  claims_checked: number;
  unsupported_count: number;
  unsupported: { type: string; value: string; status?: ClaimStatus; reason?: string }[];
  passed: boolean;
  claims?: VerifiedClaim[];
  summary?: Partial<Record<ClaimStatus, number>>;
  edited_by_user?: boolean;
};

const META: Record<ClaimStatus, { en: string; ar: string; tone: string; icon: React.ElementType }> = {
  supported: { en: "Supported by evidence", ar: "مدعوم بالأدلة", tone: "text-ok", icon: CheckCircle2 },
  unsupported: { en: "Not in your evidence", ar: "غير موجود في أدلتك", tone: "text-bad", icon: CircleSlash },
  contradicted: { en: "Contradicts your evidence", ar: "يتعارض مع أدلتك", tone: "text-bad", icon: ShieldAlert },
  ambiguous: { en: "Ambiguous", ar: "غير واضح", tone: "text-warn", icon: CircleHelp },
  needs_confirmation: { en: "Needs your confirmation", ar: "يحتاج تأكيدك", tone: "text-warn", icon: UserCheck },
  unavailable: { en: "Verification unavailable", ar: "التحقق غير متاح", tone: "text-fg-3", icon: AlertTriangle },
};

const REASONS: Record<string, { en: string; ar: string }> = {
  number_not_in_evidence: { en: "This number does not appear in your evidence.", ar: "هذا الرقم غير موجود في أدلتك." },
  number_unit_mismatch: { en: "The number exists, but with a different unit or meaning.", ar: "الرقم موجود لكن بوحدة أو معنى مختلف." },
  skill_not_in_evidence: { en: "This skill is not mentioned in your evidence.", ar: "هذه المهارة غير مذكورة في أدلتك." },
  skill_negated: { en: "Your evidence says this skill was not used.", ar: "تذكر أدلتك أن هذه المهارة لم تُستخدم." },
  skill_studied_only: { en: "Evidence shows study or a course, not professional use.", ar: "تُظهر الأدلة دراسة أو دورة وليس استخدامًا مهنيًا." },
  credential_not_in_evidence: { en: "This credential is not in your evidence.", ar: "هذه الشهادة غير موجودة في أدلتك." },
  credential_attended_only: { en: "Evidence shows attendance, not certification.", ar: "تُظهر الأدلة الحضور وليس الحصول على الشهادة." },
  credential_planned_only: { en: "Evidence describes a plan, not a completed credential.", ar: "تصف الأدلة خطة وليس شهادة مكتملة." },
  role_inflated: { en: "The role is stronger than your evidence (e.g. 'led' vs 'participated').", ar: "الدور أقوى مما تذكره الأدلة (مثل «قاد» بدل «شارك»)." },
  team_vs_individual: { en: "Evidence credits a team; the text credits you alone.", ar: "الأدلة تنسب الإنجاز للفريق، والنص ينسبه لك وحدك." },
  attributed_to_other: { en: "Evidence attributes this to someone else.", ar: "الأدلة تنسب هذا لشخص آخر." },
  team_size_as_reports: { en: "Evidence mentions a team size, not people you managed.", ar: "الأدلة تذكر حجم الفريق وليس أشخاصًا أدرتهم." },
  contribution_unconfirmed: { en: "Your personal contribution is not confirmed yet.", ar: "مساهمتك الشخصية غير مؤكدة بعد." },
  verifier_unavailable: { en: "The checker could not run, so this is not verified.", ar: "تعذر تشغيل أداة التحقق، لذلك لم يتم التحقق." },
};

export function claimReasonText(code: string, locale: string) {
  const r = REASONS[code];
  return r ? (locale === "ar" ? r.ar : r.en) : code;
}

export function claimStatusLabel(s: ClaimStatus, locale: string) {
  return locale === "ar" ? META[s].ar : META[s].en;
}

/** One-line summary suitable for headers ("3 claims checked · 1 needs attention"). */
export function ClaimSummary({ report, className }: { report?: ClaimReport | null; className?: string }) {
  const { locale } = useI18n();
  if (!report) return null;
  const flagged = flaggedClaims(report).length;
  const ar = locale === "ar";
  if (report.claims_checked === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-fg-3", className)}>
        <CircleHelp className="size-3.5" />
        {ar ? "لا توجد ادعاءات قابلة للتحقق" : "No checkable claims found"}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", flagged ? "text-warn" : "text-ok", className)}>
      {flagged ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
      {ar
        ? `تم فحص ${report.claims_checked} ادعاء${flagged ? ` · ${flagged} يحتاج مراجعة` : " · كلها مدعومة"}`
        : `${report.claims_checked} claim${report.claims_checked === 1 ? "" : "s"} checked${flagged ? ` · ${flagged} need${flagged === 1 ? "s" : ""} attention` : " · all supported"}`}
    </span>
  );
}

export function flaggedClaims(report: ClaimReport): { label: string; status: ClaimStatus; reasons: string[]; evidence: VerifiedClaim["evidence"] }[] {
  if (report.claims?.length) {
    return report.claims
      .filter((c) => c.status !== "supported")
      .map((c) => ({ label: c.value || c.text, status: c.status, reasons: c.reasons, evidence: c.evidence }));
  }
  return (report.unsupported || []).map((u) => ({
    label: u.value,
    status: u.status ?? "unsupported",
    reasons: u.reason ? [u.reason] : [],
    evidence: [],
  }));
}

/** Full verification panel: lists every flagged claim with its reason and any related evidence. */
export function ClaimReportPanel({ report, className, showSupported = false }: { report?: ClaimReport | null; className?: string; showSupported?: boolean }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  if (!report) return null;
  const items = flaggedClaims(report);
  const supported = (report.claims || []).filter((c) => c.status === "supported");
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <ClaimSummary report={report} />
        {report.edited_by_user && <span className="text-xs text-fg-3">{ar ? "بعد تعديلك" : "After your edits"}</span>}
      </div>
      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((c, i) => {
            const m = META[c.status];
            const Icon = m.icon;
            return (
              <li key={i} className="flex gap-3 px-3 py-2.5">
                <Icon className={cn("mt-0.5 size-4 shrink-0", m.tone)} aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium text-fg">“{c.label}”</div>
                  <div className={cn("text-xs font-medium", m.tone)}>{ar ? m.ar : m.en}</div>
                  {c.reasons.map((r) => (
                    <p key={r} className="mt-0.5 text-xs text-fg-2">
                      {claimReasonText(r, locale)}
                    </p>
                  ))}
                  {c.evidence.slice(0, 1).map((e, j) => (
                    <blockquote key={j} className="mt-1.5 border-s-2 border-border-strong ps-2 text-xs text-fg-3">
                      {e.quote}
                    </blockquote>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {showSupported && supported.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-fg-3">
            {ar ? `ادعاءات مدعومة (${supported.length})` : `Supported claims (${supported.length})`}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {supported.map((c) => (
              <li key={c.id} className="flex gap-2 text-xs text-fg-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" />
                <span>
                  {c.value || c.text}
                  {c.evidence[0] && <span className="text-fg-3"> — “{c.evidence[0].quote}”</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs leading-relaxed text-fg-3">
        {ar
          ? "يقارن وصل الأرقام والمهارات والشهادات والأدوار مع أدلتك. هذا الفحص آلي وقد يفوّت بعض الحالات — راجع النص قبل النشر."
          : "Wasl compares numbers, skills, credentials and roles with your evidence. The check is automated and can miss cases — review the text before you use it."}
      </p>
    </div>
  );
}
