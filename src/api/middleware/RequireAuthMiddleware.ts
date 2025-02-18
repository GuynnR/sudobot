/*
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

import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type Client from "../../core/Client";
import { log } from "../../utils/logger";
import Request from "../Request";

export default async function RequireAuthMiddleware(
    client: Client,
    fetchUser: boolean = true,
    request: Request,
    response: Response,
    next: NextFunction
) {
    if (!request.headers.authorization) {
        response.status(401).json({
            error: "No authorization header found in the request"
        });

        return;
    }

    const [type, token] = request.headers.authorization.split(/\s+/);

    if (type.toLowerCase() !== "bearer") {
        response.status(401).json({
            error: "Only bearer tokens are supported"
        });

        return;
    }

    try {
        const info = jwt.verify(token, process.env.JWT_SECRET!, {
            issuer: process.env.JWT_ISSUER ?? "SudoBot",
            subject: "Temporary API token for authenticated user",
            complete: true
        });

        const payload = info.payload as {
            userId: number;
        };

        log(info, payload);

        if (!payload?.userId) {
            throw new Error("ID not found");
        }

        if (!fetchUser) {
            request.userId = payload.userId;
            next();
            return;
        }

        const user = await client.prisma.user.findFirst({
            where: {
                id: payload.userId,
                token
            }
        });

        if (!user || Date.now() > (user?.tokenExpiresAt?.getTime() ?? 0)) {
            throw new Error();
        }

        request.userId = user.id;
        request.user = user;
        next();
    } catch (e) {
        log(e);

        response.status(401).json({
            error: "Invalid API token"
        });

        return;
    }
}
