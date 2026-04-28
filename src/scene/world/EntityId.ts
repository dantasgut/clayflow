declare const __entityIdBrand: unique symbol;
export type EntityId = number & { readonly [__entityIdBrand]: true };

export function asEntityId(value: number): EntityId {
    return value as EntityId;
}
