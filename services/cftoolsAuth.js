// services/cftoolsAuth.js

const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const APPLICATION_ID = process.env.CFTOOLS_APPLICATION_ID;
const APPLICATION_SECRET = process.env.CFTOOLS_APPLICATION_SECRET;

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
        console.log("✅ Authenticated with CF Tools API (Shared Auth)");
    } catch (error) {
        console.error("❌ CF Tools auth failed (Shared Auth):", error.response?.data || error.message);
        throw new Error("CF Tools auth failed");
    }
}

/**
 * A shared function to get a valid auth token.
 * It will handle authentication and re-authentication automatically.
 */
async function getAuthToken() {
    if (!authToken || Date.now() >= tokenExpiration) {
        await authenticate();
    }
    return authToken;
}

module.exports = { getAuthToken };