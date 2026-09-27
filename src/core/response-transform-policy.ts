import {
  type MappingRule,
  type ResponseFilterRule,
  type ResponseSortRule,
  type ResponseTransformPolicy,
} from './contracts.js';

export interface ActiveResponseTransformPolicy {
  filters: ResponseFilterRule[] | undefined;
  sort: ResponseSortRule[] | undefined;
  include: string[] | undefined;
  exclude: string[];
  redact: string[];
  mappings: MappingRule[] | undefined;
  limit: number | undefined;
}

export function activeResponseTransformPolicy(
  policy: ResponseTransformPolicy | undefined,
): ActiveResponseTransformPolicy {
  if (policy === undefined) {
    return emptyResponseTransformPolicy();
  }

  return {
    filters: policy.filters,
    sort: policy.sort,
    include: policy.include,
    exclude: policy.exclude ?? [],
    redact: policy.redact ?? [],
    mappings: policy.mappings,
    limit: policy.limit,
  };
}

function emptyResponseTransformPolicy(): ActiveResponseTransformPolicy {
  return {
    filters: undefined,
    sort: undefined,
    include: undefined,
    exclude: [],
    redact: [],
    mappings: undefined,
    limit: undefined,
  };
}
