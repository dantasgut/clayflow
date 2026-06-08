declare const __entityIdBrand: unique symbol;

/**
 * Branded number — identificador opaco de Entity no World.
 * Marca evita confusão com outros IDs numéricos (resourceId, frameNo, etc.)
 * via type-level branding (zero runtime cost).
 */
export type EntityId = number & {
    /** Brand marker — único por tipo, força incompatibilidade nominal. */
    readonly [__entityIdBrand]: true;
};

/**
 * Cast seguro de `number` para `EntityId`. Use só dentro do World e em
 * contextos onde o número já é garantidamente um id válido (e.g. retorno
 * de `World.add`, key de Map<EntityId, _>).
 */
export function asEntityId(value: number): EntityId {
    return value as EntityId;
}
