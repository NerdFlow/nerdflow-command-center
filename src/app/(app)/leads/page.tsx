import { redirect } from "next/navigation";

/** Lead Inbox is retired — scraped/imported leads go straight to Focus. */
export default function LeadInboxRedirect() {
  redirect("/campaigns");
}
