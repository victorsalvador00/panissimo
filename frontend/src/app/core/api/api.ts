import type { components } from './schema';

/** Schemas of the backend OpenAPI, generated into schema.d.ts by `npm run api:types` (frontend §3). */
export type Schemas = components['schemas'];

/** An API enum by schema name, without the `null` that .NET adds when the property is optional. */
export type ApiEnum<K extends keyof Schemas> = NonNullable<Schemas[K]>;
