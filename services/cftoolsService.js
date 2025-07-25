// services/cftoolsService.js

const axios = require("axios");
const { getAuthToken } = require("./cftoolsAuth"); // ✅ Import shared auth
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const SERVER_API_ID = process.env.CFTOOLS_SERVER_API_ID;
const APPLICATION_ID = process.env.CFTOOLS_APPLICATION_ID;

async function teleportPlayerBySteam64(steam64, targetPos) {
    try {
        const authToken = await getAuthToken(); // ✅ Get the shared token

        const payload = {
            actionCode: "CFCloud_TeleportPlayer",
            actionContext: "player",
            referenceKey: steam64,
            parameters: {
                vector: {
                    valueVectorX: targetPos[0],
                    valueVectorY: targetPos[2],
                    valueVectorZ: targetPos[1],
                },
            },
        };

        await axios.post(
            `${API_BASE_URL}/server/${SERVER_API_ID}/GameLabs/action`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "User-Agent": APPLICATION_ID,
                },
            }
        );
        console.log(`✅ Teleport issued for Steam64 ${steam64}`);
    } catch (error) {
        console.error("❌ Teleport failed:", error.response?.data || error.message);
    }
}

async function sendServerMessage(content) {
    try {
        const authToken = await getAuthToken(); // ✅ Get the shared token

        await axios.post(
            `${API_BASE_URL}/server/${SERVER_API_ID}/message-server`,
            { content },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "User-Agent": APPLICATION_ID,
                },
            }
        );
        console.log(`✅ Sent server message: "${content}"`);
    } catch (error) {
        console.error("❌ Failed to send server message:", error.response?.data || error.message);
    }
}

module.exports = {
    teleportPlayerBySteam64,
    sendServerMessage,
};