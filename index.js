const express = require("express");
const crypto = require("crypto");
const stringSimilarity = require("string-similarity");

const {
    sendServerMessage,
    teleportPlayerBySteam64
} = require("./services/cftoolsService");
const {
    getAllOnlinePlayers
} = require("./services/distanceCheck");
const {
    POI_CONFIG
} = require("./services/poiConfig");
const {
    linkSteamID
} = require("./services/steamLinks");

require("dotenv").config();

const PORT = process.env.PORT || 8080;
const CF_WEBHOOK_SECRET = process.env.CF_WEBHOOK_SECRET;

const app = express();
app.use(express.json({
    limit: "1mb"
}));
app.use(express.urlencoded({
    extended: true,
    limit: "1mb"
}));

const CLAIMS = {};
const CLAIM_HISTORY = {}; // { POI_NAME: Set of player names who claimed it this restart }

const INTRUSION_RADIUS = 350;
const INTRUSION_COOLDOWN = 1 * 60 * 1000;
const CLAIM_DURATION_DEFAULT = 45 * 60 * 1000; // 45 minutes
const CLAIM_DURATION_T5 = 60 * 60 * 1000; // 60 minutes
const COOLDOWN_DURATION = 45 * 60 * 1000;
const GRACE_PERIOD_DURATION = 15 * 60 * 1000;
const TELEPORT_WARNING_DURATION = 30 * 1000; // 30 seconds

// Radii and Distances (using squared values is faster than Math.sqrt)
const GROUPING_RADIUS_SQUARED = 100 * 100; // 100m
const WIPE_CHECK_RADIUS_SQUARED = 500 * 500; // 500m

// List of T5 POIs that get an extended claim time
const T5_POIS = new Set([
    "Biathlon Arena T5",
    "Rostoki Castle T5",
    "Svetloyarsk Oil Rig T5",
]);

const TELEPORT_WARNINGS = {}; // Tracks players on a teleport countdown
const lastIntrusionWarnings = {};

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

// --- ADD THIS NEW HELPER FUNCTION ---
// Formats milliseconds into a human-readable string (e.g., "15m 30s")
function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
}

// --- ADD THIS NEW HELPER FUNCTION ---
// This function is called when the 45/60 min hard cap is reached
async function forceExpireAndStartCooldown(poiName) {
    const claim = CLAIMS[poiName];
    if (!claim) return;

    console.log(`⌛ ${poiName}: Hard cap reached. Evicting remaining players.`);
    sendServerMessage(`Warning: The claim on ${poiName} has expired. All members will be removed.`);

    const config = POI_CONFIG[poiName];
    if (!config) return;

    // Give a 60-second warning before teleporting everyone out.
    setTimeout(async () => {
        const teleportPromises = [];
        const currentClaim = CLAIMS[poiName]; // Re-fetch claim state
        if (!currentClaim || currentClaim.state !== 'ACTIVE') return; // Stop if claim was cancelled during warning

        for (const player of sessionCache) {
            const normalizedName = player.name.trim().toLowerCase();
            if (currentClaim.members.has(normalizedName)) {
                const distSquared = Math.pow(player.position[0] - config.position[0], 2) + Math.pow(player.position[1] - config.position[2], 2);
                if (distSquared <= (config.kickRadius * config.kickRadius)) {
                    console.log(`Evicting ${player.name} from ${poiName}.`);
                    if (player.steam64) {
                        teleportPromises.push(
                            teleportPlayerBySteam64(player.steam64, config.safePos)
                        );
                    }
                }
            }
        }
        await Promise.all(teleportPromises);
        startCooldown(poiName, {
            checkWipe: false
        }); // Start cooldown with no grace period
    }, 60 * 1000); // 60 second delay
}


