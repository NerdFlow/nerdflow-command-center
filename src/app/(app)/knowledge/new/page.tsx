import Link from "next/link";
import { KnowledgeEditor } from "@/components/KnowledgeEditor";
import { canEditOutreachKb } from "@/lib/outreachKb";
import { requireUser } from "@/server/auth";

export default async function NewKnowledgePage() {
  const user = await requireUser();
  const canEdit = canEditOutreachKb(user.role);

  return (
    <div className="space-y-4">
      <Link href="/knowledge" className="text-sm text-muted">
        Back to Knowledge
      </Link>
      <div>
        <h1 className="text-[28px] tracking-tight mb-1.5">Add a knowledge row</h1>
        <p className="text-muted m-0">Write the title and the text. It stays a draft until you mark it Approved.</p>
      </div>
      {canEdit ? (
        <KnowledgeEditor
          canEdit
          row={{
            key: "",
            layer: "core",
            kind: "learning",
            icp: null,
            scope: "universal",
            status: "draft",
            title: "",
            body: "",
            payload: {},
            locked: false,
            sourcePath: "app",
            updatedLabel: null,
            updatedByName: null,
          }}
        />
      ) : (
        <p className="text-sm text-muted">You can read the knowledge base. Managers add rows.</p>
      )}
    </div>
  );
}
