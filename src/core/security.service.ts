import { Injectable } from '@nestjs/common';
import {
  type MappedHttpRequest,
  type OperationSpec,
  type ValidationFailure,
} from './contracts.js';
import { isBlockedHeader } from './mapping.service.js';

@Injectable()
export class SecurityService {
  validateRequest(
    spec: OperationSpec,
    request: MappedHttpRequest,
  ): ValidationFailure[] {
    return [
      ...validateHost(spec, request),
      ...validateScheme(spec, request),
      ...validatePrivateNetwork(spec, request),
      ...validateMethod(spec, request),
      ...validateBlockedHeaders(spec, request),
    ];
  }
}

function validateHost(
  spec: OperationSpec,
  request: MappedHttpRequest,
): ValidationFailure[] {
  if (spec.securityPolicy.allowedHosts.includes(request.url.hostname)) {
    return [];
  }

  return [
    {
      path: '$.securityPolicy.allowedHosts',
      code: 'host_not_allowed',
      message: `Host ${request.url.hostname} is not allowed.`,
    },
  ];
}

function validateMethod(
  spec: OperationSpec,
  request: MappedHttpRequest,
): ValidationFailure[] {
  if (spec.securityPolicy.allowedMethods.includes(request.method)) {
    return [];
  }

  return [
    {
      path: '$.securityPolicy.allowedMethods',
      code: 'method_not_allowed',
      message: `Method ${request.method} is not allowed.`,
    },
  ];
}

function validateScheme(
  spec: OperationSpec,
  request: MappedHttpRequest,
): ValidationFailure[] {
  const scheme = schemeOf(request.url);
  if (scheme !== 'other' && allowedSchemes(spec).includes(scheme)) {
    return [];
  }

  return [
    {
      path: '$.securityPolicy.allowedSchemes',
      code: 'scheme_not_allowed',
      message: `Scheme ${request.url.protocol} is not allowed.`,
    },
  ];
}

function allowedSchemes(spec: OperationSpec): ('http' | 'https')[] {
  return spec.securityPolicy.allowedSchemes ?? ['https'];
}

function schemeOf(url: URL): 'http' | 'https' | 'other' {
  if (url.protocol === 'http:') {
    return 'http';
  }

  return url.protocol === 'https:' ? 'https' : 'other';
}

function validatePrivateNetwork(
  spec: OperationSpec,
  request: MappedHttpRequest,
): ValidationFailure[] {
  if (spec.securityPolicy.allowPrivateNetwork === true) {
    return [];
  }

  return isPrivateNetworkHost(request.url.hostname)
    ? [
        {
          path: '$.securityPolicy.allowPrivateNetwork',
          code: 'private_network_not_allowed',
          message: `Host ${request.url.hostname} is a private network target.`,
        },
      ]
    : [];
}

function isPrivateNetworkHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return privateHostChecks().some((check) => check(normalized));
}

function privateHostChecks(): ((host: string) => boolean)[] {
  return [
    (host) => host === 'localhost',
    (host) => host === '::1',
    (host) => host.startsWith('127.'),
    (host) => host.startsWith('10.'),
    (host) => host.startsWith('192.168.'),
    isPrivate172Address,
    (host) => host.startsWith('169.254.'),
    (host) => host.startsWith('fc'),
    (host) => host.startsWith('fd'),
  ];
}

function isPrivate172Address(host: string): boolean {
  const parts = host.split('.');
  if (parts[0] !== '172') {
    return false;
  }

  const second = Number(parts[1]);
  return Number.isInteger(second) && second >= 16 && second <= 31;
}

function validateBlockedHeaders(
  spec: OperationSpec,
  request: MappedHttpRequest,
): ValidationFailure[] {
  return Object.keys(request.headers)
    .filter((name) =>
      isBlockedHeader(name, spec.securityPolicy.blockedRequestHeaders),
    )
    .map((name) => ({
      path: `$.request.headers.${name}`,
      code: 'blocked_header',
      message: `Header ${name} cannot be mapped.`,
    }));
}
