import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPI } from 'openapi-types';
import { MOJOutput } from './schema-validation';

export async function ingestSpec(source: string | object): Promise<OpenAPI.Document> {
  try {
    const api = await SwaggerParser.validate(source as object);
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

  for (const [path, methods] of Object.entries(spec.paths)) {
    if (!methods) continue;

    for (const [method, operation] of Object.entries(methods)) {
      if (!isHttpMethod(method)) continue;
      if (typeof operation !== 'object' || !operation) continue; // Skip if not a valid operation object
      if (isReferenceObject(operation)) continue;

      const op = operation;
      const pathParameters = Array.isArray(methods.parameters) ? methods.parameters : [];
      const operationParameters = Array.isArray(op.parameters) ? op.parameters : [];
      const mergedParameters = [...pathParameters, ...operationParameters];

      const endpointId = generateEndpointId(path, method, op.operationId);
      const context = extractContext(op);
      const blueprint = mapBlueprint(op, path, method, mergedParameters);
      const successSchema = generateSuccessSchema(op);

      endpoints.push({
        id: endpointId,
        context,
        blueprint,
        success_schema: successSchema,
      });
    }
  }

  return { endpoints };
}

function generateEndpointId(path: string, method: string, operationId?: string): string {
  if (operationId) return operationId;
  
  // Fallback: create slug from method + path
  // e.g., GET /users/{id} -> get_users_id
  const cleanPath = path
    .replace(/[{}]/g, '') // Remove braces
    .replace(/^\//, '')   // Remove leading slash
    .replace(/\//g, '_'); // Replace slashes with underscores
    
  return `${method.toLowerCase()}_${cleanPath}`;
}

function extractContext(operation: OpenAPI.Operation): string {
  return operation.summary || operation.description || 'No description provided';
}

function mapBlueprint(
  operation: OpenAPI.Operation,
  path: string,
  method: string,
  parametersList: OpenAPI.Parameter[] | OpenAPI.ReferenceObject[]
) {
  const headers: string[] = [];
  const parameters: Record<string, unknown> = {};
  let body: unknown = undefined;

  for (const param of parametersList) {
    if (isReferenceObject(param)) continue;

    if (param.in === 'header') {
      headers.push(param.name);
    } else if (param.in === 'query' || param.in === 'path') {
      parameters[param.name] = {
        type: readSchemaType(param.schema),
        description: param.description,
        required: param.required,
      };
    }
  }

  if (operation.requestBody && !isReferenceObject(operation.requestBody)) {
    body = extractSchemaFromContent(operation.requestBody.content);
  }

  return {
    method: method.toUpperCase(),
    path,
    headers: headers.length > 0 ? headers : undefined,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    body,
  };
}

function generateSuccessSchema(operation: OpenAPI.Operation): unknown {
  const responses = operation.responses;
  if (!responses) return {};

  const successCode = Object.keys(responses).find(code => code.startsWith('2'));
  if (!successCode) return {};

  const successResponse = responses[successCode];
  if (!successResponse || isReferenceObject(successResponse)) {
    return {};
  }

  return extractSchemaFromContent(successResponse.content);
}

function extractSchemaFromContent(content?: OpenAPI.Content): unknown {
  if (!content) return {};

  const preferredType = pickPreferredMediaType(Object.keys(content));
  if (!preferredType) return {};

  const mediaType = content[preferredType];
  if (!mediaType) return {};

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

  return {};
}

function simplifySchema(schema: OpenAPI.SchemaObject | OpenAPI.ReferenceObject | undefined): unknown {
  if (!schema) return {};
  if (isReferenceObject(schema)) return schema.$ref;

  if (schema.example !== undefined) {
    return simplifyExample(schema.example);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((value) => simplifyExample(value));
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const merged = schema.allOf.map((item) => simplifySchema(item));
    return mergeSchemaParts(merged);
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return simplifySchema(schema.oneOf[0]);
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return simplifySchema(schema.anyOf[0]);
  }

  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    const simplified: Record<string, unknown> = {};
    const properties = schema.properties ?? {};

    for (const [key, prop] of Object.entries(properties)) {
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

  if (value && typeof value === 'object') {
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
    return parts.reduce<Record<string, unknown>>((acc, part) => ({ ...acc, ...part }), {});
  }

  return parts[0] ?? {};
}

function pickPreferredMediaType(mediaTypes: string[]): string | null {
  if (mediaTypes.length === 0) return null;

  const preferred = mediaTypes.find((type) => type.includes('json') || type.endsWith('+json'));
  return preferred ?? mediaTypes[0] ?? null;
}

function readSchemaType(schema?: OpenAPI.SchemaObject | OpenAPI.ReferenceObject): string {
  if (!schema) return 'any';
  if (isReferenceObject(schema)) return schema.$ref;
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (schema.nullable && schema.type) return `${schema.type} | null`;
  return schema.type || 'any';
}

function isReferenceObject(value: unknown): value is OpenAPI.ReferenceObject {
  return typeof value === 'object' && value !== null && '$ref' in value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpMethod(method: string): method is keyof OpenAPI.PathItemObject {
  return ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(method);
}
