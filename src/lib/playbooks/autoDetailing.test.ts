import { describe, expect, it } from "vitest";
import { autoDetailingStarter } from "@/lib/playbooks/autoDetailing";
import { resolveFocusOpener } from "@/lib/focusScripts";
import { linkedinOpenUrl, mailtoUrl } from "@/lib/outreachLinks";

describe("auto-detailing starter playbook", () => {
  it("uses detailing ICP and openers, not restaurant copy", () => {
    const playbook = autoDetailingStarter({ productName: "BayBook", location: "Dallas", buyerGuess: "Shop owner" });
    const blob = [
      playbook.summary,
      playbook.icp.business,
      playbook.icp.buyer,
      ...playbook.call_scripts,
      ...playbook.email_scripts,
      ...playbook.objections.map((o) => `${o.question} ${o.answer}`),
    ].join("\n");
    expect(playbook.icp.business.toLowerCase()).toMatch(/detail/);
    expect(playbook.call_scripts[0].toLowerCase()).toMatch(/detail/);
    expect(playbook.call_scripts[1].toLowerCase()).toMatch(/detail/);
    expect(playbook.email_scripts[0].toLowerCase()).toMatch(/detail/);
    expect(playbook.email_scripts[0]).not.toBe(playbook.email_scripts[1]);
    expect(playbook.call_scripts[0]).not.toBe(playbook.call_scripts[1]);
    expect(blob).not.toMatch(/receptai|dinner rush|restaurant/i);
    expect(playbook.objections).toHaveLength(2);

    const opener = resolveFocusOpener({
      channel: "call",
      leadId: "shop-1",
      productName: "BayBook",
      strategy: playbook,
      values: { name: "Sam", biz: "Shine Shop", city: "Dallas", me: "Alex", product: "BayBook" },
    });
    expect(opener.text.toLowerCase()).toMatch(/detail/);
    expect(opener.text).toMatch(/Shine Shop|booking/);
    expect(opener.text).not.toMatch(/receptai|dinner rush|restaurant/i);
  });
});

describe("outreach links", () => {
  it("opens Titan through mailto and LinkedIn without a send or invite note", () => {
    const mail = mailtoUrl("a@b.com", "Hello there", "Line one\nLine two");
    expect(mail.startsWith("mailto:a@b.com?subject=")).toBe(true);
    expect(mail).toContain("subject=Hello%20there");
    expect(mail).toContain("body=Line%20one%0ALine%20two");
    expect(mail).not.toContain("mail.google.com");
    expect(mail).not.toContain("%40");
    expect(mail).not.toMatch(/[?&]send=/);

    expect(linkedinOpenUrl({ linkedinUrl: "https://www.linkedin.com/in/sam", businessName: "Shine" })).toBe(
      "https://www.linkedin.com/in/sam",
    );
    const search = linkedinOpenUrl({ contactName: "Sam", businessName: "Shine Shop", linkedinUrl: null });
    expect(search.startsWith("https://www.linkedin.com/search/results/people/?keywords=")).toBe(true);
    expect(search).not.toContain("/messaging/send");
    expect(search).not.toMatch(/[?&](message|body)=/i);
    const company = linkedinOpenUrl({
      linkedinUrl: "https://www.linkedin.com/company/shine",
      contactName: "Sam",
      businessName: "Shine Shop",
    });
    expect(company.startsWith("https://www.linkedin.com/search/results/people/?keywords=")).toBe(true);
  });
});
