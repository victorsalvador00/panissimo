/**
 * Generado por `npm run api:types` desde /openapi/v1.json. No editar a mano.
 */

export interface paths {
    "/api/v1/adjustments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    From?: string;
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Reason?: components["schemas"]["AdjustmentReason"];
                    Skip?: number;
                    Sort?: string;
                    To?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfAdjustmentListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfAdjustmentListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfAdjustmentListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crea el ajuste y lo registra de inmediato. Corrección admite entradas y salidas; merma, caducado,
         *     dañado y uso interno solo salidas. Sin existencia suficiente responde 409 insufficient_stock y no registra nada.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateAdjustmentRequest"];
                    "application/json": components["schemas"]["CreateAdjustmentRequest"];
                    "text/json": components["schemas"]["CreateAdjustmentRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdjustmentDto"];
                        "text/json": components["schemas"]["AdjustmentDto"];
                        "text/plain": components["schemas"]["AdjustmentDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/adjustments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdjustmentDto"];
                        "text/json": components["schemas"]["AdjustmentDto"];
                        "text/plain": components["schemas"]["AdjustmentDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Stock bajo y lotes por caducar (o ya vencidos) en tus ubicaciones. */
        get: {
            parameters: {
                query?: {
                    locationId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AlertsDto"];
                        "text/json": components["schemas"]["AlertsDto"];
                        "text/plain": components["schemas"]["AlertsDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/audit-log": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bitácora de cambios, del más reciente al más antiguo. Filtros: entityType, entityId, userId, from, to. */
        get: {
            parameters: {
                query?: {
                    EntityId?: string;
                    EntityType?: string;
                    From?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    To?: string;
                    UserId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfAuditLogDto"];
                        "text/json": components["schemas"]["PagedResultOfAuditLogDto"];
                        "text/plain": components["schemas"]["PagedResultOfAuditLogDto"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Inicia sesión. Devuelve el access token y deja el refresh token en una cookie HttpOnly. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["LoginRequest"];
                    "application/json": components["schemas"]["LoginRequest"];
                    "text/json": components["schemas"]["LoginRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TokenResponse"];
                        "text/json": components["schemas"]["TokenResponse"];
                        "text/plain": components["schemas"]["TokenResponse"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Too Many Requests */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cierra la sesión: revoca el refresh token y borra la cookie. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rota el refresh token de la cookie y devuelve un nuevo access token. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TokenResponse"];
                        "text/json": components["schemas"]["TokenResponse"];
                        "text/plain": components["schemas"]["TokenResponse"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branch-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Pedidos cuya sucursal u origen está a tu alcance. Filtros: status, requestingLocationId, supplyingLocationId, locationId, q. */
        get: {
            parameters: {
                query?: {
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    RequestingLocationId?: string;
                    Skip?: number;
                    Sort?: string;
                    Status?: components["schemas"]["BranchOrderStatus"];
                    SupplyingLocationId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfBranchOrderListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfBranchOrderListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfBranchOrderListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Crea un pedido en borrador de una sucursal a la fábrica o al comisariato. Cantidades en unidad base. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateBranchOrderRequest"];
                    "application/json": components["schemas"]["CreateBranchOrderRequest"];
                    "text/json": components["schemas"]["CreateBranchOrderRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BranchOrderDto"];
                        "text/json": components["schemas"]["BranchOrderDto"];
                        "text/plain": components["schemas"]["BranchOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branch-orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BranchOrderDto"];
                        "text/json": components["schemas"]["BranchOrderDto"];
                        "text/plain": components["schemas"]["BranchOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateBranchOrderRequest"];
                    "application/json": components["schemas"]["UpdateBranchOrderRequest"];
                    "text/json": components["schemas"]["UpdateBranchOrderRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BranchOrderDto"];
                        "text/json": components["schemas"]["BranchOrderDto"];
                        "text/plain": components["schemas"]["BranchOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branch-orders/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** El origen aprueba con la cantidad de cada línea (0 a lo solicitado) y se crea el traspaso en borrador con lo aprobado (RN-20). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["ApproveBranchOrderRequest"];
                    "application/json": components["schemas"]["ApproveBranchOrderRequest"];
                    "text/json": components["schemas"]["ApproveBranchOrderRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BranchOrderDto"];
                        "text/json": components["schemas"]["BranchOrderDto"];
                        "text/plain": components["schemas"]["BranchOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branch-orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancela un pedido en borrador o enviado. Uno aprobado se cancela cancelando su traspaso en borrador. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BranchOrderDto"];
                        "text/json": components["schemas"]["BranchOrderDto"];
                        "text/plain": components["schemas"]["BranchOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branch-orders/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["RejectBranchOrderRequest"];
                    "application/json": components["schemas"]["RejectBranchOrderRequest"];
                    "text/json": components["schemas"]["RejectBranchOrderRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BranchOrderDto"];
                        "text/json": components["schemas"]["BranchOrderDto"];
                        "text/plain": components["schemas"]["BranchOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branch-orders/{id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BranchOrderDto"];
                        "text/json": components["schemas"]["BranchOrderDto"];
                        "text/plain": components["schemas"]["BranchOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branch-orders/suggestion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Sugerido por mín/máx de la sucursal: proyectado = existencia + en tránsito + pedidos pendientes; si es ≤ mínimo,
         *     sugiere máximo − proyectado (unidad base).
         */
        get: {
            parameters: {
                query?: {
                    locationId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BranchOrderSuggestionDto"][];
                        "text/json": components["schemas"]["BranchOrderSuggestionDto"][];
                        "text/plain": components["schemas"]["BranchOrderSuggestionDto"][];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/consumptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    From?: string;
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    To?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfConsumptionListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfConsumptionListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfConsumptionListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Registra el consumo de una sucursal y lo descuenta de inmediato (FEFO si no se indica lote). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateConsumptionRequest"];
                    "application/json": components["schemas"]["CreateConsumptionRequest"];
                    "text/json": components["schemas"]["CreateConsumptionRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ConsumptionDto"];
                        "text/json": components["schemas"]["ConsumptionDto"];
                        "text/plain": components["schemas"]["ConsumptionDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/consumptions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ConsumptionDto"];
                        "text/json": components["schemas"]["ConsumptionDto"];
                        "text/plain": components["schemas"]["ConsumptionDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/dashboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Contadores del tablero para la ubicación indicada, o para todas las de tu alcance si no se indica.
         *     Cada bloque llega en null si no tienes el permiso correspondiente.
         */
        get: {
            parameters: {
                query?: {
                    locationId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DashboardDto"];
                        "text/json": components["schemas"]["DashboardDto"];
                        "text/plain": components["schemas"]["DashboardDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/goods-receipts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Recepciones en ubicaciones a tu alcance. Filtros: purchaseOrderId, supplierId, locationId, from, to, q (folio o factura). */
        get: {
            parameters: {
                query?: {
                    From?: string;
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    PurchaseOrderId?: string;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    SupplierId?: string;
                    To?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfGoodsReceiptListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfGoodsReceiptListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfGoodsReceiptListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Recibe (total o parcialmente) una OC aprobada: registra la entrada al inventario al costo de la OC (RN-33).
         *     Una línea de la OC puede repetirse para recibirla en varios lotes. La sobre-recepción se limita a la tolerancia (RN-32).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateGoodsReceiptRequest"];
                    "application/json": components["schemas"]["CreateGoodsReceiptRequest"];
                    "text/json": components["schemas"]["CreateGoodsReceiptRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GoodsReceiptDto"];
                        "text/json": components["schemas"]["GoodsReceiptDto"];
                        "text/plain": components["schemas"]["GoodsReceiptDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/goods-receipts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GoodsReceiptDto"];
                        "text/json": components["schemas"]["GoodsReceiptDto"];
                        "text/plain": components["schemas"]["GoodsReceiptDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imports/initial-stock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Carga existencias iniciales desde CSV UTF-8: ubicacion, sku, cantidad, costo_unitario (obligatorias); lote,
         *     caducidad (artículos con lotes). Genera un ajuste por ubicación. Con errores responde 400 con rowErrors y no importa nada.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        file?: components["schemas"]["IFormFile"];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InitialStockImportResult"];
                        "text/json": components["schemas"]["InitialStockImportResult"];
                        "text/plain": components["schemas"]["InitialStockImportResult"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imports/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Importa artículos desde CSV UTF-8 (separador , o ;). Columnas: sku, nombre, tipo, categoria, unidad_base
         *     (obligatorias); unidad_compra, factor_compra, maneja_lotes, vida_util_dias, almacenamiento, iva (opcionales).
         *     Si alguna fila tiene errores responde 400 con rowErrors y no importa nada. Un SKU existente se actualiza.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        file?: components["schemas"]["IFormFile"];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemImportResult"];
                        "text/json": components["schemas"]["ItemImportResult"];
                        "text/plain": components["schemas"]["ItemImportResult"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/item-categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Categorías de artículo. Activas por defecto; includeInactive=true para ver todas. También con inventory.view:
         *     los conteos físicos parciales se hacen por categoría.
         */
        get: {
            parameters: {
                query?: {
                    IncludeInactive?: boolean;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfItemCategoryDto"];
                        "text/json": components["schemas"]["PagedResultOfItemCategoryDto"];
                        "text/plain": components["schemas"]["PagedResultOfItemCategoryDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateItemCategoryRequest"];
                    "application/json": components["schemas"]["CreateItemCategoryRequest"];
                    "text/json": components["schemas"]["CreateItemCategoryRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemCategoryDto"];
                        "text/json": components["schemas"]["ItemCategoryDto"];
                        "text/plain": components["schemas"]["ItemCategoryDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/item-categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemCategoryDto"];
                        "text/json": components["schemas"]["ItemCategoryDto"];
                        "text/plain": components["schemas"]["ItemCategoryDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita el nombre o activa/desactiva la categoría. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateItemCategoryRequest"];
                    "application/json": components["schemas"]["UpdateItemCategoryRequest"];
                    "text/json": components["schemas"]["UpdateItemCategoryRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemCategoryDto"];
                        "text/json": components["schemas"]["ItemCategoryDto"];
                        "text/plain": components["schemas"]["ItemCategoryDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Artículos. Filtros: q (SKU o nombre), type, categoryId, includeInactive. */
        get: {
            parameters: {
                query?: {
                    CategoryId?: string;
                    IncludeInactive?: boolean;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    Type?: components["schemas"]["ItemType"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfItemListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfItemListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfItemListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateItemRequest"];
                    "application/json": components["schemas"]["CreateItemRequest"];
                    "text/json": components["schemas"]["CreateItemRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemDto"];
                        "text/json": components["schemas"]["ItemDto"];
                        "text/plain": components["schemas"]["ItemDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/items/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemDto"];
                        "text/json": components["schemas"]["ItemDto"];
                        "text/plain": components["schemas"]["ItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateItemRequest"];
                    "application/json": components["schemas"]["UpdateItemRequest"];
                    "text/json": components["schemas"]["UpdateItemRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemDto"];
                        "text/json": components["schemas"]["ItemDto"];
                        "text/plain": components["schemas"]["ItemDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/items/{id}/location-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Mínimo y máximo (unidad base) del artículo en cada ubicación a tu alcance. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemLocationSettingDto"][];
                        "text/json": components["schemas"]["ItemLocationSettingDto"][];
                        "text/plain": components["schemas"]["ItemLocationSettingDto"][];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Guarda mínimo y máximo por ubicación. Mínimo y máximo vacíos quitan la configuración de esa ubicación. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateItemLocationSettingsRequest"];
                    "application/json": components["schemas"]["UpdateItemLocationSettingsRequest"];
                    "text/json": components["schemas"]["UpdateItemLocationSettingsRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemLocationSettingDto"][];
                        "text/json": components["schemas"]["ItemLocationSettingDto"][];
                        "text/plain": components["schemas"]["ItemLocationSettingDto"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/items/{id}/supplier-offers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Proveedores activos que venden el artículo, con precio por unidad de compra (sin IVA) y días de entrega;
         *     primero el preferido y luego por precio. Trae la unidad de compra del artículo (para capturar requisiciones).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemSupplierOffersDto"];
                        "text/json": components["schemas"]["ItemSupplierOffersDto"];
                        "text/plain": components["schemas"]["ItemSupplierOffersDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/items/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Búsqueda ligera de artículos activos (SKU o nombre) para los selectores de inventario, logística,
         *     producción y compras. No exige catalog.view: basta ver alguno de esos módulos.
         */
        get: {
            parameters: {
                query?: {
                    Id?: string;
                    Limit?: number;
                    Q?: string;
                    Type?: components["schemas"]["ItemType"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ItemLookupDto"][];
                        "text/json": components["schemas"]["ItemLookupDto"][];
                        "text/plain": components["schemas"]["ItemLookupDto"][];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/locations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ubicaciones a las que tienes acceso. Activas por defecto; includeInactive=true para ver todas. */
        get: {
            parameters: {
                query?: {
                    IncludeInactive?: boolean;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    Type?: components["schemas"]["LocationType"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfLocationDto"];
                        "text/json": components["schemas"]["PagedResultOfLocationDto"];
                        "text/plain": components["schemas"]["PagedResultOfLocationDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Da de alta una ubicación (sucursal, fábrica o comisariato). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateLocationRequest"];
                    "application/json": components["schemas"]["CreateLocationRequest"];
                    "text/json": components["schemas"]["CreateLocationRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LocationDto"];
                        "text/json": components["schemas"]["LocationDto"];
                        "text/plain": components["schemas"]["LocationDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/locations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LocationDto"];
                        "text/json": components["schemas"]["LocationDto"];
                        "text/plain": components["schemas"]["LocationDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita nombre, dirección y estado. El código y el tipo no cambian. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateLocationRequest"];
                    "application/json": components["schemas"]["UpdateLocationRequest"];
                    "text/json": components["schemas"]["UpdateLocationRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LocationDto"];
                        "text/json": components["schemas"]["LocationDto"];
                        "text/plain": components["schemas"]["LocationDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/locations/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ubicaciones activas (todas, no solo las tuyas) para elegir el destino de un traspaso. No exige locations.view:
         *     basta logistics.view.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LocationLookupDto"][];
                        "text/json": components["schemas"]["LocationLookupDto"][];
                        "text/plain": components["schemas"]["LocationLookupDto"][];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Usuario actual, permisos efectivos y ubicaciones permitidas. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MeDto"];
                        "text/json": components["schemas"]["MeDto"];
                        "text/plain": components["schemas"]["MeDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/change-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cambia la contraseña. Por seguridad cierra todas las sesiones: hay que volver a iniciar sesión. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["ChangePasswordRequest"];
                    "application/json": components["schemas"]["ChangePasswordRequest"];
                    "text/json": components["schemas"]["ChangePasswordRequest"];
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/movements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kardex paginado, del más reciente al más antiguo. Con locationId e itemId incluye el saldo acumulado. */
        get: {
            parameters: {
                query?: {
                    From?: string;
                    ItemId?: string;
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    To?: string;
                    Type?: components["schemas"]["MovementType"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfKardexEntryDto"];
                        "text/json": components["schemas"]["PagedResultOfKardexEntryDto"];
                        "text/plain": components["schemas"]["PagedResultOfKardexEntryDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Catálogo fijo de permisos, agrupado por módulo. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PermissionGroupDto"][];
                        "text/json": components["schemas"]["PermissionGroupDto"][];
                        "text/plain": components["schemas"]["PermissionGroupDto"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/physical-counts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    Status?: components["schemas"]["PhysicalCountStatus"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfPhysicalCountListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfPhysicalCountListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfPhysicalCountListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Crea un conteo en borrador. Con categoryId es un conteo parcial de esa categoría. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreatePhysicalCountRequest"];
                    "application/json": components["schemas"]["CreatePhysicalCountRequest"];
                    "text/json": components["schemas"]["CreatePhysicalCountRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PhysicalCountDto"];
                        "text/json": components["schemas"]["PhysicalCountDto"];
                        "text/plain": components["schemas"]["PhysicalCountDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/physical-counts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PhysicalCountDto"];
                        "text/json": components["schemas"]["PhysicalCountDto"];
                        "text/plain": components["schemas"]["PhysicalCountDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** En borrador: categoría y notas. En curso: notas y cantidades contadas (lineId, o itemId/lote para agregar una línea). */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdatePhysicalCountRequest"];
                    "application/json": components["schemas"]["UpdatePhysicalCountRequest"];
                    "text/json": components["schemas"]["UpdatePhysicalCountRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PhysicalCountDto"];
                        "text/json": components["schemas"]["PhysicalCountDto"];
                        "text/plain": components["schemas"]["PhysicalCountDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/physical-counts/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PhysicalCountDto"];
                        "text/json": components["schemas"]["PhysicalCountDto"];
                        "text/plain": components["schemas"]["PhysicalCountDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/physical-counts/{id}/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cierra el conteo y registra la diferencia contado − snapshot de cada línea. Todas las líneas deben estar contadas. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PhysicalCountDto"];
                        "text/json": components["schemas"]["PhysicalCountDto"];
                        "text/plain": components["schemas"]["PhysicalCountDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/physical-counts/{id}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Inicia el conteo y toma el snapshot de existencias (RN-06). Solo un conteo en curso por ubicación. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PhysicalCountDto"];
                        "text/json": components["schemas"]["PhysicalCountDto"];
                        "text/plain": components["schemas"]["PhysicalCountDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/production-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Órdenes de producción de tus ubicaciones. Filtros: locationId, status, outputItemId, from, to (fecha programada), q. */
        get: {
            parameters: {
                query?: {
                    From?: string;
                    LocationId?: string;
                    OutputItemId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    Status?: components["schemas"]["ProductionOrderStatus"];
                    To?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfProductionOrderListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfProductionOrderListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfProductionOrderListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Crea la orden en borrador con la receta activa del producto (queda fija esa versión). Solo fábrica o comisariato. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateProductionOrderRequest"];
                    "application/json": components["schemas"]["CreateProductionOrderRequest"];
                    "text/json": components["schemas"]["CreateProductionOrderRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductionOrderDto"];
                        "text/json": components["schemas"]["ProductionOrderDto"];
                        "text/plain": components["schemas"]["ProductionOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/production-orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductionOrderDto"];
                        "text/json": components["schemas"]["ProductionOrderDto"];
                        "text/plain": components["schemas"]["ProductionOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita cantidad planeada, fecha y notas de una orden en borrador (recalcula el consumo teórico). */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateProductionOrderRequest"];
                    "application/json": components["schemas"]["UpdateProductionOrderRequest"];
                    "text/json": components["schemas"]["UpdateProductionOrderRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductionOrderDto"];
                        "text/json": components["schemas"]["ProductionOrderDto"];
                        "text/plain": components["schemas"]["ProductionOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/production-orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductionOrderDto"];
                        "text/json": components["schemas"]["ProductionOrderDto"];
                        "text/plain": components["schemas"]["ProductionOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/production-orders/{id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Completa la orden en una sola transacción (RN-12): consume componentes por el consumo real (FEFO o lotes elegidos),
         *     da entrada al producto con lote = folio y caducidad = hoy + vida útil, y calcula su costo unitario.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CompleteProductionOrderRequest"];
                    "application/json": components["schemas"]["CompleteProductionOrderRequest"];
                    "text/json": components["schemas"]["CompleteProductionOrderRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductionOrderDto"];
                        "text/json": components["schemas"]["ProductionOrderDto"];
                        "text/plain": components["schemas"]["ProductionOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/production-orders/{id}/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductionOrderDto"];
                        "text/json": components["schemas"]["ProductionOrderDto"];
                        "text/plain": components["schemas"]["ProductionOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/purchase-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * OC con entrega en ubicaciones a tu alcance. Filtros: status, supplierId, locationId, q (folio o proveedor) y
         *     pendingReceipt=true (aprobadas o parcialmente recibidas: las que se pueden recibir).
         */
        get: {
            parameters: {
                query?: {
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    PendingReceipt?: boolean;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    Status?: components["schemas"]["PurchaseOrderStatus"];
                    SupplierId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfPurchaseOrderListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfPurchaseOrderListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfPurchaseOrderListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crea una OC en borrador con entrega en fábrica o comisariato. Solo artículos del catálogo activo del proveedor;
         *     precio vacío = precio del catálogo (RN-30). Cantidades y precios en unidad de compra, sin IVA.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreatePurchaseOrderRequest"];
                    "application/json": components["schemas"]["CreatePurchaseOrderRequest"];
                    "text/json": components["schemas"]["CreatePurchaseOrderRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderDto"];
                        "text/json": components["schemas"]["PurchaseOrderDto"];
                        "text/plain": components["schemas"]["PurchaseOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/purchase-orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderDto"];
                        "text/json": components["schemas"]["PurchaseOrderDto"];
                        "text/plain": components["schemas"]["PurchaseOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita una OC en borrador. Las líneas que conservan su lineId mantienen su liga con la requisición. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdatePurchaseOrderRequest"];
                    "application/json": components["schemas"]["UpdatePurchaseOrderRequest"];
                    "text/json": components["schemas"]["UpdatePurchaseOrderRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderDto"];
                        "text/json": components["schemas"]["PurchaseOrderDto"];
                        "text/plain": components["schemas"]["PurchaseOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/purchase-orders/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderDto"];
                        "text/json": components["schemas"]["PurchaseOrderDto"];
                        "text/plain": components["schemas"]["PurchaseOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/purchase-orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancela una OC en borrador, pendiente o aprobada sin nada recibido. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderDto"];
                        "text/json": components["schemas"]["PurchaseOrderDto"];
                        "text/plain": components["schemas"]["PurchaseOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/purchase-orders/{id}/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cierra una OC parcialmente recibida, abandonando el saldo pendiente (RN-32). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderDto"];
                        "text/json": components["schemas"]["PurchaseOrderDto"];
                        "text/plain": components["schemas"]["PurchaseOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/purchase-orders/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rechaza una OC pendiente de aprobación, con motivo. El rechazo es final. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["RejectPurchaseOrderRequest"];
                    "application/json": components["schemas"]["RejectPurchaseOrderRequest"];
                    "text/json": components["schemas"]["RejectPurchaseOrderRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderDto"];
                        "text/json": components["schemas"]["PurchaseOrderDto"];
                        "text/plain": components["schemas"]["PurchaseOrderDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/purchase-orders/{id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Envía la OC: si el subtotal sin IVA alcanza el umbral configurado queda pendiente de aprobación; si no, aprobada (RN-31). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderDto"];
                        "text/json": components["schemas"]["PurchaseOrderDto"];
                        "text/plain": components["schemas"]["PurchaseOrderDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/recipes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Recetas activas; includeInactive=true incluye versiones anteriores. Filtros: outputItemId, q. */
        get: {
            parameters: {
                query?: {
                    IncludeInactive?: boolean;
                    OutputItemId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfRecipeListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfRecipeListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfRecipeListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Crea la receta (versión 1) de un intermedio o terminado. Solo puede haber una activa por artículo (RN-10). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateRecipeRequest"];
                    "application/json": components["schemas"]["CreateRecipeRequest"];
                    "text/json": components["schemas"]["CreateRecipeRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RecipeDto"];
                        "text/json": components["schemas"]["RecipeDto"];
                        "text/plain": components["schemas"]["RecipeDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/recipes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RecipeDto"];
                        "text/json": components["schemas"]["RecipeDto"];
                        "text/plain": components["schemas"]["RecipeDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /**
         * Edita la versión activa. Si ya fue usada en una orden de producción crea la versión N+1 (RN-10):
         *     la respuesta trae el id de la nueva versión. También activa o desactiva versiones.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateRecipeRequest"];
                    "application/json": components["schemas"]["UpdateRecipeRequest"];
                    "text/json": components["schemas"]["UpdateRecipeRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RecipeDto"];
                        "text/json": components["schemas"]["RecipeDto"];
                        "text/plain": components["schemas"]["RecipeDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/recipes/{id}/explode": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consumo teórico para producir qty (RN-11). Con locationId agrega disponibilidad (sin lotes vencidos) y costo estimado. */
        get: {
            parameters: {
                query?: {
                    locationId?: string;
                    qty?: number;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ExplosionDto"];
                        "text/json": components["schemas"]["ExplosionDto"];
                        "text/plain": components["schemas"]["ExplosionDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requisitions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Requisiciones de ubicaciones a tu alcance. Filtros: status, locationId, q (folio). */
        get: {
            parameters: {
                query?: {
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                    Status?: components["schemas"]["RequisitionStatus"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfRequisitionListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfRequisitionListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfRequisitionListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crea una requisición en borrador (solo fábrica o comisariato). Cantidades en unidad de compra.
         *     Una línea sin proveedor toma el preferido del artículo.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateRequisitionRequest"];
                    "application/json": components["schemas"]["CreateRequisitionRequest"];
                    "text/json": components["schemas"]["CreateRequisitionRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RequisitionDto"];
                        "text/json": components["schemas"]["RequisitionDto"];
                        "text/plain": components["schemas"]["RequisitionDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requisitions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RequisitionDto"];
                        "text/json": components["schemas"]["RequisitionDto"];
                        "text/plain": components["schemas"]["RequisitionDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita fecha requerida, notas y líneas de una requisición en borrador. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateRequisitionRequest"];
                    "application/json": components["schemas"]["UpdateRequisitionRequest"];
                    "text/json": components["schemas"]["UpdateRequisitionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RequisitionDto"];
                        "text/json": components["schemas"]["RequisitionDto"];
                        "text/plain": components["schemas"]["RequisitionDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requisitions/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RequisitionDto"];
                        "text/json": components["schemas"]["RequisitionDto"];
                        "text/plain": components["schemas"]["RequisitionDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requisitions/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancela una requisición en borrador, enviada o aprobada (no convertida). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RequisitionDto"];
                        "text/json": components["schemas"]["RequisitionDto"];
                        "text/plain": components["schemas"]["RequisitionDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requisitions/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rechaza una requisición enviada, con motivo. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["RejectRequisitionRequest"];
                    "application/json": components["schemas"]["RejectRequisitionRequest"];
                    "text/json": components["schemas"]["RejectRequisitionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RequisitionDto"];
                        "text/json": components["schemas"]["RequisitionDto"];
                        "text/plain": components["schemas"]["RequisitionDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requisitions/{id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Envía a aprobación. Todas las líneas deben tener proveedor sugerido. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RequisitionDto"];
                        "text/json": components["schemas"]["RequisitionDto"];
                        "text/plain": components["schemas"]["RequisitionDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requisitions/convert": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Convierte requisiciones aprobadas en OC en borrador, una por proveedor sugerido y ubicación de entrega (RN-34).
         *     Precio sugerido del catálogo del proveedor (RN-30). Todo o nada.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["ConvertRequisitionsRequest"];
                    "application/json": components["schemas"]["ConvertRequisitionsRequest"];
                    "text/json": components["schemas"]["ConvertRequisitionsRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PurchaseOrderListItemDto"][];
                        "text/json": components["schemas"]["PurchaseOrderListItemDto"][];
                        "text/plain": components["schemas"]["PurchaseOrderListItemDto"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfRoleListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfRoleListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfRoleListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Crea un rol. Solo puedes otorgar permisos que tú tienes. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateRoleRequest"];
                    "application/json": components["schemas"]["CreateRoleRequest"];
                    "text/json": components["schemas"]["CreateRoleRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RoleDto"];
                        "text/json": components["schemas"]["RoleDto"];
                        "text/plain": components["schemas"]["RoleDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/roles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RoleDto"];
                        "text/json": components["schemas"]["RoleDto"];
                        "text/plain": components["schemas"]["RoleDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita un rol. El rol Administrador conserva siempre todos los permisos. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateRoleRequest"];
                    "application/json": components["schemas"]["UpdateRoleRequest"];
                    "text/json": components["schemas"]["UpdateRoleRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RoleDto"];
                        "text/json": components["schemas"]["RoleDto"];
                        "text/plain": components["schemas"]["RoleDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Parámetros del sistema con su tipo y límites: umbral de aprobación de OC, tolerancia de recepción y días de alerta de caducidad. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AppSettingDto"][];
                        "text/json": components["schemas"]["AppSettingDto"][];
                        "text/plain": components["schemas"]["AppSettingDto"][];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Guarda los parámetros indicados; cada uno valida su versión (409 si otro usuario lo cambió). */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateSettingsRequest"];
                    "application/json": components["schemas"]["UpdateSettingsRequest"];
                    "text/json": components["schemas"]["UpdateSettingsRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AppSettingDto"][];
                        "text/json": components["schemas"]["AppSettingDto"][];
                        "text/plain": components["schemas"]["AppSettingDto"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Existencias por ubicación y artículo. belowMin=true muestra solo lo que está bajo el mínimo (RN-07). */
        get: {
            parameters: {
                query?: {
                    BelowMin?: boolean;
                    CategoryId?: string;
                    ItemId?: string;
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfStockLevelDto"];
                        "text/json": components["schemas"]["PagedResultOfStockLevelDto"];
                        "text/plain": components["schemas"]["PagedResultOfStockLevelDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stock/{locationId}/{itemId}/lots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalle por lote de un artículo en una ubicación, del que caduca primero al último. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    itemId: string;
                    locationId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LotStockDto"][];
                        "text/json": components["schemas"]["LotStockDto"][];
                        "text/plain": components["schemas"]["LotStockDto"][];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/suppliers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Proveedores. Filtros: q (razón social o RFC), includeInactive. Orden: name, taxId, paymentTermsDays. */
        get: {
            parameters: {
                query?: {
                    IncludeInactive?: boolean;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfSupplierDto"];
                        "text/json": components["schemas"]["PagedResultOfSupplierDto"];
                        "text/plain": components["schemas"]["PagedResultOfSupplierDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Alta de proveedor. El RFC es único, salvo los genéricos del SAT (XAXX010101000, XEXX010101000). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateSupplierRequest"];
                    "application/json": components["schemas"]["CreateSupplierRequest"];
                    "text/json": components["schemas"]["CreateSupplierRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SupplierDto"];
                        "text/json": components["schemas"]["SupplierDto"];
                        "text/plain": components["schemas"]["SupplierDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/suppliers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SupplierDto"];
                        "text/json": components["schemas"]["SupplierDto"];
                        "text/plain": components["schemas"]["SupplierDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita datos o activa/desactiva. Al desactivar deja de ser proveedor preferido de sus artículos. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateSupplierRequest"];
                    "application/json": components["schemas"]["UpdateSupplierRequest"];
                    "text/json": components["schemas"]["UpdateSupplierRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SupplierDto"];
                        "text/json": components["schemas"]["SupplierDto"];
                        "text/plain": components["schemas"]["SupplierDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/suppliers/{id}/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Artículos del proveedor con precio por unidad de compra (sin IVA). Filtros: q, itemId, includeInactive. */
        get: {
            parameters: {
                query?: {
                    IncludeInactive?: boolean;
                    ItemId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfSupplierItemDto"];
                        "text/json": components["schemas"]["PagedResultOfSupplierItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfSupplierItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Liga un artículo activo al proveedor. isPreferred=true lo vuelve el proveedor preferido del artículo. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateSupplierItemRequest"];
                    "application/json": components["schemas"]["CreateSupplierItemRequest"];
                    "text/json": components["schemas"]["CreateSupplierItemRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SupplierItemDto"];
                        "text/json": components["schemas"]["SupplierItemDto"];
                        "text/plain": components["schemas"]["SupplierItemDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/suppliers/{id}/items/{supplierItemId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    supplierItemId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SupplierItemDto"];
                        "text/json": components["schemas"]["SupplierItemDto"];
                        "text/plain": components["schemas"]["SupplierItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita precio, clave y días de entrega; marca como preferido o activa/desactiva. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    supplierItemId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateSupplierItemRequest"];
                    "application/json": components["schemas"]["UpdateSupplierItemRequest"];
                    "text/json": components["schemas"]["UpdateSupplierItemRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SupplierItemDto"];
                        "text/json": components["schemas"]["SupplierItemDto"];
                        "text/plain": components["schemas"]["SupplierItemDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/transfers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Traspasos cuyo origen o destino está a tu alcance. Filtros: status, received (recibidos con o sin diferencias), fromLocationId, toLocationId, locationId, from, to, q. */
        get: {
            parameters: {
                query?: {
                    From?: string;
                    FromLocationId?: string;
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Received?: boolean;
                    Skip?: number;
                    Sort?: string;
                    Status?: components["schemas"]["TransferStatus"];
                    To?: string;
                    ToLocationId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfTransferListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfTransferListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfTransferListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Crea un traspaso en borrador. Rutas distintas de fábrica/comisariato → sucursal requieren logistics.transfers.special. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateTransferRequest"];
                    "application/json": components["schemas"]["CreateTransferRequest"];
                    "text/json": components["schemas"]["CreateTransferRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TransferDto"];
                        "text/json": components["schemas"]["TransferDto"];
                        "text/plain": components["schemas"]["TransferDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/transfers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TransferDto"];
                        "text/json": components["schemas"]["TransferDto"];
                        "text/plain": components["schemas"]["TransferDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita destino, notas y líneas de un traspaso en borrador. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateTransferRequest"];
                    "application/json": components["schemas"]["UpdateTransferRequest"];
                    "text/json": components["schemas"]["UpdateTransferRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TransferDto"];
                        "text/json": components["schemas"]["TransferDto"];
                        "text/plain": components["schemas"]["TransferDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/transfers/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancela un traspaso en borrador. Uno despachado no puede cancelarse (RN-23). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TransferDto"];
                        "text/json": components["schemas"]["TransferDto"];
                        "text/plain": components["schemas"]["TransferDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/transfers/{id}/dispatch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Despacha: registra la salida en el origen (FEFO o lotes elegidos) y deja el traspaso en tránsito. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["DispatchTransferRequest"];
                    "application/json": components["schemas"]["DispatchTransferRequest"];
                    "text/json": components["schemas"]["DispatchTransferRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TransferDto"];
                        "text/json": components["schemas"]["TransferDto"];
                        "text/plain": components["schemas"]["TransferDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/transfers/{id}/receive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recibe en el destino. Recibir menos de lo enviado exige motivo y deja el traspaso con discrepancias. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["ReceiveTransferRequest"];
                    "application/json": components["schemas"]["ReceiveTransferRequest"];
                    "text/json": components["schemas"]["ReceiveTransferRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TransferDto"];
                        "text/json": components["schemas"]["TransferDto"];
                        "text/plain": components["schemas"]["TransferDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/transfers/in-transit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Traspasos despachados pendientes de recibir (en tránsito). */
        get: {
            parameters: {
                query?: {
                    locationId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TransferListItemDto"][];
                        "text/json": components["schemas"]["TransferListItemDto"][];
                        "text/plain": components["schemas"]["TransferListItemDto"][];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/units-of-measure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Unidades de medida. Activas por defecto; includeInactive=true para ver todas. */
        get: {
            parameters: {
                query?: {
                    IncludeInactive?: boolean;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    Skip?: number;
                    Sort?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfUnitOfMeasureDto"];
                        "text/json": components["schemas"]["PagedResultOfUnitOfMeasureDto"];
                        "text/plain": components["schemas"]["PagedResultOfUnitOfMeasureDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateUnitOfMeasureRequest"];
                    "application/json": components["schemas"]["CreateUnitOfMeasureRequest"];
                    "text/json": components["schemas"]["CreateUnitOfMeasureRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UnitOfMeasureDto"];
                        "text/json": components["schemas"]["UnitOfMeasureDto"];
                        "text/plain": components["schemas"]["UnitOfMeasureDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/units-of-measure/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UnitOfMeasureDto"];
                        "text/json": components["schemas"]["UnitOfMeasureDto"];
                        "text/plain": components["schemas"]["UnitOfMeasureDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        /** Edita nombre, tipo y estado. El código no cambia. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateUnitOfMeasureRequest"];
                    "application/json": components["schemas"]["UpdateUnitOfMeasureRequest"];
                    "text/json": components["schemas"]["UpdateUnitOfMeasureRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UnitOfMeasureDto"];
                        "text/json": components["schemas"]["UnitOfMeasureDto"];
                        "text/plain": components["schemas"]["UnitOfMeasureDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista paginada de usuarios. Filtros: q (nombre o correo), isActive, roleId, locationId. */
        get: {
            parameters: {
                query?: {
                    IsActive?: boolean;
                    LocationId?: string;
                    Page?: number;
                    PageSize?: number;
                    Q?: string;
                    RoleId?: string;
                    Skip?: number;
                    Sort?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PagedResultOfUserListItemDto"];
                        "text/json": components["schemas"]["PagedResultOfUserListItemDto"];
                        "text/plain": components["schemas"]["PagedResultOfUserListItemDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put?: never;
        /** Crea un usuario con sus roles y ubicaciones. Solo puedes asignar roles y ubicaciones que tú tienes. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["CreateUserRequest"];
                    "application/json": components["schemas"]["CreateUserRequest"];
                    "text/json": components["schemas"]["CreateUserRequest"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserDto"];
                        "text/json": components["schemas"]["UserDto"];
                        "text/plain": components["schemas"]["UserDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserDto"];
                        "text/json": components["schemas"]["UserDto"];
                        "text/plain": components["schemas"]["UserDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["UpdateUserRequest"];
                    "application/json": components["schemas"]["UpdateUserRequest"];
                    "text/json": components["schemas"]["UpdateUserRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserDto"];
                        "text/json": components["schemas"]["UserDto"];
                        "text/plain": components["schemas"]["UserDto"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserDto"];
                        "text/json": components["schemas"]["UserDto"];
                        "text/plain": components["schemas"]["UserDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}/deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Desactiva el usuario y cierra todas sus sesiones. No puedes desactivarte a ti mismo. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["VersionRequest"];
                    "application/json": components["schemas"]["VersionRequest"];
                    "text/json": components["schemas"]["VersionRequest"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserDto"];
                        "text/json": components["schemas"]["UserDto"];
                        "text/plain": components["schemas"]["UserDto"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unprocessable Entity */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Asigna una contraseña temporal, desbloquea la cuenta y cierra todas sus sesiones. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/*+json": components["schemas"]["ResetPasswordRequest"];
                    "application/json": components["schemas"]["ResetPasswordRequest"];
                    "text/json": components["schemas"]["ResetPasswordRequest"];
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                        "text/json": components["schemas"]["ProblemDetails"];
                        "text/plain": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AdjustmentDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["AdjustmentLineDto"][];
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            movements: components["schemas"]["PostedMovementDto"][];
            notes: null | string;
            reason: components["schemas"]["AdjustmentReason"];
            status: components["schemas"]["AdjustmentStatus"];
            /** Format: double */
            totalCost: number;
            /** Format: uint32 */
            version: number;
        };
        AdjustmentLineDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            notes: null | string;
            /** Format: double */
            quantity: number;
            sku: string;
        };
        AdjustmentLineRequest: {
            /** Format: date */
            expirationDate: null | string;
            /** Format: uuid */
            itemId: string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            notes: null | string;
            /** Format: double */
            quantity: number;
            /** Format: double */
            unitCost: null | number;
        };
        AdjustmentListItemDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            /** Format: int32 */
            lineCount: number;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            reason: components["schemas"]["AdjustmentReason"];
            status: components["schemas"]["AdjustmentStatus"];
            /** Format: double */
            totalCost: number;
        };
        /** @enum {unknown} */
        AdjustmentReason: "Correction" | "Waste" | "Expired" | "Damaged" | "InternalUse";
        /** @enum {unknown} */
        AdjustmentStatus: "Posted" | "Cancelled";
        AlertsDto: {
            /** Format: int32 */
            expirationAlertDays: number;
            expiringLots: components["schemas"]["ExpiringLotAlertDto"][];
            lowStock: components["schemas"]["LowStockAlertDto"][];
        };
        /**
         * @example {
         *       "version": 1234,
         *       "lines": [
         *         {
         *           "lineId": "0199a1b2-0000-7000-8000-0000000000e1",
         *           "approvedQty": 20
         *         },
         *         {
         *           "lineId": "0199a1b2-0000-7000-8000-0000000000e2",
         *           "approvedQty": 0
         *         }
         *       ]
         *     }
         */
        ApproveBranchOrderRequest: {
            lines: components["schemas"]["ApproveLineRequest"][];
            /** Format: uint32 */
            version: number;
        };
        ApproveLineRequest: {
            /** Format: double */
            approvedQty: number;
            /** Format: uuid */
            lineId: string;
        };
        AppSettingDto: {
            /** Format: int32 */
            decimals: number;
            description: string;
            key: string;
            kind: components["schemas"]["SettingKind"];
            label: string;
            /** Format: double */
            max: number;
            /** Format: double */
            min: number;
            /** Format: date-time */
            updatedAt: null | string;
            /** Format: uuid */
            updatedBy: null | string;
            updatedByName: null | string;
            /** Format: double */
            value: number;
            /** Format: uint32 */
            version: number;
        };
        AuditLogDto: {
            action: string;
            changes: components["schemas"]["JsonElement"];
            entityId: string;
            entityType: string;
            /** Format: uuid */
            id: string;
            ipAddress: null | string;
            /** Format: date-time */
            occurredAt: string;
            /** Format: uuid */
            userId: null | string;
            userName: null | string;
        };
        BranchOrderDto: {
            /** Format: date-time */
            approvedAt: null | string;
            /** Format: uuid */
            approvedBy: null | string;
            approvedByName: null | string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            folio: string;
            /** Format: date-time */
            fulfilledAt: null | string;
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["BranchOrderLineDto"][];
            notes: null | string;
            /** Format: date-time */
            rejectedAt: null | string;
            /** Format: uuid */
            rejectedBy: null | string;
            rejectedByName: null | string;
            rejectionReason: null | string;
            requestingLocation: components["schemas"]["TransferLocationDto"];
            /** Format: date */
            requiredDate: string;
            status: components["schemas"]["BranchOrderStatus"];
            /** Format: date-time */
            submittedAt: null | string;
            /** Format: uuid */
            submittedBy: null | string;
            submittedByName: null | string;
            supplyingLocation: components["schemas"]["TransferLocationDto"];
            transfers: components["schemas"]["BranchOrderTransferDto"][];
            /** Format: uint32 */
            version: number;
        };
        BranchOrderLineDto: {
            /** Format: double */
            approvedQty: null | number;
            baseUomCode: string;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            /** Format: double */
            onHandAtOrigin: number;
            /** Format: double */
            requestedQty: number;
            /** Format: double */
            shippedQty: number;
            sku: string;
        };
        BranchOrderLineRequest: {
            /** Format: uuid */
            itemId: string;
            /** Format: double */
            requestedQty: number;
        };
        BranchOrderListItemDto: {
            /** Format: date-time */
            createdAt: string;
            folio: string;
            /** Format: uuid */
            id: string;
            /** Format: int32 */
            lineCount: number;
            requestingLocation: components["schemas"]["TransferLocationDto"];
            /** Format: date */
            requiredDate: string;
            status: components["schemas"]["BranchOrderStatus"];
            supplyingLocation: components["schemas"]["TransferLocationDto"];
        };
        /** @enum {unknown} */
        BranchOrderStatus: "Draft" | "Submitted" | "Approved" | "PartiallyFulfilled" | "Fulfilled" | "Rejected" | "Cancelled";
        BranchOrderSuggestionDto: {
            baseUomCode: string;
            /** Format: double */
            inTransit: number;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            /** Format: double */
            maxQty: number;
            /** Format: double */
            minQty: number;
            /** Format: double */
            onHand: number;
            /** Format: double */
            pending: number;
            sku: string;
            /** Format: double */
            suggestedQty: number;
        };
        BranchOrderTransferDto: {
            folio: string;
            /** Format: uuid */
            id: string;
            status: components["schemas"]["TransferStatus"];
        };
        /**
         * @example {
         *       "currentPassword": "Contrasena123",
         *       "newPassword": "NuevaContrasena456"
         *     }
         */
        ChangePasswordRequest: {
            currentPassword: string;
            newPassword: string;
        };
        CompleteLineRequest: {
            /** Format: double */
            actualQty: null | number;
            /** Format: uuid */
            componentItemId: string;
            lots: null | components["schemas"]["ComponentLotInput"][];
        };
        /**
         * @example {
         *       "version": 1234,
         *       "producedQty": 114,
         *       "lines": [
         *         {
         *           "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "actualQty": 12.5,
         *           "lots": null
         *         },
         *         {
         *           "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2",
         *           "actualQty": 3,
         *           "lots": [
         *             {
         *               "lotId": "0199a1b2-0000-7000-8000-0000000000f1",
         *               "quantity": 3
         *             }
         *           ]
         *         }
         *       ]
         *     }
         */
        CompleteProductionOrderRequest: {
            lines: null | components["schemas"]["CompleteLineRequest"][];
            /** Format: double */
            producedQty: number;
            /** Format: uint32 */
            version: number;
        };
        ComponentLotInput: {
            /** Format: uuid */
            lotId: string;
            /** Format: double */
            quantity: number;
        };
        ConsumptionDto: {
            /** Format: date */
            businessDate: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["ConsumptionLineDto"][];
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            movements: components["schemas"]["PostedMovementDto"][];
            notes: null | string;
            status: components["schemas"]["ConsumptionStatus"];
            /** Format: double */
            totalCost: number;
            /** Format: uint32 */
            version: number;
        };
        ConsumptionLineDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            /** Format: double */
            quantity: number;
            sku: string;
        };
        ConsumptionLineRequest: {
            /** Format: uuid */
            itemId: string;
            /** Format: uuid */
            lotId: null | string;
            /** Format: double */
            quantity: number;
        };
        ConsumptionListItemDto: {
            /** Format: date */
            businessDate: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            /** Format: int32 */
            lineCount: number;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            status: components["schemas"]["ConsumptionStatus"];
            /** Format: double */
            totalCost: number;
        };
        /** @enum {unknown} */
        ConsumptionStatus: "Posted" | "Cancelled";
        /**
         * @example {
         *       "requisitionIds": [
         *         "0199a1b2-0000-7000-8000-00000000007a",
         *         "0199a1b2-0000-7000-8000-00000000007b"
         *       ]
         *     }
         */
        ConvertRequisitionsRequest: {
            requisitionIds: string[];
        };
        CountInput: {
            /** Format: double */
            countedQty: number;
            /** Format: date */
            expirationDate: null | string;
            /** Format: uuid */
            itemId: null | string;
            /** Format: uuid */
            lineId: null | string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
        };
        /**
         * @example {
         *       "locationId": "0199a1b2-0000-7000-8000-0000000000a1",
         *       "reason": "Correction",
         *       "notes": "Diferencia en revisión",
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "lotId": null,
         *           "lotNumber": "L-2409",
         *           "expirationDate": "2027-03-31",
         *           "quantity": 5,
         *           "unitCost": 18.5,
         *           "notes": null
         *         },
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d2",
         *           "lotId": null,
         *           "lotNumber": null,
         *           "expirationDate": null,
         *           "quantity": -2,
         *           "unitCost": null,
         *           "notes": "Bolsa rota"
         *         }
         *       ]
         *     }
         */
        CreateAdjustmentRequest: {
            lines: components["schemas"]["AdjustmentLineRequest"][];
            /** Format: uuid */
            locationId: string;
            notes: null | string;
            reason: components["schemas"]["AdjustmentReason"];
        };
        /**
         * @example {
         *       "requestingLocationId": "0199a1b2-0000-7000-8000-0000000000a1",
         *       "supplyingLocationId": "0199a1b2-0000-7000-8000-0000000000a9",
         *       "requiredDate": "2026-09-26",
         *       "notes": "Fin de semana largo",
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d9",
         *           "requestedQty": 24
         *         },
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "requestedQty": 5.5
         *         }
         *       ]
         *     }
         */
        CreateBranchOrderRequest: {
            lines: components["schemas"]["BranchOrderLineRequest"][];
            notes: null | string;
            /** Format: uuid */
            requestingLocationId: string;
            /** Format: date */
            requiredDate: string;
            /** Format: uuid */
            supplyingLocationId: string;
        };
        /**
         * @example {
         *       "locationId": "0199a1b2-0000-7000-8000-0000000000a1",
         *       "businessDate": "2026-09-23",
         *       "notes": null,
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "lotId": null,
         *           "quantity": 1.5
         *         }
         *       ]
         *     }
         */
        CreateConsumptionRequest: {
            /** Format: date */
            businessDate: null | string;
            lines: components["schemas"]["ConsumptionLineRequest"][];
            /** Format: uuid */
            locationId: string;
            notes: null | string;
        };
        /**
         * @example {
         *       "purchaseOrderId": "0199a1b2-0000-7000-8000-00000000007c",
         *       "poVersion": 1234,
         *       "supplierInvoiceNumber": "F-10234",
         *       "lines": [
         *         {
         *           "poLineId": "0199a1b2-0000-7000-8000-0000000000e1",
         *           "quantity": 6,
         *           "lotNumber": "L-2410",
         *           "expirationDate": "2027-03-31"
         *         },
         *         {
         *           "poLineId": "0199a1b2-0000-7000-8000-0000000000e1",
         *           "quantity": 4,
         *           "lotNumber": "L-2411",
         *           "expirationDate": null
         *         },
         *         {
         *           "poLineId": "0199a1b2-0000-7000-8000-0000000000e2",
         *           "quantity": 2,
         *           "lotNumber": null,
         *           "expirationDate": null
         *         }
         *       ]
         *     }
         */
        CreateGoodsReceiptRequest: {
            lines: components["schemas"]["GoodsReceiptLineRequest"][];
            /** Format: uint32 */
            poVersion: number;
            /** Format: uuid */
            purchaseOrderId: string;
            supplierInvoiceNumber: null | string;
        };
        /**
         * @example {
         *       "name": "Lácteos"
         *     }
         */
        CreateItemCategoryRequest: {
            name: string;
        };
        /**
         * @example {
         *       "sku": "HAR-001",
         *       "name": "Harina de trigo",
         *       "type": "RawMaterial",
         *       "categoryId": "0199a1b2-0000-7000-8000-0000000000c1",
         *       "baseUomId": "0199a1b2-0000-7000-8000-0000000000b1",
         *       "purchaseUomId": "0199a1b2-0000-7000-8000-0000000000b2",
         *       "purchaseToBaseFactor": 25,
         *       "tracksLots": true,
         *       "shelfLifeDays": 180,
         *       "storageCondition": "Ambient",
         *       "taxRate": 0
         *     }
         */
        CreateItemRequest: {
            /** Format: uuid */
            baseUomId: string;
            /** Format: uuid */
            categoryId: string;
            name: string;
            /** Format: double */
            purchaseToBaseFactor: null | number;
            /** Format: uuid */
            purchaseUomId: null | string;
            /** Format: int32 */
            shelfLifeDays: null | number;
            sku: string;
            storageCondition: components["schemas"]["StorageCondition"];
            /** Format: double */
            taxRate: number;
            tracksLots: boolean;
            type: components["schemas"]["ItemType"];
        };
        /**
         * @example {
         *       "code": "SUC-11",
         *       "name": "Sucursal Plaza Sur",
         *       "type": "Branch",
         *       "address": "Av. Sur 200"
         *     }
         */
        CreateLocationRequest: {
            address: null | string;
            code: string;
            name: string;
            type: components["schemas"]["LocationType"];
        };
        /**
         * @example {
         *       "locationId": "0199a1b2-0000-7000-8000-0000000000a1",
         *       "categoryId": null,
         *       "notes": "Conteo semanal"
         *     }
         */
        CreatePhysicalCountRequest: {
            /** Format: uuid */
            categoryId: null | string;
            /** Format: uuid */
            locationId: string;
            notes: null | string;
        };
        /**
         * @example {
         *       "locationId": "0199a1b2-0000-7000-8000-0000000000a9",
         *       "outputItemId": "0199a1b2-0000-7000-8000-0000000000d9",
         *       "plannedQty": 120,
         *       "scheduledDate": "2026-09-25",
         *       "notes": "Turno matutino"
         *     }
         */
        CreateProductionOrderRequest: {
            /** Format: uuid */
            locationId: string;
            notes: null | string;
            /** Format: uuid */
            outputItemId: string;
            /** Format: double */
            plannedQty: number;
            /** Format: date */
            scheduledDate: string;
        };
        /**
         * @example {
         *       "supplierId": "0199a1b2-0000-7000-8000-00000000005a",
         *       "deliveryLocationId": "0199a1b2-0000-7000-8000-0000000000a9",
         *       "expectedDate": "2026-10-01",
         *       "notes": "Entregar antes de las 10:00",
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "quantity": 10,
         *           "unitPrice": null
         *         },
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d2",
         *           "quantity": 2,
         *           "unitPrice": 30.5
         *         }
         *       ]
         *     }
         */
        CreatePurchaseOrderRequest: {
            /** Format: uuid */
            deliveryLocationId: string;
            /** Format: date */
            expectedDate: null | string;
            lines: components["schemas"]["PurchaseOrderLineRequest"][];
            notes: null | string;
            /** Format: uuid */
            supplierId: string;
        };
        /**
         * @example {
         *       "outputItemId": "0199a1b2-0000-7000-8000-0000000000d9",
         *       "yieldQty": 12,
         *       "notes": "Pan de muerto, charola de 12",
         *       "lines": [
         *         {
         *           "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "quantity": 1.2,
         *           "wastePct": 3
         *         },
         *         {
         *           "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2",
         *           "quantity": 0.25,
         *           "wastePct": 0
         *         }
         *       ]
         *     }
         */
        CreateRecipeRequest: {
            lines: components["schemas"]["RecipeLineRequest"][];
            notes: null | string;
            /** Format: uuid */
            outputItemId: string;
            /** Format: double */
            yieldQty: number;
        };
        /**
         * @example {
         *       "locationId": "0199a1b2-0000-7000-8000-0000000000a9",
         *       "neededBy": "2026-10-01",
         *       "notes": "Reposición quincenal",
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "quantity": 8,
         *           "suggestedSupplierId": null
         *         },
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d2",
         *           "quantity": 2.5,
         *           "suggestedSupplierId": "0199a1b2-0000-7000-8000-00000000005a"
         *         }
         *       ]
         *     }
         */
        CreateRequisitionRequest: {
            lines: components["schemas"]["RequisitionLineRequest"][];
            /** Format: uuid */
            locationId: string;
            /** Format: date */
            neededBy: string;
            notes: null | string;
        };
        /**
         * @example {
         *       "name": "Supervisor de sucursales",
         *       "description": "Consulta y aprobación de pedidos",
         *       "permissions": [
         *         "inventory.view",
         *         "logistics.view",
         *         "logistics.orders.approve"
         *       ]
         *     }
         */
        CreateRoleRequest: {
            description: string;
            name: string;
            permissions: string[];
        };
        /**
         * @example {
         *       "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *       "supplierSku": "HP-TRIGO-25",
         *       "price": 412.5,
         *       "leadTimeDays": 3,
         *       "isPreferred": true
         *     }
         */
        CreateSupplierItemRequest: {
            isPreferred: boolean;
            /** Format: uuid */
            itemId: string;
            /** Format: int32 */
            leadTimeDays: number;
            /** Format: double */
            price: number;
            supplierSku: null | string;
        };
        /**
         * @example {
         *       "taxId": "HPA010203AB1",
         *       "name": "Harinas del Pacífico SA de CV",
         *       "contactName": "Marta Ríos",
         *       "phone": "33 1234 5678",
         *       "email": "ventas@harinaspacifico.mx",
         *       "paymentTermsDays": 30
         *     }
         */
        CreateSupplierRequest: {
            contactName: null | string;
            email: null | string;
            name: string;
            /** Format: int32 */
            paymentTermsDays: number;
            phone: null | string;
            taxId: string;
        };
        /**
         * @example {
         *       "fromLocationId": "0199a1b2-0000-7000-8000-0000000000a9",
         *       "toLocationId": "0199a1b2-0000-7000-8000-0000000000a1",
         *       "notes": "Reposición semanal",
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "lotId": null,
         *           "quantity": 12
         *         }
         *       ]
         *     }
         */
        CreateTransferRequest: {
            /** Format: uuid */
            fromLocationId: string;
            lines: components["schemas"]["TransferLineRequest"][];
            notes: null | string;
            /** Format: uuid */
            toLocationId: string;
        };
        /**
         * @example {
         *       "code": "bolsa",
         *       "name": "Bolsa",
         *       "kind": "Unit"
         *     }
         */
        CreateUnitOfMeasureRequest: {
            code: string;
            kind: components["schemas"]["UomKind"];
            name: string;
        };
        /**
         * @example {
         *       "email": "encargado.suc01@ejemplo.mx",
         *       "fullName": "Laura Méndez",
         *       "password": "Temporal2024x",
         *       "roleIds": [
         *         "0199a1b2-0000-7000-8000-000000000001"
         *       ],
         *       "locationIds": [
         *         "0199a1b2-0000-7000-8000-0000000000a1"
         *       ],
         *       "defaultLocationId": "0199a1b2-0000-7000-8000-0000000000a1"
         *     }
         */
        CreateUserRequest: {
            /** Format: uuid */
            defaultLocationId: null | string;
            email: string;
            fullName: string;
            locationIds: string[];
            password: string;
            roleIds: string[];
        };
        DashboardDto: {
            /** Format: int32 */
            branchOrdersInProgress: null | number;
            /** Format: int32 */
            branchOrdersToApprove: null | number;
            inventory: null | components["schemas"]["InventoryBlockDto"];
            /** Format: uuid */
            locationId: null | string;
            lowStockByLocation: null | components["schemas"]["LocationCountDto"][];
            /** Format: int32 */
            productionOrdersToday: null | number;
            /** Format: int32 */
            purchaseOrdersToApprove: null | number;
            transfers: null | components["schemas"]["TransfersBlockDto"];
        };
        /** @enum {unknown} */
        DiscrepancyReason: "Missing" | "Damaged" | "Other" | null;
        DispatchLineRequest: {
            /** Format: uuid */
            lineId: string;
            lots: components["schemas"]["LotQuantity"][];
        };
        /**
         * @example {
         *       "version": 1234,
         *       "vehicleDescription": "Nissan NP300 blanca ABC-123",
         *       "driverName": "Juan Pérez",
         *       "lines": [
         *         {
         *           "lineId": "0199a1b2-0000-7000-8000-0000000000e1",
         *           "lots": [
         *             {
         *               "lotId": "0199a1b2-0000-7000-8000-0000000000f1",
         *               "quantity": 10
         *             },
         *             {
         *               "lotId": "0199a1b2-0000-7000-8000-0000000000f2",
         *               "quantity": 2
         *             }
         *           ]
         *         }
         *       ]
         *     }
         */
        DispatchTransferRequest: {
            driverName: string;
            lines: null | components["schemas"]["DispatchLineRequest"][];
            vehicleDescription: string;
            /** Format: uint32 */
            version: number;
        };
        ExpiringLotAlertDto: {
            baseUomCode: string;
            /** Format: int32 */
            daysToExpire: number;
            /** Format: date */
            expirationDate: string;
            isExpired: boolean;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            /** Format: uuid */
            lotId: string;
            lotNumber: string;
            /** Format: double */
            quantity: number;
            sku: string;
        };
        ExplosionDto: {
            canProduce: null | boolean;
            /** Format: double */
            estimatedTotalCost: null | number;
            /** Format: double */
            estimatedUnitCost: null | number;
            lines: components["schemas"]["ExplosionLineDto"][];
            /** Format: uuid */
            locationId: null | string;
            /** Format: uuid */
            outputItemId: string;
            outputName: string;
            outputSku: string;
            /** Format: double */
            quantity: number;
            /** Format: uuid */
            recipeId: string;
            /** Format: int32 */
            recipeVersion: number;
            /** Format: double */
            yieldQty: number;
        };
        ExplosionLineDto: {
            /** Format: double */
            available: null | number;
            /** Format: double */
            averageCost: null | number;
            baseUomCode: string;
            /** Format: uuid */
            componentItemId: string;
            /** Format: double */
            estimatedCost: null | number;
            hasRecipe: boolean;
            name: string;
            /** Format: double */
            quantityPerYield: number;
            /** Format: double */
            shortage: null | number;
            sku: string;
            /** Format: double */
            theoreticalQty: number;
            /** Format: double */
            wastePct: number;
        };
        GoodsReceiptDto: {
            folio: string;
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["GoodsReceiptLineDto"][];
            location: components["schemas"]["PurchasingLocationDto"];
            purchaseOrder: components["schemas"]["GoodsReceiptOrderDto"];
            purchaseOrderStatus: components["schemas"]["PurchaseOrderStatus"];
            /** Format: date-time */
            receivedAt: string;
            /** Format: uuid */
            receivedBy: null | string;
            receivedByName: null | string;
            supplier: components["schemas"]["PurchaseOrderSupplierDto"];
            supplierInvoiceNumber: null | string;
            /** Format: double */
            totalCost: number;
        };
        GoodsReceiptLineDto: {
            /** Format: double */
            amount: number;
            /** Format: double */
            baseQuantity: number;
            baseUomCode: string;
            /** Format: date */
            expirationDate: null | string;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            /** Format: uuid */
            purchaseOrderLineId: string;
            purchaseUomCode: string;
            /** Format: double */
            quantity: number;
            sku: string;
            /** Format: double */
            unitCostBase: number;
        };
        GoodsReceiptLineRequest: {
            /** Format: date */
            expirationDate: null | string;
            lotNumber: null | string;
            /** Format: uuid */
            poLineId: string;
            /** Format: double */
            quantity: number;
        };
        GoodsReceiptListItemDto: {
            folio: string;
            /** Format: uuid */
            id: string;
            /** Format: int32 */
            lineCount: number;
            location: components["schemas"]["PurchasingLocationDto"];
            purchaseOrder: components["schemas"]["GoodsReceiptOrderDto"];
            /** Format: date-time */
            receivedAt: string;
            supplier: components["schemas"]["PurchaseOrderSupplierDto"];
            supplierInvoiceNumber: null | string;
            /** Format: double */
            totalCost: number;
        };
        GoodsReceiptOrderDto: {
            folio: string;
            /** Format: uuid */
            id: string;
        };
        /** Format: binary */
        IFormFile: string;
        InitialStockImportResult: {
            adjustmentFolios: string[];
            /** Format: int32 */
            lines: number;
        };
        InventoryBlockDto: {
            /** Format: int32 */
            expirationAlertDays: number;
            /** Format: int32 */
            expiredLots: number;
            /** Format: int32 */
            expiringLots: number;
            /** Format: int32 */
            lowStock: number;
        };
        ItemCategoryDto: {
            /** Format: uuid */
            id: string;
            isActive: boolean;
            name: string;
            /** Format: uint32 */
            version: number;
        };
        ItemDto: {
            /** Format: uuid */
            baseUomId: string;
            /** Format: uuid */
            categoryId: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            name: string;
            /** Format: double */
            purchaseToBaseFactor: number;
            /** Format: uuid */
            purchaseUomId: null | string;
            /** Format: int32 */
            shelfLifeDays: null | number;
            sku: string;
            storageCondition: components["schemas"]["StorageCondition"];
            /** Format: double */
            taxRate: number;
            tracksLots: boolean;
            type: components["schemas"]["ItemType"];
            /** Format: uint32 */
            version: number;
        };
        ItemImportResult: {
            /** Format: int32 */
            created: number;
            /** Format: int32 */
            updated: number;
        };
        ItemListItemDto: {
            baseUomCode: string;
            /** Format: uuid */
            categoryId: string;
            categoryName: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            name: string;
            sku: string;
            storageCondition: components["schemas"]["StorageCondition"];
            tracksLots: boolean;
            type: components["schemas"]["ItemType"];
        };
        ItemLocationSettingDto: {
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            locationName: string;
            /** Format: double */
            maxQty: null | number;
            /** Format: double */
            minQty: null | number;
        };
        ItemLocationSettingInput: {
            /** Format: uuid */
            locationId: string;
            /** Format: double */
            maxQty: null | number;
            /** Format: double */
            minQty: null | number;
        };
        ItemLookupDto: {
            baseUomCode: string;
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: int32 */
            shelfLifeDays: null | number;
            sku: string;
            tracksLots: boolean;
            type: components["schemas"]["ItemType"];
        };
        ItemSupplierOffersDto: {
            baseUomCode: string;
            /** Format: uuid */
            itemId: string;
            name: string;
            offers: components["schemas"]["SupplierOfferDto"][];
            /** Format: double */
            purchaseToBaseFactor: number;
            purchaseUomCode: string;
            sku: string;
        };
        /** @enum {unknown} */
        ItemType: "RawMaterial" | "Intermediate" | "FinishedGood";
        JsonElement: unknown;
        KardexEntryDto: {
            /** Format: double */
            balanceAfter: null | number;
            /** Format: date */
            businessDate: string;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            notes: null | string;
            /** Format: date-time */
            occurredAt: string;
            /** Format: double */
            quantity: number;
            sku: string;
            sourceDocFolio: string;
            /** Format: uuid */
            sourceDocId: string;
            sourceDocType: string;
            /** Format: double */
            totalCost: number;
            type: components["schemas"]["MovementType"];
            /** Format: double */
            unitCost: number;
            /** Format: uuid */
            userId: null | string;
            userName: null | string;
        };
        LineLotDto: {
            /** Format: date */
            expirationDate: null | string;
            /** Format: uuid */
            lotId: string;
            lotNumber: string;
            /** Format: double */
            quantity: number;
        };
        LocationCountDto: {
            /** Format: int32 */
            count: number;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            locationName: string;
        };
        LocationDto: {
            address: null | string;
            canProduce: boolean;
            canSupplyBranches: boolean;
            code: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            name: string;
            type: components["schemas"]["LocationType"];
            /** Format: uint32 */
            version: number;
        };
        LocationLookupDto: {
            code: string;
            /** Format: uuid */
            id: string;
            name: string;
            type: components["schemas"]["LocationType"];
        };
        /** @enum {unknown} */
        LocationType: "Branch" | "Factory" | "Commissary";
        /**
         * @example {
         *       "email": "encargado.suc01@ejemplo.mx",
         *       "password": "Contrasena123"
         *     }
         */
        LoginRequest: {
            email: string;
            password: string;
        };
        LotQuantity: {
            /** Format: uuid */
            lotId: string;
            /** Format: double */
            quantity: number;
        };
        LotStockDto: {
            /** Format: int32 */
            daysToExpire: null | number;
            /** Format: date */
            expirationDate: null | string;
            isExpired: boolean;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            /** Format: double */
            quantity: number;
        };
        LowStockAlertDto: {
            baseUomCode: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            /** Format: double */
            maxQty: number;
            /** Format: double */
            minQty: number;
            /** Format: double */
            onHand: number;
            sku: string;
        };
        MeDto: {
            allLocations: boolean;
            /** Format: uuid */
            defaultLocationId: null | string;
            email: string;
            fullName: string;
            /** Format: uuid */
            id: string;
            locations: components["schemas"]["MeLocationDto"][];
            permissions: string[];
        };
        MeLocationDto: {
            code: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            name: string;
            type: string;
        };
        /** @enum {unknown} */
        MovementType: "PurchaseReceipt" | "ProductionConsumption" | "ProductionOutput" | "TransferOut" | "TransferIn" | "Adjustment" | "Waste" | "PhysicalCountAdjustment" | "Consumption";
        PagedResultOfAdjustmentListItemDto: {
            items: components["schemas"]["AdjustmentListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfAuditLogDto: {
            items: components["schemas"]["AuditLogDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfBranchOrderListItemDto: {
            items: components["schemas"]["BranchOrderListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfConsumptionListItemDto: {
            items: components["schemas"]["ConsumptionListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfGoodsReceiptListItemDto: {
            items: components["schemas"]["GoodsReceiptListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfItemCategoryDto: {
            items: components["schemas"]["ItemCategoryDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfItemListItemDto: {
            items: components["schemas"]["ItemListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfKardexEntryDto: {
            items: components["schemas"]["KardexEntryDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfLocationDto: {
            items: components["schemas"]["LocationDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfPhysicalCountListItemDto: {
            items: components["schemas"]["PhysicalCountListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfProductionOrderListItemDto: {
            items: components["schemas"]["ProductionOrderListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfPurchaseOrderListItemDto: {
            items: components["schemas"]["PurchaseOrderListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfRecipeListItemDto: {
            items: components["schemas"]["RecipeListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfRequisitionListItemDto: {
            items: components["schemas"]["RequisitionListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfRoleListItemDto: {
            items: components["schemas"]["RoleListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfStockLevelDto: {
            items: components["schemas"]["StockLevelDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfSupplierDto: {
            items: components["schemas"]["SupplierDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfSupplierItemDto: {
            items: components["schemas"]["SupplierItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfTransferListItemDto: {
            items: components["schemas"]["TransferListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfUnitOfMeasureDto: {
            items: components["schemas"]["UnitOfMeasureDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PagedResultOfUserListItemDto: {
            items: components["schemas"]["UserListItemDto"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            total: number;
        };
        PermissionDto: {
            code: string;
            description: string;
        };
        PermissionGroupDto: {
            module: string;
            permissions: components["schemas"]["PermissionDto"][];
        };
        PhysicalCountDto: {
            /** Format: uuid */
            categoryId: null | string;
            /** Format: date-time */
            closedAt: null | string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["PhysicalCountLineDto"][];
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            movements: components["schemas"]["PostedMovementDto"][];
            notes: null | string;
            /** Format: date-time */
            startedAt: null | string;
            status: components["schemas"]["PhysicalCountStatus"];
            /** Format: uint32 */
            version: number;
        };
        PhysicalCountLineDto: {
            baseUomCode: string;
            /** Format: double */
            countedQty: null | number;
            /** Format: double */
            difference: null | number;
            /** Format: date */
            expirationDate: null | string;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            sku: string;
            /** Format: double */
            snapshotQty: number;
        };
        PhysicalCountListItemDto: {
            /** Format: uuid */
            categoryId: null | string;
            /** Format: date-time */
            closedAt: null | string;
            /** Format: int32 */
            countedLines: number;
            /** Format: date-time */
            createdAt: string;
            folio: string;
            /** Format: uuid */
            id: string;
            /** Format: int32 */
            lineCount: number;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            /** Format: date-time */
            startedAt: null | string;
            status: components["schemas"]["PhysicalCountStatus"];
        };
        /** @enum {unknown} */
        PhysicalCountStatus: "Draft" | "InProgress" | "Closed" | "Cancelled";
        PostedMovementDto: {
            /** Format: uuid */
            itemId: string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            /** Format: double */
            quantity: number;
            sku: string;
            /** Format: double */
            totalCost: number;
            /** Format: double */
            unitCost: number;
        };
        ProblemDetails: {
            detail?: null | string;
            instance?: null | string;
            /** Format: int32 */
            status?: null | number;
            title?: null | string;
            type?: null | string;
        };
        ProductionOrderDto: {
            /** Format: date-time */
            completedAt: null | string;
            /** Format: uuid */
            completedBy: null | string;
            completedByName: null | string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["ProductionOrderLineDto"][];
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            notes: null | string;
            /** Format: uuid */
            outputItemId: string;
            /** Format: date */
            outputLotExpiration: null | string;
            /** Format: uuid */
            outputLotId: null | string;
            outputLotNumber: null | string;
            outputName: string;
            outputSku: string;
            outputTracksLots: boolean;
            outputUomCode: string;
            /** Format: double */
            plannedQty: number;
            /** Format: double */
            producedQty: null | number;
            /** Format: uuid */
            recipeId: string;
            /** Format: int32 */
            recipeVersion: number;
            /** Format: date-time */
            releasedAt: null | string;
            /** Format: date */
            scheduledDate: string;
            status: components["schemas"]["ProductionOrderStatus"];
            /** Format: double */
            totalCost: null | number;
            /** Format: double */
            totalWasteCost: null | number;
            /** Format: double */
            unitCost: null | number;
            /** Format: uint32 */
            version: number;
        };
        ProductionOrderLineDto: {
            /** Format: double */
            actualQty: null | number;
            baseUomCode: string;
            /** Format: uuid */
            componentItemId: string;
            /** Format: uuid */
            id: string;
            lots: components["schemas"]["LineLotDto"][];
            name: string;
            sku: string;
            /** Format: double */
            theoreticalProducedQty: null | number;
            /** Format: double */
            theoreticalQty: number;
            /** Format: double */
            totalCost: null | number;
            /** Format: double */
            unitCost: null | number;
            /** Format: double */
            wasteCost: null | number;
            /** Format: double */
            wasteQty: null | number;
        };
        ProductionOrderListItemDto: {
            /** Format: date-time */
            createdAt: string;
            folio: string;
            /** Format: uuid */
            id: string;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            /** Format: uuid */
            outputItemId: string;
            outputName: string;
            outputSku: string;
            /** Format: double */
            plannedQty: number;
            /** Format: double */
            producedQty: null | number;
            /** Format: date */
            scheduledDate: string;
            status: components["schemas"]["ProductionOrderStatus"];
            /** Format: double */
            unitCost: null | number;
        };
        /** @enum {unknown} */
        ProductionOrderStatus: "Draft" | "Released" | "Completed" | "Cancelled";
        PurchaseOrderDto: {
            approvalRequired: boolean;
            /** Format: date-time */
            approvedAt: null | string;
            /** Format: uuid */
            approvedBy: null | string;
            approvedByName: null | string;
            /** Format: date-time */
            closedAt: null | string;
            /** Format: uuid */
            closedBy: null | string;
            closedByName: null | string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            deliveryLocation: components["schemas"]["PurchasingLocationDto"];
            /** Format: date */
            expectedDate: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["PurchaseOrderLineDto"][];
            notes: null | string;
            /** Format: date-time */
            rejectedAt: null | string;
            /** Format: uuid */
            rejectedBy: null | string;
            rejectedByName: null | string;
            rejectionReason: null | string;
            status: components["schemas"]["PurchaseOrderStatus"];
            /** Format: date-time */
            submittedAt: null | string;
            /** Format: uuid */
            submittedBy: null | string;
            submittedByName: null | string;
            /** Format: double */
            subtotal: number;
            supplier: components["schemas"]["PurchaseOrderSupplierDto"];
            /** Format: double */
            taxTotal: number;
            /** Format: double */
            total: number;
            /** Format: uint32 */
            version: number;
        };
        PurchaseOrderLineDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            /** Format: double */
            pendingQty: number;
            /** Format: double */
            purchaseToBaseFactor: number;
            purchaseUomCode: string;
            /** Format: double */
            quantity: number;
            /** Format: double */
            receivedQty: number;
            requisitionFolio: null | string;
            /** Format: uuid */
            requisitionId: null | string;
            /** Format: uuid */
            requisitionLineId: null | string;
            sku: string;
            /** Format: double */
            subtotal: number;
            /** Format: double */
            taxAmount: number;
            /** Format: double */
            taxRate: number;
            tracksLots: boolean;
            /** Format: double */
            unitPrice: number;
        };
        PurchaseOrderLineRequest: {
            /** Format: uuid */
            itemId: string;
            /** Format: uuid */
            lineId?: null | string;
            /** Format: double */
            quantity: number;
            /** Format: double */
            unitPrice: null | number;
        };
        PurchaseOrderListItemDto: {
            /** Format: date-time */
            createdAt: string;
            deliveryLocation: components["schemas"]["PurchasingLocationDto"];
            /** Format: date */
            expectedDate: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            /** Format: int32 */
            lineCount: number;
            status: components["schemas"]["PurchaseOrderStatus"];
            supplier: components["schemas"]["PurchaseOrderSupplierDto"];
            /** Format: double */
            total: number;
        };
        /** @enum {unknown} */
        PurchaseOrderStatus: "Draft" | "PendingApproval" | "Approved" | "PartiallyReceived" | "Received" | "Rejected" | "Cancelled" | "Closed";
        PurchaseOrderSupplierDto: {
            /** Format: uuid */
            id: string;
            name: string;
            taxId: string;
        };
        PurchasingLocationDto: {
            code: string;
            /** Format: uuid */
            id: string;
            name: string;
        };
        ReceiveLineRequest: {
            discrepancyNotes: null | string;
            discrepancyReason: null | components["schemas"]["DiscrepancyReason"];
            /** Format: uuid */
            lineId: string;
            /** Format: double */
            receivedQty: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "lines": [
         *         {
         *           "lineId": "0199a1b2-0000-7000-8000-0000000000e1",
         *           "receivedQty": 10,
         *           "discrepancyReason": null,
         *           "discrepancyNotes": null
         *         },
         *         {
         *           "lineId": "0199a1b2-0000-7000-8000-0000000000e2",
         *           "receivedQty": 1,
         *           "discrepancyReason": "Damaged",
         *           "discrepancyNotes": "Caja aplastada"
         *         }
         *       ]
         *     }
         */
        ReceiveTransferRequest: {
            lines: components["schemas"]["ReceiveLineRequest"][];
            /** Format: uint32 */
            version: number;
        };
        RecipeDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            isUsed: boolean;
            lines: components["schemas"]["RecipeLineDto"][];
            notes: null | string;
            /** Format: uuid */
            outputItemId: string;
            outputName: string;
            outputSku: string;
            outputUomCode: string;
            /** Format: int32 */
            recipeVersion: number;
            /** Format: date-time */
            updatedAt: null | string;
            /** Format: uint32 */
            version: number;
            /** Format: double */
            yieldQty: number;
        };
        RecipeLineDto: {
            baseUomCode: string;
            /** Format: uuid */
            componentItemId: string;
            hasRecipe: boolean;
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: double */
            quantity: number;
            sku: string;
            type: components["schemas"]["ItemType"];
            /** Format: double */
            wastePct: number;
        };
        RecipeLineRequest: {
            /** Format: uuid */
            componentItemId: string;
            /** Format: double */
            quantity: number;
            /** Format: double */
            wastePct: number;
        };
        RecipeListItemDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            isUsed: boolean;
            /** Format: int32 */
            lineCount: number;
            /** Format: uuid */
            outputItemId: string;
            outputName: string;
            outputSku: string;
            outputUomCode: string;
            /** Format: int32 */
            recipeVersion: number;
            /** Format: date-time */
            updatedAt: null | string;
            /** Format: double */
            yieldQty: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "reason": "Sin existencia hasta el lunes"
         *     }
         */
        RejectBranchOrderRequest: {
            reason: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "reason": "Precio fuera de lo negociado"
         *     }
         */
        RejectPurchaseOrderRequest: {
            reason: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "reason": "Hay existencia suficiente en comisariato"
         *     }
         */
        RejectRequisitionRequest: {
            reason: string;
            /** Format: uint32 */
            version: number;
        };
        RequisitionDto: {
            /** Format: date-time */
            approvedAt: null | string;
            /** Format: uuid */
            approvedBy: null | string;
            approvedByName: null | string;
            /** Format: date-time */
            convertedAt: null | string;
            /** Format: uuid */
            convertedBy: null | string;
            convertedByName: null | string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            folio: string;
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["RequisitionLineDto"][];
            location: components["schemas"]["PurchasingLocationDto"];
            /** Format: date */
            neededBy: string;
            notes: null | string;
            purchaseOrders: components["schemas"]["RequisitionPurchaseOrderDto"][];
            /** Format: date-time */
            rejectedAt: null | string;
            /** Format: uuid */
            rejectedBy: null | string;
            rejectedByName: null | string;
            rejectionReason: null | string;
            status: components["schemas"]["RequisitionStatus"];
            /** Format: date-time */
            submittedAt: null | string;
            /** Format: uuid */
            submittedBy: null | string;
            submittedByName: null | string;
            /** Format: uint32 */
            version: number;
        };
        RequisitionLineDto: {
            /** Format: double */
            estimatedPrice: null | number;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            purchaseUomCode: string;
            /** Format: double */
            quantity: number;
            sku: string;
            suggestedSupplier: null | components["schemas"]["RequisitionSupplierDto"];
        };
        RequisitionLineRequest: {
            /** Format: uuid */
            itemId: string;
            /** Format: double */
            quantity: number;
            /** Format: uuid */
            suggestedSupplierId: null | string;
        };
        RequisitionListItemDto: {
            /** Format: date-time */
            createdAt: string;
            folio: string;
            /** Format: uuid */
            id: string;
            /** Format: int32 */
            lineCount: number;
            location: components["schemas"]["PurchasingLocationDto"];
            /** Format: date */
            neededBy: string;
            status: components["schemas"]["RequisitionStatus"];
        };
        RequisitionPurchaseOrderDto: {
            folio: string;
            /** Format: uuid */
            id: string;
        };
        /** @enum {unknown} */
        RequisitionStatus: "Draft" | "Submitted" | "Approved" | "Converted" | "Rejected" | "Cancelled";
        RequisitionSupplierDto: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        /**
         * @example {
         *       "newPassword": "Temporal2024x"
         *     }
         */
        ResetPasswordRequest: {
            newPassword: string;
        };
        RoleDto: {
            description: string;
            /** Format: uuid */
            id: string;
            isAdministrator: boolean;
            isSystem: boolean;
            name: string;
            permissions: string[];
            /** Format: uint32 */
            version: number;
        };
        RoleListItemDto: {
            description: string;
            /** Format: uuid */
            id: string;
            isSystem: boolean;
            name: string;
            /** Format: int32 */
            permissionCount: number;
            /** Format: int32 */
            userCount: number;
        };
        /** @enum {unknown} */
        SettingKind: "Decimal" | "Integer";
        SettingValueRequest: {
            key: string;
            /** Format: double */
            value: number;
            /** Format: uint32 */
            version: number;
        };
        StockLevelDto: {
            /** Format: double */
            averageCost: number;
            baseUomCode: string;
            belowMin: boolean;
            /** Format: uuid */
            categoryId: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            locationCode: string;
            /** Format: uuid */
            locationId: string;
            /** Format: double */
            maxQty: null | number;
            /** Format: double */
            minQty: null | number;
            /** Format: double */
            onHand: number;
            sku: string;
            /** Format: double */
            stockValue: number;
        };
        /** @enum {unknown} */
        StorageCondition: "Ambient" | "Refrigerated" | "Frozen";
        SupplierDto: {
            contactName: null | string;
            email: null | string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            name: string;
            /** Format: int32 */
            paymentTermsDays: number;
            phone: null | string;
            taxId: string;
            /** Format: uint32 */
            version: number;
        };
        SupplierItemDto: {
            baseUomCode: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            isPreferred: boolean;
            /** Format: uuid */
            itemId: string;
            /** Format: int32 */
            leadTimeDays: number;
            name: string;
            /** Format: double */
            price: number;
            /** Format: double */
            purchaseToBaseFactor: number;
            purchaseUomCode: string;
            sku: string;
            /** Format: uuid */
            supplierId: string;
            supplierSku: null | string;
            /** Format: double */
            taxRate: number;
            tracksLots: boolean;
            /** Format: uint32 */
            version: number;
        };
        SupplierOfferDto: {
            isPreferred: boolean;
            /** Format: int32 */
            leadTimeDays: number;
            /** Format: double */
            price: number;
            /** Format: uuid */
            supplierId: string;
            /** Format: uuid */
            supplierItemId: string;
            supplierName: string;
            supplierSku: null | string;
        };
        TokenResponse: {
            accessToken: string;
            /** Format: int32 */
            expiresIn: number;
        };
        TransferDto: {
            branchOrderFolio: null | string;
            /** Format: uuid */
            branchOrderId: null | string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdBy: null | string;
            createdByName: null | string;
            /** Format: date-time */
            dispatchedAt: null | string;
            /** Format: uuid */
            dispatchedBy: null | string;
            dispatchedByName: null | string;
            driverName: null | string;
            folio: string;
            from: components["schemas"]["TransferLocationDto"];
            /** Format: uuid */
            id: string;
            lines: components["schemas"]["TransferLineDto"][];
            notes: null | string;
            /** Format: date-time */
            receivedAt: null | string;
            /** Format: uuid */
            receivedBy: null | string;
            receivedByName: null | string;
            /** Format: double */
            shippedValue: number;
            status: components["schemas"]["TransferStatus"];
            to: components["schemas"]["TransferLocationDto"];
            /** Format: double */
            transitLossValue: number;
            vehicleDescription: null | string;
            /** Format: uint32 */
            version: number;
        };
        TransferLineDto: {
            baseUomCode: string;
            discrepancyNotes: null | string;
            discrepancyReason: null | components["schemas"]["DiscrepancyReason"];
            /** Format: date */
            expirationDate: null | string;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            itemId: string;
            itemName: string;
            /** Format: uuid */
            lotId: null | string;
            lotNumber: null | string;
            /** Format: double */
            receivedQty: null | number;
            /** Format: double */
            shippedQty: number;
            /** Format: double */
            shortQty: number;
            /** Format: double */
            shortValue: null | number;
            sku: string;
            /** Format: double */
            unitCost: null | number;
        };
        TransferLineRequest: {
            /** Format: uuid */
            itemId: string;
            /** Format: uuid */
            lotId: null | string;
            /** Format: double */
            quantity: number;
        };
        TransferListItemDto: {
            branchOrderFolio: null | string;
            /** Format: uuid */
            branchOrderId: null | string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            dispatchedAt: null | string;
            folio: string;
            from: components["schemas"]["TransferLocationDto"];
            /** Format: uuid */
            id: string;
            /** Format: int32 */
            lineCount: number;
            /** Format: date-time */
            receivedAt: null | string;
            status: components["schemas"]["TransferStatus"];
            to: components["schemas"]["TransferLocationDto"];
        };
        TransferLocationDto: {
            code: string;
            /** Format: uuid */
            id: string;
            name: string;
        };
        TransfersBlockDto: {
            /** Format: int32 */
            toDispatch: number;
            /** Format: int32 */
            toReceive: number;
        };
        /** @enum {unknown} */
        TransferStatus: "Draft" | "Dispatched" | "Received" | "ReceivedWithDiscrepancies" | "Cancelled";
        UnitOfMeasureDto: {
            code: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            kind: components["schemas"]["UomKind"];
            name: string;
            /** Format: uint32 */
            version: number;
        };
        /** @enum {unknown} */
        UomKind: "Mass" | "Volume" | "Unit";
        /**
         * @example {
         *       "version": 1234,
         *       "supplyingLocationId": "0199a1b2-0000-7000-8000-0000000000a9",
         *       "requiredDate": "2026-09-27",
         *       "notes": null,
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d9",
         *           "requestedQty": 30
         *         }
         *       ]
         *     }
         */
        UpdateBranchOrderRequest: {
            lines: components["schemas"]["BranchOrderLineRequest"][];
            notes: null | string;
            /** Format: date */
            requiredDate: string;
            /** Format: uuid */
            supplyingLocationId: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "name": "Lácteos y derivados",
         *       "isActive": true
         *     }
         */
        UpdateItemCategoryRequest: {
            isActive: boolean;
            name: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "settings": [
         *         {
         *           "locationId": "0199a1b2-0000-7000-8000-0000000000a1",
         *           "minQty": 10,
         *           "maxQty": 40
         *         },
         *         {
         *           "locationId": "0199a1b2-0000-7000-8000-0000000000a2",
         *           "minQty": null,
         *           "maxQty": null
         *         }
         *       ]
         *     }
         */
        UpdateItemLocationSettingsRequest: {
            settings: components["schemas"]["ItemLocationSettingInput"][];
        };
        /**
         * @example {
         *       "version": 1234,
         *       "sku": "HAR-001",
         *       "name": "Harina de trigo 25 kg",
         *       "type": "RawMaterial",
         *       "categoryId": "0199a1b2-0000-7000-8000-0000000000c1",
         *       "baseUomId": "0199a1b2-0000-7000-8000-0000000000b1",
         *       "purchaseUomId": "0199a1b2-0000-7000-8000-0000000000b2",
         *       "purchaseToBaseFactor": 25,
         *       "tracksLots": true,
         *       "shelfLifeDays": 180,
         *       "storageCondition": "Ambient",
         *       "taxRate": 0,
         *       "isActive": true
         *     }
         */
        UpdateItemRequest: {
            /** Format: uuid */
            baseUomId: string;
            /** Format: uuid */
            categoryId: string;
            isActive: boolean;
            name: string;
            /** Format: double */
            purchaseToBaseFactor: null | number;
            /** Format: uuid */
            purchaseUomId: null | string;
            /** Format: int32 */
            shelfLifeDays: null | number;
            sku: string;
            storageCondition: components["schemas"]["StorageCondition"];
            /** Format: double */
            taxRate: number;
            tracksLots: boolean;
            type: components["schemas"]["ItemType"];
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "name": "Sucursal Centro",
         *       "address": "Av. Juárez 100, Col. Centro",
         *       "isActive": true
         *     }
         */
        UpdateLocationRequest: {
            address: null | string;
            isActive: boolean;
            name: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "categoryId": null,
         *       "notes": "Conteo semanal",
         *       "counts": [
         *         {
         *           "lineId": "0199a1b2-0000-7000-8000-0000000000e1",
         *           "itemId": null,
         *           "lotId": null,
         *           "lotNumber": null,
         *           "expirationDate": null,
         *           "countedQty": 7
         *         },
         *         {
         *           "lineId": null,
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "lotId": null,
         *           "lotNumber": "L-2410",
         *           "expirationDate": "2027-01-15",
         *           "countedQty": 2
         *         }
         *       ]
         *     }
         */
        UpdatePhysicalCountRequest: {
            /** Format: uuid */
            categoryId: null | string;
            counts: null | components["schemas"]["CountInput"][];
            notes: null | string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "plannedQty": 96,
         *       "scheduledDate": "2026-09-26",
         *       "notes": null
         *     }
         */
        UpdateProductionOrderRequest: {
            notes: null | string;
            /** Format: double */
            plannedQty: number;
            /** Format: date */
            scheduledDate: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "deliveryLocationId": "0199a1b2-0000-7000-8000-0000000000a9",
         *       "expectedDate": "2026-10-02",
         *       "notes": null,
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "quantity": 12,
         *           "unitPrice": 395,
         *           "lineId": "0199a1b2-0000-7000-8000-0000000000e1"
         *         }
         *       ]
         *     }
         */
        UpdatePurchaseOrderRequest: {
            /** Format: uuid */
            deliveryLocationId: string;
            /** Format: date */
            expectedDate: null | string;
            lines: components["schemas"]["PurchaseOrderLineRequest"][];
            notes: null | string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "yieldQty": 12,
         *       "notes": "Menos azúcar",
         *       "isActive": true,
         *       "lines": [
         *         {
         *           "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "quantity": 1.2,
         *           "wastePct": 3
         *         },
         *         {
         *           "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2",
         *           "quantity": 0.2,
         *           "wastePct": 0
         *         }
         *       ]
         *     }
         */
        UpdateRecipeRequest: {
            isActive: boolean;
            lines: components["schemas"]["RecipeLineRequest"][];
            notes: null | string;
            /** Format: uint32 */
            version: number;
            /** Format: double */
            yieldQty: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "neededBy": "2026-10-02",
         *       "notes": null,
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "quantity": 10,
         *           "suggestedSupplierId": null
         *         }
         *       ]
         *     }
         */
        UpdateRequisitionRequest: {
            lines: components["schemas"]["RequisitionLineRequest"][];
            /** Format: date */
            neededBy: string;
            notes: null | string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "name": "Supervisor de sucursales",
         *       "description": "Consulta y aprobación de pedidos",
         *       "permissions": [
         *         "inventory.view",
         *         "logistics.view",
         *         "logistics.orders.approve",
         *         "locations.view"
         *       ]
         *     }
         */
        UpdateRoleRequest: {
            description: string;
            name: string;
            permissions: string[];
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "settings": [
         *         {
         *           "key": "purchasing.po_approval_threshold",
         *           "value": 15000,
         *           "version": 1234
         *         },
         *         {
         *           "key": "inventory.expiration_alert_days",
         *           "value": 5,
         *           "version": 1235
         *         }
         *       ]
         *     }
         */
        UpdateSettingsRequest: {
            settings: components["schemas"]["SettingValueRequest"][];
        };
        /**
         * @example {
         *       "version": 1234,
         *       "supplierSku": "HP-TRIGO-25",
         *       "price": 425,
         *       "leadTimeDays": 2,
         *       "isPreferred": true,
         *       "isActive": true
         *     }
         */
        UpdateSupplierItemRequest: {
            isActive: boolean;
            isPreferred: boolean;
            /** Format: int32 */
            leadTimeDays: number;
            /** Format: double */
            price: number;
            supplierSku: null | string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "taxId": "HPA010203AB1",
         *       "name": "Harinas del Pacífico SA de CV",
         *       "contactName": "Marta Ríos",
         *       "phone": "33 1234 5678",
         *       "email": "ventas@harinaspacifico.mx",
         *       "paymentTermsDays": 45,
         *       "isActive": true
         *     }
         */
        UpdateSupplierRequest: {
            contactName: null | string;
            email: null | string;
            isActive: boolean;
            name: string;
            /** Format: int32 */
            paymentTermsDays: number;
            phone: null | string;
            taxId: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "toLocationId": "0199a1b2-0000-7000-8000-0000000000a1",
         *       "notes": null,
         *       "lines": [
         *         {
         *           "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
         *           "lotId": null,
         *           "quantity": 15
         *         }
         *       ]
         *     }
         */
        UpdateTransferRequest: {
            lines: components["schemas"]["TransferLineRequest"][];
            notes: null | string;
            /** Format: uuid */
            toLocationId: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "name": "Bolsa",
         *       "kind": "Unit",
         *       "isActive": true
         *     }
         */
        UpdateUnitOfMeasureRequest: {
            isActive: boolean;
            kind: components["schemas"]["UomKind"];
            name: string;
            /** Format: uint32 */
            version: number;
        };
        /**
         * @example {
         *       "version": 1234,
         *       "fullName": "Laura Méndez Ruiz",
         *       "roleIds": [
         *         "0199a1b2-0000-7000-8000-000000000001"
         *       ],
         *       "locationIds": [
         *         "0199a1b2-0000-7000-8000-0000000000a1",
         *         "0199a1b2-0000-7000-8000-0000000000a2"
         *       ],
         *       "defaultLocationId": "0199a1b2-0000-7000-8000-0000000000a1"
         *     }
         */
        UpdateUserRequest: {
            /** Format: uuid */
            defaultLocationId: null | string;
            fullName: string;
            locationIds: string[];
            roleIds: string[];
            /** Format: uint32 */
            version: number;
        };
        UserDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            defaultLocationId: null | string;
            email: string;
            fullName: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            isLockedOut: boolean;
            locationIds: string[];
            roleIds: string[];
            /** Format: date-time */
            updatedAt: null | string;
            /** Format: uint32 */
            version: number;
        };
        UserListItemDto: {
            email: string;
            fullName: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            isLockedOut: boolean;
            locationCodes: string[];
            roles: string[];
        };
        /**
         * @example {
         *       "version": 1234
         *     }
         */
        VersionRequest: {
            /** Format: uint32 */
            version: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
