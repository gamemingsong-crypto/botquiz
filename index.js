import "dotenv/config";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ActivityType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits
} from "discord.js";

function pick(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value.trim();
  }
  return "";
}

const token = pick("DISCORD_TOKEN", "TOKEN", "BOT_TOKEN");
const scoresFile = resolve(pick("SCORES_FILE", "POINTS_FILE") || "./scores.json");

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in .env");
}

let scoreState = await loadScoreState();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const activeQuizzes = new Map();
const PRESENCE_REFRESH_MS = 5 * 60 * 1000;

function applyPresence() {
  client.user?.setActivity("fastest answer | /quiz ask", {
    type: ActivityType.Watching
  });
}

client.once(Events.ClientReady, (readyClient) => {
  applyPresence();
  setInterval(applyPresence, PRESENCE_REFRESH_MS);
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on("shardResume", applyPresence);

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (!interaction.guildId || !interaction.channelId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true
    });
    return;
  }

  if (interaction.commandName === "points" || interaction.commandName === "point") {
    await handlePoints(interaction);
    return;
  }

  if (interaction.commandName !== "quiz") {
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "points") {
    await handlePoints(interaction);
    return;
  }

  if (!canManageQuiz(interaction)) {
    await interaction.reply({
      content: "You need Manage Server or Manage Messages permission to manage questions.",
      ephemeral: true
    });
    return;
  }

  if (subcommand === "ask") {
    await handleAsk(interaction);
    return;
  }

  if (subcommand === "stop") {
    await handleStop(interaction);
    return;
  }

  if (subcommand === "status") {
    await handleStatus(interaction);
    return;
  }

  if (subcommand === "clearpoints") {
    await handleClearPoints(interaction);
    return;
  }

  if (subcommand === "winpoints") {
    await handleWinPoints(interaction);
    return;
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guildId || message.author.bot) return;

  const quiz = activeQuizzes.get(message.channelId);
  if (!quiz || quiz.guildId !== message.guildId) return;

  const normalizedMessage = normalizeAnswer(message.content, quiz.caseSensitive);
  const isCorrect = quiz.matchMode === "contains"
    ? quiz.answers.some((answer) => normalizedMessage.includes(answer))
    : quiz.answers.includes(normalizedMessage);

  if (!isCorrect) return;

  finishQuiz(message.channelId);
  const pointResult = await addPoint(message.guildId, message.author.id);

  let content = `Correct! ${message.author} answered first. Answer: **${escapeMarkdown(quiz.displayAnswer)}** +1 point. Total: **${pointResult.totalPoints}**`;
  if (pointResult.reachedWin) {
    content += `\nWinner! ${message.author} reached **${pointResult.winPoints}** points.`;
  }

  await message.channel.send({ content });
});

async function handleAsk(interaction) {
  if (activeQuizzes.has(interaction.channelId)) {
    await interaction.reply({
      content: "This channel already has an active question. Use `/quiz stop` first.",
      ephemeral: true
    });
    return;
  }

  const question = getStringOption(interaction, ["question", "prompt", "q"]);
  const answerText = getStringOption(interaction, ["answer", "answers", "correct_answer", "correct"]);

  if (!question || !answerText) {
    await interaction.reply({
      content: "Missing question or answer. Use `/quiz ask question:... answer:...`",
      ephemeral: true
    });
    return;
  }

  const matchMode = getStringOption(interaction, ["match", "mode"]) || "exact";
  const caseSensitive = getBooleanOption(interaction, ["case_sensitive", "case"]) ?? false;

  const rawAnswers = answerText
    .split("|")
    .map((answer) => answer.trim())
    .filter(Boolean);

  const answers = rawAnswers
    .map((answer) => normalizeAnswer(answer, caseSensitive))
    .filter(Boolean);

  if (answers.length === 0) {
    await interaction.reply({
      content: "Please provide at least one answer.",
      ephemeral: true
    });
    return;
  }

  activeQuizzes.set(interaction.channelId, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    question,
    answers,
    displayAnswer: rawAnswers[0],
    matchMode: matchMode === "contains" ? "contains" : "exact",
    caseSensitive
  });

  const embed = new EmbedBuilder()
    .setColor(0xffc857)
    .setTitle("Fastest Answer")
    .setDescription(question)
    .addFields(
      { name: "Match", value: matchMode === "contains" ? "contains" : "exact", inline: true }
    )
    .setFooter({ text: "Type the answer in this channel. First correct answer wins." });

  await interaction.reply({
    content: "Question started.",
    ephemeral: true
  });

  await interaction.channel.send({
    content: "@everyone",
    embeds: [embed],
    allowedMentions: { parse: ["everyone"] }
  });
}

async function handleStop(interaction) {
  const quiz = activeQuizzes.get(interaction.channelId);
  if (!quiz) {
    await interaction.reply({
      content: "No active question in this channel.",
      ephemeral: true
    });
    return;
  }

  finishQuiz(interaction.channelId);
  await interaction.reply({
    content: `Question stopped. Answer: **${escapeMarkdown(quiz.displayAnswer)}**`,
    ephemeral: false
  });
}

