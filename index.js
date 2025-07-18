const express = require("express");
const crypto = require("crypto");
const stringSimilarity = require("string-similarity");

const { sendServerMessage, teleportPlayerBySteam64 } = require("./services/cftoolsService");
const { getAllOnlinePlayers, isPlayerNearPOI, calculateDistance } = require("./services/distanceCheck");
const { POI_CONFIG } = require("./services/poiConfig");
const { linkSteamID } = require("./services/steamLinks");

require("dotenv").config();

const PORT = process.env.PORT || 8080;
const CF_WEBHOOK_SECRET = process.env.CF_WEBHOOK_SECRET;

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const CLAIMS = {};
const CLAIM_HISTORY = {}; // { POI_NAME: Set of player names who claimed it this restart }
const CLAIM_RADIUS = 500;

const MEMBER_EXPIRY = 60 * 60 * 1000;
const INTRUSION_RADIUS = 350;
const INTRUSION_COOLDOWN = 1 * 60 * 1000;
const CLAIM_TIMEOUT = 45 * 60 * 1000; // 45 minutes

const lastIntrusionWarnings = {};
const LEAVE_TRACKER = {};

const CLAIM_REGEX = /^!?\/?claim\s+([A-Za-z0-9_ -]+)\b/i;
const CANCEL_CLAIM_REGEX = /^!?\/?cancel\s+([A-Za-z0-9_ -]+)\b/i;
const CHECK_CLAIMS_REGEX = /^!?\/?check claims\b/i;
const CHECK_POI_REGEX = /^!?\/?check\s+([A-Za-z0-9_ -]+)\b/i;

const EXCLUDED_POIS = [];

const DYNAMIC_POIS = new Set([
  "Heli Crash (Event)",
  "Airdrop (Event)",
]);

const POI_MAP = {
  "Biathlon Arena T5": "Biathlon Arena",
  "Sinystok Bunker T4": "Sinystok Bunker",
  "Yephbin Underground Facility T4": "Yephbin",
  "Rostoki Castle T5": "Rostoki",
  "Svetloyarsk Oil Rig T5": "Big Oil Rig",
  "Elektro Raider Outpost T1": "Elektro",
  "Svetloyarsk Raider Outpost T1": "Svetloyarsk",
  "Solenchny Raider Outpost T1": "Solenchny",
  "Solnechny Oil Rig": "Small Oil Rig",
  "Klyuch Military T2": "Klyuch",
  "Rog Castle Military T2": "Rog",
  "Zub Castle Military T3": "Zub",
  "Kamensk Heli Depot T3": "Kamensk",
  "Metalurg Hydro Dam T3": "Metalurg",
  "Tisy Power Plant T4": "Tisy",
  "Krasno Warehouse T2": "Krasno",
  "Heli Crash (Event)": "Heli",
  "Airdrop (Event)": "Airdrop",
  "Weed Farm (Event)": "Weed Farm",
  "Ghost Ship (Event)": "Ghost Ship",
  "Capital Bank (Event)": "Bank"
};

const PARTIAL_POI_MAP = {
  "biathlon": "Biathlon Arena T5",
  "metalurg": "Metalurg Hydro Dam T3",
  "solenchny": "Solenchny Raider Outpost T1",
  "sol": "Solenchny Raider Outpost T1",
  "rostoki": "Rostoki Castle T5",
  "yephbin": "Yephbin Underground Facility T4",
  "krasno": "Krasno Warehouse T2",
  "svet": "Svetloyarsk Raider Outpost T1",
  "svetloyarsk": "Svetloyarsk Raider Outpost T1",
  "tisy": "Tisy Power Plant T4",
  "kamensk": "Kamensk Heli Depot T3",
  "elektro": "Elektro Raider Outpost T1",
  "klyuch": "Klyuch Military T2",
  "rog": "Rog Castle Military T2",
  "zub": "Zub Castle Military T3",
  "big oil rig": "Svetloyarsk Oil Rig T5",
  "small oil rig": "Solnechny Oil Rig",
  "big oil": "Svetloyarsk Oil Rig T5",
  "small oil": "Solnechny Oil Rig",
  "bunker": "Sinystok Bunker T4",
  "heli crash": "Heli Crash (Event)",
  "heli": "Heli Crash (Event)",
  "airdrop": "Airdrop (Event)",
  "farm": "Weed Farm (Event)",
  "weed": "Weed Farm (Event)",
  "ghost": "Ghost Ship (Event)",
  "ship": "Ghost Ship (Event)",
  "bank": "Capital Bank (Event)"
};

