"use client";

/**
 * Exports, placed with the comparison rather than in a menu.
 *
 * The award note is first and is the only one described in a full sentence,
 * because it is the actual deliverable of the product and the one a buyer will
 * otherwise never find. Its reader is internal audit eight months from now, who
 * never opens the tool: everything they need has to be inside that one file.
 */

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ExportBar({ qualifiedOnly }: { qualifiedOnly: boolean }) {
  const items: Array<{ href: string; label: string; blurb: string; primary?: boolean }> = [
    {
      href: `/api/export/award-note${qualifiedOnly ? "" : "?all=true"}`,
      label: "Award note",
      primary: true,
      blurb:
        "The recommendation and everything behind it: why not the cheapest, the " +
        "assumptions in force, money we did not count, and every open item. Written to " +
        "stand on its own for whoever audits this in a year. Opens printable.",
    },
    {
      href: "/api/export/comparison",
      label: "Comparison (xlsx)",
      blurb:
        "The grid, normalised. Each cell carries its source, the original value and every " +
        "caveat as a comment, so nothing is lost when you email it on.",
    },
    {
      href: "/api/export/audit",
      label: "Audit bundle (json)",
      blurb:
        "Every cell, source and calculation step. Enough to rebuild this decision without " +
        "the tool.",
    },
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-2">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Export
      </span>
      {items.map((it) => (
        <Tooltip key={it.href}>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={it.primary ? "default" : "outline"}
              className="h-6.5 text-[11px]"
              asChild
            >
              <a href={it.href} target="_blank" rel="noreferrer">{it.label}</a>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm text-xs leading-relaxed">
            {it.blurb}
          </TooltipContent>
        </Tooltip>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground">
        {qualifiedOnly ? "Qualified suppliers only" : "All suppliers, including failed"}
      </span>
    </div>
  );
}
