export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
}