// --- ADD THIS NEW HELPER FUNCTION ---
// This function handles the transition to the COOLDOWN state
function startCooldown(poiName, options = {
    checkWipe: false
}) {
    const claim = CLAIMS[poiName];
    if (!claim || claim.state !== 'ACTIVE') return;

    clearTimeout(claim.timerId);

    let gracePeriodGranted = false;
    if (options.checkWipe) {
        console.log(`🩺 Checking for team wipe at ${poiName}...`);
        const config = POI_CONFIG[poiName];
        let membersFound = 0;
        let membersOutsideWipeRadius = 0;

        for (const memberName of claim.members) {
            const player = sessionCache.find(p => p.name.trim().toLowerCase() === memberName);
            if (player) {
                membersFound++;
                const distSquared = Math.pow(player.position[0] - config.position[0], 2) + Math.pow(player.position[1] - config.position[2], 2);
                if (distSquared > WIPE_CHECK_RADIUS_SQUARED) {
                    membersOutsideWipeRadius++;
                }
            }
        }

        // If we found members online, and ALL of them are outside the 500m radius
        if (membersFound > 0 && membersFound === membersOutsideWipeRadius) {
            gracePeriodGranted = true;
            claim.gracePeriodAllowed = true;
            console.log(`✅ Team wipe detected for ${poiName}. Allowing grace period.`);
            sendServerMessage(`A team wipe was detected at ${poiName}. Your group may return for gear. A 15-min timer will start when the first member arrives.`);
        } else {
            console.log(`❌ No team wipe at ${poiName}. At least one member is within 500m.`);
        }
    }

    if (!gracePeriodGranted) {
        sendServerMessage(`${poiName} is now on a 45-minute cooldown.`);
    }

    claim.state = 'COOLDOWN';
    claim.cooldownUntil = Date.now() + COOLDOWN_DURATION;
    claim.timerId = setTimeout(() => {
        delete CLAIMS[poiName];
        console.log(`✅ ${poiName}: Cooldown finished.`);
        sendServerMessage(`${poiName} is now available to claim again!`);
    }, COOLDOWN_DURATION);
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


// --- REPLACE THE ENTIRE FUNCTION ---
async function checkPOIZones() {
    try {
        const now = Date.now();

        // --- CANCEL EXPIRED TELEPORT WARNINGS ---
        for (const playerName in TELEPORT_WARNINGS) {
            const player = sessionCache.find(p => p.name === playerName);
            const warning = TELEPORT_WARNINGS[playerName];
            const config = POI_CONFIG[warning.poiName];

            let isSafe = true;
            if (player && config) {
                const distSquared = Math.pow(player.position[0] - config.position[0], 2) + Math.pow(player.position[1] - config.position[2], 2);
                if (distSquared <= (config.kickRadius * config.kickRadius)) {
                    isSafe = false; // Player is still inside the kick zone
                }
            }

            if (isSafe) {
                console.log(`🚶 ${playerName} left ${warning.poiName}. Teleport cancelled.`);
                clearTimeout(warning.timerId);
                delete TELEPORT_WARNINGS[playerName];
            }
        }

        for (const [poiName, config] of Object.entries(POI_CONFIG)) {
            const claim = CLAIMS[poiName];

            // --- ACTIVE PHASE LOGIC (checks if group left early) ---
            if (claim && claim.state === 'ACTIVE') {
                let playersInsideCount = 0;
                for (const memberName of claim.members) {
                    const player = sessionCache.find(p => p.name.trim().toLowerCase() === memberName);
                    if (player) {
                        const distSquared = Math.pow(player.position[0] - config.position[0], 2) + Math.pow(player.position[1] - config.position[2], 2);
                        if (distSquared <= (config.kickRadius * config.kickRadius)) {
                            playersInsideCount++;
                        }
                    }
                }
                if (playersInsideCount === 0) {
                    console.log(`🟢 ${poiName}: All members have left. Checking for wipe.`);
                    startCooldown(poiName, {
                        checkWipe: true
                    });
                }
            }

            // --- UNIVERSAL ENFORCEMENT & WARNING LOOP ---
            for (const player of sessionCache) {
                const playerName = player.name.trim();
                const normalizedName = playerName.toLowerCase();
                const distSquared = Math.pow(player.position[0] - config.position[0], 2) + Math.pow(player.position[1] - config.position[2], 2);

                let isAuthorized = false;
                if (claim && claim.members.has(normalizedName)) {
                    isAuthorized = true;
                    if (claim.state === 'COOLDOWN') {
                        // If grace is allowed but not started, trigger it on entering 500m zone
                        if (claim.gracePeriodAllowed && !claim.individualGracePeriods[normalizedName] && distSquared <= WIPE_CHECK_RADIUS_SQUARED) {
                            claim.individualGracePeriods[normalizedName] = now + GRACE_PERIOD_DURATION;
                            console.log(`⏱️ ${playerName} triggered their 15-min grace timer for ${poiName}.`);
                            sendServerMessage(`${playerName} has returned to ${poiName}. Your 15-minute gear retrieval timer has begun!`);
                        }
                        // Check if the individual grace period has expired
                        const graceUntil = claim.individualGracePeriods[normalizedName];
                        if (!graceUntil || now > graceUntil) {
                            isAuthorized = false;
                        }
                    }
                }

                // If player is inside kick radius and NOT authorized
                if (distSquared <= (config.kickRadius * config.kickRadius) && !isAuthorized) {
                    if (!TELEPORT_WARNINGS[playerName]) {
                        // Issue a new warning
                        console.log(`⚠️ ${playerName} entered restricted area ${poiName}. Starting 30s timer.`);
                        sendServerMessage(`Warning: ${playerName}, you are in a restricted area. You will be removed in 30 seconds if you do not leave.`);
                        const timerId = setTimeout(() => {
                            teleportPlayerBySteam64(player.steam64, config.safePos)
                                .then(() => console.log(`🚀 ${playerName} teleported from ${poiName}.`))
                                .catch(err => console.error(`Teleport failed for ${playerName}`, err));
                            delete TELEPORT_WARNINGS[playerName];
                        }, TELEPORT_WARNING_DURATION);
                        TELEPORT_WARNINGS[playerName] = {
                            timerId,
                            poiName
                        };
                    }
                }

                // Outer radius warning for active claims
                if (claim && claim.state === 'ACTIVE' && !isAuthorized && distSquared <= (INTRUSION_RADIUS * INTRUSION_RADIUS)) {
                    handleWarning(playerName, poiName, now);
                }
            }
        }
    } catch (err) {
        console.error("❌ Error in checkPOIZones:", err);
    }
}

setInterval(checkPOIZones, 30 * 1000); // Increased responsiveness

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
            const {
                message,
                player_name
            } = req.body;
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

            // --- REPLACE THIS ENTIRE BLOCK ---
            const checkMatch = messageContent.match(CHECK_POI_REGEX);
            if (checkMatch) {
                const corrected = findMatchingPOI(checkMatch[1]);
                if (!corrected) {
                    await sendServerMessage(`Unknown POI: ${checkMatch[1]}. Try 'check claims'.`);
                    return res.sendStatus(204);
                }

                const claim = CLAIMS[corrected];
                if (claim) {
                    if (claim.state === 'ACTIVE') {
                        const timeRemaining = formatDuration(claim.activeUntil - Date.now());
                        await sendServerMessage(`${corrected} is claimed by ${claim.displayName}. Time remaining: ${timeRemaining}`);
                    } else if (claim.state === 'COOLDOWN') {
                        const timeRemaining = formatDuration(claim.cooldownUntil - Date.now());
                        await sendServerMessage(`${corrected} is on cooldown for ${timeRemaining}.`);
                    }
                } else {
                    await sendServerMessage(`${corrected} is available!`);
                }
                return res.sendStatus(204);
            }

            // ✅ Handle claim
            // --- REPLACE THIS ENTIRE BLOCK ---
            // --- REPLACE WITH THIS FINAL VERSION ---
            const claimMatch = messageContent.match(CLAIM_REGEX);
            if (claimMatch) {
                const corrected = findMatchingPOI(claimMatch[1]);
                if (!corrected) {
                    await sendServerMessage(`Invalid POI: ${claimMatch[1]}.`);
                    return res.sendStatus(204);
                }

                if (CLAIMS[corrected]) {
                    await sendServerMessage(`${corrected} is already claimed or on cooldown.`);
                    return res.sendStatus(204);
                }

                const normalizedClaimant = playerName.trim().toLowerCase();
                const claimantPlayer = sessionCache.find(p => p.name.trim().toLowerCase() === normalizedClaimant);

                // --- MODIFICATION START ---
                // All location-based and history-based checks are now inside this block
                if (!DYNAMIC_POIS.has(corrected)) {
                    if (!claimantPlayer) {
                        await sendServerMessage(`Could not verify your position. Please relog.`);
                        return res.sendStatus(204);
                    }

                    // Check claim history ONLY for non-dynamic POIs
                    if (!CLAIM_HISTORY[corrected]) CLAIM_HISTORY[corrected] = new Set();
                    if (CLAIM_HISTORY[corrected].has(normalizedClaimant)) {
                        await sendServerMessage(`${playerName}, you or your group have already claimed ${corrected} this restart.`);
                        return res.sendStatus(204);
                    }

                    // Check distance ONLY for non-dynamic POIs
                    const distSquared = Math.pow(claimantPlayer.position[0] - POI_CONFIG[corrected].position[0], 2) + Math.pow(claimantPlayer.position[1] - POI_CONFIG[corrected].position[2], 2);
                    if (distSquared > WIPE_CHECK_RADIUS_SQUARED) {
                        await sendServerMessage(`${playerName} is too far away. Move within 500m to claim.`);
                        return res.sendStatus(204);
                    }
                }
                // --- MODIFICATION END ---


                // Determine claim duration based on tier
                const claimDuration = T5_POIS.has(corrected) ? CLAIM_DURATION_T5 : CLAIM_DURATION_DEFAULT;

                const newClaim = {
                    player: normalizedClaimant,
                    displayName: playerName.trim(),
                    state: 'ACTIVE',
                    activeUntil: Date.now() + claimDuration,
                    cooldownUntil: null,
                    gracePeriodAllowed: false,
                    individualGracePeriods: {},
                    members: new Set([normalizedClaimant]),
                    displayMembers: [{
                        name: normalizedClaimant,
                        displayName: playerName.trim()
                    }],
                    timerId: setTimeout(() => {
                        // For dynamic POIs, we just delete the claim. No cooldown.
                        if (DYNAMIC_POIS.has(corrected)) {
                            delete CLAIMS[corrected];
                            sendServerMessage(`${corrected} claim has expired.`);
                        } else {
                            forceExpireAndStartCooldown(corrected);
                        }
                    }, claimDuration)
                };

                // Add nearby group members (100m from claimant)
                if (!DYNAMIC_POIS.has(corrected) && claimantPlayer) { // Grouping only for static POIs
                    for (const p of sessionCache) {
                        const normalizedMemberName = p.name.trim().toLowerCase();
                        if (normalizedMemberName === normalizedClaimant) continue;

                        // Player-to-player distance check
                        const distSquared = Math.pow(p.position[0] - claimantPlayer.position[0], 2) + Math.pow(p.position[1] - claimantPlayer.position[1], 2);

                        if (distSquared <= GROUPING_RADIUS_SQUARED) {
                            if (CLAIM_HISTORY[corrected] && CLAIM_HISTORY[corrected].has(normalizedMemberName)) {
                                console.log(`Skipping ${p.name}, they have already claimed ${corrected} this cycle.`);
                                continue;
                            }
                            newClaim.members.add(normalizedMemberName);
                            newClaim.displayMembers.push({
                                name: normalizedMemberName,
                                displayName: p.name.trim()
                            });
                            console.log(`👥 ${p.name} added to ${corrected} group.`);
                        }
                    }
                }

                CLAIMS[corrected] = newClaim;

                // Add ALL members to the claim history ONLY for non-dynamic POIs
                if (!DYNAMIC_POIS.has(corrected)) {
                    for (const memberName of newClaim.members) {
                        if (!CLAIM_HISTORY[corrected]) CLAIM_HISTORY[corrected] = new Set();
                        CLAIM_HISTORY[corrected].add(memberName);
                    }
                }

                const displayNames = newClaim.displayMembers
                    .filter(m => m.name !== normalizedClaimant)
                    .map(m => m.displayName);
                const groupMsg = displayNames.length ? ` with ${displayNames.join(", ")}` : "";

                await sendServerMessage(`${playerName} claimed ${corrected}${groupMsg}.`);
                return res.sendStatus(204);
            }

            // ✅ Unclaim handler
            const unclaimMatch = messageContent.match(CANCEL_CLAIM_REGEX);
            if (unclaimMatch) {
                const corrected = findMatchingPOI(unclaimMatch[1]);
                if (!corrected || !CLAIMS[corrected]) {
                    await sendServerMessage(
                        corrected ?
                        `${corrected} is not claimed.` :
                        `Invalid POI: ${unclaimMatch[1]}.`
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
                clearTimeout(CLAIMS[corrected].timerId); // Cancel the associated timer
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