import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  DistanceMetric,
  NotFoundError,
  ServiceUnavailableError,
  TidepoolClient,
  TidepoolError,
  ValidationError,
  validateVector,
  withRetry,
} from "../dist/index.js";

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

let calls = [];
let responseQueue = [];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { "content-type": "text/plain" },
  });
}

beforeEach(() => {
  calls = [];
  responseQueue = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    const body =
      typeof init.body === "string" && init.body.length > 0
        ? JSON.parse(init.body)
        : undefined;
    calls.push({ url, method, body });

    if (responseQueue.length === 0) {
      return jsonResponse({ ok: true });
    }
    const next = responseQueue.shift();
    if (typeof next === "function") {
      return next({ url, method, body });
    }
    return next;
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

test("validateVector rejects invalid input", () => {
  assert.throws(() => validateVector("bad"), /Vector must be an array/);
  assert.throws(() => validateVector([]), /Vector cannot be empty/);
  assert.throws(() => validateVector([Infinity]), /finite numbers/);
  assert.throws(() => validateVector([1, 2], 3), /Expected 3 dimensions/);
  validateVector([0.1, 0.2], 2);
});

test("withRetry retries ServiceUnavailableError", async () => {
  let attempts = 0;
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms) => {
    fn();
    return 0;
  };

  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new ServiceUnavailableError("busy");
    }
    return "ok";
  }, 3, 1);

  globalThis.setTimeout = originalTimeout;
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("withRetry does not retry non-service errors", async () => {
  await assert.rejects(
    () => withRetry(async () => {
      throw new ValidationError("bad");
    }, 3, 1),
    ValidationError
  );
});

test("constructor validates config", () => {
  assert.throws(() => new TidepoolClient({ queryUrl: " " }), /queryUrl must be a non-empty string/);
  assert.throws(() => new TidepoolClient({ ingestUrl: "" }), /ingestUrl must be a non-empty string/);
  assert.throws(() => new TidepoolClient({ timeout: 0 }), /timeout must be a positive number/);
});

test("query validation fails fast", async () => {
  const client = new TidepoolClient({ defaultNamespace: "default" });
  await assert.rejects(
    () => client.query([0.1, 0.2], { topK: 0 }),
    ValidationError
  );
  await assert.rejects(
    () => client.query({ text: "hi", mode: "invalid" }),
    ValidationError
  );
  assert.equal(calls.length, 0);
});

test("query payload includes normalized fields", async () => {
  responseQueue.push(jsonResponse({ namespace: "default", results: [{ id: "a", score: 0.1 }] }));

  const client = new TidepoolClient({ defaultNamespace: "default" });
  await client.query([0.1, 0.2], {
    text: " hello ",
    mode: "hybrid",
    topK: 5,
    includeVectors: false,
    distanceMetric: DistanceMetric.DotProduct,
    filters: { tag: "a" },
    efSearch: 10,
    nprobe: 4,
    alpha: 2,
    fusion: "rrf",
    rrfK: 8,
  });

  const payload = calls[0].body;
  assert.equal(payload.mode, "hybrid");
  assert.equal(payload.text, "hello");
  assert.equal(payload.include_vectors, false);
  assert.equal(payload.distance_metric, DistanceMetric.DotProduct);
  assert.equal(payload.ef_search, 10);
  assert.equal(payload.nprobe, 4);
  assert.equal(payload.alpha, 1);
  assert.equal(payload.fusion, "rrf");
  assert.equal(payload.rrf_k, 8);
});

test("query supports array response shape", async () => {
  responseQueue.push(jsonResponse([{ id: "a", score: 0.1 }]));
  const client = new TidepoolClient({ defaultNamespace: "default" });
  const response = await client.query([0.1, 0.2]);
  assert.equal(response.namespace, "default");
  assert.equal(response.results.length, 1);
});

test("listNamespaces handles legacy shapes", async () => {
  responseQueue.push(jsonResponse(["a", "b"]));
  const client = new TidepoolClient({ defaultNamespace: "default" });
  const list = await client.listNamespaces();
  assert.equal(list[0].namespace, "a");
});

test("getNamespaceStatus parses dates", async () => {
  responseQueue.push(
    jsonResponse({
      last_run: "bad-date",
      wal_files: 1,
      wal_entries: 2,
      segments: 3,
      total_vecs: 4,
      dimensions: 5,
    })
  );
  const client = new TidepoolClient({ defaultNamespace: "default" });
  const status = await client.getNamespaceStatus("default");
  assert.equal(status.lastRun, null);
  assert.equal(status.walEntries, 2);
});

test("errors map to specific classes", async () => {
  responseQueue.push(jsonResponse({ error: "bad" }, 400));
  responseQueue.push(jsonResponse({ error: "missing" }, 404));
  responseQueue.push(jsonResponse({ error: "down" }, 503));

  const client = new TidepoolClient({ defaultNamespace: "default" });
  await assert.rejects(() => client.query([0.1, 0.2]), ValidationError);
  await assert.rejects(() => client.getNamespace("missing"), NotFoundError);
  await assert.rejects(() => client.status(), ServiceUnavailableError);
});

test("request throws when fetch is missing", async () => {
  globalThis.fetch = undefined;
  const client = new TidepoolClient({ defaultNamespace: "default" });
  await assert.rejects(() => client.listNamespaces(), TidepoolError);
});

test("request returns text for non-json responses", async () => {
  responseQueue.push(textResponse("ok"));
  const client = new TidepoolClient({ defaultNamespace: "default" });
  const response = await client.health("query");
  assert.equal(typeof response, "string");
});
