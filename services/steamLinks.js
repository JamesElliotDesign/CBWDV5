// services/steamLinks.js

const fs = require("fs");
const path = require("path");

const LINKS_PATH = path.join(__dirname, "../steamlinks.json");

let steamLinks = {};

function loadSteamLinks() {
  if (fs.existsSync(LINKS_PATH)) {
    steamLinks = JSON.parse(fs.readFileSync(LINKS_PATH));
  }
}

function saveSteamLinks() {
  fs.writeFileSync(LINKS_PATH, JSON.stringify(steamLinks, null, 2));
}

function linkSteamID(playerName, steamID) {
  const normalized = playerName.trim().toLowerCase();
  steamLinks[normalized] = steamID;
  saveSteamLinks();
}

function getLinkedSteamID(playerName) {
  const normalized = playerName.trim().toLowerCase();
  return steamLinks[normalized];
}

// Load at startup
loadSteamLinks();

module.exports = {
  linkSteamID,
  getLinkedSteamID,
  loadSteamLinks,
  saveSteamLinks,
  steamLinks, // if you need raw access
};
