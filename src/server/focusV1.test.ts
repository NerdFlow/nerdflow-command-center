import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLeadChannel } from "./cadence";
import { detailingStarterStrategy, isAutoDetailingContext } from "./detailingStrategy";
import {
  assignScriptVariant,
  leadEligibleForFocusMode,
  linkedInOpenUrl,
  perHundred,
  resolveFocusOpener,
  variantFromScriptId,
} from "./focusMode";
import { applyMapping, autoMapFields } from "./importMap";
import { campaignStrategySchema } from "./playbook";

const phoneLead = { phone: "(512) 555-0148", email: "owner@shine.example", linkedinUrl: null };

describe("Focus Call is phone-first", () => {
  it("includes a lead with a phone when the cadence step is email", () => {
    const strategy = detailingStarterStrategy({
      productName: "BayLine",
      productType: "service",
      productSummary: "Booking help for auto detailing shops",
      location: "Austin, TX",
      buyerGuess: "detail shop owner",
    });
    assert.equal(resolveLeadChannel({ strategy, cadenceStep: 0, nextChannelOverride: null }), "email");
    assert.equal(leadEligibleForFocusMode(phoneLead, "call"), true);
    assert.equal(leadEligibleForFocusMode({ phone: "", email: "owner@shine.example", linkedinUrl: null }, "call"), false);
    assert.equal(leadEligibleForFocusMode({ phone: "n/a", email: "owner@shine.example", linkedinUrl: null }, "call"), false);
    assert.equal(leadEligibleForFocusMode({ phone: null, email: "owner@shine.example", linkedinUrl: null }, "email"), true);
    assert.equal(
      leadEligibleForFocusMode({ phone: null, email: null, linkedinUrl: "https://www.linkedin.com/in/owner" }, "linkedin"),
      true,
    );
  });
});

describe("script assignment", () => {
  it("is stable and stores a script id the rep does not choose", () => {
    const strategy = detailingStarterStrategy({
      productName: "BayLine",
      productType: "service",
      productSummary: "auto detailing shops",
      location: "Austin",
    });
    const first = assignScriptVariant("lead-1", "call");
    assert.equal(assignScriptVariant("lead-1", "call"), first);

    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(assignScriptVariant(`lead-${i}`, "call"));
    assert.deepEqual([...seen].sort(), ["a", "b"]);

    const opener = resolveFocusOpener({
      leadId: "lead-1",
      channel: "call",
      strategy,
      cadenceStep: 0,
      values: { name: "Sam", biz: "Shine Lab", city: "Austin", me: "Ada", product: "BayLine" },
    });
    assert.match(opener.scriptId, /^call:[ab]$/);
    assert.equal(variantFromScriptId(opener.scriptId, null), opener.scriptId.endsWith(":b") ? "b" : "a");
    assert.match(opener.body, /Shine Lab/);
    assert.doesNotMatch(opener.body, /restaurant/i);
  });

  it("counts interested per 100 touches", () => {
    assert.equal(perHundred(1, 4), 25);
    assert.equal(perHundred(0, 0), null);
  });
});

describe("detailing starter", () => {
  it("uses detailing ICP and openers without restaurant language", () => {
    assert.equal(isAutoDetailingContext(["BayLine", "Auto detailing booking desk"]), true);
    assert.equal(isAutoDetailingContext(["ReceptAI", "answers restaurant calls"]), false);

    const strategy = detailingStarterStrategy({
      productName: "BayLine",
      productType: "service",
      productSummary: "Helps auto detailing shops catch bookings",
      location: "Austin, TX",
      buyerGuess: "shop owner",
    });
    const blob = JSON.stringify(strategy).toLowerCase();
    assert.match(strategy.icp.business, /detailing/i);
    assert.equal(strategy.call_scripts[0]?.includes("{name}"), true);
    assert.equal(strategy.email_scripts.length, 2);
    assert.notEqual(strategy.call_scripts[0], strategy.call_scripts[1]);
    for (const word of ["restaurant", "dinner", "kitchen", "reservation", "menu", "dine-in"]) {
      assert.equal(blob.includes(word), false, word);
    }

    const { email_scripts: _email, ...withoutEmailScripts } = strategy;
    const parsed = campaignStrategySchema.parse(withoutEmailScripts);
    assert.deepEqual(parsed.email_scripts, ["", ""]);
  });
});

describe("import mapping", () => {
  it("maps friendly headers and falls back from corporate email to generic email", () => {
    const headers = ["Business Name", "Corporate Email", "Generic Email", "Phone Number", "City"];
    const mapping = autoMapFields(headers);
    assert.equal(mapping.business_name, "Business Name");
    assert.equal(mapping.email, "Corporate Email");
    assert.equal(mapping.phone, "Phone Number");
    assert.equal(mapping.city, "City");

    const rows = applyMapping(
      [
        {
          "Business Name": "Shine Lab",
          "Corporate Email": "owner@shine.example",
          "Generic Email": "info@shine.example",
          "Phone Number": "(512) 555-0100",
          City: "Austin",
        },
        {
          "Business Name": "Dull Finish",
          "Corporate Email": "",
          "Generic Email": "hello@dull.example",
          "Phone Number": "5125550199",
          City: "Austin",
        },
      ],
      mapping,
    );

    assert.equal(rows[0]?.email, "owner@shine.example");
    assert.equal(rows[0]?.business_name, "Shine Lab");
    assert.equal(rows[0]?.phone, "(512) 555-0100");
    assert.equal(rows[1]?.email, "hello@dull.example");
  });

  it("maps company name when that is the only business header", () => {
    const mapping = autoMapFields(["Company Name", "Email"]);
    assert.equal(mapping.business_name, "Company Name");
    assert.equal(mapping.email, "Email");
  });
});

describe("linkedin open", () => {
  it("opens a profile url and never builds a send endpoint", () => {
    const url = linkedInOpenUrl("https://www.linkedin.com/in/sam-owner");
    assert.equal(url, "https://www.linkedin.com/in/sam-owner");
    assert.equal(url.includes("send"), false);
  });
});
