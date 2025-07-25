// services/distanceCheck.js

const axios = require("axios");
const { getAuthToken } = require("./cftoolsAuth"); // ✅ Import shared auth
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const SERVER_API_ID = process.env.CFTOOLS_SERVER_API_ID;

async function getAllOnlinePlayers() {
    try {
        const authToken = await getAuthToken(); // ✅ Get the shared token

        const response = await axios.get(
            `${API_BASE_URL}/server/${SERVER_API_ID}/GSM/list`,
            {
                headers: { Authorization: `Bearer ${authToken}` },
            }
        );

        const sessions = response.data.sessions || [];

        const cleanData = sessions.filter(p =>
            p.gamedata?.player_name &&
            p.gamedata?.steam64 &&
            p.live?.position?.latest &&
            Array.isArray(p.live.position.latest) &&
            p.live.position.latest.length >= 3
        ).map(p => ({
            name: p.gamedata.player_name.trim(),
            position: p.live.position.latest,
            steam64: p.gamedata.steam64,
        }));
        
        return cleanData;

    } catch (error) {
        console.error("❌ Failed to get player sessions:", error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    getAllOnlinePlayers,
};