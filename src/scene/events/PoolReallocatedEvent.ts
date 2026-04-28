export interface PoolReallocatedEvent {
    readonly poolKey: string;
    readonly oldByteSize: number;
    readonly newByteSize: number;
}
