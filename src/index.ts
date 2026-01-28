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

export function validateVector(
  vector: unknown,
  expectedDims?: number
): asserts vector is Vector {
  if (!Array.isArray(vector)) {
    throw new ValidationError("Vector must be an array");
  }
  if (vector.length === 0) {
    throw new ValidationError("Vector cannot be empty");
  }
  if (!vector.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new ValidationError("Vector must contain only finite numbers");
  }
  if (expectedDims !== undefined && vector.length !== expectedDims) {
    throw new ValidationError(
      `Expected ${expectedDims} dimensions, got ${vector.length}`
    );
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 500
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries || !(error instanceof ServiceUnavailableError)) {
        throw error;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

const DEFAULT_QUERY_URL = "http://localhost:8080";
const DEFAULT_INGEST_URL = "http://localhost:8081";
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_NAMESPACE = "default";

function ensureNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function toJsonBody(body: unknown): string {
  return JSON.stringify(body);
}

function resolveUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

function normalizeNamespace(namespace: string): string {
  return ensureNonEmptyString(namespace, "namespace");
}

function validateDocuments(documents: Document[]): void {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new ValidationError("vectors must be a non-empty array");
  }
  const first = documents[0];
  ensureNonEmptyString(first?.id, "id");
  validateVector(first?.vector);
  const expectedDims = first.vector.length;
  for (const doc of documents) {
    ensureNonEmptyString(doc?.id, "id");
    validateVector(doc?.vector, expectedDims);
  }
}

function validateIds(ids: string[]): void {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError("ids must be a non-empty array");
  }
  for (const id of ids) {
    ensureNonEmptyString(id, "id");
  }
}

function mapError(status: number, message: string, body?: unknown): TidepoolError {
  switch (status) {
    case 400:
    case 413:
      return new ValidationError(message);
    case 404:
      return new NotFoundError(message);
    case 503:
      return new ServiceUnavailableError(message);
    default:
      return new TidepoolError(message, status, body);
  }
}

function ensurePositiveInt(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new ValidationError(`${fieldName} must be a positive integer`);
  }
}

function normalizeNamespaceInfo(data: NamespaceInfo | Record<string, unknown>): NamespaceInfo {
  const record = data as Record<string, unknown>;
  return {
    namespace: ensureNonEmptyString(
      (record.namespace ?? record.ns) as unknown,
      "namespace"
    ),
    approxCount: Number(record.approxCount ?? record.approx_count ?? record.count ?? 0),
    dimensions: Number(record.dimensions ?? record.dims ?? record.dimension ?? 0),
  };
}

function normalizeIngestStatus(data: IngestStatus | Record<string, unknown>): IngestStatus {
  const record = data as Record<string, unknown>;
  const lastRunRaw = record.lastRun ?? record.last_run ?? null;
  const parsed =
    lastRunRaw === null || lastRunRaw === undefined
      ? null
      : new Date(lastRunRaw as string);
  return {
    lastRun: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
    walFiles: Number(record.walFiles ?? record.wal_files ?? 0),
    walEntries: Number(record.walEntries ?? record.wal_entries ?? 0),
    segments: Number(record.segments ?? 0),
    totalVecs: Number(record.totalVecs ?? record.total_vecs ?? 0),
    dimensions: Number(record.dimensions ?? record.dims ?? 0),
  };
}

function normalizeVectorResults(
  data: VectorResult[] | Record<string, unknown>
): VectorResult[] {
  if (Array.isArray(data)) {
    return data.map((result) => ({
      id: String(result.id),
      dist: Number(
        (result as VectorResult).dist ??
          (result as unknown as Record<string, unknown>).distance
      ),
      vector: result.vector,
      attributes: result.attributes,
    }));
  }
  return [];
}

export class TidepoolClient {
  private queryUrl: string;
  private ingestUrl: string;
  private timeout: number;
  private namespace: string;

  constructor(config: TidepoolConfig = {}) {
    this.queryUrl = config.queryUrl ?? DEFAULT_QUERY_URL;
    this.ingestUrl = config.ingestUrl ?? DEFAULT_INGEST_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.namespace = config.namespace ?? DEFAULT_NAMESPACE;

    ensureNonEmptyString(this.queryUrl, "queryUrl");
    ensureNonEmptyString(this.ingestUrl, "ingestUrl");
    if (!Number.isFinite(this.timeout) || this.timeout <= 0) {
      throw new ValidationError("timeout must be a positive number");
    }
    this.namespace = normalizeNamespace(this.namespace);
  }

  async health(service: "query" | "ingest" = "query"): Promise<{ service: string; status: string }> {
    const baseUrl = service === "ingest" ? this.ingestUrl : this.queryUrl;
    return this.request<{ service: string; status: string }>(baseUrl, "/health", {
      method: "GET",
    });
  }

