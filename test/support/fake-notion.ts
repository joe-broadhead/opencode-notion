import type { FakeWorkspace } from "./fake-tools.ts"

/** The fixed clock every recorded answer uses: noon UTC, after every listed edit has settled. */
export const NOW = Date.parse("2026-11-20T12:00:00.000Z")

/** Two invented workspaces: one person, a few pages, no real account, no secret. */
export const WORKSPACES: Readonly<Record<"work" | "personal", FakeWorkspace>> = {
  work: {
    id: "ws-work",
    name: "Northwind Studio",
    user: { id: "u-ana", name: "Ana Silva", type: "person" },
    plan: "business",
    pages: [
      {
        id: "p-work-1",
        type: "page",
        title: "Queue migration notes",
        edited_at: "2026-11-18T10:15:00.000Z",
        edited_by: "u-ana",
        created_by: "u-ana",
        url: "https://app.notion.com/p/p-work-1?pvs=4",
      },
      {
        id: "p-work-2",
        type: "page",
        title: "Launch checklist",
        edited_at: "2026-11-19T08:40:00.000Z",
        edited_by: "u-ana",
        created_by: "u-ana",
        url: "https://www.notion.so/p-work-2",
      },
      {
        id: "p-work-3",
        type: "database",
        title: "Someone else's tracker",
        edited_at: "2026-11-17T16:00:00.000Z",
        edited_by: "u-other",
        created_by: "u-other",
        url: "https://app.notion.com/p/p-work-3",
      },
      {
        id: "p-work-4",
        type: "page",
        title: "External link",
        edited_at: "2026-11-18T11:00:00.000Z",
        edited_by: "u-ana",
        created_by: "u-ana",
        url: "https://example.com/p/p-work-4",
      },
    ],
  },
  personal: {
    id: "ws-personal",
    name: "Personal",
    user: { id: "u-ana-home", name: "Ana Silva", type: "person" },
    plan: "business",
    pages: [
      {
        id: "p-personal-1",
        type: "page",
        title: "Weekend plan",
        edited_at: "2026-11-17T19:05:00.000Z",
        edited_by: "u-ana-home",
        created_by: "u-ana-home",
        url: "https://app.notion.com/p/p-personal-1",
      },
      {
        id: "p-personal-2",
        type: "page",
        title: "Reading list",
        edited_at: "2026-11-16T20:00:00.000Z",
        edited_by: "u-ana-home",
        created_by: "u-other",
        url: "https://www.notion.so/p-personal-2",
      },
    ],
  },
}
