import * as React from "react";
import { SpotArt, type SpotKind } from "@/components/brand/art";
import { cn } from "@/lib/utils";

/**
 * Surface container. Use sparingly — only when grouping genuinely helps.
 * Prefer <Section> + plain lists/dividers for most page content.
 */
export function Card({
  className,
  tone = "surface",
  padded = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "surface" | "muted" | "brand"; padded?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border",
        tone === "surface" && "bg-surface shadow-sm",
        tone === "muted" && "bg-surface-2",
        tone === "brand" && "border-primary/25 bg-primary-soft",
        padded && "p-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  icon,
  children,
  action,
  description,
}: {
  className?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-4 flex items-start gap-3", className)}>
      {icon && <span className="mt-0.5 text-fg-3 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 className="text-heading font-bold text-fg">{children}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type BadgeTone = "neutral" | "brand" | "accent" | "ok" | "warn" | "bad" | "outline";

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-surface-2 text-fg-2",
    brand: "bg-primary-soft text-primary-text",
    accent: "bg-accent-soft text-accent-text",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    outline: "border border-border text-fg-2",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap [&_svg]:size-3",
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

/** Page title. With `art` + `tone` it becomes the area's banner: its colour, its illustration, the same layout everywhere. */
export function PageHeader({
  title,
  sub,
  actions,
  eyebrow,
  className,
  tone,
  art,
}: {
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
  tone?: AreaTone;
  art?: SpotKind;
}) {
  if (art) {
    return (
      <header
        className={cn(
          `tone-${tone ?? "brand"}`,
          "relative mb-10 overflow-hidden rounded-2xl border border-border bg-tone-soft px-6 py-7 sm:px-8",
          className,
        )}
      >
        <div className="relative z-10 flex flex-wrap items-end gap-x-6 gap-y-4 sm:pe-40">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="mb-2 text-sm font-bold text-tone">{eyebrow}</div>}
            <h1 className="font-display brand-underline text-title text-fg">{title}</h1>
            {sub && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-2">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <SpotArt kind={art} className="pointer-events-none absolute end-5 top-1/2 hidden h-28 w-auto -translate-y-1/2 sm:block" />
      </header>
    );
  }
  return (
    <header className={cn("mb-10 flex flex-wrap items-end gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display brand-underline text-title text-fg">{title}</h1>
        {sub && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
