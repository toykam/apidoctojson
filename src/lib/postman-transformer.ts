import { MOJOutput, MOJEndpoint } from './schema-validation';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface PostmanCollection {
  item?: PostmanItem[];
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  response?: PostmanResponse[];
}

interface PostmanRequest {
  method?: string;
  header?: PostmanHeader[];
  url?: string | PostmanUrl;
  body?: PostmanBody;
  auth?: PostmanAuth;
}

interface PostmanResponse {
  code?: number;
  body?: string;
}

interface PostmanHeader {
  key?: string;
  value?: string;
  description?: string;
}

interface PostmanUrl {
  raw?: string;
  path?: string[] | string;
  query?: PostmanQuery[];
  variable?: PostmanVariable[];
}

interface PostmanQuery {
  key?: string;
  value?: string | null;
  description?: string;
}

interface PostmanVariable {
  key?: string;
  description?: string;
}

interface PostmanBody {
  mode?: 'raw' | 'formdata';
  raw?: string;
  formdata?: Array<{ key?: string; type?: string }>;
}

interface PostmanAuth {
  type?: string;
}

export function transformPostmanToMOJ(collection: PostmanCollection): MOJOutput {
  const endpoints: MOJEndpoint[] = [];

  if (!collection || !collection.item) {
    return { endpoints: [] };
  }

  // Recursive function to process items (folders or requests)
  function processItems(items: PostmanItem[]) {
    for (const item of items) {
      if (item.item) {
        processItems(item.item);
      } else if (item.request) {
        const endpoint = mapPostmanRequest(item);
        if (endpoint) {
          endpoints.push(endpoint);
        }
      }
    }
  }

  processItems(collection.item);

  return { endpoints };
}

function mapPostmanRequest(item: PostmanItem): MOJEndpoint | null {
  const request = item.request;
  if (!request) return null;

  const method = request.method || 'GET';
  let path = '';

  if (typeof request.url === 'string') {
    try {
      const urlObj = new URL(request.url);
      path = urlObj.pathname;
    } catch {
      path = request.url;
    }
  } else if (request.url && request.url.path) {
    const p = request.url.path;
    path = Array.isArray(p) ? '/' + p.join('/') : p;
  } else if (request.url && request.url.raw) {
    try {
      const urlObj = new URL(request.url.raw);
      path = urlObj.pathname;
    } catch {
      path = request.url.raw;
    }
  }

  if (!path) return null;

  const endpointId = generateEndpointId(path, method);
  const context = item.name || '';
  const blueprint = mapBlueprint(request, path, method);
  const successSchema = generateSuccessSchema(item.response);

  return {
    id: endpointId,
    context,
    blueprint,
    success_schema: successSchema
  };
}

function generateEndpointId(path: string, method: string): string {
  const cleanPath = path
    .replace(/[{}]/g, '')
    .replace(/^\//, '')
    .replace(/\//g, '_')
    .replace(/[:]/g, '');

  return `${method.toLowerCase()}_${cleanPath}`;
}

function mapBlueprint(request: PostmanRequest, path: string, method: string) {
    const headers: string[] = [];
    const parameters: Record<string, unknown> = {};
    let body: unknown = undefined;

    if (request.header && Array.isArray(request.header)) {
        request.header.forEach((h) => {
            if (h.key) headers.push(h.key);
        });
    }

    if (request.url && request.url.query && Array.isArray(request.url.query)) {
        request.url.query.forEach((q) => {
             if (q.key) {
                 parameters[q.key] = {
                     type: 'string',
                     description: q.description
                 };
             }
        });
    }

    if (request.url && request.url.variable && Array.isArray(request.url.variable)) {
         request.url.variable.forEach((v) => {
             if (v.key) {
                 parameters[v.key] = {
                     type: 'string',
                     description: v.description,
                     required: true
                 };
             }
         });
    }

    if (request.body && request.body.mode === 'raw') {
        const parsedBody = parseJsonLike(request.body.raw);
        if (parsedBody !== undefined) {
          body = simplifySchema(generateSchemaFromData(parsedBody));
        }
    } else if (request.body && request.body.mode === 'formdata') {
         const formData: Record<string, unknown> = {};
         request.body.formdata?.forEach((f) => {
             formData[f.key] = { type: f.type || 'string' };
         });
         body = formData;
    }

    if (request.auth && request.auth.type && request.auth.type !== 'noauth' && !headers.includes('Authorization')) {
      headers.push('Authorization');
    }

    return {
        method,
        path,
        headers: headers.length > 0 ? headers : undefined,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        body
    };
}

function generateSuccessSchema(responses?: PostmanResponse[]): unknown {
    if (!responses || !Array.isArray(responses)) return {};

    const success = responses.find((r) => (r.code ?? 0) >= 200 && (r.code ?? 0) < 300);
    
    if (success && success.body) {
        const parsed = parseJsonLike(success.body);
        if (parsed !== undefined) {
          return simplifySchema(generateSchemaFromData(parsed));
        }
    }
    
    return {};
}

function generateSchemaFromData(data: unknown): SchemaShape {
    if (data === null) return { type: 'null' };
    if (Array.isArray(data)) {
        const itemSchema = data.length > 0 ? generateSchemaFromData(data[0]) : { type: 'any' };
        return { type: 'array', items: itemSchema };
    }
    if (typeof data === 'object') {
        const properties: Record<string, SchemaShape> = {};
        for (const [key, value] of Object.entries(data)) {
            properties[key] = generateSchemaFromData(value);
        }
        return { type: 'object', properties };
    }
    return { type: typeof data };
}

type SchemaShape =
  | { type: string; properties?: Record<string, SchemaShape>; items?: SchemaShape }
  | undefined;

function simplifySchema(schema: SchemaShape): unknown {
    if (!schema) return {};

    if (schema.type === 'object' && schema.properties) {
        const simplified: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
            simplified[key] = simplifySchema(prop);
        }
        return simplified;
    } else if (schema.type === 'array' && schema.items) {
        return [simplifySchema(schema.items)];
    } else {
        return schema.type || 'any';
    }
}

function parseJsonLike(value?: string): JsonValue | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    try {
      const withoutComments = trimmed
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      return JSON.parse(withoutComments) as JsonValue;
    } catch {
      return undefined;
    }
  }
}
