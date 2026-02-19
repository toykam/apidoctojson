async function inspectConfigUrl() {
  const configUrl = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/v3/api-docs/swagger-config";
  console.log(`Fetching configUrl: ${configUrl}`);
  try {
    const res = await fetch(configUrl);
    const text = await res.text();
    console.log("--- Config Content ---");
    console.log(text);
    console.log("--- End Config ---");
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

inspectConfigUrl();
