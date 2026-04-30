'use server';

import SwaggerParser from '@apidevtools/swagger-parser';
import * as cheerio from 'cheerio';

export type IngestProvider = 'swagger' | 'postman';
export type AuthType = 'none' | 'bearer' | 'basic' | 'apiKey';

export interface IngestAuth {
  type: AuthType;
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  headerValue?: string;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; MOJ-Converter/1.0)',
  Accept: 'application/json, application/yaml, application/vnd.oai.openapi, text/yaml, text/plain, text/html;q=0.9, */*;q=0.8',
} satisfies HeadersInit;

export async function ingestUrlAction(
  inputUrl: string,
  provider: IngestProvider = 'swagger',
  auth: IngestAuth = { type: 'none' }
) {
  console.log(`[Ingest] Fetching: ${inputUrl}, Provider: ${provider}`);
  try {
    const requestHeaders = buildHeaders(auth);

    if (provider === 'postman') {
      const match = inputUrl.match(/view\/([^\/]+)\/([^\/?]+)/);
      let fetchUrl = inputUrl;

      if (match) {
        const ownerId = match[1];
        const slug = match[2];
        fetchUrl = `https://documenter.gw.postman.com/api/collections/${ownerId}/${slug}?segregateAuth=true&versionTag=latest`;
      }

      console.log(`[Ingest] Fetching Postman Collection from: ${fetchUrl}`);
      const res = await fetch(fetchUrl, { headers: requestHeaders, cache: 'no-store' });

      if (!res.ok) {
        throw new Error(formatFetchError('Postman collection', fetchUrl, res.status, res.statusText));
      }

      const data = await res.json();
      return { success: true, data };
    }

    const url = normalizeUrl(inputUrl);

    const res = await fetch(url, {
      headers: requestHeaders,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(formatFetchError('URL', url, res.status, res.statusText));
    }

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    let specUrl = url;
    let specContent = text;

    if (contentType.includes('text/html')) {
      console.log('[Ingest] Detected HTML, attempting to scrape Swagger UI...');
      const scrapedUrl = await findSpecUrlInHtml(text, url, requestHeaders);

      if (scrapedUrl) {
        console.log(`[Ingest] Found spec URL: ${scrapedUrl}`);
        specUrl = scrapedUrl;
        const specRes = await fetch(specUrl, { headers: requestHeaders, cache: 'no-store' });
        if (!specRes.ok) {
          throw new Error(formatFetchError('scraped spec URL', specUrl, specRes.status, specRes.statusText));
        }
        specContent = await specRes.text();
      } else {
        console.warn('[Ingest] Could not find spec URL in HTML, attempting to parse as-is (might fail if not embedded)');
      }
    }

    let parsedInput;
    if (specContent.trim().startsWith('<') || specContent.includes('<!DOCTYPE html>')) {
      return {
        success: false,
        error:
          'Could not find a valid OpenAPI spec URL within the provided HTML page. If the docs are protected, provide authentication details and try again.',
      };
    }

    try {
      parsedInput = JSON.parse(specContent);
    } catch {
      parsedInput = specContent;
    }

    if (parsedInput && !parsedInput.openapi && !parsedInput.swagger) {
      const config = parsedInput as JsonRecord;
      const resolvedSpec = await resolveConfigToSpec(config, specUrl, url, requestHeaders);
      if (resolvedSpec) {
        parsedInput = resolvedSpec;
      }
    }

    try {
      const api = await SwaggerParser.validate(parsedInput as object);
      return { success: true, data: api };
    } catch (err) {
      console.warn('[Ingest] Strict validation failed, attempting lenient parse...', err);
      try {
        const api = await SwaggerParser.parse(parsedInput as object);
        console.log('[Ingest] Lenient parse successful.');
        return { success: true, data: api };
      } catch (parseErr) {
        console.error('[Ingest] Lenient parse also failed:', parseErr);
        throw err;
      }
    }
  } catch (err) {
    console.error('[Ingest] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error occurred' };
  }
}

async function findSpecUrlInHtml(
  html: string,
  baseUrl: string,
  headers: HeadersInit
): Promise<string | null> {
  const $ = cheerio.load(html);
  const inlineScripts = $('script')
    .map((_, element) => $(element).html() || '')
    .get()
    .filter(Boolean);

  for (const content of inlineScripts) {
    const discovered = findSpecReference(content, baseUrl);
    if (discovered) {
      return discovered;
    }
  }

  const scriptSources = $('script[src]')
    .map((_, element) => $(element).attr('src'))
    .get()
    .filter((value): value is string => Boolean(value));

  for (const scriptSrc of scriptSources) {
    const scriptUrl = resolveUrl(scriptSrc, baseUrl);
    try {
      const res = await fetch(scriptUrl, { headers, cache: 'no-store' });
      if (!res.ok) continue;
      const scriptText = await res.text();
      const discovered = findSpecReference(scriptText, scriptUrl);
      if (discovered) {
        return discovered;
      }
    } catch (error) {
      console.warn('[Ingest] Failed to inspect script source', scriptUrl, error);
    }
  }

  if (html.includes('swagger-ui')) {
    const candidates = [
      'swagger-initializer.js',
      './swagger-initializer.js',
      '../swagger-initializer.js',
      '../../v3/api-docs/swagger-config',
      '../../v3/api-docs',
      '../../v2/api-docs',
      '/swagger-config.json',
      '/v3/api-docs/swagger-config',
      '/v3/api-docs',
      '/v2/api-docs',
      '/openapi.json',
      '/swagger.json',
    ];

    for (const candidate of candidates) {
      const candidateUrl = resolveUrl(candidate, baseUrl);
      try {
        console.log(`[Ingest] HTML scraping inconclusive, trying candidate: ${candidateUrl}`);
        const res = await fetch(candidateUrl, { headers, cache: 'no-store' });
        if (!res.ok) continue;

        const text = await res.text();
        const discovered = findSpecReference(text, candidateUrl);
        if (discovered) {
          return discovered;
        }

        if (looksLikeJson(text)) {
          return candidateUrl;
        }
      } catch (error) {
        console.log(`[Ingest] Candidate check failed for ${candidate}`, error);
      }
    }
  }

  return null;
}

function resolveUrl(relative: string, base: string): string {
  return new URL(relative, base).toString();
}

function normalizeUrl(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`;
}

function buildHeaders(auth: IngestAuth): Headers {
  const headers = new Headers(DEFAULT_HEADERS);

  if (auth.type === 'bearer' && auth.token) {
    headers.set('Authorization', `Bearer ${auth.token}`);
  }

  if (auth.type === 'basic' && auth.username) {
    const encoded = Buffer.from(`${auth.username}:${auth.password ?? ''}`).toString('base64');
    headers.set('Authorization', `Basic ${encoded}`);
  }

  if (auth.type === 'apiKey' && auth.headerName && auth.headerValue) {
    headers.set(auth.headerName, auth.headerValue);
  }

  return headers;
}

function formatFetchError(target: string, url: string, status: number, statusText: string): string {
  if (status === 401 || status === 403) {
    return `Failed to fetch ${target} (${status} ${statusText}) from ${url}. This documentation appears to require authentication.`;
  }

  return `Failed to fetch ${target}: ${status} ${statusText}`;
}

function findSpecReference(content: string, baseUrl: string): string | null {
  const configUrlPatterns = [
    /configUrl\s*:\s*["']([^"']+)["']/,
    /"configUrl"\s*:\s*["']([^"']+)["']/,
  ];

  for (const pattern of configUrlPatterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return resolveUrl(match[1], baseUrl);
    }
  }

  const urlPatterns = [
    /\burls\s*:\s*\[\s*\{\s*url\s*:\s*["']([^"']+)["']/,
    /url\s*:\s*["']([^"']+)["']/,
    /"url"\s*:\s*["']([^"']+)["']/,
  ];

  for (const pattern of urlPatterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return resolveUrl(match[1], baseUrl);
    }
  }

  return null;
}

async function resolveConfigToSpec(
  config: JsonRecord,
  configUrl: string,
  inputUrl: string,
  headers: HeadersInit
): Promise<unknown | null> {
  if (typeof config.configUrl === 'string') {
    console.log(`[Ingest] Found configUrl in fetched content: ${config.configUrl}`);
    const nextConfigUrl = resolveUrl(config.configUrl, configUrl);
    if (nextConfigUrl !== configUrl) {
      try {
        const nextConfig = await fetchJsonRecord(nextConfigUrl, headers);
        config = { ...config, ...nextConfig };
      } catch (error) {
        console.warn('[Ingest] Failed to follow recursive configUrl', error);
      }
    }
  }

  if (Array.isArray(config.urls)) {
    console.log('[Ingest] Fetched content is a Config with multiple URLs');
    const selected = selectConfigUrl(config.urls, inputUrl);
    if (selected) {
      return fetchSpecContent(resolveUrl(selected, configUrl), headers);
    }
  }

  if (typeof config.url === 'string') {
    console.log(`[Ingest] Fetched content is a Config with single URL: ${config.url}`);
    return fetchSpecContent(resolveUrl(config.url, configUrl), headers);
  }

  return null;
}

function selectConfigUrl(urls: unknown[], inputUrl: string): string | null {
  const primaryName = new URL(inputUrl).searchParams.get('urls.primaryName');
  const normalized = urls
    .filter((value): value is JsonRecord => typeof value === 'object' && value !== null)
    .map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : null,
      url: typeof entry.url === 'string' ? entry.url : null,
    }))
    .filter((entry): entry is { name: string | null; url: string } => Boolean(entry.url));

  if (primaryName) {
    const match = normalized.find((entry) => entry.name === primaryName);
    if (match) {
      console.log(`[Ingest] Selected spec '${primaryName}' from config: ${match.url}`);
      return match.url;
    }
  }

  const fallback = normalized[0]?.url ?? null;
  if (fallback) {
    console.log(`[Ingest] Defaulting to first spec in config: ${fallback}`);
  }
  return fallback;
}

async function fetchJsonRecord(url: string, headers: HeadersInit): Promise<JsonRecord> {
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(formatFetchError('config URL', url, res.status, res.statusText));
  }

  const text = await res.text();
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object from config URL: ${url}`);
  }

  return parsed as JsonRecord;
}

async function fetchSpecContent(url: string, headers: HeadersInit): Promise<unknown> {
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(formatFetchError('resolved spec', url, res.status, res.statusText));
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}
