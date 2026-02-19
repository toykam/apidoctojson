import { ingestUrlAction } from '../src/app/actions/ingest';

async function test() {
  // logic to test multi-spec selection
  const url = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/swagger-ui/index.html?urls.primaryName=CardService";
  console.log(`Testing ingestion for: ${url}`);
  
  const result = await ingestUrlAction(url);
  
  if (result.success) {
      console.log('Ingestion Successful!');
      console.log('API Title:', result.data.info.title);
      // We expect the Title to NOT be Petstore if it worked correctly, 
      // or at least be the CardService spec.
      // Based on my inspection of the config (step 148), the configUrl returned a JSON with "configUrl": "/swagger-config.json".
      // Wait, step 148 output showed: {"configUrl":"/swagger-config.json"...} 
      // This means the /v3/api-docs/swagger-config returned ANOTHER config object pointing to /swagger-config.json? 
      // Or maybe it was the content of that file?
      // actually output of 148 was: {"configUrl":"/swagger-config.json" ... }
      // This response seems to be the PROPS for SwaggerUI, not the Swagger Config with 'urls'.
      // The 'urls' typically appear in the same object passed to SwaggerUIBundle.
      
      // Let's see what the output is.
      console.log('API Version:', result.data.info.version);
      if (result.data.paths) {
        console.log('Endpoint Count:', Object.keys(result.data.paths).length);
      }
  } else {
      console.error('Ingestion Failed:', result.error);
      process.exit(1);
  }
}

test();