  async upsert(vectors: Document[], options: UpsertOptions = {}): Promise<void> {
    validateDocuments(vectors);
    const namespace = normalizeNamespace(options.namespace ?? this.namespace);
    const body: Record<string, unknown> = {
      vectors: vectors.map((doc) => ({
        id: doc.id,
        vector: doc.vector,
        attributes: doc.attributes,
      })),
    };
    if (options.distanceMetric) {
      body.distance_metric = options.distanceMetric;
    }
    await this.request<void>(this.ingestUrl, `/v1/vectors/${namespace}`, {
      method: "POST",
      body: toJsonBody(body),
    });
  }

  async query(vector: Vector, options: QueryOptions = {}): Promise<VectorResult[]> {
    validateVector(vector);
    const namespace = normalizeNamespace(options.namespace ?? this.namespace);
    if (options.topK !== undefined) {
      ensurePositiveInt(options.topK, "topK");
    }
    if (options.efSearch !== undefined) {
      ensurePositiveInt(options.efSearch, "efSearch");
    }
    if (options.nprobe !== undefined) {
      ensurePositiveInt(options.nprobe, "nprobe");
    }
    const body: Record<string, unknown> = {
      vector,
      top_k: options.topK ?? 10,
      include_vectors: options.includeVectors ?? false,
    };
    if (options.distanceMetric) {
      body.distance_metric = options.distanceMetric;
    }
    if (options.filters) {
      body.filters = options.filters;
    }
    if (options.efSearch !== undefined) {
      body.ef_search = options.efSearch;
    }
    if (options.nprobe !== undefined) {
      body.nprobe = options.nprobe;
    }

    const data = await this.request<QueryResponse | VectorResult[]>(
      this.queryUrl,
      `/v1/vectors/${namespace}`,
      {
        method: "POST",
        body: toJsonBody(body),
      }
    );

    if (Array.isArray(data)) {
      return normalizeVectorResults(data);
    }
    if (data && Array.isArray(data.results)) {
      return normalizeVectorResults(data.results);
    }
    throw new TidepoolError("Unexpected query response shape");
  }

  async delete(ids: string[], options: DeleteOptions = {}): Promise<void> {
    validateIds(ids);
    const namespace = normalizeNamespace(options.namespace ?? this.namespace);
    await this.request<void>(this.ingestUrl, `/v1/vectors/${namespace}`, {
      method: "DELETE",
      body: toJsonBody({ ids }),
    });
  }

  async getNamespace(namespace?: string): Promise<NamespaceInfo> {
    const resolved = normalizeNamespace(namespace ?? this.namespace);
    const data = await this.request<NamespaceInfo | Record<string, unknown>>(
      this.queryUrl,
      `/v1/namespaces/${resolved}`,
      { method: "GET" }
    );
    return normalizeNamespaceInfo(data);
  }

  async listNamespaces(): Promise<string[]> {
    const data = await this.request<string[] | { namespaces: string[] }>(
      this.queryUrl,
      "/v1/namespaces",
      { method: "GET" }
    );
    if (Array.isArray(data)) {
      return data.map((name) => String(name));
    }
    if (data && Array.isArray(data.namespaces)) {
      return data.namespaces.map((name) => String(name));
    }
    if (data && typeof data === "object") {
      const namespaceList = (data as unknown as { namespace_list?: string[] })
        .namespace_list;
      if (Array.isArray(namespaceList)) {
        return namespaceList.map((name) => String(name));
      }
    }
    throw new TidepoolError("Unexpected namespaces response shape");
  }

  async status(): Promise<IngestStatus> {
    const data = await this.request<IngestStatus | Record<string, unknown>>(
      this.ingestUrl,
      "/status",
      { method: "GET" }
    );
    return normalizeIngestStatus(data);
  }

  async compact(): Promise<void> {
    await this.request<void>(this.ingestUrl, "/compact", { method: "POST" });
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (typeof fetch !== "function") {
      throw new TidepoolError("Global fetch is not available in this environment");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const headers = new Headers(options.headers ?? {});
    headers.set("Accept", "application/json");
    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    try {
      const response = await fetch(resolveUrl(baseUrl, path), {
        ...options,
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        const isJson = isJsonResponse(response);
        const body = isJson ? await response.json().catch(() => undefined) : undefined;
        const text = !isJson ? await response.text().catch(() => "") : "";
        const message =
          (body as { error?: string; message?: string } | undefined)?.error ??
          (body as { error?: string; message?: string } | undefined)?.message ??
          text ??
          response.statusText;
        throw mapError(response.status, message || response.statusText, body ?? text);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      if (!isJsonResponse(response)) {
        const text = await response.text();
        return text as unknown as T;
      }

      const data = await response.json().catch(() => undefined);
      return data as T;
    } catch (error) {
      if (error instanceof TidepoolError) {
        throw error;
      }
      if ((error as { name?: string } | undefined)?.name === "AbortError") {
        throw new TidepoolError(`Request timed out after ${this.timeout}ms`, 408);
      }
      throw new TidepoolError((error as Error)?.message ?? "Request failed");
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
