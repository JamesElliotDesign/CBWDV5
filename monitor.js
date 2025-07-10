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

async function getServerPerformance() {
  if (!authToken || Date.now() >= tokenExpiration) await authenticate();

  const response = await axios.get(
    `${API_BASE_URL}/server/${SERVER_API_ID}/status`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "User-Agent": APPLICATION_ID,
      },
    }
  );

  return response.data;
}

async function wipeAI() {
  if (!authToken || Date.now() >= tokenExpiration) await authenticate();

  const response = await axios.post(
    `${API_BASE_URL}/server/${SERVER_API_ID}/GameLabs/action`,
    {
      actionCode: "CFCloud_WorldWipeAI",
      actionContext: "world",
      parameters: {}
    },
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "User-Agent": APPLICATION_ID,
      },
    }
  );

  console.log("🗑️ Wiped all AI:", response.data);
}

async function checkAndAct() {
  try {
    const status = await getServerPerformance();
    const fps = status.performance.fps;
    console.log(`📊 Current FPS: ${fps}`);

    if (fps < 10) {
      console.log("⚠️ FPS below 10! Triggering AI wipe...");
      await wipeAI();
    } else {
      console.log("✅ FPS is fine, no action taken.");
    }

  } catch (err) {
    console.error("❌ Error in checkAndAct:", err.response?.data || err.message);
  }
}

// Run every minute
setInterval(checkAndAct, 60 * 1000);

(async () => {
  await authenticate();
  await checkAndAct();
})();
