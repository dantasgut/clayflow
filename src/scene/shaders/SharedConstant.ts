import { wgslModule, type WgslModule } from './WgslModule';

/** Tipo WGSL de uma constante compartilhada. */
export type SharedConstantType = 'u32' | 'i32' | 'f32' | 'vec2f' | 'vec3f' | 'vec4f';

/**
 * Constante com fonte única para TypeScript e WGSL (spec 031, R6): `value` no TS e `module` (um `const` WGSL) para
 * `requires`. Ex.: `@compute @workgroup_size(WORKGROUP_SIZE)`.
 */
export interface SharedConstant<V extends number | readonly number[] = number | readonly number[]> {
    /** Nome do `const` WGSL. */
    readonly name: string;
    /** Valor. */
    readonly value: V;
    /** Tipo WGSL. */
    readonly type: SharedConstantType;
    /** Módulo com a declaração `const`. */
    readonly module: WgslModule;
}

function scalar(type: 'u32' | 'i32' | 'f32', v: number): string {
    if (!Number.isFinite(v)) throw new RangeError(`sharedConstant: valor não finito ${v}`);
    if (type === 'u32') {
        if (!Number.isInteger(v) || v < 0 || v > 0xffffffff)
            throw new RangeError(`sharedConstant: ${v} não é u32`);
        return `${v >>> 0}u`;
    }
    if (type === 'i32') {
        if (!Number.isInteger(v)) throw new RangeError(`sharedConstant: ${v} não é i32`);
        return `${v}i`;
    }
    const text = String(v);
    return /[.e]/.test(text) ? `${text}f` : `${text}.0f`;
}

const VECTOR_SIZE: Readonly<Record<string, number>> = { vec2f: 2, vec3f: 3, vec4f: 4 };

/**
 * Cria uma constante compartilhada. Lança se o valor não cabe no tipo.
 *
 * @param name - Identificador WGSL (convenção: MAIÚSCULAS).
 * @param value - Número (escalares) ou lista (vetores).
 * @param type - Tipo WGSL.
 */
export function sharedConstant(
    name: string,
    value: number,
    type: 'u32' | 'i32' | 'f32',
): SharedConstant<number>;
export function sharedConstant(
    name: string,
    value: readonly number[],
    type: 'vec2f' | 'vec3f' | 'vec4f',
): SharedConstant<readonly number[]>;
export function sharedConstant(
    name: string,
    value: number | readonly number[],
    type: SharedConstantType,
): SharedConstant {
    let literal: string;
    const size = VECTOR_SIZE[type];
    if (size !== undefined) {
        if (!Array.isArray(value) || value.length !== size)
            throw new RangeError(`sharedConstant('${name}'): ${type} espera ${size} componentes`);
        literal = `${type}(${(value as readonly number[]).map((v) => scalar('f32', v)).join(', ')})`;
    } else {
        if (typeof value !== 'number')
            throw new RangeError(`sharedConstant('${name}'): ${type} espera um número`);
        literal = scalar(type as 'u32' | 'i32' | 'f32', value);
    }
    const module = wgslModule({
        name: `const:${name}`,
        source: `const ${name}: ${type} = ${literal};`,
    });
    return Object.freeze({
        name,
        value: Array.isArray(value) ? Object.freeze([...(value as readonly number[])]) : value,
        type,
        module,
    });
}
