import type { JsonSchema, Verifier } from "./types.ts";

// Deterministic, dependency-free schema check. This is the heart of "delivery
// verification": a provider only gets paid for data that actually matches what
// the buyer asked for. No trusted third party, no human arbiter.

function check(value: unknown, schema: JsonSchema, path: string): string | null {
  const typeOf = (v: unknown): string => {
    if (Array.isArray(v)) return "array";
    if (v === null) return "null";
    return typeof v;
  };

  const actual = typeOf(value);
  if (schema.type !== actual) {
    return `${path || "root"}: expected ${schema.type}, got ${actual}`;
  }

  if (schema.type === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) return `${path || "root"}: missing required field "${key}"`;
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj) {
        const err = check(obj[key], sub, path ? `${path}.${key}` : key);
        if (err) return err;
      }
    }
  }

  if (schema.type === "array" && schema.items) {
    const arr = value as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const err = check(arr[i], schema.items, `${path}[${i}]`);
      if (err) return err;
    }
  }

  return null;
}

export const schemaVerifier: Verifier = {
  verify(response, schema) {
    // An empty/null body is the classic "took the money, gave nothing" scam.
    if (response === undefined || response === null) {
      return { ok: false, reason: "empty response body" };
    }
    const err = check(response, schema, "");
    return err ? { ok: false, reason: err } : { ok: true };
  },
};
