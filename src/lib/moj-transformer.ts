import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPI } from 'openapi-types';
import { MOJOutput } from './schema-validation';

type JsonMap = Record<string, unknown>;

type ReferenceObject = { $ref: string };

type ExampleObject = {
  value?: unknown;
};

type MediaTypeObject = {
  schema?: SchemaLike;
  example?: unknown;
  examples?: Record<string, ReferenceObject | ExampleObject>;
};

type RequestBodyLike = {
  content?: Record<string, MediaTypeObject>;
};

type ResponseLike = {
  description?: string;
  content?: Record<string, MediaTypeObject>;
  schema?: SchemaLike;
  examples?: Record<string, unknown>;
};

type ParameterLike = {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: SchemaLike;
  type?: string;
};

type OperationLike = {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Array<ParameterLike | ReferenceObject>;
  requestBody?: RequestBodyLike | ReferenceObject;
  responses?: Record<string, ResponseLike | ReferenceObject | undefined>;
};

type PathItemLike = {
  parameters?: Array<ParameterLike | ReferenceObject>;
} & Record<string, unknown>;

type SchemaLike = {
  $ref?: string;
  type?: string | string[];
  nullable?: boolean;
  example?: unknown;
  enum?: unknown[];
  allOf?: SchemaLike[];
  oneOf?: SchemaLike[];
  anyOf?: SchemaLike[];
  properties?: Record<string, SchemaLike>;
  additionalProperties?: boolean | SchemaLike;
  items?: SchemaLike;
};

type ExpectedError = NonNullable<MOJOutput['endpoints'][number]['expected_errors']>[number];

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

export async function ingestSpec(source: string | OpenAPI.Document): Promise<OpenAPI.Document> {
  try {
    const api = await SwaggerParser.validate(source);
    return api as OpenAPI.Document;
  } catch (err) {
    console.error('Error parsing Swagger/OpenAPI spec:', err);
    throw new Error('Failed to parse Swagger/OpenAPI spec');
  }
}

export function transformToMOJ(spec: OpenAPI.Document): MOJOutput {
  const endpoints: MOJOutput['endpoints'] = [];

  if (!spec.paths) {
    return { endpoints: [] };
  }

  for (const [path, rawPathItem] of Object.entries(spec.paths)) {
    if (!rawPathItem) continue;

    const pathItem = rawPathItem as PathItemLike;
    const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!isHttpMethod(method)) continue;
      if (!isPlainObject(rawOperation) || isReferenceObject(rawOperation)) continue;

      const operation = rawOperation as OperationLike;
      const operationParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
      const mergedParameters = [...pathParameters, ...operationParameters];

      const successSchema = generateSuccessSchema(operation);
      const expectedErrors = generateExpectedErrors(operation);

      endpoints.push({
        id: generateEndpointId(path, method, operation.operationId),
        context: extractContext(operation),
        blueprint: mapBlueprint(operation, path, method, mergedParameters),
        success_schema: successSchema,
        expected_errors: expectedErrors.length > 0 ? expectedErrors : undefined,
      });
    }
  }

  return { endpoints };
}

