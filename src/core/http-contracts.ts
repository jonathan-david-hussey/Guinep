import { type HttpMethod } from './common-contracts.js';

export type ContentType = 'json' | 'form-urlencoded';

export interface MappedHttpRequest {
  method: HttpMethod;
  url: URL;
  headers: Record<string, string>;
  body?: unknown;
  contentType: ContentType;
  timeoutMs: number;
}
