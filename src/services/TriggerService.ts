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
    ActionRowBuilder,
    ActivityType,
    ButtonBuilder,
    ButtonStyle,
    ClientEvents,
    GuildMember,
    Message,
    Presence,
    Snowflake
} from "discord.js";
import Service from "../core/Service";
import { GatewayEventListener } from "../decorators/GatewayEventListener";
import { HasEventListeners } from "../types/HasEventListeners";
import { TriggerType } from "../types/TriggerSchema";
import { logError } from "../utils/logger";

export const name = "triggerService";

const handlers = {
    sticky_message: "triggerMessageSticky",
    member_status_update: "triggerMemberStatusUpdate"
} satisfies Record<TriggerType["type"], Extract<keyof TriggerService, `trigger${string}`>>;

const events = {
    sticky_message: ["messageCreate"],
    member_status_update: ["presenceUpdate"]
} satisfies Record<TriggerType["type"], (keyof ClientEvents)[]>;

type TriggerHandlerContext<M extends boolean = false> = {
    message: M extends false ? Message | undefined : M extends true ? Message : never;
    member?: GuildMember;
    newPresence?: Presence;
    oldPresence?: Presence | null;
};

export default class TriggerService extends Service implements HasEventListeners {
    private readonly lastStickyMessages: Record<`${Snowflake}_${Snowflake}`, Message | undefined> = {};
    private readonly lastStickyMessageQueues: Record<`${Snowflake}_${Snowflake}`, boolean> = {};

    private config(guildId: Snowflake) {
        return this.client.configManager.config[guildId]?.auto_triggers;
    }

    @GatewayEventListener("presenceUpdate")
    onPresenceUpdate(oldPresence: Presence | null, newPresence: Presence) {
        if (newPresence?.user?.bot) {
            return false;
        }

        const config = this.config(newPresence?.guild?.id ?? "");

        if (!config?.enabled) {
            return false;
        }

        this.processTriggers(
            config.triggers,
            {
                roles: [...(newPresence?.member?.roles.cache.keys() ?? [])],
                userId: newPresence.user?.id,
                context: {
                    message: undefined,
                    oldPresence,
                    newPresence
                }
            },
            ["presenceUpdate"]
        );
    }

    onMessageCreate(message: Message<boolean>) {
        if (message.author.bot) {
            return false;
        }

        const config = this.config(message.guildId!);

        if (!config?.enabled || config?.global_disabled_channels?.includes(message.channelId!)) {
            return false;
        }

        this.processMessageTriggers(message, config.triggers);
        return true;
    }

    processTriggers(
        triggers: TriggerType[],
        data: Parameters<typeof this.processTrigger<false>>[1],
        triggerEvents: (keyof ClientEvents)[] | undefined = undefined
    ) {
        loop: for (const trigger of triggers) {
            if (triggerEvents !== undefined) {
                for (const triggerEvent of triggerEvents) {
                    if (!(events[trigger.type] as any).includes(triggerEvent)) {
                        continue loop;
                    }
                }
            }

            this.processTrigger<boolean>(trigger, data).catch(logError);
        }
    }

    processMessageTriggers(message: Message, triggers: TriggerType[]) {
        for (const trigger of triggers) {
            if (!(events[trigger.type] as any).includes("messageCreate")) {
                continue;
            }

            this.processTrigger(trigger, {
                channelId: message.channelId!,
                roles: message.member!.roles.cache.keys(),
                userId: message.author.id,
                context: {
                    message
                }
            }).catch(logError);
        }
    }

    async processTrigger<B extends true | false>(
        trigger: TriggerType,
        {
            channelId,
            roles,
            userId,
            context
        }: {
            channelId?: string;
            userId?: string;
            roles?: IterableIterator<Snowflake> | Snowflake[];
            context: TriggerHandlerContext<B>;
        }
    ) {
        if (channelId && !trigger.enabled_channels.includes(channelId)) {
            return;
        }

        if (userId && trigger.ignore_users.includes(userId)) {
            return;
        }

        if (roles) {
            for (const roleId of roles) {
                if (trigger.ignore_roles.includes(roleId)) {
                    return;
                }
            }
        }

        const callback = this[handlers[trigger.type]].bind(this);

        if (handlers[trigger.type].startsWith("triggerMessage")) {
            if (!context.message) {
                throw new Error(
                    "Attempting to call a message trigger without specifying a message object inside the context. This is an internal error."
                );
            }
        }

        if (handlers[trigger.type].startsWith("trigger")) {
            await callback(trigger as any, context as any);
        }
    }

    async triggerMemberStatusUpdate(
        trigger: Extract<TriggerType, { type: "member_status_update" }>,
        { newPresence, oldPresence }: TriggerHandlerContext<false>
    ) {
        if (!newPresence || !oldPresence || (!trigger.must_contain && !trigger.must_not_contain)) {
            return;
        }

        const oldStatus = oldPresence?.activities.find(a => a.type === ActivityType.Custom)?.state ?? "";
        const newStatus = newPresence?.activities.find(a => a.type === ActivityType.Custom)?.state ?? "";

        if (newPresence.status === "offline" || newPresence.status === "invisible") {
            return;
        }

        if (oldStatus === newStatus) {
            return;
        }

        if (trigger.must_contain) {
            for (const string of trigger.must_contain) {
                if (!newStatus.includes(string)) {
                    return;
                }
            }
        }

        if (trigger.must_not_contain) {
            for (const string of trigger.must_not_contain) {
                if (newStatus.includes(string)) {
                    return;
                }
            }
        }

        try {
            if (trigger.action === "assign_role") {
                await newPresence.member?.roles.add(trigger.roles);
            } else if (trigger.action === "take_away_role") {
                await newPresence.member?.roles.remove(trigger.roles);
            }
        } catch (e) {
            logError(e);
        }
    }

    async triggerMessageSticky(
        trigger: Extract<TriggerType, { type: "sticky_message" }>,
        { message }: TriggerHandlerContext<true>
    ) {
        if (!this.lastStickyMessageQueues[`${message.guildId!}_${message.channelId!}`]) {
            this.lastStickyMessageQueues[`${message.guildId!}_${message.channelId!}`] = true;

            setTimeout(async () => {
                const lastStickyMessage = this.lastStickyMessages[`${message.guildId!}_${message.channelId!}`];

                if (lastStickyMessage) {
                    try {
                        await lastStickyMessage.delete();
                        this.lastStickyMessages[`${message.guildId!}_${message.channelId!}`] = undefined;
                    } catch (e) {
                        logError(e);
                        return;
                    }
                }

                try {
                    const sentMessage = await message.channel.send({
                        content: trigger.message,
                        components:
                            trigger.buttons.length === 0
                                ? undefined
                                : [
                                      new ActionRowBuilder<ButtonBuilder>().addComponents(
                                          ...trigger.buttons.map(({ label, url }) =>
                                              new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label)
                                          )
                                      )
                                  ]
                    });

                    this.lastStickyMessages[`${message.guildId!}_${message.channelId!}`] = sentMessage;
                    this.lastStickyMessageQueues[`${message.guildId!}_${message.channelId!}`] = false;
                } catch (e) {
                    logError(e);
                }
            }, 2000);
        }
    }
}
