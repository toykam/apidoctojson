import { MOJOutput, MOJEndpoint } from './schema-validation';

export function transformPostmanToMOJ(collection: any): MOJOutput {
  const endpoints: MOJEndpoint[] = [];

  if (!collection || !collection.item) {
    return { endpoints: [] };
  }

  // Recursive function to process items (folders or requests)
  function processItems(items: any[]) {
    for (const item of items) {
      if (item.item) {
        // It's a folder, recurse
        processItems(item.item);
      } else if (item.request) {
        // It's a request
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

function mapPostmanRequest(item: any): MOJEndpoint | null {
  const request = item.request;
  const method = request.method || 'GET';
  
  // Extract path
  let path = '';
  if (typeof request.url === 'string') {
     // Try to parse string url to get path
     try {
         const urlObj = new URL(request.url);
         path = urlObj.pathname;
     } catch {
         path = request.url;
     }
  } else if (request.url && request.url.path) {
    // Postman URL object
    const p = request.url.path;
    path = Array.isArray(p) ? '/' + p.join('/') : p;
  } else if (request.url && request.url.raw) {
      try {
          // rare case where raw is full url but path array is missing?
          const urlObj = new URL(request.url.raw);
          path = urlObj.pathname;
      } catch {
          path = request.url.raw;
      }
  }

  if (!path) return null;

  const endpointId = generateEndpointId(path, method);
  const context = item.name || '';  // Postman request name is usually the summary
  
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
  // Simple slug generation
    const cleanPath = path
    .replace(/[{}]/g, '')
    .replace(/^\//, '')
    .replace(/\//g, '_')
    .replace(/[:]/g, ''); // Remove colons from path params if any
    
  return `${method.toLowerCase()}_${cleanPath}`;
}

function mapBlueprint(request: any, path: string, method: string) {
    const headers: string[] = [];
    const parameters: Record<string, any> = {};
    let body: any = undefined;

    // Headers
    if (request.header && Array.isArray(request.header)) {
        request.header.forEach((h: any) => {
            if (h.key) headers.push(h.key);
        });
    }

    // Query Params
    if (request.url && request.url.query && Array.isArray(request.url.query)) {
        request.url.query.forEach((q: any) => {
             if (q.key) {
                 parameters[q.key] = {
                     type: 'string', // Postman doesn't strictly type params
                     description: q.description
                 };
             }
        });
    }

    // Path variables
    // Postman usually denotes path variables in the path strings like :id or {{id}}
    // We can try to extract them if they are in the `variable` array of the URL object
    if (request.url && request.url.variable && Array.isArray(request.url.variable)) {
         request.url.variable.forEach((v: any) => {
             if (v.key) {
                 parameters[v.key] = {
                     type: 'string',
                     description: v.description,
                     required: true // path vars are usually required
                 };
             }
         });
    }

    // Body
    if (request.body && request.body.mode === 'raw') {
        try {
            const raw = request.body.raw;
            if (raw && (raw.trim().startsWith('{') || raw.trim().startsWith('['))) {
                const parsedBody = JSON.parse(raw);
                body = simplifySchema(generateSchemaFromData(parsedBody));
            }
        } catch {}
    } else if (request.body && request.body.mode === 'formdata') {
         // Form data
         const formData: Record<string, any> = {};
         request.body.formdata.forEach((f: any) => {
             formData[f.key] = { type: f.type || 'string' };
         });
         body = formData;
    }

    return {
        method,
        path,
        headers: headers.length > 0 ? headers : undefined,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        body
    };
}

function generateSuccessSchema(responses: any[]): any {
    if (!responses || !Array.isArray(responses)) return {};

    // Find a success response (200-299)
    const success = responses.find((r: any) => r.code >= 200 && r.code < 300);
    
    if (success && success.body) {
        try {
             const parsed = JSON.parse(success.body);
             return simplifySchema(generateSchemaFromData(parsed));
        } catch {
            return {};
        }
    }
    
    return {};
}

// Helper to infer schema from actual data (since Postman examples are data, not schemas)
function generateSchemaFromData(data: any): any {
    if (data === null) return { type: 'null' };
    if (Array.isArray(data)) {
        const itemSchema = data.length > 0 ? generateSchemaFromData(data[0]) : { type: 'any' };
        return { type: 'array', items: itemSchema };
    }
    if (typeof data === 'object') {
        const properties: Record<string, any> = {};
        for (const key in data) {
            properties[key] = generateSchemaFromData(data[key]);
        }
        return { type: 'object', properties };
    }
    return { type: typeof data };
}

// Reusing the simplifier from logic, but adapted for our inferred schema structure
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
        return schema.type || 'any';
    }
}
