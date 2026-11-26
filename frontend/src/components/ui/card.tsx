import * as React from "react";
import { SpotArt, type SpotKind } from "@/components/brand/art";
import { cn } from "@/lib/utils";

/**
 * v1's card, matured: ink outline, even radius and a solid offset shadow (mirrors in RTL).
 * tone "sky" is v1's highlighted card; "soft" is the inner item of a card (no shadow).
 */
export function Card({
  className,
  tone = "paper",
  padded = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "paper" | "sky" | "soft" | "tint"; padded?: boolean }) {
  return (
    <div
      className={cn(
        tone === "soft" ? "ink-soft" : "ink-card",
        tone === "sky" && "!bg-primary-soft",
        tone === "tint" && "!bg-surface-2",
        padded && (tone === "soft" ? "p-4" : "p-5 sm:p-6"),
        className,
      )}
      {...props}
    />
  );
}

/** v1 card title: an outlined sky icon square, the title, and an optional action at the end. */
export function CardTitle({
  className,
  icon,
  children,
  action,
  description,
  as: As = "h2",
}: {
  className?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  description?: React.ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("mb-5 flex items-center gap-3", className)}>
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border-[1.5px] border-ink bg-primary-soft text-fg [&_svg]:size-[18px]" aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <As className="font-display text-xl leading-tight text-fg">{children}</As>
        {description && <p className="mt-0.5 text-sm text-fg-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** v1 stat card: icon + label, a large number, an optional hint. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "paper",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "paper" | "sky";
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-fg-2">
        {icon && <span className="text-fg-3 [&_svg]:size-4" aria-hidden>{icon}</span>}
        {label}
      </div>
      <div className="num font-display mt-2 text-[2.1rem] leading-none text-fg">{value}</div>
      {hint && <div className="mt-2 text-xs text-fg-3">{hint}</div>}
    </>
  );
  const cls = cn("ink-card flex min-h-[7.25rem] flex-col p-4 sm:p-5", tone === "sky" && "!bg-primary-soft");
  return href ? (
    <a href={href} className={cn(cls, "transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary")}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export type BadgeTone = "neutral" | "brand" | "accent" | "ok" | "warn" | "bad" | "outline";

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "ink-chip bg-surface-2 text-fg-2",
    brand: "ink-chip bg-primary-soft text-fg",
    accent: "ink-chip bg-accent-soft text-accent-text",
    ok: "ink-chip bg-ok-soft text-ok",
    warn: "ink-chip bg-warn-soft text-warn",
    bad: "ink-chip bg-bad-soft text-bad",
    outline: "ink-chip bg-surface text-fg-2",
  };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** A status dot + label, for inline states (verified, pending, failed…). */
export function Status({ tone = "neutral", children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  const dot: Record<BadgeTone, string> = {
    neutral: "bg-fg-3",
    brand: "bg-primary",
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    bad: "bg-bad",
    outline: "bg-border-strong",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-fg-2", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dot[tone])} aria-hidden />
      {children}
    </span>
  );
}

/** A single metric. Renders inline (no box) — compose several in a <MetricRow>. */
export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs font-medium text-fg-3">{label}</div>
      <div className="num mt-1 text-2xl font-extrabold tracking-tight text-fg">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-fg-3">{hint}</div>}
    </div>
  );
}

/** Metrics on one surface, separated by hairlines (one container, not a card per number). */
export function MetricRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 rounded-xl border border-border bg-surface px-5 shadow-sm sm:grid-cols-4 [&>*]:py-4 [&>*]:pe-4 [&>*:not(:first-child)]:sm:border-s [&>*:not(:first-child)]:sm:ps-5 [&>*]:border-border-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type AreaTone = "brand" | "sky" | "amber" | "green" | "violet" | "teal" | "slate";

/**
 * v1 page header: a large title with the blue underline, the subtitle, and actions (or a small line illustration)
 * at the end. `tone` is accepted for compatibility and ignored: v1 had no per-area banners.
 */
export function PageHeader({
  title,
  sub,
  actions,
  eyebrow,
  className,
  art,
  artNode,
}: {
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
  tone?: AreaTone;
  /** a small line illustration beside the actions (v1 Job Matches) */
  art?: SpotKind;
  artNode?: React.ReactNode;
}) {
  return (
    <header className={cn("mb-9 flex flex-wrap items-end gap-x-6 gap-y-5", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-2 text-sm font-bold text-primary-text">{eyebrow}</div>}
        <h1 className="font-display text-[2.1rem] leading-[1.15] text-fg sm:text-[2.6rem] rtl:leading-snug">
          <span className="brand-underline">{title}</span>
        </h1>
        {sub && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-2">{sub}</p>}
      </div>
      {(art || artNode) && <div className="hidden shrink-0 self-center md:block">{artNode ?? <SpotArt kind={art!} className="h-24 w-auto" />}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

/** Editorial section: heading on top, content below, no container. */
export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const hid = React.useId();
  return (
    <section className={cn("min-w-0", className)} aria-labelledby={title ? hid : undefined} id={id}>
      {(title || action) && (
        <div className="mb-3 flex items-end gap-4">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 id={hid} className="text-heading font-bold text-fg">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-fg-3">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Divided list on one surface (rows separated by hairlines). */
export function List({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className={cn("divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface shadow-sm", className)}
      {...props}
    />
  );
}

export function ListItem({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn("px-4 py-3.5", className)} {...props} />;
}

/** Key/value pairs (metadata). */
export function DescriptionList({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 gap-y-2 text-sm", className)}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <dt className="text-fg-3">{it.label}</dt>
          <dd className="min-w-0 text-fg">{it.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 font-mono text-[11px] text-fg-2">{children}</kbd>;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-border", className)} />;
}
