'use server';

import SwaggerParser from '@apidevtools/swagger-parser';
import * as cheerio from 'cheerio';

export async function ingestUrlAction(inputUrl: string, provider: 'swagger' | 'postman' = 'swagger') {
    console.log(`[Ingest] Fetching: ${inputUrl}, Provider: ${provider}`);
  try {
      // --- POSTMAN PATH ---
      if (provider === 'postman') {
          // Expected format: https://documenter.getpostman.com/view/{ownerId}/{slug}
          // or just a raw collection link if the user has it

          // 1. Extract info from URL
          // Match /view/:ownerId/:slug
          const match = inputUrl.match(/view\/([^\/]+)\/([^\/?]+)/);

          let fetchUrl = inputUrl;

          if (match) {
              const ownerId = match[1];
              const slug = match[2];
              // Construct the hidden API URL
              // https://documenter.gw.postman.com/api/collections/2676638/2sAYQUptZc?segregateAuth=true&versionTag=latest
              fetchUrl = `https://documenter.gw.postman.com/api/collections/${ownerId}/${slug}?segregateAuth=true&versionTag=latest`;
          }

          console.log(`[Ingest] Fetching Postman Collection from: ${fetchUrl}`);
          const res = await fetch(fetchUrl);

          if (!res.ok) {
              throw new Error(`Failed to fetch Postman collection: ${res.status} ${res.statusText}`);
          }

          const data = await res.json();
          return { success: true, data: data };
      }

      // --- SWAGGER/OPENAPI PATH ---
      let url = inputUrl;

      // Basic formatting
      if (!url.startsWith('http')) {
          url = `https://${url}`;
      }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MOJ-Converter/1.0)',
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    let specUrl = url;
    let specContent = text;

    // Check if it's HTML (likely Swagger UI)
    if (contentType.includes('text/html')) {
        console.log('[Ingest] Detected HTML, attempting to scrape Swagger UI...');
        const scrapedUrl = await findSpecUrlInHtml(text, url);
        
        if (scrapedUrl) {
            console.log(`[Ingest] Found spec URL: ${scrapedUrl}`);
            specUrl = scrapedUrl;
            // Fetch the actual spec
            const specRes = await fetch(specUrl);
            if (!specRes.ok) {
                 throw new Error(`Failed to fetch scraped spec URL: ${specUrl}`);
            }
            specContent = await specRes.text();
        } else {
             console.warn('[Ingest] Could not find spec URL in HTML, attempting to parse as-is (might fail if not embedded)');
             // Fallback: maybe it's embedded JSON in HTML? Unlikely but possible.
        }
    }

    // Parse the spec content
    let parsedInput;
    
    // If we still have HTML content at this point, validation will fail.
    // SwaggerParser can sometimes handle URLs that redirect to JSON, but here we have the text content.
    if (specContent.trim().startsWith('<') || specContent.includes('<!DOCTYPE html>')) {
         return { success: false, error: 'Could not find a valid OpenAPI spec URL within the provided HTML page.' };
    }

    try {
        parsedInput = JSON.parse(specContent);
    } catch {
        parsedInput = specContent;
    }

    // Check if the parsed input is actually a Swagger Config (not a spec)
    // It might happen if we scraped a configUrl
    if (parsedInput && !parsedInput.openapi && !parsedInput.swagger) {
        let config = parsedInput;
        
        // Handle recursive configUrl
        if (config.configUrl) {
             console.log(`[Ingest] Found configUrl in fetched content: ${config.configUrl}`);
             // Resolve relative to the specUrl (which matches the config file URL)
             const nextConfigUrl = new URL(config.configUrl, specUrl).toString();
             // Only fetch if it's different to avoid infinite loop (e.g. self-reference)
             if (nextConfigUrl !== specUrl) {
                 try {
                     const nextRes = await fetch(nextConfigUrl);
                     if (nextRes.ok) {
                        const nextText = await nextRes.text();
                        const nextData = JSON.parse(nextText);
                        Object.assign(config, nextData);
                     }
                 } catch (e) {
                     console.warn('[Ingest] Failed to follow recursive configUrl', e);
                 }
             }
        }

        // Check for 'urls' array
        if (config.urls && Array.isArray(config.urls)) {
             console.log('[Ingest] Fetched content is a Config with multiple URLs');
             const inputUrlObj = new URL(url); 
             const primaryName = inputUrlObj.searchParams.get('urls.primaryName');
             
             let selectedUrl = null;
             if (primaryName) {
                 const match = config.urls.find((u: any) => u.name === primaryName);
                 if (match) selectedUrl = match.url;
             }
             if (!selectedUrl && config.urls.length > 0) {
                 selectedUrl = config.urls[0].url;
             }
             
             if (selectedUrl) {
                 console.log(`[Ingest] Resolved actual spec URL from config: ${selectedUrl}`);
                 // Resolve relative to the config URL
                 const finalSpecUrl = new URL(selectedUrl, specUrl).toString();
                 const finalRes = await fetch(finalSpecUrl);
                 if (!finalRes.ok) throw new Error(`Failed to fetch resolved spec: ${finalSpecUrl}`);
                 const finalText = await finalRes.text();
                 try {
                    parsedInput = JSON.parse(finalText);
                 } catch {
                    parsedInput = finalText;
                 }
             }
        }
        // Check for single 'url' in config
        else if (config.url) {
             console.log(`[Ingest] Fetched content is a Config with single URL: ${config.url}`);
             const finalSpecUrl = new URL(config.url, specUrl).toString();
             const finalRes = await fetch(finalSpecUrl);
             if (!finalRes.ok) throw new Error(`Failed to fetch resolved spec: ${finalSpecUrl}`);
             const finalText = await finalRes.text();
             try {
                parsedInput = JSON.parse(finalText);
             } catch {
                parsedInput = finalText;
             }
        }
    }

    try {
        const api = await SwaggerParser.validate(parsedInput as any);
        return { success: true, data: api };
    } catch (err) {
        console.warn('[Ingest] Strict validation failed, attempting lenient parse...', err);
        try {
            // Fallback to parse (no dereferencing/validation) or dereference without validation? 
            // SwaggerParser.dereference throws on validation errors too.
            // basic 'parse' just reads the file/object.
            const api = await SwaggerParser.parse(parsedInput as any);
            console.log('[Ingest] Lenient parse successful.');
            return { success: true, data: api };
        } catch (parseErr) {
             console.error('[Ingest] Lenient parse also failed:', parseErr);
             throw err; // Throw the original validation error or the parse error
        }
    }

  } catch (err) {
    console.error('[Ingest] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error occurred' };
  }
}

