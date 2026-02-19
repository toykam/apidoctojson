async function inspectCorrectConfigUrl() {
  const baseUrl = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/swagger-ui/";
  const configUrl = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/v3/api-docs/swagger-config"; // Previous attempt
  const relativeConfigUrl = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/swagger-ui/swagger-config.json"; // Attempt relative to UI
  const rootConfigUrl = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/swagger-config.json"; // Attempt relative to root
  const apiDocsConfigUrl = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/v3/api-docs/swagger-config"; // SpringDoc default

  const urlsToTry = [
      apiDocsConfigUrl,
      relativeConfigUrl,
      rootConfigUrl,
      "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/swagger-ui/index.html/swagger-config" // Weird but possible
  ];

  for (const url of urlsToTry) {
      console.log(`Trying: ${url}`);
      try {
        const res = await fetch(url);
        if (res.ok) {
            console.log(`SUCCESS: ${url}`);
            const text = await res.text();
            console.log(text);
            break;
        } else {
            console.log(`FAILED: ${res.status}`);
        }
      } catch (e: any) {
          console.log(`ERROR: ${e.message}`);
      }
  }
}

inspectCorrectConfigUrl();
