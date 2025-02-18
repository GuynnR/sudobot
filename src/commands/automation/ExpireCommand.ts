/**
 * This file is part of SudoBot.
 *
 * Copyright (C) 2021-2023 OSN Developers.
 *
 * SudoBot is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SudoBot is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with SudoBot. If not, see <https://www.gnu.org/licenses/>.
 */

import { Message, PermissionsBitField, SlashCommandBuilder, TextBasedChannel } from "discord.js";
import path from "path";
import Command, { ArgumentType, BasicCommandContext, CommandMessage, CommandReturn, ValidationRule } from "../../core/Command";
import QueueEntry from "../../utils/QueueEntry";
import { stringToTimeInterval } from "../../utils/datetime";
import { logError } from "../../utils/logger";
import { getEmojiObject, isTextableChannel } from "../../utils/utils";

export default class ExpireCommand extends Command {
    public readonly name = "expire";
    public readonly validationRules: ValidationRule[] = [
        {
            types: [ArgumentType.TimeInterval],
            number: {
                min: 1
            },
            errors: {
                "number:range:min": "Please specify a valid time interval!",
                required: "Please specify after how long the message will expire!",
                "type:invalid": "Please specify a valid time interval!"
            },
            time: {
                unit: "ms"
            },
            name: "time_interval"
        },
        {
            types: [ArgumentType.StringRest],
            optional: true,
            errors: {
                required: "Please specify a message content!",
                "type:invalid": "Please specify a valid message content!"
            },
            name: "content"
        }
    ];
    public readonly permissions = [PermissionsBitField.Flags.ManageMessages];

    public readonly description = "Sends a message and deletes it after the given timeframe.";
    public readonly argumentSyntaxes = ["<time_interval> [content]"];
    public readonly slashCommandBuilder = new SlashCommandBuilder()
        .addStringOption(option => option.setName("content").setDescription("The message content").setRequired(true))
        .addStringOption(option =>
            option
                .setName("time_interval")
                .setDescription("Specify the time after the bot should remove the message")
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("The channel where the message will be sent, defaults to the current channel")
        );

    async execute(message: CommandMessage, context: BasicCommandContext): Promise<CommandReturn> {
        await this.deferIfInteraction(message);

        let timeInterval = context.isLegacy
            ? context.parsedNamedArgs.time_interval
            : context.options.getString("time_interval", true);

        if (!context.isLegacy) {
            const { error, result } = stringToTimeInterval(timeInterval, {
                milliseconds: true
            });

            if (error) {
                await this.error(message, error);
                return;
            }

            timeInterval = result;
        }

        const content: string | undefined = context.isLegacy
            ? context.parsedNamedArgs.content
            : context.options.getString("content");
        const channel = (
            context.isLegacy ? message.channel! : context.options.getChannel("channel") ?? message.channel!
        ) as TextBasedChannel;

        if (!isTextableChannel(channel)) {
            await this.error(message, "Cannot send messages to a non-text based channel!");
            return;
        }

        try {
            const sentMessage = await message.channel!.send({
                content
            });

            await this.client.queueManager.add(
                new QueueEntry({
                    args: [channel.id, sentMessage.id],
                    client: this.client,
                    createdAt: new Date(),
                    filePath: path.resolve(__dirname, "../../queues/ExpireMessageQueue"),
                    guild: message.guild!,
                    name: "ExpireMessageQueue",
                    userId: message.member!.user.id,
                    willRunAt: new Date(Date.now() + timeInterval)
                })
            );

            if (message instanceof Message) {
                await message.react(getEmojiObject(this.client, "check") ?? "✅").catch(logError);
            } else {
                await this.success(message, "Successfully queued message deletion.");
            }
        } catch (e) {
            logError(e);
            await this.error(message, "Could not send message, make sure I have enough permissions.");
            return;
        }
    }
}
