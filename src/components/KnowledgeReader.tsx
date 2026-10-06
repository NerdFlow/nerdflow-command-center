import { Panel } from "@/components/ui";
import type { KbReaderView } from "@/lib/outreachKb";

const CLAIM_LABEL: Record<string, string> = {
  yes: "We can say this",
  roadmap: "Not yet. Don't say this",
  commercial: "The price and the offer",
};

export function KnowledgeReader({ view }: { view: KbReaderView }) {
  return (
    <div className="space-y-4 max-w-2xl">
      <Panel className="space-y-4">
        <p className="text-sm text-muted m-0">{view.type}</p>
        <div>
          <p className="text-sm m-0">Title</p>
          <p className="m-0 mt-1">{view.title}</p>
        </div>
        <div>
          <p className="text-sm m-0">Body</p>
          <p className="m-0 mt-1 whitespace-pre-wrap">{view.body}</p>
        </div>
        <div>
          <p className="text-sm m-0">Status</p>
          <p className="m-0 mt-1">{view.status}</p>
        </div>
        {view.claim !== null && (
          <div>
            <p className="text-sm m-0">What we can claim</p>
            <p className="m-0 mt-1">{CLAIM_LABEL[view.claim] ?? view.claim}</p>
          </div>
        )}
        {view.safeToQuote !== null && (
          <div>
            <p className="text-sm m-0">Safe to quote: yes/no</p>
            <p className="m-0 mt-1">{view.safeToQuote ? "Yes" : "No"}</p>
          </div>
        )}
        {view.doNotQuote !== null && (
          <div>
            <p className="text-sm m-0">Do not quote: yes/no</p>
            <p className="m-0 mt-1">{view.doNotQuote ? "Yes" : "No"}</p>
          </div>
        )}
        <p className="text-sm text-muted m-0">Last edited {view.lastEdited}</p>
        <p className="text-sm text-muted m-0">You can read this. Managers edit it.</p>
      </Panel>
    </div>
  );
}
