import { getRepliesOverview } from "@/server/actions/replies";
import { RepliesClient } from "@/components/RepliesClient";

export default async function RepliesPage() {
  const overview = await getRepliesOverview();
  return <RepliesClient overview={overview} />;
}
