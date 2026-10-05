export type KbLayerName = "sales_craft" | "core" | "icp";
export type KbScopeName = "universal" | "icp";
export type KbStatusName = "draft" | "pending" | "approved" | "retired";

export type KbTask =
  | "write_outreach"
  | "score_leads"
  | "answer_reply"
  | "talk_price"
  | "prep_discovery"
  | "quote_stat"
  | "customer_story";

export type KbSeedEntry = {
  key: string;
  layer: KbLayerName;
  kind: string;
  icp: string | null;
  scope: KbScopeName;
  status: KbStatusName;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  sourcePath: string;
  sourceLink: string | null;
  version: number;
};

export type KbContextRow = {
  key: string;
  layer: string;
  kind: string;
  icp: string | null;
  scope: string;
  status: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  sourcePath: string;
  version: number;
};
