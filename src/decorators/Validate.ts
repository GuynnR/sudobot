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

import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import type Controller from "../api/Controller";
import ValidateMiddleware from "../api/middleware/ValidateMiddleware";
import type Client from "../core/Client";

export function Validate(schema: ZodSchema) {
    return (target: Controller, propertyKey: string, descriptor: PropertyDescriptor) => {
        const metadata = Reflect.getMetadata("validation_middleware", target) ?? {};

        const middleware = (client: Client, req: Request, res: Response, next: NextFunction) =>
            ValidateMiddleware(schema, req, res, next);

        metadata[propertyKey] ??= middleware;

        Reflect.defineMetadata("validation_middleware", metadata, target);
    };
}
