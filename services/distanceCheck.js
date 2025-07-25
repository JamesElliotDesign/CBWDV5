const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const APPLICATION_ID = process.env.CFTOOLS_APPLICATION_ID;
const APPLICATION_SECRET = process.env.CFTOOLS_APPLICATION_SECRET;
const SERVER_API_ID = process.env.CFTOOLS_SERVER_API_ID;

let authToken = null;
let tokenExpiration = 0;

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
        console.log("✅ Authenticated with CFTools API (from distanceCheck)");
    } catch (error) {
        console.error("❌ Authentication failed:", error.response?.data || error.message);
        throw new Error("CFTools auth failed");
    }
}

/**
 * ✅ Gets all online players and filters out any with incomplete or malformed data.
 */
async function getAllOnlinePlayers() {
    try {
        if (!authToken || Date.now() >= tokenExpiration) await authenticate();

        const response = await axios.get(
            `${API_BASE_URL}/server/${SERVER_API_ID}/GSM/list`,
            {
                headers: { Authorization: `Bearer ${authToken}` },
            }
        );

        const sessions = response.data.sessions || [];

        // ✅ Filter the raw data at the source with stricter validation
        const cleanData = sessions.filter(p =>
            p.gamedata?.player_name &&
            p.gamedata?.steam64 &&
            p.live?.position?.latest &&
            Array.isArray(p.live.position.latest) && // Ensure position is an array
            p.live.position.latest.length >= 3        // Ensure it has X, Y, and Z coordinates
        ).map(p => ({
            name: p.gamedata.player_name.trim(),
            position: p.live.position.latest,
            steam64: p.gamedata.steam64,
        }));
        
        return cleanData;

    } catch (error) {
        console.error("❌ Failed to get player sessions:", error.response?.data || error.message);
        return null; // Return null so the main loop keeps the stale cache
    }
}

module.exports = {
    getAllOnlinePlayers,
};