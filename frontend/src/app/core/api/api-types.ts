import type { components } from './schema';

/** Esquemas del OpenAPI del backend (generados con `npm run api:types`). */
export type Schemas = components['schemas'];

/** .NET marca los enums como anulables en el esquema; esta utilidad quita el `null`. */
export type ApiEnum<K extends keyof Schemas> = NonNullable<Schemas[K]>;

export type MeDto = Schemas['MeDto'];
export type MeLocationDto = Schemas['MeLocationDto'];
export type LoginRequest = Schemas['LoginRequest'];
export type TokenResponse = Schemas['TokenResponse'];
export type ChangePasswordRequest = Schemas['ChangePasswordRequest'];
