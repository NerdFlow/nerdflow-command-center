const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

function decodeOnce(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (entity, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return entity;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/** Turn `&amp;`, `&#39;`, and `&nbsp;` into the characters a rep should read. */
export function decodeHtmlEntities(value: string): string {
  let current = value;
  for (let pass = 0; pass < 3; pass++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

export function presentLeadName(value: string | null | undefined): string {
  if (!value) return "";
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function placesName(placesName: string): string {
  const cleaned = presentLeadName(placesName);
  return cleaned || "Unknown business";
}

/**
 * The lead's business name is the Google Places name.
 * A website `<title>` is page copy and is not the business name.
 */
export function leadBusinessName(input: { placesName: string; pageTitle?: string | null }): string {
  return placesName(input.placesName);
}
