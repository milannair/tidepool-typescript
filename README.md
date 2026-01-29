# Tidepool TypeScript Client

TypeScript client library and API contract for the Tidepool vector database services.

## Contents

- API design document: `docs/tidepool-typescript-client-design.md`
- Dynamic namespaces guide: `docs/TYPESCRIPT_CLIENT.md`
- Release checklist: `RELEASING.md`

## Installation

```bash
npm install tidepool-client
# or
yarn add tidepool-client
```

## Usage

```typescript
import { TidepoolClient } from "tidepool-client";

const client = new TidepoolClient({
  queryUrl: "https://query.example.com",
  ingestUrl: "https://ingest.example.com",
  defaultNamespace: "default",
});

const response = await client.query([0.1, 0.2, 0.3, 0.4], { topK: 5 });
console.log(response.namespace, response.results);
```

## Development

```bash
npm install
npm run build
```

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`.

## License

MIT. See `LICENSE`.
