const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = "https://data.cftools.cloud/v1";
const APPLICATION_ID = process.env.CFTOOLS_APPLICATION_ID;
const APPLICATION_SECRET = process.env.CFTOOLS_APPLICATION_SECRET;
const SERVER_API_ID = process.env.CFTOOLS_SERVER_API_ID;

let authToken = null;

async function authenticate() {
  const response = await axios.post(`${API_BASE_URL}/auth/register`, {
    application_id: APPLICATION_ID,
    secret: APPLICATION_SECRET,
  }, {
    headers: { "User-Agent": APPLICATION_ID },
  });

  authToken = response.data.token;
  console.log("✅ Authenticated!");
}

async function getServerStatistics() {
  const response = await axios.get(`${API_BASE_URL}/server/${SERVER_API_ID}/statistics`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      "User-Agent": APPLICATION_ID,
    },
  });

  console.log("✅ Server Statistics:");
  console.dir(response.data, { depth: null });
}

(async () => {
  await authenticate();
  await getServerStatistics();
})();
