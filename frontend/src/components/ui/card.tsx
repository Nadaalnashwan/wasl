import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, tone = "paper", ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: "paper" | "sky" | "tint" }) {
  return (
    <div
      className={cn("sketch p-5", tone === "sky" && "!bg-sky", tone === "tint" && "!bg-paper-2", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, icon, children, action }: { className?: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn("mb-4 flex items-center gap-3", className)}>
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-ink bg-sky [&_svg]:size-5">{icon}</span>}
      <h2 className="font-hand text-2xl leading-tight">{children}</h2>
      {action && <div className="ms-auto">{action}</div>}
    </div>
  );
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "brand" | "ok" | "warn" | "bad" | "sky" }) {
  const tones = {
    neutral: "bg-paper-2 text-ink-soft",
    brand: "bg-brand text-brand-ink",
    ok: "bg-ok-fill text-ink",
    warn: "bg-warn-fill text-ink",
    bad: "bg-bad-fill text-ink",
    sky: "bg-sky text-ink",
  } as const;
  return (
    <span
      className={cn("sketch-pill inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5", tones[tone], className)}
      {...props}
    />
  );
}

export function Stat({ label, value, hint, icon, tone = "paper" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: "paper" | "sky" }) {
  return (
    <Card tone={tone} className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
        {label}
      </div>
      <div className="font-hand text-4xl leading-none">{value}</div>
      {hint && <div className="text-xs text-ink-faint">{hint}</div>}
    </Card>
  );
}

export function PageHeader({ title, sub, actions, art }: { title: string; sub?: string; actions?: React.ReactNode; art?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="font-hand text-4xl md:text-5xl">
          <span className="scribble">{title}</span>
        </h1>
        {sub && <p className="mt-4 max-w-2xl text-ink-soft">{sub}</p>}
      </div>
      {art && <div className="hidden shrink-0 md:block">{art}</div>}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
