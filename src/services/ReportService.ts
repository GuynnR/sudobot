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

import {
    APIEmbed,
    ActionRowBuilder,
    Colors,
    GuildMember,
    Interaction,
    Message,
    MessageCreateOptions,
    ModalBuilder,
    ModalSubmitInteraction,
    PermissionsBitField,
    PermissionsString,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    TextBasedChannel,
    TextInputBuilder,
    TextInputStyle,
    User
} from "discord.js";
import Service from "../core/Service";
import { GatewayEventListener } from "../decorators/GatewayEventListener";
import { HasEventListeners } from "../types/HasEventListeners";
import LevelBasedPermissionManager from "../utils/LevelBasedPermissionManager";
import { userInfo } from "../utils/embed";
import { safeChannelFetch, safeMemberFetch } from "../utils/fetch";
import { logError } from "../utils/logger";
import { TODO } from "../utils/utils";

export const name = "reportService";

type ReportOptions = {
    reason?: string;
    moderator: GuildMember;
    guildId: string;
    message?: Message;
    member?: GuildMember;
};

type Action = "ignore" | "warn" | "mute" | "kick" | "ban";

export default class ReportService extends Service implements HasEventListeners {
    async check(guildId: string, moderator: GuildMember, member: GuildMember) {
        const config = this.client.configManager.config[guildId!]?.message_reporting;
        const manager = await this.client.permissionManager.getManager(guildId!);

        if (!config?.enabled) {
            return {
                error: "Message reporting is not enabled in this server."
            };
        }

        if (
            (config.permission_level !== undefined &&
                config.permission_level > 0 &&
                this.client.permissionManager.usesLevelBasedMode(guildId!) &&
                manager instanceof LevelBasedPermissionManager &&
                manager.getPermissionLevel(moderator) < config.permission_level) ||
            !manager.getMemberPermissions(moderator).permissions.has(config.permissions as PermissionsString[], true) ||
            !moderator?.roles.cache.hasAll(...(config?.roles ?? []))
        ) {
            return {
                error: "You don't have permission to report messages."
            };
        }

        if (!this.client.permissionManager.shouldModerate(member!, moderator)) {
            return {
                error: "You're missing permissions to moderate this user!"
            };
        }

        return {
            error: null
        };
    }

    async report({ reason, moderator, guildId, member, message }: ReportOptions) {
        const config = this.client.configManager.config[guildId!]?.message_reporting;
        const { error } = await this.check(guildId, moderator, member ?? message?.member!);

        if (error) {
            return { error };
        }

        const guild = this.client.guilds.cache.get(guildId)!;

        if (config?.logging_channel) {
            const channel = await safeChannelFetch(guild, config?.logging_channel);

            if (channel?.isTextBased()) {
                await this.sendReportLog(
                    channel,
                    (message?.author ?? member?.user)!,
                    member ? "m" : "u",
                    {
                        title: `${member ? "User" : "Message"} Reported`,
                        description: message?.content,
                        fields: [
                            {
                                name: "User",
                                value: userInfo((message?.author ?? member?.user)!),
                                inline: true
                            },
                            {
                                name: "Responsible Moderator",
                                value: userInfo(moderator.user),
                                inline: true
                            },
                            {
                                name: "Reason",
                                value: reason ?? "*No reason provided*"
                            }
                        ],
                        footer: {
                            text: "Reported"
                        }
                    },
                    {
                        files: message
                            ? message.attachments.map(a => ({
                                  attachment: a.proxyURL,
                                  name: a.name,
                                  description: a.description ?? undefined
                              }))
                            : undefined
                    }
                );
            }
        }

        if (member) {
            TODO("Reporting members is not supported yet");
        } else if (message && message.deletable) {
            message.delete().catch(logError);
        }

        return {
            success: true
        };
    }

