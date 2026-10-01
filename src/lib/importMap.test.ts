import { describe, expect, it } from "vitest";
import { applyMapping, autoMapFields, defaultAssigneeIds } from "@/lib/importMap";

describe("import column map", () => {
  const headers = ["Business Name", "City", "Phone", "Corporate Email", "Generic Email"];

  it("maps Business Name and treats Corporate Email as primary with Generic Email as fallback", () => {
    const mapping = autoMapFields(headers);
    expect(mapping.business_name).toBe("Business Name");
    expect(mapping.city).toBe("City");
    expect(mapping.phone).toBe("Phone");
    expect(mapping.email).toBe("Corporate Email");
    expect(mapping.email_fallback).toBe("Generic Email");
  });

  it("uses Generic Email when Corporate Email is blank", () => {
    const mapping = autoMapFields(headers);
    const [row] = applyMapping(
      [
        {
          "Business Name": "Shine Shop",
          City: "Austin",
          Phone: "512-555-0100",
          "Corporate Email": "  ",
          "Generic Email": "owner@shine.example",
        },
      ],
      mapping,
    );
    expect(row?.business_name).toBe("Shine Shop");
    expect(row?.phone).toBe("512-555-0100");
    expect(row?.email).toBe("owner@shine.example");
  });

  it("keeps Corporate Email when it is present", () => {
    const mapping = autoMapFields(headers);
    const [row] = applyMapping(
      [
        {
          "Business Name": "Shine Shop",
          City: "Austin",
          Phone: "512-555-0100",
          "Corporate Email": "corp@shine.example",
          "Generic Email": "owner@shine.example",
        },
      ],
      mapping,
    );
    expect(row?.email).toBe("corp@shine.example");
  });

  it("maps headers that are not the exact field key", () => {
    const mapping = autoMapFields(["Company", "Mobile", "E-mail"]);
    expect(mapping.business_name).toBe("Company");
    expect(mapping.phone).toBe("Mobile");
    expect(mapping.email).toBe("E-mail");
  });

  it("defaults the owner to the person opening Focus", () => {
    expect(defaultAssigneeIds("me", ["other", "me"])).toEqual(["me"]);
    expect(defaultAssigneeIds("manager", ["rep-a", "rep-b"])).toEqual(["rep-a"]);
  });
});
