import {
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Question race commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ask")
        .setDescription("Start a question race in this channel")
        .addStringOption((option) =>
          option
            .setName("question")
            .setDescription("Question to ask, for example: 1+1 = ?")
            .setRequired(true)
            .setMaxLength(500)
        )
        .addStringOption((option) =>
          option
            .setName("answer")
            .setDescription("Correct answer. Use | for variants, for example: 2|two|สอง")
            .setRequired(true)
            .setMaxLength(300)
        )
        .addIntegerOption((option) =>
          option
            .setName("seconds")
            .setDescription("Time limit in seconds, default 60")
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(3600)
        )
        .addStringOption((option) =>
          option
            .setName("match")
            .setDescription("How strict answer matching should be")
            .setRequired(false)
            .addChoices(
              { name: "exact", value: "exact" },
              { name: "contains", value: "contains" }
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("case_sensitive")
            .setDescription("Require exact uppercase/lowercase match")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stop")
        .setDescription("Stop the active question in this channel")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show the active question in this channel")
    )
].map((command) => command.toJSON());
