export abstract class Schema {
    abstract readonly name: string;
    abstract readonly stride: number;

    abstract pack(data: Record<string, unknown>): ArrayBufferView;
    abstract toWGSL(): string;
    abstract applyDefaults(values: Record<string, unknown>): Record<string, unknown>;
}
