# Tidepool TypeScript Client (Dynamic Namespaces)

Tidepool Phase 8 adds dynamic namespaces. The TypeScript client now supports a
default namespace plus per-request overrides so a single client can operate on
multiple namespaces.

## Client Initialization

```typescript
import { TidepoolClient } from "tidepool-client";

const client = new TidepoolClient({
  queryUrl: "http://localhost:8080",
  ingestUrl: "http://localhost:8081",
  defaultNamespace: "default", // Optional default
});
```

`defaultNamespace` is used when a method call omits `namespace`.

## Method Signatures

```typescript
client.upsert(vectors, { namespace, distanceMetric });
client.query({
  vector,
  text,
  mode,       // "vector" | "text" | "hybrid"
  alpha,      // Blend weight for hybrid
  fusion,     // "blend" | "rrf"
  rrfK,
  topK,
  namespace,
  distanceMetric,
  includeVectors,
  filters,
  efSearch,
  nprobe,
});
// Backward-compatible vector-first overload:
client.query(vector, { text, mode, alpha, fusion, rrfK, topK, namespace, distanceMetric, includeVectors, filters, efSearch, nprobe });
client.delete(ids, { namespace });

client.getNamespace(namespace?);
client.listNamespaces();

client.getNamespaceStatus(namespace?);
client.compact(namespace?);

client.status(); // Ingest service status (global)
client.health("query" | "ingest");
```

## Full-Text & Hybrid Search

Include `text` on documents to enable BM25 search. For queries, set `mode` to `"text"` for full-text only or `"hybrid"` to fuse vector and text results. Hybrid queries support `alpha` (blend weight) and `fusion: "rrf"` when you want reciprocal-rank fusion instead of score blending.

## Response Models

```typescript
interface NamespaceStatus {
  lastRun: Date | null;
  walFiles: number;
  walEntries: number;
  segments: number;
  totalVecs: number;
  dimensions: number;
}

interface QueryResponse {
  results: VectorResult[];
  namespace: string;
}

interface VectorResult {
  id: string;
  score: number;
  vector?: number[];
  attributes?: Record<string, AttrValue>;
}

interface NamespaceInfo {
  namespace: string;
  approxCount: number;
  dimensions: number;
  pendingCompaction?: boolean | null;
}
```

`QueryResponse.namespace` returns the namespace that was queried.

`listNamespaces` returns an array of `NamespaceInfo` entries (not just names), matching the query service response.

## Usage Examples

### Multi-Tenant Application

```typescript
const client = new TidepoolClient({ ingestUrl: "...", queryUrl: "..." });

// Each tenant gets their own namespace
function indexTenantData(tenantId: string, documents: Array<Record<string, unknown>>) {
  const vectors = documents.map((doc) => embed(doc));
  return client.upsert(vectors, { namespace: `tenant_${tenantId}` });
}

async function searchTenant(tenantId: string, query: string, topK = 10) {
  const queryVec = embed(query);
  return client.query({
    vector: queryVec,
    text: query,
    mode: "hybrid",
    alpha: 0.7,
    topK,
    namespace: `tenant_${tenantId}`,
  });
}
```

### Different Data Types

```typescript
const client = new TidepoolClient({ defaultNamespace: "products" });

// Index different types of data in separate namespaces
await client.upsert(productVectors, { namespace: "products" });
await client.upsert(userVectors, { namespace: "users" });
await client.upsert(docVectors, { namespace: "documents" });

// Query specific namespace
const response = await client.query(queryVec, { namespace: "products" });
const results = response.results;

// Check namespace status
const status = await client.getNamespaceStatus("products");
console.log(`Products: ${status.totalVecs} vectors in ${status.segments} segments`);
```

### Namespace Management

```typescript
// Check if namespace needs compaction
const status = await client.getNamespaceStatus("products");
if (status.walEntries > 1000) {
  await client.compact("products");
  console.log("Compaction triggered");
}
```

## Error Handling

If a namespace is restricted by `ALLOWED_NAMESPACES`, the API returns:

```
404 Not Found
{"error": "namespace not found"}
```

The client surfaces this as `NotFoundError` with the provided message.