async function findSpecUrlInHtml(html: string, baseUrl: string): Promise<string | null> {
    const $ = cheerio.load(html);
    
    // 1. Check for 'swagger-initializer.js' or similar scripts which might contain the config
    // 2. Look for patterns in scripts
    
     // Check for specific config variables
     // We want to prioritize configUrl because it often holds the 'urls' array for multi-spec setups
     
     // Check for standard script tags
     const scripts = $('script');
     for (const script of scripts) {
         const content = $(script).html() || '';
         if (!content) continue;
         
         const configUrlMatch = content.match(/configUrl\s*:\s*["']([^"']+)["']/);
         if (configUrlMatch && configUrlMatch[1]) {
              console.log(`[Ingest] Found configUrl in script: ${configUrlMatch[1]}`);
              return resolveUrl(configUrlMatch[1], baseUrl);
         }

         const urlMatch = content.match(/url\s*:\s*["']([^"']+)["']/);
         if (urlMatch && urlMatch[1]) {
              // Don't return immediately, keep looking for configUrl in other scripts?
              // Or just return this if no configUrl found later? 
              // Actually, often they are in the same script (initializer).
              // Let's store it and return it if no configUrl is found in this script.
         }
     }
     
     // Double check scripts for 'url' if no configUrl was found
     for (const script of scripts) {
         const content = $(script).html() || '';
         const urlMatch = content.match(/url\s*:\s*["']([^"']+)["']/);
         if (urlMatch && urlMatch[1]) {
              return resolveUrl(urlMatch[1], baseUrl);
         }
     }

    // Special handling for the user's specific case:
    // https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/swagger-ui/index.html?urls.primaryName=CardService
    
    // Try to blindly fetch common config locations if we are in a swagger-ui context
    if (html.includes('swagger-ui')) {
        // Try to fetch ./swagger-initializer.js
        try {
            const initializerUrl = new URL('swagger-initializer.js', baseUrl).toString();
            console.log(`[Ingest] HTML scraping inconclusive, trying to fetch initializer: ${initializerUrl}`);
            const res = await fetch(initializerUrl);
            if (res.ok) {
                const initText = await res.text();
                
                // Prioritize configUrl in initializer too
                const configUrlMatch = initText.match(/"configUrl"\s*:\s*["']([^"']+)["']/); // quoted key
                // try unquoted key too just in case
                const configUrlMatchUnquoted = initText.match(/configUrl\s*:\s*["']([^"']+)["']/);
                
                const foundConfig = (configUrlMatch && configUrlMatch[1]) || (configUrlMatchUnquoted && configUrlMatchUnquoted[1]);
                
                if (foundConfig) {
                     console.log(`[Ingest] Found configUrl in initializer: ${foundConfig}`);
                     // If we return a URL ending in .json that is NOT a spec but a config,
                     // the main ingestUrlAction needs to handle it.
                     // IMPORTANT: ingestUrlAction expects a list of candidates to try in the `candidates` array loop?
                     // No, `findSpecUrlInHtml` returns a single string.
                     // If we return the config URL here, `ingestUrlAction` will fetch it.
                     // But `ingestUrlAction` thinks it's fetching the SPEC.
                     // It tries to parse it.
                     // IF `ingestUrlAction` parses it and finds `urls`, it handles it! 
                     // (We added that logic in step 149/161).
                     // So we just need to return the config URL here.
                     return resolveUrl(foundConfig, initializerUrl);
                }

                // Fallback to url
                 const urlMatch = initText.match(/url\s*:\s*["']([^"']+)["']/);
                if (urlMatch && urlMatch[1]) {
                     return resolveUrl(urlMatch[1], initializerUrl);
                }
            }
        } catch (e) {
            console.warn('[Ingest] Failed to fetch initializer', e);
        }
        
        // Try generic /v3/api-docs (SpringDoc default) and /v2/api-docs
        const candidates = [
            '../../v3/api-docs/swagger-config', // SpringDoc config endpoint
            '../../v3/api-docs',
            '../../v2/api-docs',
            '/v3/api-docs',
            '/v2/api-docs'
        ];
        
        for (const candidate of candidates) {
            try {
                 const candidateUrl = new URL(candidate, baseUrl).toString();
                 console.log(`[Ingest] HTML scraping inconclusive, trying candidate: ${candidateUrl}`);
                 // Check if it's a config file (JSON) or spec
                 const res = await fetch(candidateUrl);
                 if (res.ok) {
                     const contentType = res.headers.get('content-type') || '';
                     const text = await res.text();
                     
                     if (contentType.includes('json') || text.trim().startsWith('{')) {
                         try {
                             const data = JSON.parse(text);
                             
                             // Check if it's a pointer to another config (common in SpringDoc)
                             if (data.configUrl) {
                                 console.log(`[Ingest] Found pointer to another config: ${data.configUrl}`);
                                 const nextUrl = resolveUrl(data.configUrl, candidateUrl);
                                 console.log(`[Ingest] Fetching next config: ${nextUrl}`);
                                 // Recursively fetch the next config (simple one-level recursion for now)
                                 try {
                                     const nextRes = await fetch(nextUrl);
                                     if (nextRes.ok) {
                                        const nextText = await nextRes.text();
                                        console.log(`[Ingest] Next config content: ${nextText.substring(0, 200)}...`);
                                        const nextData = JSON.parse(nextText);
                                        // Use this new data for the checks below
                                        Object.assign(data, nextData);
                                     } else {
                                         console.warn(`[Ingest] Failed to fetch next config: ${nextRes.status}`);
                                     }
                                 } catch (e) {
                                     console.warn(`[Ingest] Error fetching next config`, e);
                                 }
                             }

                             // Check if it's a Swagger Config (has urls array)
                             if (data.urls && Array.isArray(data.urls)) {
                                 console.log('[Ingest] Found Swagger Config with multiple URLs');
                                 // Check input URL for query param selection
                                 // e.g. ?urls.primaryName=CardService
                                 const inputUrlObj = new URL(baseUrl); // The baseUrl here is the HTML page URL passed in
                                 const primaryName = inputUrlObj.searchParams.get('urls.primaryName');
                                 
                                 if (primaryName) {
                                     const match = data.urls.find((u: any) => u.name === primaryName);
                                     if (match) {
                                         console.log(`[Ingest] Selected spec '${primaryName}' from config: ${match.url}`);
                                         return resolveUrl(match.url, candidateUrl);
                                     }
                                 }
                                 
                                 // Default to first if no param or no match
                                 if (data.urls.length > 0) {
                                     console.log(`[Ingest] Defaulting to first spec in config: ${data.urls[0].url}`);
                                     return resolveUrl(data.urls[0].url, candidateUrl);
                                 }
                             }
                             
                             // If it's a direct spec (openapi/swagger key exists)
                             if (data.openapi || data.swagger) {
                                 console.log(`[Ingest] Found valid spec at ${candidateUrl}`);
                                 return candidateUrl;
                             }
                         } catch (e) {
                             console.log('[Ingest] Failed to parse candidate as JSON', e);
                         }
                     }
                 }
            } catch (e) {
                console.log(`[Ingest] Candidate check failed for ${candidate}`, e);
            }
        }
    }

    return null;
}

function resolveUrl(relative: string, base: string): string {
    return new URL(relative, base).toString();
}