// ✅ Keep all sessions live
let sessionCache = [];

setInterval(async () => {
  sessionCache = await getAllOnlinePlayers();
}, 1000);

function scheduleClaimReset() {
  const now = new Date(Date.now() + 60 * 60 * 1000); // Adjust if needed for timezone offset
  const nextReset = new Date(now);

  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  let nextBlock = Math.ceil((currentHour + currentMinute / 60) / 3) * 3;

  if (nextBlock >= 24) {
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    nextReset.setUTCHours(0, 0, 0, 0);
  } else {
    nextReset.setUTCHours(nextBlock, 0, 0, 0);
  }

  const delay = nextReset.getTime() - now.getTime();

  console.log(`🕒 Now: ${new Date().toUTCString()}`);
  console.log(`⏳ Next POI reset scheduled in ${Math.floor(delay / 1000 / 60)} minutes at ${nextReset.toUTCString()}`);

  setTimeout(() => {
    resetClaims();
    setInterval(resetClaims, 3 * 60 * 60 * 1000);
  }, delay);
}

function resetClaims() {
  for (const poi in CLAIMS) {
    delete CLAIMS[poi];
  }
  for (const poi in CLAIM_HISTORY) {
    delete CLAIM_HISTORY[poi];
  }
  console.log("♻️ Scheduled reset: All POI claims and claim histories cleared for server restart.");
  sendServerMessage("All POI claims have been reset for the new server cycle.");
}

scheduleClaimReset();


function validateSignature(req) {
  const deliveryUUID = req.headers["x-hephaistos-delivery"];
  const receivedSignature = req.headers["x-hephaistos-signature"];
  if (!deliveryUUID || !receivedSignature) return false;

  const localSignature = crypto.createHash("sha256")
    .update(deliveryUUID + CF_WEBHOOK_SECRET)
    .digest("hex");

  return localSignature === receivedSignature;
}

function findMatchingPOI(input) {
  let normalizedPOI = input.trim().toLowerCase().replace(/\s+/g, " ");
  let correctedPOI = PARTIAL_POI_MAP[normalizedPOI] || POI_MAP[normalizedPOI];

  if (!correctedPOI) {
    const bestMatch = stringSimilarity.findBestMatch(
      normalizedPOI,
      [...Object.keys(POI_MAP), ...Object.values(POI_MAP), ...Object.keys(PARTIAL_POI_MAP)]
    );
    if (bestMatch.bestMatch.rating >= 0.6) {
      correctedPOI = PARTIAL_POI_MAP[bestMatch.bestMatch.target] || POI_MAP[bestMatch.bestMatch.target] || bestMatch.bestMatch.target;
    }
  }

  return correctedPOI || null;
}

function isPlayerOwnerOrMember(playerName, claim) {
  if (!claim) return false;
  if (claim.player === playerName) return true;
  return claim.members?.some(m => m.name === playerName);
}

function handleWarning(playerName, poiName, now) {
  if (!lastIntrusionWarnings[playerName]) {
    lastIntrusionWarnings[playerName] = {};
  }
  const lastWarned = lastIntrusionWarnings[playerName][poiName] || 0;
  if (now - lastWarned >= INTRUSION_COOLDOWN) {
    lastIntrusionWarnings[playerName][poiName] = now;
    sendServerMessage(`Warning: ${playerName}, you are near ${poiName}, you need to claim it to run it.`);
  }
}

function handleLeaveEnter(poiName, playerName, distance, innerRadius) {
  const claim = CLAIMS[poiName];
  if (!claim) return;

  if (!LEAVE_TRACKER[poiName]) LEAVE_TRACKER[poiName] = new Set();

  const isOwner = claim.player === playerName;
  const isMember = claim.members && claim.members.some(m => m.name === playerName);

  if (!(isOwner || isMember)) {
    // Not owner/member → ignore for reset logic
    return;
  }

  if (distance <= innerRadius) {
    LEAVE_TRACKER[poiName].add(playerName);
  } else {
    LEAVE_TRACKER[poiName].delete(playerName);
  }

  const insideCount = LEAVE_TRACKER[poiName].size;

  if (insideCount === 0 && !claim.cooldown) {
    console.log(`⏳ ${poiName}: all owners/members left or dead, starting 45 min timer`);
    claim.cooldown = setTimeout(() => {
      delete CLAIMS[poiName];
      console.log(`⌛ ${poiName} auto-unclaimed after timeout`);
      sendServerMessage(`${poiName} claim expired — it’s now available!`);
    }, 45 * 60 * 1000);
  }

  if (insideCount > 0 && claim.cooldown) {
    console.log(`🔄 ${poiName}: owner/member re-entered, cancelling expiry timer`);
    clearTimeout(claim.cooldown);
    claim.cooldown = null;
  }
}

