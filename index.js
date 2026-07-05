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

client.once(Events.ClientReady, (readyClient) => {
  readyClient.user.setActivity("fastest answer | /quiz ask", {
    type: ActivityType.Watching
  });
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "quiz") {
    return;
  }

  if (!interaction.guildId || !interaction.channelId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true
    });
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
  const totalPoints = await addPoint(message.guildId, message.author.id);

  await message.channel.send({
    content: `Correct! ${message.author} answered first. Answer: **${escapeMarkdown(quiz.displayAnswer)}** +1 point. Total: **${totalPoints}**`
  });
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
  const targetUser = getUserOption(interaction, "user") || interaction.user;
  const points = getPoint(interaction.guildId, targetUser.id);

  await interaction.reply({
    content: `${targetUser} has **${points}** quiz point(s).`,
    ephemeral: true
  });
}

async function handleClearPoints(interaction) {
  const removedCount = await clearGuildPoints(interaction.guildId);

  await interaction.reply({
    content: `Cleared quiz points for this server. Removed ${removedCount} player score(s).`,
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
    return parsed;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not load score file: ${error.message}`);
    }
    return { guilds: {} };
  }
}

async function saveScoreState() {
  await mkdir(dirname(scoresFile), { recursive: true });
  const tempPath = `${scoresFile}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(scoreState, null, 2)}\n`, "utf8");
  await rename(tempPath, scoresFile);
}

function getGuildScores(guildId) {
  if (!scoreState.guilds[guildId]) {
    scoreState.guilds[guildId] = {};
  }
  return scoreState.guilds[guildId];
}

async function addPoint(guildId, userId) {
  const guildScores = getGuildScores(guildId);
  guildScores[userId] = (guildScores[userId] || 0) + 1;
  await saveScoreState();
  return guildScores[userId];
}

function getPoint(guildId, userId) {
  return scoreState.guilds?.[guildId]?.[userId] || 0;
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

function getUserOption(interaction, name) {
  try {
    return interaction.options.getUser(name);
  } catch {
    return null;
  }
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
