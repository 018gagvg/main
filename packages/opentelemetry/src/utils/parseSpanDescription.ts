import type { AttributeValue, Attributes } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import {
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_FAAS_TRIGGER,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_ROUTE,
  SEMATTRS_HTTP_TARGET,
  SEMATTRS_HTTP_URL,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_RPC_SERVICE,
} from '@opentelemetry/semantic-conventions';
import type { SpanAttributes, TransactionSource } from '@sentry/types';
import { getSanitizedUrlString, parseUrl, stripUrlQueryAndFragment } from '@sentry/utils';

import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION } from '../semanticAttributes';
import type { AbstractSpan } from '../types';
import { getSpanKind } from './getSpanKind';
import { spanHasAttributes, spanHasName } from './spanTypes';

interface SpanDescription {
  op: string | undefined;
  description: string;
  source: TransactionSource;
  data?: Record<string, string | undefined>;
}

/**
 * Infer the op & description for a set of name, attributes and kind of a span.
 */
export function inferSpanData(name: string, attributes: SpanAttributes, kind: SpanKind): SpanDescription {
  // This attribute is intentionally exported as a SEMATTR constant because it should stay intimite API
  if (attributes['sentry.skip_span_data_inference']) {
    return {
      op: undefined,
      description: name,
      source: 'custom',
      data: {
        // Suggest to callers of `parseSpanDescription` to wipe the hint because it is unnecessary data in the end.
        'sentry.skip_span_data_inference': undefined,
      },
    };
  }

  // if http.method exists, this is an http request span
  //
  // TODO: Referencing `http.request.method` is a temporary workaround until the semantic
  // conventions export an attribute key for it.
  const httpMethod = attributes['http.request.method'] || attributes[SEMATTRS_HTTP_METHOD];
  if (httpMethod) {
    return descriptionForHttpMethod({ attributes, name, kind }, httpMethod);
  }

  const dbSystem = attributes[SEMATTRS_DB_SYSTEM];
  const opIsCache =
    typeof attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'string' &&
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP].startsWith('cache.');

  // If db.type exists then this is a database call span
  // If the Redis DB is used as a cache, the span description should not be changed
  if (dbSystem && !opIsCache) {
    return descriptionForDbSystem({ attributes, name });
  }

  // If rpc.service exists then this is a rpc call span.
  const rpcService = attributes[SEMATTRS_RPC_SERVICE];
  if (rpcService) {
    return {
      op: 'rpc',
      description: name,
      source: 'route',
    };
  }

  // If messaging.system exists then this is a messaging system span.
  const messagingSystem = attributes[SEMATTRS_MESSAGING_SYSTEM];
  if (messagingSystem) {
    return {
      op: 'message',
      description: name,
      source: 'route',
    };
  }

  // If faas.trigger exists then this is a function as a service span.
  const faasTrigger = attributes[SEMATTRS_FAAS_TRIGGER];
  if (faasTrigger) {
    return { op: faasTrigger.toString(), description: name, source: 'route' };
  }

  return { op: undefined, description: name, source: 'custom' };
}

/**
 * Extract better op/description from an otel span.
 *
 * Based on https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/7422ce2a06337f68a59b552b8c5a2ac125d6bae5/exporter/sentryexporter/sentry_exporter.go#L306
 */
export function parseSpanDescription(span: AbstractSpan): SpanDescription {
  const attributes = spanHasAttributes(span) ? span.attributes : {};
  const name = spanHasName(span) ? span.name : '<unknown>';
  const kind = getSpanKind(span);

  return inferSpanData(name, attributes, kind);
}

function descriptionForDbSystem({ attributes, name }: { attributes: Attributes; name: string }): SpanDescription {
  // Use DB statement (Ex "SELECT * FROM table") if possible as description.
  const statement = attributes[SEMATTRS_DB_STATEMENT];

  const description = statement ? statement.toString() : name;

  return { op: 'db', description, source: 'task' };
}