    sendReportLog(
        channel: TextBasedChannel,
        offender: User,
        type: "m" | "u",
        embedOptions?: APIEmbed,
        messageOptions?: MessageCreateOptions
    ) {
        return channel.send({
            embeds: [
                {
                    author: {
                        name: offender.username,
                        icon_url: offender.displayAvatarURL()
                    },
                    color: 0x007bff,
                    timestamp: new Date().toISOString(),
                    ...(embedOptions ?? {})
                }
            ],
            components: [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`report_action_${type}_${offender.id}`)
                        .setMinValues(1)
                        .setMaxValues(1)
                        .setPlaceholder("Select an action to take...")
                        .setOptions(
                            {
                                label: "Ignore",
                                description: "Ignore the report and take no action",
                                value: "ignore",
                                emoji: "✅"
                            },
                            {
                                label: "Warn",
                                description: "Warn the user regarding this report",
                                value: "warn",
                                emoji: "🛡️"
                            },
                            {
                                label: "Mute",
                                description: "Mutes the user",
                                value: "mute",
                                emoji: "⌚"
                            },
                            {
                                label: "Kick",
                                description: "Kicks the user from the server",
                                value: "kick",
                                emoji: "🔨"
                            },
                            {
                                label: "Ban",
                                description: "Bans the user from the server",
                                value: "ban",
                                emoji: "⚙"
                            }
                        )
                )
            ],
            ...(messageOptions ?? {})
        });
    }

    permissionCheck(action: Action, guildId: string, memberPermissions: PermissionsBitField) {
        const config = this.client.configManager.config[guildId!]?.message_reporting;
        const requiredPermissions = config?.action_required_permissions[action] as [
            PermissionsString | "or",
            ...PermissionsString[]
        ];

        if (!requiredPermissions) {
            return false;
        }

        const mode = requiredPermissions[0] === "or" ? "or" : "and";

        if (mode === "or") {
            requiredPermissions.shift();
        }

        return memberPermissions[mode === "or" ? "any" : "has"](requiredPermissions as PermissionsString[], true);
    }

    async onStringSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
        if (!interaction.values.length) {
            await interaction.deferUpdate();
            return;
        }

        const action = interaction.values[0] as Action;
        const [type, userId] = interaction.customId.split("_").slice(2);

        if (!(await this.commonChecks(action as Action, userId, interaction))) {
            return;
        }

        if (action === "ignore") {
            await interaction.message.edit({
                components: [],
                embeds: [
                    {
                        ...interaction.message.embeds[0].data,
                        fields: [
                            ...interaction.message.embeds[0].fields,
                            {
                                name: "Action",
                                value: "Ignored",
                                inline: true
                            },
                            {
                                name: "Action Taken By",
                                value: userInfo(interaction.user),
                                inline: true
                            }
                        ],
                        color: Colors.Green
                    }
                ]
            });

            await interaction.reply({
                content: "Operation completed.",
                ephemeral: true
            });

            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`report_action_info_${action}_${type}_${userId}`)
            .setTitle("Taking Action")
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("reason")
                        .setLabel("Reason")
                        .setPlaceholder("Type a reason for this action here...")
                        .setStyle(TextInputStyle.Paragraph)
                )
            );

        if (action === "ban" || action === "mute") {
            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("duration")
                        .setLabel("Duration")
                        .setPlaceholder("e.g. (10d or 24h)")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                )
            );
        }

        await interaction.showModal(modal);
    }

    async commonChecks(action: Action, userId: string, interaction: ModalSubmitInteraction | StringSelectMenuInteraction) {
        if (
            !interaction.memberPermissions ||
            !this.permissionCheck(action, interaction.guildId!, interaction.memberPermissions)
        ) {
            await interaction.reply({
                ephemeral: true,
                content: "You don't have permission to take action on reports."
            });

            return false;
        }

        const member = await safeMemberFetch(interaction.guild!, userId);

        if (!member) {
            await interaction.reply({
                content: "The member is no longer in the server!",
                ephemeral: true
            });

            return false;
        }

        const { error } = await this.check(interaction.guildId!, interaction.member! as GuildMember, member);

        if (error) {
            await interaction.reply({
                content: error,
                ephemeral: true
            });

            return false;
        }

        return true;
    }

    async onModalSubmit(interaction: ModalSubmitInteraction) {
        const [action, type, userId] = interaction.customId.split("_").slice(3);

        if (!(await this.commonChecks(action as Action, userId, interaction))) {
            return;
        }

        TODO("Not implemented");
    }

    @GatewayEventListener("interactionCreate")
    async onInteractionCreate(interaction: Interaction) {
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith("report_action_")) {
            await this.onStringSelectMenuInteraction(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith(`report_action_info_`)) {
            await this.onModalSubmit(interaction);
            return;
        }
    }
}
