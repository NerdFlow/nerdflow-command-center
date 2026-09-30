"use client";

import { useState, type ReactNode } from "react";
import { BulkImportWizard } from "@/components/BulkImportWizard";

export function CampaignsImportSlot({
  campaigns,
  reps,
  currentUserId,
  title,
  primaryAction,
}: {
  campaigns: { id: string; name: string; hasIcp: boolean }[];
  reps: { id: string; fullName: string }[];
  currentUserId: string;
  title: ReactNode;
  primaryAction: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-8">
      <div className="flex flex-wrap justify-between items-end gap-4 mb-0">
        {title}
        <div className="flex flex-wrap gap-2 items-center">
          {!open && (
            <BulkImportWizard
              campaigns={campaigns}
              reps={reps}
              currentUserId={currentUserId}
              open={false}
              onOpenChange={setOpen}
            />
          )}
          {primaryAction}
        </div>
      </div>
      {open && (
        <div className="mt-6">
          <BulkImportWizard
            campaigns={campaigns}
            reps={reps}
            currentUserId={currentUserId}
            open
            onOpenChange={setOpen}
          />
        </div>
      )}
    </div>
  );
}
