import {
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

function addQuestionOptions(command) {
  return command
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
        .setDescription("Correct answer. Use | for variants, for example: 2|two")
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
    );
}

export const commands = [
  addQuestionOptions(
    new SlashCommandBuilder()
      .setName("question")
      .setDescription("Start a fastest-answer question in this channel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  ),

  new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Question race commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      addQuestionOptions(
        subcommand
          .setName("ask")
          .setDescription("Start a fastest-answer question in this channel")
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
