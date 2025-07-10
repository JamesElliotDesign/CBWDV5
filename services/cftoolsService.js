const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const APPLICATION_ID = process.env.CFTOOLS_APPLICATION_ID;
const APPLICATION_SECRET = process.env.CFTOOLS_APPLICATION_SECRET;
const SERVER_API_ID = process.env.CFTOOLS_SERVER_API_ID;

let authToken = null;
let tokenExpiration = 0;

/**
 * ✅ Authenticate with CF Tools API
 */
async function authenticate() {
  try {
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
    tokenExpiration = Date.now() + 24 * 60 * 60 * 1000;

    console.log("✅ Authenticated with CF Tools API");
  } catch (error) {
    console.error("❌ CF Tools auth failed:", error.response?.data || error.message);
    throw new Error("CF Tools auth failed");
  }
}

/**
 * ✅ Teleport player by Steam64 ID
 * Uses GameLabs Dynamic Action
 */
async function teleportPlayerBySteam64(steam64, targetPos) {
  try {
    if (!authToken || Date.now() >= tokenExpiration) await authenticate();

    const payload = {
      actionCode: "CFCloud_TeleportPlayer",
      actionContext: "player",
      referenceKey: steam64,
      parameters: {
      vector: {
          valueVectorX: targetPos[0],
          valueVectorY: targetPos[2], // ← Z becomes height
          valueVectorZ: targetPos[1], // ← Y becomes Z (north/south)
        },
      },
    };

    console.log(`🚀 Teleport Request → Steam64: ${steam64}`);
    console.log(`🚀 Payload:`, JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${API_BASE_URL}/server/${SERVER_API_ID}/GameLabs/action`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "User-Agent": APPLICATION_ID,
        },
      }
    );

    console.log(`✅ Teleport issued for Steam64 ${steam64} → [${targetPos.join(", ")}]`);
    console.log(`✅ CF Tools Response:`, response.data);
    return response.data;

  } catch (error) {
    console.error("❌ Teleport failed:", error.response?.data || error.message);
    return null;
  }
}

/**
 * ✅ Send a message to server chat
 */
async function sendServerMessage(content) {
  try {
    if (!authToken || Date.now() >= tokenExpiration) await authenticate();

    const response = await axios.post(
      `${API_BASE_URL}/server/${SERVER_API_ID}/message-server`,
      { content },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "User-Agent": APPLICATION_ID,
        },
      }
    );

    if (response.status === 204) {
      console.log(`✅ Sent server message: "${content}"`);
    } else {
      console.warn(`⚠️ Unexpected response from server message: ${response.status}`);
    }
  } catch (error) {
    console.error("❌ Failed to send server message:", error.response?.data || error.message);
  }
}

module.exports = {
  teleportPlayerBySteam64,
  sendServerMessage,
};
