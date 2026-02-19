import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPI } from 'openapi-types';
import { MOJOutput } from './schema-validation';

export async function ingestSpec(source: string | object): Promise<OpenAPI.Document> {
  try {
    const api = await SwaggerParser.validate(source as any);
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
      if (typeof operation !== 'object' || !operation) continue; // Skip if not a valid operation object
      
      // Cast to any to access properties that might be there but not strictly typed in all versions
      const op = operation as any;

      const endpointId = generateEndpointId(path, method, op.operationId);
      const context = extractContext(op);
      const blueprint = mapBlueprint(op, path, method);
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

function extractContext(operation: any): string {
  return operation.summary || operation.description || 'No description provided';
}

function mapBlueprint(operation: any, path: string, method: string) {
  const headers: string[] = [];
  const parameters: Record<string, any> = {};
  let body: any = undefined;

  // Process Parameters (Path, Query, Header)
  if (operation.parameters && Array.isArray(operation.parameters)) {
    for (const param of operation.parameters) {
        if(param.in === 'header') {
            headers.push(param.name);
        } else if (param.in === 'query' || param.in === 'path') {
            parameters[param.name] = {
                type: param.schema?.type || 'string',
                description: param.description,
                required: param.required
            }
        }
    }
  }

  // Process Request Body
  if (operation.requestBody) {
     const content = operation.requestBody.content;
     if (content && content['application/json']) {
         body = simplifySchema(content['application/json'].schema);
     }
  }

  return {
    method: method.toUpperCase(),
    path,
    headers: headers.length > 0 ? headers : undefined,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    body,
  };
}

function generateSuccessSchema(operation: any): any {
  const responses = operation.responses;
  if (!responses) return {};

  const successCode = Object.keys(responses).find(code => code.startsWith('2'));
  if (!successCode) return {};

  const successResponse = responses[successCode];
  if (successResponse.content && successResponse.content['application/json']) {
      return simplifySchema(successResponse.content['application/json'].schema);
  }
  
  return {};
}

function simplifySchema(schema: any): any {
    if (!schema) return {};

    if (schema.type === 'object' && schema.properties) {
        const simplified: Record<string, any> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
            simplified[key] = simplifySchema(prop);
        }
        return simplified;
    } else if (schema.type === 'array' && schema.items) {
        return [simplifySchema(schema.items)];
    } else {
        return schema.type || 'any'; // Return the type (string, integer, etc)
    }
}
