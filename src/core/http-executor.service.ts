import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  type MappedHttpRequest,
  type RetryPolicy,
  type UpstreamResult,
} from './contracts.js';

@Injectable()
export class HttpExecutorService {
  public constructor(private readonly httpService: HttpService) {}

  async execute(
    request: MappedHttpRequest,
    retryPolicy: RetryPolicy | undefined,
  ): Promise<UpstreamResult> {
    const maxAttempts = retryPolicy?.maxAttempts ?? 1;
    let attempt = 1;
    let result = await this.executeOnce(request);

    while (shouldRetry(result, retryPolicy, attempt, maxAttempts)) {
      attempt += 1;
      result = await this.executeOnce(request);
    }

    return result;
  }

  private async executeOnce(
    request: MappedHttpRequest,
  ): Promise<UpstreamResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.request(toAxiosConfig(request)),
      );
      return successResult(response);
    } catch (error) {
      return failureResult(error);
    }
  }
}

function toAxiosConfig(request: MappedHttpRequest): AxiosRequestConfig {
  return {
    data: formatBody(request),
    headers: requestHeaders(request),
    method: request.method,
    timeout: request.timeoutMs,
    url: request.url.toString(),
    validateStatus: () => true,
  };
}

function requestHeaders(request: MappedHttpRequest): Record<string, string> {
  if (request.contentType === 'form-urlencoded') {
    return {
      ...request.headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  return { ...request.headers, 'Content-Type': 'application/json' };
}

function formatBody(request: MappedHttpRequest): unknown {
  if (request.contentType === 'form-urlencoded') {
    return new URLSearchParams(
      request.body as Record<string, string>,
    ).toString();
  }

  return request.body;
}

function successResult(response: AxiosResponse): UpstreamResult {
  if (response.status >= 200 && response.status < 300) {
    return {
      ok: true,
      status: response.status,
      headers: normalizeHeaders(response.headers),
      body: response.data as unknown,
    };
  }

  return {
    ok: false,
    status: response.status,
    headers: normalizeHeaders(response.headers),
    body: response.data as unknown,
    failureKind: 'http',
  };
}

function failureResult(error: unknown): UpstreamResult {
  if (error instanceof AxiosError && isTimeoutCode(error.code)) {
    return { ok: false, failureKind: 'timeout' };
  }

  return { ok: false, failureKind: 'network' };
}

function isTimeoutCode(code: string | undefined): boolean {
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT';
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (headers === null || typeof headers !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

function shouldRetry(
  result: UpstreamResult,
  retryPolicy: RetryPolicy | undefined,
  attempt: number,
  maxAttempts: number,
): boolean {
  if (retryPolicy === undefined || result.ok || attempt >= maxAttempts) {
    return false;
  }

  return statusIsRetryable(result.status, retryPolicy);
}

function statusIsRetryable(
  status: number | undefined,
  retryPolicy: RetryPolicy,
): boolean {
  if (status === undefined) {
    return false;
  }

  return retryPolicy.statusRanges.some(
    (range) => status >= range.min && status <= range.max,
  );
}
