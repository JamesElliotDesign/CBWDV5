const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const APPLICATION_ID = process.env.CFTOOLS_APPLICATION_ID;
const APPLICATION_SECRET = process.env.CFTOOLS_APPLICATION_SECRET;
const SERVER_API_ID = process.env.CFTOOLS_SERVER_API_ID;
const { getLinkedSteamID } = require("./steamLinks");

let authToken = null;
let tokenExpiration = 0;

// ✅ Authenticate once every 24h
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
    console.log("✅ Authenticated with CFTools API");
  } catch (error) {
    console.error("❌ Authentication failed:", error.response?.data || error.message);
    throw new Error("CFTools auth failed");
  }
}

// ✅ Get all online players with name, pos, steam64
async function getAllOnlinePlayers() {
  try {
    if (!authToken || Date.now() >= tokenExpiration) await authenticate();

    const response = await axios.get(
      `${API_BASE_URL}/server/${SERVER_API_ID}/GSM/list`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "User-Agent": APPLICATION_ID,
        },
      }
    );

    const sessions = response.data.sessions || [];

    return sessions
      .filter(
        (p) =>
          p.gamedata?.player_name &&
          p.live?.position?.latest &&
          p.gamedata?.steam64
      )
      .map((p) => ({
        name: p.gamedata.player_name.trim(),
        position: p.live.position.latest, // [X, Z, Y]
        steam64: p.gamedata.steam64,
      }));
  } catch (error) {
    console.error("❌ Failed to get player sessions:", error.response?.data || error.message);
    return [];
  }
}

// ✅ Calculate flat 2D distance
function calculateDistance(pos1, pos2) {
  const dx = pos1[0] - pos2[0];
  const dz = pos1[1] - pos2[2];
  return Math.sqrt(dx * dx + dz * dz);
}

// ✅ Verify player is near POI — uses cached sessions!
/**
 * Checks if player is within 500m of a POI.
 * Uses sessionCache only — no extra GSM hits.
 */
async function isPlayerNearPOI(playerName, poiName, players, POI_CONFIG) {
  console.log(`🚦 Checking distance for ${playerName} → ${poiName}`);

  const normalizedName = playerName.trim().toLowerCase();
  let player = players.find(
    (p) => p.name.trim().toLowerCase() === normalizedName
  );

  console.log(`🔍 Searching by name "${normalizedName}"`);

  if (!player) {
    const linkedSteamID = getLinkedSteamID(playerName);
    if (linkedSteamID) {
      console.log(`🔗 Trying fallback via linked SteamID ${linkedSteamID}`);
      player = players.find((p) => p.steam64 === linkedSteamID);
      if (player) {
        console.log(`✅ Found player by SteamID! Name in session: ${player.name}`);
      }
    }
  }

  if (!player) {
    console.warn(`❌ Could not match ${playerName} by name or SteamID — BLOCKING claim.`);
    return {
      success: false,
      message: `Could not verify your position. Please use /linksteam YOURSTEAMID and try again.`,
    };
  }

  if (!player.position) {
    console.warn(`❌ Player found but has no position — BLOCKING claim.`);
    return {
      success: false,
      message: `Could not verify your position data. Please relog or wait a moment.`,
    };
  }

  const poi = POI_CONFIG[poiName];
  if (!poi) {
    console.warn(`❌ POI_CONFIG MISSING for ${poiName} — BLOCKING claim.`);
    return { success: false, message: `Unknown POI: ${poiName}` };
  }

  const poiPos = poi.position;
  const dist = calculateDistance(player.position, poiPos);

  if (Number.isNaN(dist)) {
    console.warn(`❌ Distance calc NaN! playerPos=${JSON.stringify(player.position)} poiPos=${JSON.stringify(poiPos)}`);
    return { success: false, message: `Error verifying distance.` };
  }

  console.log(`📏 ${playerName} → ${poiName}: ${dist.toFixed(2)}m`);

  if (dist > 500) {
    return {
      success: false,
      message: `${playerName} is too far (${dist.toFixed(1)}m). Move within 500m to claim.`,
    };
  }

  return { success: true };
}

module.exports = {
  getAllOnlinePlayers,
  calculateDistance,
  isPlayerNearPOI,
};
