const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const APPLICATION_ID = process.env.CFTOOLS_APPLICATION_ID;
const APPLICATION_SECRET = process.env.CFTOOLS_APPLICATION_SECRET;
const SERVER_API_ID = process.env.CFTOOLS_SERVER_API_ID;

let authToken = null;

async function authenticate() {
  const response = await axios.post(
    `${API_BASE_URL}/auth/register`,
    {
      application_id: APPLICATION_ID,
      secret: APPLICATION_SECRET,
    },
    {
      headers: { "User-Agent": APPLICATION_ID },
    }
  );

  authToken = response.data.token;
  console.log("✅ Authenticated, token:", authToken.slice(0, 12) + "...");
}

async function getGSMList() {
  if (!authToken) await authenticate();

  const response = await axios.get(
    `${API_BASE_URL}/server/${SERVER_API_ID}/GSM/list`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "User-Agent": APPLICATION_ID,
      },
    }
  );

  console.log("🔍 Full GSM response:", JSON.stringify(response.data, null, 2));

  const players = response.data.gamesessions || [];
  if (players.length === 0) {
    console.log("⚠️ No players found in GSM list.");
    return;
  }

  console.log("\n✅ Players Online:");
  players.forEach((p) => {
    console.log(`- ${p.name} → SteamID: ${p.steam_id}`);
  });
}

getGSMList().catch((err) => {
  console.error("❌ Error:", err.response?.data || err.message);
});
