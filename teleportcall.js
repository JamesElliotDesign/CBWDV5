const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const APPLICATION_ID = process.env.CFTOOLS_APPLICATION_ID;
const APPLICATION_SECRET = process.env.CFTOOLS_APPLICATION_SECRET;
const SERVER_API_ID = process.env.CFTOOLS_SERVER_API_ID;

let authToken = null;
let tokenExpiration = 0;

async function authenticate() {
  const response = await axios.post(`${API_BASE_URL}/auth/register`, {
    application_id: APPLICATION_ID,
    secret: APPLICATION_SECRET,
  }, {
    headers: { "User-Agent": APPLICATION_ID },
  });

  authToken = response.data.token;
  tokenExpiration = Date.now() + 24 * 60 * 60 * 1000;

  console.log("✅ Authenticated!");
}

async function teleportPlayerBySteam64(steam64, pos) {
  try {
    if (!authToken || Date.now() >= tokenExpiration) await authenticate();

    const response = await axios.post(
      `${API_BASE_URL}/server/${SERVER_API_ID}/GameLabs/action`,
      {
        actionCode: "CFCloud_TeleportPlayer",
        actionContext: "player",
        referenceKey: steam64, // Must be the player's Steam64 ID
        parameters: {
          vector: {
            valueVectorX: pos[0],
            valueVectorY: pos[1],
            valueVectorZ: pos[2],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "User-Agent": APPLICATION_ID,
        },
      }
    );

    console.log("✅ Teleport request OK!", response.data);
  } catch (err) {
    if (err.response) {
      console.error("❌ Error:", err.response.status, err.response.data);
    } else {
      console.error("❌ Request error:", err);
    }
  }
}

(async () => {
  const steam64 = "7656XXXXXXXXXXXXX"; // 🔑 Replace with the real Steam64 ID
  const safePos = [7837.10, 210.56, 4474.27];
  await teleportPlayerBySteam64(steam64, safePos);
})();
