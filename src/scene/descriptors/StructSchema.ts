import {
    fieldAlign,
    fieldBytes,
    fieldCtor,
    fieldElementBytes,
    fieldElements,
    fieldWgsl,
    type FieldType,
} from './FieldType';
import { Schema } from './Schema';

interface StructFieldLayout {
    readonly name: string;
    readonly type: FieldType;
    readonly offset: number;
}

function alignTo(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}

export class StructSchema extends Schema {
    readonly name: string;
    readonly fields: ReadonlyMap<string, FieldType>;
    readonly stride: number;
    private readonly layout: ReadonlyMap<string, StructFieldLayout>;

    constructor(name: string, fields: Record<string, FieldType>) {
        super();
        this.name = name;
        const orderedFields = new Map<string, FieldType>();
        for (const [k, v] of Object.entries(fields)) orderedFields.set(k, v);
        this.fields = orderedFields;

        const layout = new Map<string, StructFieldLayout>();
        let offset = 0;
        for (const [fieldName, fieldType] of orderedFields) {
            offset = alignTo(offset, fieldAlign(fieldType));
            layout.set(fieldName, { name: fieldName, type: fieldType, offset });
            offset += fieldBytes(fieldType);
        }
        // struct align = max(field aligns), stride = align-up(struct size)
        let maxAlign = 4;
        for (const ft of orderedFields.values()) maxAlign = Math.max(maxAlign, fieldAlign(ft));
        this.stride = alignTo(offset, maxAlign);
        this.layout = layout;
    }

    offsetOf(field: string): number {
        const entry = this.layout.get(field);
        if (entry === undefined)
            throw new Error(`StructSchema(${this.name}): unknown field '${field}'`);
        return entry.offset;
    }

    typeOf(field: string): FieldType {
        const entry = this.layout.get(field);
        if (entry === undefined)
            throw new Error(`StructSchema(${this.name}): unknown field '${field}'`);
        return entry.type;
    }

    applyDefaults(values: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [name, type] of this.fields) {
            if (Object.prototype.hasOwnProperty.call(values, name)) {
                out[name] = values[name];
            } else {
                out[name] = defaultFor(type);
            }
        }
        return out;
    }

    pack(data: Record<string, unknown>): ArrayBufferView {
        const buffer = new ArrayBuffer(this.stride);
        for (const [name, layoutEntry] of this.layout) {
            const value = data[name];
            const ctor = fieldCtor(layoutEntry.type);
            const elements = fieldElements(layoutEntry.type);
            const elementBytes = fieldElementBytes(layoutEntry.type);
            const view = new ctor(buffer, layoutEntry.offset, elements);
            writeValue(view, value, layoutEntry.type, elements, elementBytes);
        }
        return new Uint8Array(buffer);
    }

    toWGSL(): string {
        const lines: string[] = [`struct ${this.name} {`];
        for (const [name, type] of this.fields) {
            lines.push(`    ${name}: ${fieldWgsl(type)},`);
        }
        lines.push('}');
        return lines.join('\n');
    }
}

function defaultFor(type: FieldType): number | number[] {
    const elements = fieldElements(type);
    if (elements === 1) return 0;
    return new Array(elements).fill(0);
}

function writeValue(
    view: { [i: number]: number; length: number },
    value: unknown,
    type: FieldType,
    elements: number,
    _elementBytes: number,
): void {
    if (typeof value === 'number') {
        view[0] = value;
        for (let i = 1; i < elements; i++) view[i] = 0;
        return;
    }
    if (Array.isArray(value)) {
        const limit = Math.min(elements, value.length);
        for (let i = 0; i < limit; i++) {
            const v = value[i];
            view[i] = typeof v === 'number' ? v : 0;
        }
        for (let i = limit; i < elements; i++) view[i] = 0;
        return;
    }
    if (value !== undefined && typeof value === 'object' && Symbol.iterator in value!) {
        let i = 0;
        for (const v of value as Iterable<unknown>) {
            if (i >= elements) break;
            view[i] = typeof v === 'number' ? v : 0;
            i++;
        }
        for (; i < elements; i++) view[i] = 0;
        return;
    }
    throw new Error(`StructSchema: cannot pack field of type ${type} from value ${typeof value}`);
}
