/**
 * Live Intelligence Tape Data — Autonomy Index
 * Monochrome date-based format for institutional presentation
 */

export interface LiveUpdate {
  id: string;
  date: string;        // Display date, e.g. "Feb 14"
  text: string;        // Plain update text
  timestamp: string;   // ISO for sorting
  link?: string;
}

export const liveUpdates: LiveUpdate[] = [
  {
    id: "update-001",
    date: "Feb 14",
    text: "CrewAI sandbox update reduces ARI from 52 to 47",
    timestamp: "2026-02-14T14:32:00Z",
  },
  {
    id: "update-002",
    date: "Feb 13",
    text: "MCP adoption crosses 12,000 registered endpoints",
    timestamp: "2026-02-13T12:15:00Z",
  },
  {
    id: "update-003",
    date: "Feb 12",
    text: "LangChain patches tool injection vulnerability (CVE-2026-4521)",
    timestamp: "2026-02-12T18:42:00Z",
  },
  {
    id: "update-004",
    date: "Feb 11",
    text: "n8n enterprise adoption up 35% YoY — EPI adjusted to 78",
    timestamp: "2026-02-11T10:08:00Z",
  },
  {
    id: "update-005",
    date: "Feb 10",
    text: "Claude Opus 4.6 expands enterprise tier with 2× token limits",
    timestamp: "2026-02-10T16:20:00Z",
  },
];

/**
 * Get updates sorted by timestamp (newest first)
 */
export function getSortedUpdates(): LiveUpdate[] {
  return [...liveUpdates].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Render tape content for HTML (monochrome format)
 */
export function renderTapeContent(): string {
  const updates = getSortedUpdates();
  const doubled = [...updates, ...updates];

  return doubled
    .map((update) => `
    <div class="tape-item">
      <span class="tape-date">${update.date}</span>
      <span class="tape-sep">—</span>
      <span class="tape-headline">${update.text}</span>
    </div>
  `)
    .join("");
}
