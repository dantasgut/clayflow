export interface ChangedEvent<T> {
    readonly added: readonly T[];
    readonly removed: readonly T[];
}
