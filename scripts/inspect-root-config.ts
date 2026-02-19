async function inspectRootConfig() {
  const url = "https://ubnomnichannel-middleware.westus2.cloudapp.azure.com/swagger-config.json";
  console.log(`Fetching: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
        console.log(`Failed: ${res.status}`);
        return;
    }
    const text = await res.text();
    console.log(text);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

inspectRootConfig();
