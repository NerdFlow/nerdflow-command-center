"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Panel } from "@/components/ui";
import { saveProfile } from "@/server/actions/profile";
import type { Channel } from "@prisma/client";

const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram DM" },
  { value: "linkedin", label: "LinkedIn DM" },
];

export function ProfileClient({
  isSetup,
  fullName: initialFullName,
  timezone: initialTimezone,
  start: initialStart,
  end: initialEnd,
  gmail: initialGmail,
  instagram: initialInstagram,
  linkedin: initialLinkedin,
  channelsWorked: initialChannelsWorked,
  targets,
}: {
  isSetup: boolean;
  fullName: string;
  timezone: string;
  start: string;
  end: string;
  gmail: string;
  instagram: string;
  linkedin: string;
  channelsWorked: string[];
  targets: { label: string; value: number }[];
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [gmail, setGmail] = useState(initialGmail);
  const [instagram, setInstagram] = useState(initialInstagram);
  const [linkedin, setLinkedin] = useState(initialLinkedin);
  const [channelsWorked, setChannelsWorked] = useState<Channel[]>(initialChannelsWorked as Channel[]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleChannel(ch: Channel) {
    setChannelsWorked((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
    setSaved(false);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await saveProfile({ fullName, timezone, start, end, gmail, instagram, linkedin, channelsWorked, markComplete: isSetup });
      if (isSetup) {
        router.push("/today");
        router.refresh();
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <div className="space-y-4">
        <label className="block text-sm">
          Name
          <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Timezone
          <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Working hours start
            <input type="time" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="block text-sm">
            Working hours end
            <input type="time" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <div>
          <p className="text-sm font-medium mb-1">Channels I work</p>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_OPTIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleChannel(c.value)}
                className={
                  "text-sm px-3 py-1.5 rounded-lg border " +
                  (channelsWorked.includes(c.value) ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted")
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-1">These are the tiles you&apos;ll see when starting a Focus session.</p>
        </div>

        <div>
          <p className="text-sm font-medium mb-1">Channel accounts</p>
          <div className="space-y-2">
            <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg text-sm" placeholder="Gmail address" value={gmail} onChange={(e) => setGmail(e.target.value)} />
            <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg text-sm" placeholder="Instagram handle" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
            <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg text-sm" placeholder="LinkedIn profile URL" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          </div>
          <p className="text-xs text-muted mt-1">Used for the &quot;Open Gmail/Instagram/LinkedIn&quot; buttons in Replies.</p>
        </div>

        {targets.length > 0 && (
          <div className="bg-panel2 rounded-card p-3">
            <p className="text-xs text-muted font-semibold mb-1">Your daily targets (set by a Lead)</p>
            {targets.map((t) => (
              <div key={t.label} className="flex justify-between text-sm py-0.5">
                <span>{t.label}</span>
                <span className="font-medium">{t.value} / day</span>
              </div>
            ))}
          </div>
        )}

        {saved && <p className="text-sm text-go">Saved.</p>}
        {error && <p className="text-sm text-stop">{error}</p>}

        <Btn variant="primary" className="w-full justify-center" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : isSetup ? "Take me to Today" : "Save"}
        </Btn>
      </div>
    </Panel>
  );
}
