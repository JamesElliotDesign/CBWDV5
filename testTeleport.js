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

async function listGameLabsActions() {
  try {
    if (!authToken || Date.now() >= tokenExpiration) await authenticate();

    const response = await axios.get(
      `${API_BASE_URL}/server/${SERVER_API_ID}/GameLabs/actions`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "User-Agent": APPLICATION_ID,
        },
      }
    );

    console.log("✅ Available GameLabs actions:");
    console.dir(response.data, { depth: null });

  } catch (err) {
    if (err.response) {
      console.error("❌ Error response:", err.response.status, err.response.data);
    } else {
      console.error("❌ Request failed:", err);
    }
  }
}

listGameLabsActions();
