# Tidepool TypeScript Client

TypeScript client library for the Tidepool vector database services (Query and Ingest).

## Highlights

- Typed API surface with request/response models
- Vector, text, and hybrid search support
- Namespace management, status, and compaction
- Explicit validation and error classes
- Optional `withRetry` helper for 503s

## Requirements

- Node.js 18+ (for global `fetch`)

If you use an environment without `fetch`, supply a polyfill (e.g. `undici`) before creating the client.

## Installation

```bash
npm install tidepool-client
# or
yarn add tidepool-client
```

## Quick Start

```typescript
import { TidepoolClient } from "tidepool-client";

const client = new TidepoolClient({
  queryUrl: "http://localhost:8080",
  ingestUrl: "http://localhost:8081",
  defaultNamespace: "default",
});

const response = await client.query({
  vector: [0.1, 0.2, 0.3, 0.4],
  text: "neural networks",
  mode: "hybrid",
  topK: 5,
  alpha: 0.7,
});

console.log(response.namespace, response.results);
```

## Configuration

- `queryUrl` and `ingestUrl` set base URLs. Defaults:
  - Query: `http://localhost:8080`
  - Ingest: `http://localhost:8081`
- `defaultNamespace` is used when no namespace is provided. Default is `default`.
- `namespace` is supported for backward compatibility and overrides `defaultNamespace`.
- `timeout` controls request timeout (ms). Default is 30000.

## Query Modes

- Vector-only: provide `vector`, omit `text`.
- Text-only: provide `text`, set `mode: "text"`.
- Hybrid: provide both, set `mode: "hybrid"`.

```typescript
const response = await client.query({
  text: "fraud detection",
  mode: "text",
  topK: 10,
  namespace: "documents",
});
```

## Namespaces

All write/query/delete methods accept a namespace. If omitted, the client uses `defaultNamespace`.

```typescript
await client.upsert([{ id: "doc-1", vector: [0.1, 0.2, 0.3] }], {
  namespace: "tenant-a",
});
```

## Errors

Errors are mapped to explicit classes:

- `ValidationError`
- `NotFoundError`
- `ServiceUnavailableError`
- `TidepoolError`

```typescript
import { ValidationError } from "tidepool-client";

try {
  await client.query([0.1], { topK: 0 });
} catch (err) {
  if (err instanceof ValidationError) {
    console.error("invalid input", err.message);
  }
}
```

## Retries

No automatic retries are built in, but you can use the exported `withRetry` helper for 503s:

```typescript
import { withRetry, ServiceUnavailableError } from "tidepool-client";

const result = await withRetry(async () => {
  return client.status();
});
```

`withRetry` only retries `ServiceUnavailableError` and applies exponential backoff.

## Development

```bash
npm install
npm run build
npm test
```

## Documentation

- `docs/tidepool-typescript-client-design.md` — API design and contract
- `docs/TYPESCRIPT_CLIENT.md` — namespace usage and API reference
- `RELEASING.md` — release checklist

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`.

## License

MIT. See `LICENSE`.
