import { redirect } from "next/navigation";

/** Lead Gen is retired — create a campaign or import a list from Campaigns. */
export default function LeadGenerationRedirect() {
  redirect("/campaigns");
}
