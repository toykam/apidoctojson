async function inspectConfig() {
  const baseUrl = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/swagger-ui/";
  const indexUrl = baseUrl + "index.html?urls.primaryName=CardService";
  const initializerUrl = baseUrl + "swagger-initializer.js";

  console.log(`Fetching initializer: ${initializerUrl}`);
  try {
    const res = await fetch(initializerUrl);
    const text = await res.text();
    console.log("--- Initializer Content ---");
    console.log(text);
    console.log("--- End Initializer ---");
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

inspectConfig();
