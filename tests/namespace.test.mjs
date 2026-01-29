import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { TidepoolClient } from "../dist/index.js";

const originalFetch = globalThis.fetch;

let calls = [];
let responseMode = "object";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  responseMode = "object";
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    const body =
      typeof init.body === "string" && init.body.length > 0
        ? JSON.parse(init.body)
        : undefined;
    calls.push({ url, method, body });

    if (url.includes("/v1/namespaces/") && url.endsWith("/status")) {
      return jsonResponse({
        last_run: "2025-01-01T00:00:00Z",
        wal_files: 1,
        wal_entries: 2,
        segments: 3,
        total_vecs: 4,
        dimensions: 5,
      });
    }

    if (url.endsWith("/v1/namespaces") && method === "GET") {
      return jsonResponse({
        namespaces: [
          {
            namespace: "default",
            approx_count: 10,
            dimensions: 3,
            pending_compaction: true,
          },
          { namespace: "products", approx_count: 5, dimensions: 3 },
        ],
      });
    }

    if (url.includes("/v1/vectors/") && method === "POST") {
      const namespace = url.split("/v1/vectors/")[1];
      if (responseMode === "array") {
        return jsonResponse([{ id: "a", score: 0.1 }]);
      }
      return jsonResponse({
        namespace,
        results: [{ id: "a", score: 0.1 }],
      });
    }

    return jsonResponse({ ok: true });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("uses explicit namespace for upsert, query, delete", async () => {
  const client = new TidepoolClient({ defaultNamespace: "default" });

  await client.upsert(
    [{ id: "doc-1", vector: [0.1, 0.2, 0.3] }],
    { namespace: "products" }
  );
  const response = await client.query([0.1, 0.2, 0.3], {
    namespace: "products",
  });
  await client.delete(["doc-1"], { namespace: "products" });

  assert.equal(response.namespace, "products");
  const urls = calls.map((call) => call.url);
  assert.equal(
    urls.filter((url) => url.includes("/v1/vectors/products")).length,
    3
  );
});

test("falls back to default namespace when omitted", async () => {
  const client = new TidepoolClient({ defaultNamespace: "default" });

  await client.upsert([{ id: "doc-1", vector: [0.1, 0.2, 0.3] }]);

  assert.ok(calls.some((call) => call.url.includes("/v1/vectors/default")));
});

test("getNamespaceStatus and compact use namespace endpoints", async () => {
  const client = new TidepoolClient({ defaultNamespace: "default" });

  const status = await client.getNamespaceStatus("products");
  await client.compact("products");

  assert.equal(status.walEntries, 2);
  assert.ok(
    calls.some((call) => call.url.includes("/v1/namespaces/products/status"))
  );
  assert.ok(
    calls.some((call) => call.url.includes("/v1/namespaces/products/compact"))
  );
});

test("cross-namespace isolation uses distinct endpoints", async () => {
  responseMode = "array";
  const client = new TidepoolClient({ defaultNamespace: "default" });

  const a = await client.query([0.1, 0.2, 0.3], { namespace: "tenant_a" });
  const b = await client.query([0.1, 0.2, 0.3], { namespace: "tenant_b" });

  assert.equal(a.namespace, "tenant_a");
  assert.equal(b.namespace, "tenant_b");
  assert.ok(calls.some((call) => call.url.includes("/v1/vectors/tenant_a")));
  assert.ok(calls.some((call) => call.url.includes("/v1/vectors/tenant_b")));
});

test("supports text-only queries via request object", async () => {
  const client = new TidepoolClient({ defaultNamespace: "default" });

  await client.query({ text: "machine learning", mode: "text", namespace: "documents" });

  const lastCall = calls[calls.length - 1];
  assert.ok(lastCall.url.includes("/v1/vectors/documents"));
  assert.equal(lastCall.body.mode, "text");
  assert.equal(lastCall.body.text, "machine learning");
  assert.equal(lastCall.body.vector, undefined);
});

test("listNamespaces returns namespace info", async () => {
  const client = new TidepoolClient({ defaultNamespace: "default" });

  const namespaces = await client.listNamespaces();

  assert.equal(namespaces.length, 2);
  assert.equal(namespaces[0].namespace, "default");
  assert.equal(namespaces[0].approxCount, 10);
  assert.equal(namespaces[0].dimensions, 3);
  assert.equal(namespaces[0].pendingCompaction, true);
});
