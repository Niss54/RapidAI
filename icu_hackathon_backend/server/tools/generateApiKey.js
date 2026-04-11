require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const { generateApiKey } = require("../services/apiKeyService");

async function main() {
  const userId = String(process.argv[2] || "").trim();
  const planType = String(process.argv[3] || "free").trim();

  if (!userId) {
    console.error("Usage: node tools/generateApiKey.js <userId> [free|pro|hospital]");
    process.exit(1);
  }

  const created = await generateApiKey(userId, planType);

  console.log("API key created successfully.");
  console.log(JSON.stringify(created, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  console.error(`Failed to create API key: ${message}`);
  process.exit(1);
});