/** Only exported for tests. */
export function descriptionForHttpMethod(
  { name, kind, attributes }: { name: string; attributes: Attributes; kind: SpanKind },
  httpMethod: AttributeValue,
): SpanDescription {
  const opParts = ['http'];

  switch (kind) {
    case SpanKind.CLIENT:
      opParts.push('client');
      break;
    case SpanKind.SERVER:
      opParts.push('server');
      break;
  }

  const { urlPath, url, query, fragment, hasRoute } = getSanitizedUrl(attributes, kind);

  if (!urlPath) {
    return { op: opParts.join('.'), description: name, source: 'custom' };
  }

  const graphqlOperationsAttribute = attributes[SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION];

  // Ex. GET /api/users
  const baseDescription = `${httpMethod} ${urlPath}`;

  // When the http span has a graphql operation, append it to the description
  // We add these in the graphqlIntegration
  const description = graphqlOperationsAttribute
    ? `${baseDescription} (${getGraphqlOperationNamesFromAttribute(graphqlOperationsAttribute)})`
    : baseDescription;

  // If `httpPath` is a root path, then we can categorize the transaction source as route.
  const source: TransactionSource = hasRoute || urlPath === '/' ? 'route' : 'url';

  const data: Record<string, string> = {};

  if (url) {
    data.url = url;
  }
  if (query) {
    data['http.query'] = query;
  }
  if (fragment) {
    data['http.fragment'] = fragment;
  }

  return {
    op: opParts.join('.'),
    description,
    source,
    data,
  };
}

function getGraphqlOperationNamesFromAttribute(attr: AttributeValue): string {
  if (Array.isArray(attr)) {
    const sorted = attr.slice().sort();

    // Up to 5 items, we just add all of them
    if (sorted.length < 5) {
      return sorted.join(', ');
    } else {
      // Else, we add the first 5 and the diff of other operations
      return `${sorted.slice(0, 5).join(', ')}, +${sorted.length - 5}`;
    }
  }

  return `${attr}`;
}

/** Exported for tests only */
export function getSanitizedUrl(
  attributes: Attributes,
  kind: SpanKind,
): {
  url: string | undefined;
  urlPath: string | undefined;
  query: string | undefined;
  fragment: string | undefined;
  hasRoute: boolean;
} {
  // This is the relative path of the URL, e.g. /sub
  const httpTarget = attributes[SEMATTRS_HTTP_TARGET];
  // This is the full URL, including host & query params etc., e.g. https://example.com/sub?foo=bar
  const httpUrl = attributes[SEMATTRS_HTTP_URL];
  // This is the normalized route name - may not always be available!
  const httpRoute = attributes[SEMATTRS_HTTP_ROUTE];

  const parsedUrl = typeof httpUrl === 'string' ? parseUrl(httpUrl) : undefined;
  const url = parsedUrl ? getSanitizedUrlString(parsedUrl) : undefined;
  const query = parsedUrl && parsedUrl.search ? parsedUrl.search : undefined;
  const fragment = parsedUrl && parsedUrl.hash ? parsedUrl.hash : undefined;

  if (typeof httpRoute === 'string') {
    return { urlPath: httpRoute, url, query, fragment, hasRoute: true };
  }

  if (kind === SpanKind.SERVER && typeof httpTarget === 'string') {
    return { urlPath: stripUrlQueryAndFragment(httpTarget), url, query, fragment, hasRoute: false };
  }

  if (parsedUrl) {
    return { urlPath: url, url, query, fragment, hasRoute: false };
  }

  // fall back to target even for client spans, if no URL is present
  if (typeof httpTarget === 'string') {
    return { urlPath: stripUrlQueryAndFragment(httpTarget), url, query, fragment, hasRoute: false };
  }

  return { urlPath: undefined, url, query, fragment, hasRoute: false };
}
