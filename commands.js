import {
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
  new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Question race commands")
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
    .addSubcommand((subcommand) =>
      subcommand
        .setName("points")
        .setDescription("Check quiz points")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check. Leave empty to check yourself")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clearpoints")
        .setDescription("Clear all quiz points in this server")
    )
].map((command) => command.toJSON());
