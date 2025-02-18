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

import Command, { CommandReturn, ValidationRule } from "../../core/Command";

export default class AboutCommand extends Command {
    public readonly name = "about";
    public readonly validationRules: ValidationRule[] = [];
    public readonly permissions = [];
    public readonly metadata = this.client.metadata.data;

    public readonly description = "Show information about the bot";

    async execute(): Promise<CommandReturn> {
        return {
            __reply: true,
            embeds: [
                {
                    author: {
                        icon_url: this.client.user?.displayAvatarURL(),
                        name: "SudoBot"
                    },
                    description: `
                        __**A free and open source Discord moderation bot**__.\n
                        This bot is free software, and you are welcome to redistribute it under certain conditions.
                        See the [GNU Affero General Public License v3](https://www.gnu.org/licenses/agpl-3.0.en.html) for more detailed information.
                    `.replaceAll(/\n([ \t]+)/gm, "\n"),
                    color: 0x007bff,
                    fields: [
                        {
                            name: "Version",
                            value: `${this.metadata.version}`,
                            inline: true
                        },
                        {
                            name: "Source Code",
                            value: `[GitHub](${this.metadata.repository.url})`,
                            inline: true
                        },
                        {
                            name: "Licensed Under",
                            value: `[GNU Affero General Public License v3](https://www.gnu.org/licenses/agpl-3.0.en.html)`,
                            inline: true
                        },
                        {
                            name: "Author",
                            value: `[${this.metadata.author.name}](${this.metadata.author.url})`,
                            inline: true
                        },
                        {
                            name: "Support",
                            value: `rakinar2@onesoftnet.eu.org`,
                            inline: true
                        }
                    ],
                    footer: {
                        text: `Copyright © OSN Developers 2022-${new Date().getFullYear()}. All rights reserved.`
                    }
                }
            ]
        };
    }
}
