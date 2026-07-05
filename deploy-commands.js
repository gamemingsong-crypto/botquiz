import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

function pick(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value.trim();
  }
  return "";
}

function clientIdFromToken(token) {
  try {
    return Buffer.from(token.split(".")[0], "base64url").toString("utf8");
  } catch {
    return "";
  }
}

const token = pick("DISCORD_TOKEN", "TOKEN", "BOT_TOKEN");
const clientId = pick("CLIENT_ID", "DISCORD_CLIENT_ID", "APPLICATION_ID") || clientIdFromToken(token);
const guildId = pick("GUILD_ID", "SERVER_ID");

if (!token || !clientId) {
  throw new Error("Missing DISCORD_TOKEN and CLIENT_ID in .env");
}

const rest = new REST({ version: "10" }).setToken(token);
const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

console.log(`Deploying ${commands.length} command group(s) ${guildId ? `to guild ${guildId}` : "globally"}...`);

const data = await rest.put(route, { body: commands });

console.log(`Done. Registered: ${data.map((command) => `/${command.name}`).join(", ")}`);
if (!guildId) {
  console.log("Global commands can take a while to appear. Use GUILD_ID for instant testing.");
}
