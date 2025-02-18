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

import { log } from "console";
import { Message } from "discord.js";
import EventListener from "../../core/EventListener";
import { Events } from "../../types/ClientEvents";
import { logError } from "../../utils/logger";

export default class MessageUpdateEvent extends EventListener<Events.MessageUpdate> {
    public readonly name = Events.MessageUpdate;

    async execute(oldMessage: Message, newMessage: Message) {
        if (newMessage.author.bot) {
            return;
        }

        super.execute(oldMessage, newMessage);

        if (oldMessage.content === newMessage.content) return;

        await this.client.logger.logMessageEdit(oldMessage, newMessage);
        let deleted = await this.client.messageFilter.scanMessage(newMessage).catch(logError);

        if (deleted) {
            return;
        }

        deleted = await this.client.messageRuleService.onMessageCreate(newMessage).catch(logError);

        if (deleted) {
            return;
        }

        if (this.client.configManager.config[newMessage.guildId!]?.commands.rerun_on_edit) {
            const value = await this.client.commandManager.runCommandFromMessage(newMessage).catch(logError);

            if (value === false) {
                log("Command or snippet not found: all strategies failed");
            }
        }
    }
}