async function checkPOIZones() {
  try {
    const now = Date.now();

    for (const [poiName, config] of Object.entries(POI_CONFIG)) {
      const claim = CLAIMS[poiName];

      for (const player of sessionCache) {
        const playerName = player.name.trim();
        const normalized = playerName.toLowerCase();
        const pos = player.position;

        const dx = pos[0] - config.position[0];
        const dz = pos[1] - config.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist <= INTRUSION_RADIUS) {
          if (!claim || !isPlayerOwnerOrMember(normalized, claim)) {
            handleWarning(playerName, poiName, now);
          }
        }

        if (dist <= config.kickRadius) {
          if (!claim || !isPlayerOwnerOrMember(normalized, claim)) {
            if (player.steam64) {
              await teleportPlayerBySteam64(player.steam64, config.safePos);
              console.log(`🟢 ${playerName} kicked from ${poiName}`);
            } else {
              console.warn(`❌ Could not teleport ${playerName} — Steam64 missing`);
            }
          }
        }

        if (claim && isPlayerOwnerOrMember(normalized, claim)) {
          handleLeaveEnter(poiName, normalized, dist, config.kickRadius);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error in checkPOIZones:", err);
  }
}

setInterval(checkPOIZones, 60 * 1000);

function cleanExpiredGroupMembers() {
  const now = Date.now();

  for (const poi in CLAIMS) {
    if (!CLAIMS[poi].members) continue;
    CLAIMS[poi].members = CLAIMS[poi].members.filter(member => now - member.timestamp < MEMBER_EXPIRY);
  }
}

setInterval(cleanExpiredGroupMembers, 60 * 1000);

function releaseExpiredPOIs() {
  const now = Date.now();
  for (const poi in CLAIMS) {
    if (now - CLAIMS[poi].timestamp >= CLAIM_TIMEOUT) {
      delete CLAIMS[poi];
      console.log(`⌛ ${poi} auto-unclaimed after 45 min timeout`);
      sendServerMessage(`${poi} is now available to claim again!`);
    }
  }
}

setInterval(releaseExpiredPOIs, 60 * 1000); // Check expired claims every 1 min

const processedMessages = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of processedMessages.entries()) {
    if (now - timestamp > 10000) {
      processedMessages.delete(key);
    }
  }
}, 5000);

