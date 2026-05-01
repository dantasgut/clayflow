import { fieldBytes, fieldCtor, fieldElements, fieldWgsl, type FieldType } from './FieldType';
import { Schema } from './Schema';

export class TensorSchema extends Schema {
    readonly name: string;
    readonly shape: readonly number[];
    readonly elementType: FieldType;
    readonly stride: number;

    constructor(name: string, shape: readonly number[], elementType: FieldType) {
        super();
        if (shape.length === 0) throw new Error(`TensorSchema(${name}): shape must be non-empty`);
        this.name = name;
        this.shape = shape;
        this.elementType = elementType;
        const totalElements = shape.reduce((a, b) => a * b, 1);
        this.stride = totalElements * fieldBytes(elementType);
    }

    private flatten(values: unknown): number[] {
        const totalElements =
            this.shape.reduce((a, b) => a * b, 1) * fieldElements(this.elementType);
        const flat: number[] = new Array(totalElements).fill(0);
        let i = 0;
        const recurse = (v: unknown): void => {
            if (i >= totalElements) return;
            if (typeof v === 'number') {
                flat[i++] = v;
                return;
            }
            if (Array.isArray(v)) {
                for (const x of v) recurse(x);
                return;
            }
        };
        recurse(values);
        return flat;
    }

    applyDefaults(values: Record<string, unknown>): Record<string, unknown> {
        const data = values.data;
        if (data === undefined) {
            return {
                data: new Array(
                    this.shape.reduce((a, b) => a * b, 1) * fieldElements(this.elementType),
                ).fill(0),
            };
        }
        return { data };
    }

    pack(data: Record<string, unknown>): ArrayBufferView {
        const flat = this.flatten(data.data);
        const ctor = fieldCtor(this.elementType);
        const arr = new ctor(flat.length);
        for (let i = 0; i < flat.length; i++) arr[i] = flat[i] ?? 0;
        return arr;
    }

    toWGSL(): string {
        return `// Tensor ${this.name}: array<${fieldWgsl(this.elementType)}> stride=${this.stride}`;
    }
}