async function handleStatus(interaction) {
  const quiz = activeQuizzes.get(interaction.channelId);
  if (!quiz) {
    await interaction.reply({
      content: "No active question in this channel.",
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: `Active question: **${escapeMarkdown(quiz.question)}**`,
    ephemeral: true
  });
}

async function handlePoints(interaction) {
  const targetUser = getUserOption(interaction, "user");
  if (!targetUser) {
    await sendLeaderboard(interaction);
    return;
  }

  const points = getPoint(interaction.guildId, targetUser.id);

  await interaction.reply({
    content: `${targetUser} has **${points}** quiz point(s).`,
    ephemeral: true
  });
}

async function sendLeaderboard(interaction) {
  const rows = getLeaderboard(interaction.guildId);
  const winPoints = getWinPoints(interaction.guildId);

  if (rows.length === 0) {
    await interaction.reply({
      content: "No quiz points yet.",
      ephemeral: true
    });
    return;
  }

  const header = winPoints
    ? `Quiz points. Win target: **${winPoints}** point(s).`
    : "Quiz points.";
  const lines = rows.map(([userId, points], index) =>
    `${index + 1}. <@${userId}> - **${points}** point(s)`
  );
  const chunks = chunkLines([header, "", ...lines], 1900);

  await interaction.reply({
    content: chunks.shift(),
    allowedMentions: { users: [] }
  });

  for (const chunk of chunks) {
    await interaction.followUp({
      content: chunk,
      allowedMentions: { users: [] }
    });
  }
}

async function handleClearPoints(interaction) {
  const removedCount = await clearGuildPoints(interaction.guildId);

  await interaction.reply({
    content: `Cleared quiz points for this server. Removed ${removedCount} player score(s).`,
    ephemeral: false
  });
}

async function handleWinPoints(interaction) {
  const points = getIntegerOption(interaction, "points");
  const nextValue = Number.isInteger(points) ? points : 0;
  await setWinPoints(interaction.guildId, nextValue);

  await interaction.reply({
    content: nextValue > 0
      ? `Winner announcement target set to **${nextValue}** point(s).`
      : "Winner announcement target disabled.",
    ephemeral: false
  });
}

function finishQuiz(channelId) {
  activeQuizzes.delete(channelId);
}

async function loadScoreState() {
  try {
    const raw = await readFile(scoresFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.guilds || typeof parsed.guilds !== "object") {
      parsed.guilds = {};
    }
    if (!parsed.settings || typeof parsed.settings !== "object") {
      parsed.settings = {};
    }
    return parsed;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not load score file: ${error.message}`);
    }
    return { guilds: {}, settings: {} };
  }
}

async function saveScoreState() {
  await mkdir(dirname(scoresFile), { recursive: true });
  const tempPath = `${scoresFile}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(scoreState, null, 2)}\n`, "utf8");
  await rename(tempPath, scoresFile);
}

function getGuildScores(guildId) {
  if (!scoreState.guilds || typeof scoreState.guilds !== "object") {
    scoreState.guilds = {};
  }
  if (!scoreState.guilds[guildId]) {
    scoreState.guilds[guildId] = {};
  }
  return scoreState.guilds[guildId];
}

function getGuildSettings(guildId) {
  if (!scoreState.settings || typeof scoreState.settings !== "object") {
    scoreState.settings = {};
  }
  if (!scoreState.settings[guildId]) {
    scoreState.settings[guildId] = {};
  }
  return scoreState.settings[guildId];
}

async function addPoint(guildId, userId) {
  const guildScores = getGuildScores(guildId);
  const previousPoints = guildScores[userId] || 0;
  const totalPoints = previousPoints + 1;
  guildScores[userId] = totalPoints;
  await saveScoreState();

  const winPoints = getWinPoints(guildId);
  return {
    previousPoints,
    totalPoints,
    winPoints,
    reachedWin: Boolean(winPoints && previousPoints < winPoints && totalPoints >= winPoints)
  };
}

function getPoint(guildId, userId) {
  return scoreState.guilds?.[guildId]?.[userId] || 0;
}

function getLeaderboard(guildId) {
  const guildScores = scoreState.guilds?.[guildId] || {};
  return Object.entries(guildScores)
    .filter(([, points]) => Number(points) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]));
}

function getWinPoints(guildId) {
  const value = Number(scoreState.settings?.[guildId]?.winPoints || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function setWinPoints(guildId, points) {
  const settings = getGuildSettings(guildId);
  if (points > 0) {
    settings.winPoints = points;
  } else {
    delete settings.winPoints;
  }
  await saveScoreState();
}

async function clearGuildPoints(guildId) {
  const guildScores = getGuildScores(guildId);
  const removedCount = Object.keys(guildScores).length;
  scoreState.guilds[guildId] = {};
  await saveScoreState();
  return removedCount;
}

function getStringOption(interaction, names) {
  for (const name of names) {
    try {
      const value = interaction.options.getString(name);
      if (value?.trim()) return value.trim();
    } catch {
      // Ignore stale command schemas with different option names.
    }
  }
  return "";
}

function getBooleanOption(interaction, names) {
  for (const name of names) {
    try {
      const value = interaction.options.getBoolean(name);
      if (typeof value === "boolean") return value;
    } catch {
      // Ignore stale command schemas with different option names.
    }
  }
  return null;
}

function getIntegerOption(interaction, name) {
  try {
    return interaction.options.getInteger(name);
  } catch {
    return null;
  }
}

function getUserOption(interaction, name) {
  try {
    return interaction.options.getUser(name);
  } catch {
    return null;
  }
}

function chunkLines(lines, maxLength) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function normalizeAnswer(value, caseSensitive) {
  let text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!caseSensitive) {
    text = text.toLocaleLowerCase();
  }

  return text;
}

function canManageQuiz(interaction) {
  if (interaction.guild?.ownerId === interaction.user.id) return true;

  const permissions = interaction.memberPermissions;
  return Boolean(
    permissions?.has(PermissionFlagsBits.ManageGuild) ||
    permissions?.has(PermissionFlagsBits.ManageMessages)
  );
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

process.on("SIGINT", () => {
  process.exit(0);
});

client.login(token);
