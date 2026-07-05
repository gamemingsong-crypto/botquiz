import "dotenv/config";
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

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in .env");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const activeQuizzes = new Map();

client.once(Events.ClientReady, (readyClient) => {
  readyClient.user.setActivity("ตอบคำถามไวสุด | /quiz ask", {
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
      content: "คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น",
      ephemeral: true
    });
    return;
  }

  if (!canManageQuiz(interaction)) {
    await interaction.reply({
      content: "ต้องมีสิทธิ์ Manage Server หรือ Manage Messages เพื่อจัดการคำถาม",
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

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

  const elapsedMs = Date.now() - quiz.startedAt;
  const elapsedText = `${(elapsedMs / 1000).toFixed(2)}s`;

  await message.channel.send({
    content: `✅ ${message.author} ตอบถูกและไวสุด! คำตอบคือ **${escapeMarkdown(quiz.displayAnswer)}** ใช้เวลา **${elapsedText}**`
  });
});

async function handleAsk(interaction) {
  if (activeQuizzes.has(interaction.channelId)) {
    await interaction.reply({
      content: "ห้องนี้มีคำถามที่ยังไม่จบอยู่ ใช้ `/quiz stop` ก่อน",
      ephemeral: true
    });
    return;
  }

  const question = interaction.options.getString("question", true).trim();
  const answerText = interaction.options.getString("answer", true).trim();
  const seconds = interaction.options.getInteger("seconds") ?? 60;
  const matchMode = interaction.options.getString("match") ?? "exact";
  const caseSensitive = interaction.options.getBoolean("case_sensitive") ?? false;

  const rawAnswers = answerText
    .split("|")
    .map((answer) => answer.trim())
    .filter(Boolean);

  const answers = rawAnswers
    .map((answer) => normalizeAnswer(answer, caseSensitive))
    .filter(Boolean);

  if (answers.length === 0) {
    await interaction.reply({
      content: "ต้องใส่คำตอบอย่างน้อย 1 คำตอบ",
      ephemeral: true
    });
    return;
  }

  const expiresAt = Date.now() + seconds * 1000;
  const timeout = setTimeout(() => timeoutQuiz(interaction.channelId), seconds * 1000);

  activeQuizzes.set(interaction.channelId, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    question,
    answers,
    displayAnswer: rawAnswers[0],
    matchMode,
    caseSensitive,
    startedAt: Date.now(),
    expiresAt,
    timeout
  });

  const embed = new EmbedBuilder()
    .setColor(0xffc857)
    .setTitle("คำถามชิงตอบไว")
    .setDescription(question)
    .addFields(
      { name: "เวลา", value: `${seconds} วินาที`, inline: true },
      { name: "การตรวจคำตอบ", value: matchMode, inline: true }
    )
    .setFooter({ text: "พิมพ์คำตอบในแชทนี้ ใครถูกก่อนชนะ" });

  await interaction.reply({
    content: "เริ่มคำถามแล้ว",
    ephemeral: true
  });

  await interaction.channel.send({ embeds: [embed] });
}

async function handleStop(interaction) {
  const quiz = activeQuizzes.get(interaction.channelId);
  if (!quiz) {
    await interaction.reply({
      content: "ห้องนี้ไม่มีคำถามที่กำลังรันอยู่",
      ephemeral: true
    });
    return;
  }

  finishQuiz(interaction.channelId);
  await interaction.reply({
    content: `หยุดคำถามแล้ว คำตอบคือ **${escapeMarkdown(quiz.displayAnswer)}**`,
    ephemeral: false
  });
}

async function handleStatus(interaction) {
  const quiz = activeQuizzes.get(interaction.channelId);
  if (!quiz) {
    await interaction.reply({
      content: "ห้องนี้ไม่มีคำถามที่กำลังรันอยู่",
      ephemeral: true
    });
    return;
  }

  const remainingSeconds = Math.max(0, Math.ceil((quiz.expiresAt - Date.now()) / 1000));
  await interaction.reply({
    content: `คำถามที่กำลังรัน: **${escapeMarkdown(quiz.question)}**\nเหลือเวลา ${remainingSeconds} วินาที`,
    ephemeral: true
  });
}

async function timeoutQuiz(channelId) {
  const quiz = activeQuizzes.get(channelId);
  if (!quiz) return;

  finishQuiz(channelId);

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(`⏰ หมดเวลา! ไม่มีใครตอบถูก คำตอบคือ **${escapeMarkdown(quiz.displayAnswer)}**`);
  }
}

function finishQuiz(channelId) {
  const quiz = activeQuizzes.get(channelId);
  if (!quiz) return;

  clearTimeout(quiz.timeout);
  activeQuizzes.delete(channelId);
}

function normalizeAnswer(value, caseSensitive) {
  let text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?。！？]+$/g, "")
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
  for (const quiz of activeQuizzes.values()) {
    clearTimeout(quiz.timeout);
  }
  process.exit(0);
});

client.login(token);
