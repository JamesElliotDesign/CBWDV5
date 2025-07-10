// services/poiConfig.js

/**
 * Unified POI Config
 * - position: [X, Y, Z]
 * - kickRadius: inner kick radius (m)
 * - safePos: where to teleport intruders
 */

const POI_CONFIG = {
  "Elektro Raider Outpost T1": {
    position: [10003.69, 0, 1649.64],
    kickRadius: 140,
    safePos: [7837.10, 210.56, 4474.27],
  },
  "Solenchny Raider Outpost T1": {
    position: [13599.01, 0, 6351.13],
    kickRadius: 110,
    safePos: [11865.39, 195.10, 7266.68],
  },
  "Svetloyarsk Raider Outpost T1": {
    position: [14306.86, 0, 13249.47],
    kickRadius: 150,
    safePos: [14075.10, 148.32, 15140.58],
  },
  "Klyuch Military T2": {
    position: [9289.69, 0, 13485.25],
    kickRadius: 95,
    safePos: [8343.58, 190.83, 11726.31],
  },
  "Krasno Warehouse T2": {
    position: [11871.56, 0, 12516.03],
    kickRadius: 250,
    safePos: [13422.54, 12.49, 11184.35],
  },
  "Rog Castle Military T2": {
    position: [11254.62, 0, 4279.05],
    kickRadius: 140,
    safePos: [9765.33, 283.53, 5665.03],
  },
  "Kamensk Heli Depot T3": {
    position: [7098.51, 0, 14602.93],
    kickRadius: 260,
    safePos: [6341.20, 163.98, 12798.92],
  },
  "Metalurg Hydro Dam T3": {
    position: [1260.12, 0, 6305.84],
    kickRadius: 310,
    safePos: [3106.97, 359.96, 7010.98],
  },
  "Zub Castle Military T3": {
    position: [6549.91, 0, 5593.72],
    kickRadius: 260,
    safePos: [7071.92, 44.99, 3685.40],
  },
  "Sinystok Bunker T4": {
    position: [1174.16, 0, 12327.23],
    kickRadius: 260,
    safePos: [5714.27, 273.52, 10907.29],
  },
  "Tisy Power Plant T4": {
    position: [580.93, 0, 13663.06],
    kickRadius: 260,
    safePos: [2495.62, 240.49, 12944.81],
  },
  "Yephbin Underground Facility T4": {
    position: [983.07, 0, 10213.26],
    kickRadius: 260,
    safePos: [4503.62, 282.29, 6696.22],
  },
  "Biathlon Arena T5": {
    position: [508.67, 0, 11099.16],
    kickRadius: 210,
    safePos: [5714.27, 273.52, 10907.29],
  },
  "Rostoki Castle T5": {
    position: [485.10, 0, 8551.99],
    kickRadius: 260,
    safePos: [2057.60, 163.84, 4073.04],
  },
  "Svetloyarsk Oil Rig T5": {
    position: [15029.0967, 0, 12761.8027],
    kickRadius: 260,
    safePos: [11136.09, 143.67, 10614.50],
  },
  "Solnechny Oil Rig": {
    position: [14004.10, 0, 7039.07],
    kickRadius: 250,
    safePos: [11865.39, 195.10, 7266.68],
  },
  "Weed Farm (Event)": {
    position: [9081.32, 0, 6844.29],
    kickRadius: 250,
    safePos: [3106.97, 359.96, 7010.98],
  },
  "Ghost Ship (Event)": {
    position: [15174.62, 0, 9482.87],
    kickRadius: 250,
    safePos: [3106.97, 359.96, 7010.98],
  },
  "Capital Bank (Event)": {
    position: [3750.85, 0, 5984.47],
    kickRadius: 250,
    safePos: [3106.97, 359.96, 7010.98],
  },
};

module.exports = { POI_CONFIG };