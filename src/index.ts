export type Vector = number[];

export type AttrValue =
  | null
  | boolean
  | number
  | string
  | AttrValue[]
  | { [key: string]: AttrValue };

export interface Document {
  id: string;
  vector: Vector;
  attributes?: Record<string, AttrValue>;
}

export interface VectorResult {
  id: string;
  dist: number;
  vector?: Vector;
  attributes?: Record<string, AttrValue>;
}

export enum DistanceMetric {
  Cosine = "cosine_distance",
  Euclidean = "euclidean_squared",
  DotProduct = "dot_product",
}

export interface QueryResponse {
  results: VectorResult[];
  namespace: string;
}

export interface NamespaceInfo {
  namespace: string;
  approxCount: number;
  dimensions: number;
}

export interface IngestStatus {
  lastRun: Date | null;
  walFiles: number;
  walEntries: number;
  segments: number;
  totalVecs: number;
  dimensions: number;
}

export interface TidepoolConfig {
  queryUrl?: string;
  ingestUrl?: string;
  timeout?: number;
  namespace?: string;
}

export interface UpsertOptions {
  namespace?: string;
  distanceMetric?: DistanceMetric;
}

export interface QueryOptions {
  topK?: number;
  namespace?: string;
  distanceMetric?: DistanceMetric;
  includeVectors?: boolean;
  filters?: Record<string, AttrValue>;
  efSearch?: number;
  nprobe?: number;
}

export interface DeleteOptions {
  namespace?: string;
}

export class TidepoolError extends Error {
  statusCode?: number;
  response?: unknown;

  constructor(message: string, statusCode?: number, response?: unknown) {
    super(message);
    this.name = "TidepoolError";
    this.statusCode = statusCode;
    this.response = response;
  }
}

export class ValidationError extends TidepoolError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends TidepoolError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class ServiceUnavailableError extends TidepoolError {
  constructor(message: string) {
    super(message, 503);
    this.name = "ServiceUnavailableError";
  }
}

// Placeholder API surface to match the design doc. Implementation is pending.
export class TidepoolClient {
  constructor(_config: TidepoolConfig = {}) {}

  async health(_service?: "query" | "ingest"): Promise<{ service: string; status: string }> {
    throw new TidepoolError("Not implemented. See docs/tidepool-typescript-client-design.md");
  }

  async upsert(_vectors: Document[], _options?: UpsertOptions): Promise<void> {
    throw new TidepoolError("Not implemented. See docs/tidepool-typescript-client-design.md");
  }

  async query(_vector: Vector, _options?: QueryOptions): Promise<VectorResult[]> {
    throw new TidepoolError("Not implemented. See docs/tidepool-typescript-client-design.md");
  }

  async delete(_ids: string[], _options?: DeleteOptions): Promise<void> {
    throw new TidepoolError("Not implemented. See docs/tidepool-typescript-client-design.md");
  }

  async getNamespace(_namespace?: string): Promise<NamespaceInfo> {
    throw new TidepoolError("Not implemented. See docs/tidepool-typescript-client-design.md");
  }

  async listNamespaces(): Promise<string[]> {
    throw new TidepoolError("Not implemented. See docs/tidepool-typescript-client-design.md");
  }

  async status(): Promise<IngestStatus> {
    throw new TidepoolError("Not implemented. See docs/tidepool-typescript-client-design.md");
  }

  async compact(): Promise<void> {
    throw new TidepoolError("Not implemented. See docs/tidepool-typescript-client-design.md");
  }
}