function generateEndpointId(path: string, method: string, operationId?: string): string {
  if (operationId) return operationId;

  const cleanPath = path
    .replace(/[{}]/g, '')
    .replace(/^\//, '')
    .replace(/\//g, '_');

  return `${method.toLowerCase()}_${cleanPath}`;
}

function extractContext(operation: OperationLike): string {
  return operation.summary || operation.description || 'No description provided';
}

function mapBlueprint(
  operation: OperationLike,
  path: string,
  method: string,
  parametersList: Array<ParameterLike | ReferenceObject>
) {
  const headers: string[] = [];
  const parameters: Record<string, unknown> = {};
  let body: unknown = undefined;

  for (const param of parametersList) {
    if (isReferenceObject(param)) continue;

    if (param.in === 'header') {
      headers.push(param.name);
      continue;
    }

    if (param.in === 'query' || param.in === 'path') {
      parameters[param.name] = {
        type: readSchemaType(param.schema) || param.type || 'string',
        description: param.description,
        required: param.required,
      };
      continue;
    }

    if (param.in === 'body') {
      body = simplifySchema(param.schema);
      continue;
    }

    if (param.in === 'formData') {
      parameters[param.name] = {
        type: readSchemaType(param.schema) || param.type || 'string',
        description: param.description,
        required: param.required,
      };
    }
  }

  if (operation.requestBody && !isReferenceObject(operation.requestBody)) {
    body = extractSchemaFromContent(operation.requestBody.content, body);
  }

  return {
    method: method.toUpperCase(),
    path,
    headers: headers.length > 0 ? headers : undefined,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    body,
  };
}

function generateSuccessSchema(operation: OperationLike): unknown {
  const responses = operation.responses;
  if (!responses) return {};

  const rankedSuccessCodes = Object.keys(responses)
    .filter((code) => code.startsWith('2'))
    .sort((left, right) => rankResponseCode(left) - rankResponseCode(right));

  for (const code of rankedSuccessCodes) {
    const response = responses[code];
    if (!response || isReferenceObject(response)) continue;

    const extracted = extractResponseSchema(response);
    if (!isEmptySchema(extracted)) {
      return extracted;
    }
  }

  return {};
}

function generateExpectedErrors(operation: OperationLike): ExpectedError[] {
  const responses = operation.responses;
  if (!responses) return [];

  const rankedErrorCodes = Object.keys(responses)
    .filter((code) => code === 'default' || isErrorResponseCode(code))
    .sort((left, right) => rankErrorCode(left) - rankErrorCode(right));

  const expectedErrors: ExpectedError[] = [];

  for (const code of rankedErrorCodes) {
    const response = responses[code];
    if (!response || isReferenceObject(response)) continue;

    const schema = extractResponseSchema(response);
    expectedErrors.push({
      code,
      message: response.description || fallbackErrorMessage(code),
      schema: isEmptySchema(schema) ? undefined : schema,
    });
  }

  return expectedErrors;
}

function extractResponseSchema(response: ResponseLike): unknown {
  const schemaFromContent = extractSchemaFromContent(response.content);
  if (!isEmptySchema(schemaFromContent)) {
    return schemaFromContent;
  }

  if (response.schema) {
    return simplifySchema(response.schema);
  }

  const firstExample = response.examples ? Object.values(response.examples)[0] : undefined;
  if (firstExample !== undefined) {
    return simplifyExample(firstExample);
  }

  return {};
}

function extractSchemaFromContent(
  content?: Record<string, MediaTypeObject>,
  fallback: unknown = {}
): unknown {
  if (!content) return fallback;

  const preferredType = pickPreferredMediaType(Object.keys(content));
  if (!preferredType) return fallback;

  const mediaType = content[preferredType];
  if (!mediaType) return fallback;

  if (mediaType.schema) {
    return simplifySchema(mediaType.schema);
  }

  if (mediaType.example !== undefined) {
    return simplifyExample(mediaType.example);
  }

  const firstExample = mediaType.examples ? Object.values(mediaType.examples)[0] : undefined;
  if (firstExample && !isReferenceObject(firstExample) && firstExample.value !== undefined) {
    return simplifyExample(firstExample.value);
  }

  return fallback;
}

function simplifySchema(schema: SchemaLike | ReferenceObject | undefined): unknown {
  if (!schema) return {};
  if (isReferenceObject(schema)) return schema.$ref;

  if (schema.example !== undefined) {
    return simplifyExample(schema.example);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((value) => simplifyExample(value));
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return mergeSchemaParts(schema.allOf.map((item) => simplifySchema(item)));
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return simplifySchema(schema.oneOf[0]);
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return simplifySchema(schema.anyOf[0]);
  }

  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    const simplified: Record<string, unknown> = {};

    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      simplified[key] = simplifySchema(prop);
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      simplified.additionalProperties = simplifySchema(schema.additionalProperties);
    }

    return simplified;
  }

  if (schema.type === 'array' && schema.items) {
    return [simplifySchema(schema.items)];
  }

  return readSchemaType(schema);
}

function simplifyExample(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => simplifyExample(entry));
  }

  if (isPlainObject(value)) {
    const simplified: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      simplified[key] = simplifyExample(entry);
    }
    return simplified;
  }

  return value;
}

function mergeSchemaParts(parts: unknown[]): unknown {
  if (parts.every(isPlainObject)) {
    return parts.reduce<Record<string, unknown>>((acc, part) => ({ ...acc, ...(part as JsonMap) }), {});
  }

  return parts[0] ?? {};
}

function pickPreferredMediaType(mediaTypes: string[]): string | null {
  if (mediaTypes.length === 0) return null;

  const preferred = mediaTypes.find(
    (type) =>
      type.includes('json') ||
      type.endsWith('+json') ||
      type.includes('xml') ||
      type.includes('text')
  );

  return preferred ?? mediaTypes[0] ?? null;
}

function rankResponseCode(code: string): number {
  const preferredOrder = ['200', '201', '202', '203', '206', '204'];
  const preferredIndex = preferredOrder.indexOf(code);
  if (preferredIndex >= 0) return preferredIndex;

  const parsed = Number.parseInt(code, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function rankErrorCode(code: string): number {
  if (code === 'default') return Number.MAX_SAFE_INTEGER;

  const parsed = Number.parseInt(code, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER - 1 : parsed;
}

function readSchemaType(schema?: SchemaLike | ReferenceObject): string {
  if (!schema) return 'any';
  if (isReferenceObject(schema)) return schema.$ref;
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (schema.nullable && schema.type) return `${schema.type} | null`;
  return schema.type || 'any';
}

function isReferenceObject(value: unknown): value is ReferenceObject {
  return isPlainObject(value) && typeof value.$ref === 'string';
}

function isPlainObject(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptySchema(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function isErrorResponseCode(code: string): boolean {
  return /^[45]\d\d$/.test(code);
}

function fallbackErrorMessage(code: string): string {
  const knownMessages: Record<string, string> = {
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '409': 'Conflict',
    '422': 'Unprocessable Entity',
    '429': 'Too Many Requests',
    '500': 'Internal Server Error',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Timeout',
    default: 'Unexpected Error',
  };

  return knownMessages[code] ?? `HTTP ${code} Error`;
}

function isHttpMethod(method: string): boolean {
  return HTTP_METHODS.has(method);
}
