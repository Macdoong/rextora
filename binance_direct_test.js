const fs = require("fs");
const crypto = require("crypto");
const https = require("https");

function readEnv(path) {
  const raw = fs.readFileSync(path, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > -1) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = readEnv(".env.local");

const apiKey = env.BINANCE_API_KEY;
const secret = env.BINANCE_API_SECRET;
const baseUrl = env.BINANCE_FUTURES_BASE_URL || "https://fapi.binance.com";

if (!apiKey || !secret) {
  console.error("MISSING_BINANCE_KEY_OR_SECRET");
  process.exit(1);
}

const timestamp = Date.now();
const query = `timestamp=${timestamp}&recvWindow=5000`;
const signature = crypto.createHmac("sha256", secret).update(query).digest("hex");
const url = `${baseUrl}/fapi/v2/account?${query}&signature=${signature}`;

const req = https.request(url, {
  method: "GET",
  headers: {
    "X-MBX-APIKEY": apiKey
  }
}, (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    console.log("STATUS:", res.statusCode);
    console.log("BASE_URL:", baseUrl);
    console.log("TESTNET:", env.BINANCE_TESTNET);
    console.log("BODY:", data.slice(0, 1000));
  });
});

req.on("error", (err) => {
  console.error("REQUEST_ERROR:", err.message);
});

req.end();