app.post("/webhook", async (req, res) => {
  const eventType = req.headers["x-hephaistos-event"];

  if (eventType === "verification") {
    console.log("✅ Received verification ping.");
    return res.sendStatus(204);
  }

  if (!validateSignature(req)) {
    console.error("❌ Invalid signature.");
    return res.status(403).send("Forbidden");
  }

  if (eventType === "user.chat") {
    try {
      const { message, player_name } = req.body;
      const messageContent = message.toLowerCase();
      const playerName = player_name;

      console.log(`[Game Chat] ${playerName}: ${messageContent}`);

      const messageKey = `${playerName}-${messageContent}`;
      if (processedMessages.has(messageKey)) return res.sendStatus(204);
      processedMessages.set(messageKey, Date.now());

      // ✅ ✅ ✅ LINKSTEAM HANDLER — put FIRST
      const LINK_REGEX = /^!?\/?linksteam\s+([0-9]{17})\b/i;
      if (LINK_REGEX.test(messageContent)) {
        const steamMatch = messageContent.match(LINK_REGEX);
        const steamID = steamMatch[1];
        linkSteamID(playerName, steamID);
        await sendServerMessage(`${playerName}, your SteamID has been linked.`);
        return res.sendStatus(204);
      }

      // ✅ Check available claims
      if (CHECK_CLAIMS_REGEX.test(messageContent)) {
        const available = Object.keys(POI_MAP).filter(
          poi => !CLAIMS[poi] && !EXCLUDED_POIS.includes(poi)
        );
        if (available.length === 0) {
          await sendServerMessage("All POIs are currently claimed.");
        } else {
          await sendServerMessage(
            `Available POIs: ${available.map(poi => POI_MAP[poi]).join(", ")}`
          );
        }
        return res.sendStatus(204);
      }

      // ✅ Check specific POI
      const checkMatch = messageContent.match(CHECK_POI_REGEX);
      if (checkMatch) {
        const corrected = findMatchingPOI(checkMatch[1]);
        if (!corrected) {
          await sendServerMessage(
            `Unknown POI: ${checkMatch[1]}. Try 'check claims'.`
          );
          return res.sendStatus(204);
        }
        await sendServerMessage(
          CLAIMS[corrected]
            ? `${corrected} is claimed by ${CLAIMS[corrected].displayName}.`
            : `${corrected} is available!`
        );
        return res.sendStatus(204);
      }

      // ✅ Handle claim
    const claimMatch = messageContent.match(CLAIM_REGEX);
    if (claimMatch) {
      const corrected = findMatchingPOI(claimMatch[1]);
      if (!corrected) {
        await sendServerMessage(`Invalid POI: ${claimMatch[1]}.`);
        return res.sendStatus(204);
      }

      // If already claimed right now
      if (CLAIMS[corrected]) {
        const mins = Math.floor((Date.now() - CLAIMS[corrected].timestamp) / 60000);
        await sendServerMessage(
          `${corrected} already claimed by ${CLAIMS[corrected].displayName} ${mins} min ago.`
        );
        return res.sendStatus(204);
      }

      const normalizedClaimant = playerName.trim().toLowerCase();

      // ✅ Check if they (or their group) have claimed this POI before this restart
      if (!CLAIM_HISTORY[corrected]) CLAIM_HISTORY[corrected] = new Set();

      if (CLAIM_HISTORY[corrected].has(normalizedClaimant)) {
        await sendServerMessage(
          `${playerName}, you have already claimed ${corrected} this restart.`
        );
        return res.sendStatus(204);
      }

      if (!DYNAMIC_POIS.has(corrected)) {
        const checkResult = await isPlayerNearPOI(
          playerName,
          corrected,
          sessionCache,
          POI_CONFIG
        );
        if (!checkResult.success) {
          await sendServerMessage(checkResult.message);
          return res.sendStatus(204);
        }
      }

      // ✅ Actually claim
      CLAIMS[corrected] = {
        player: normalizedClaimant,
        displayName: playerName.trim(),
        timestamp: Date.now(),
        members: [{ name: normalizedClaimant, timestamp: Date.now() }]
      };

      // ✅ Add main claimant to claim history
      CLAIM_HISTORY[corrected].add(normalizedClaimant);

      // ✅ Also add nearby group members
      for (const p of sessionCache) {
        const normalized = p.name.trim().toLowerCase();
        const dx = p.position[0] - POI_CONFIG[corrected].position[0];
        const dz = p.position[1] - POI_CONFIG[corrected].position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist <= CLAIM_RADIUS) {
          const alreadyAdded = CLAIMS[corrected].members.some(
            m => m.name === normalized
          );
          if (!alreadyAdded) {
            CLAIMS[corrected].members.push({
              name: normalized,
              displayName: p.name.trim(),
              timestamp: Date.now()
            });
            CLAIM_HISTORY[corrected].add(normalized); // ✅ Mark them in the history too
            console.log(
              `👥 ${p.name} added to ${corrected} group (${dist.toFixed(2)}m)`
            );
          }
        }
      }

      const displayNames = CLAIMS[corrected].members
        .filter(m => m.name !== normalizedClaimant)
        .map(m => m.displayName || m.name);
      const groupMsg = displayNames.length
        ? ` with ${displayNames.join(", ")}`
        : "";

      await sendServerMessage(`${playerName} claimed ${corrected}${groupMsg}.`);
      return res.sendStatus(204);
    }

      // ✅ Unclaim handler
      const unclaimMatch = messageContent.match(CANCEL_CLAIM_REGEX);
      if (unclaimMatch) {
        const corrected = findMatchingPOI(unclaimMatch[1]);
        if (!corrected || !CLAIMS[corrected]) {
          await sendServerMessage(
            corrected
              ? `${corrected} is not claimed.`
              : `Invalid POI: ${unclaimMatch[1]}.`
          );
          return res.sendStatus(204);
        }
        const normalized = playerName.trim().toLowerCase();
        if (CLAIMS[corrected].player !== normalized) {
          await sendServerMessage(
            `You cannot cancel claim on ${corrected}. Claimed by ${CLAIMS[corrected].displayName}.`
          );
          return res.sendStatus(204);
        }
        delete CLAIMS[corrected];
        await sendServerMessage(`${playerName} cancelled their claim on ${corrected}.`);
        return res.sendStatus(204);
      }

    } catch (err) {
      console.error("❌ Webhook Error:", err);
      return res.sendStatus(500);
    }
  }

  res.sendStatus(204);
});

app.listen(PORT, () => console.log(`🚀 Webhook Server running on port ${PORT}`));
