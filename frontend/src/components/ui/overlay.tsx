"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------- Dialog */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ title, description, children, className, wide }: { title: string; description?: string; children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "sketch fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6",
          wide && "w-[min(96vw,1100px)]",
          className,
        )}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1">
            <DialogPrimitive.Title className="font-hand text-3xl">{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="mt-1 text-sm text-ink-soft">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="sketch-btn grid size-9 place-items-center bg-paper" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ----------------------------------------------------------- Tabs */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("mb-5 flex flex-wrap gap-2", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "sketch-pill bg-paper px-4 py-1.5 font-hand text-lg transition-colors hover:bg-sky data-[state=active]:bg-ink data-[state=active]:text-paper",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

/* ----------------------------------------------------------- Switch */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-ink bg-paper-3 transition-colors data-[state=checked]:bg-brand",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full border-2 border-ink bg-paper transition-transform data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5 ltr:translate-x-0.5 rtl:-translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
}
