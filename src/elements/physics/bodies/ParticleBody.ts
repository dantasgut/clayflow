import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/** Dado por campo das partículas de um corpo: um array por campo do schema, com os componentes de cada partícula. */
export type ParticleFields = Record<string, ArrayLike<number>>;

/** Dado de um `ParticleBody`: as partículas por campo (descritor `body`, uma faixa de `count` slots). */
export interface ParticleBodyData {
    /** Partículas por campo. */
    body: ParticleFields;
}

/** Opções cruas de um corpo de partículas: schema do struct de GPU, contagem e dado por campo. */
export interface ParticleBodyRawOptions {
    /** Schema do struct da partícula (layout de GPU) — define o pool e o estágio que simula. */
    readonly schema: StructSchema;
    /** Número de partículas. */
    readonly count: number;
    /** Dado por campo do schema (`fieldElements(tipo)` números por partícula); campos ausentes ficam com zero. */
    readonly data?: ParticleFields;
}

/** Posições de domínio de um corpo: `x, y, z` por partícula. */
export type ParticlePositions = ArrayLike<number>;

/**
 * Base dos corpos de partículas (spec 008): **um** Resource com N partículas, numa faixa de N slots contíguos do pool
 * do algoritmo (a ordem das partículas é a dos arrays). O dado é por campo (`data.body`), empacotado pela C2 no layout
 * do pool. O estado é da simulação depois da inserção (`upload: 'initial'`); leia-o com `resources.read(corpo, 'body')`.
 *
 * O schema precisa de um campo `pos: vec4f` (posição em `xyz`), que os estágios de desenho leem direto do pool.
 */
export abstract class ParticleBody<
    TData extends ParticleBodyData = ParticleBodyData,
> extends PhysicsBody<TData> {
    /** Número de partículas. */
    readonly count: number;
    /** Schema do struct da partícula (o do pool). */
    readonly particleSchema: StructSchema;

    constructor(kind: string, schema: StructSchema, count: number) {
        super();
        if (!Number.isInteger(count) || count < 1) {
            throw new RangeError(
                `${kind}: o corpo precisa de ao menos uma partícula (recebeu ${count}).`,
            );
        }
        if (!schema.fields.has('pos') || schema.fields.get('pos') !== FieldType.vec4f) {
            throw new TypeError(
                `${kind}: o schema '${schema.name}' precisa do campo pos: vec4f (posição lida pelos estágios de desenho).`,
            );
        }
        this.count = count;
        this.particleSchema = schema;
    }

    /** Partículas numa faixa do pool do schema (a simulação é dona do estado depois da inserção). */
    getDescriptors(): readonly GPUDescriptor[] {
        return [this.bodyDescriptor()];
    }

    /** Descritor das partículas: pool do schema, `count` slots, enviado só na inserção. */
    protected bodyDescriptor(): GPUDescriptor {
        return {
            id: 'body',
            role: 'storage-rw',
            schema: this.particleSchema,
            storage: 'pool',
            upload: 'initial',
            count: this.count,
        };
    }
}

/**
 * Número de partículas de `positions` (`x, y, z` por partícula).
 * @throws RangeError se o tamanho não é múltiplo de 3 ou é zero.
 */
export function particleCount(kind: string, positions: ParticlePositions): number {
    const n = positions.length / 3;
    if (!Number.isInteger(n) || n < 1) {
        throw new RangeError(
            `${kind}: position tem ${positions.length} valores — são 3 (x, y, z) por partícula, ao menos uma.`,
        );
    }
    return n;
}

/**
 * Confere que `values` tem `per` números por partícula para `count` partículas.
 * @throws RangeError com o campo e os tamanhos.
 */
export function requireLength(
    kind: string,
    field: string,
    values: ArrayLike<number>,
    count: number,
    per: number,
): void {
    if (values.length !== count * per) {
        throw new RangeError(
            `${kind}: ${field} tem ${values.length} valores; com ${count} partículas são ${count * per} (${per} por partícula).`,
        );
    }
}

/** `vec4` por partícula a partir de `xyz` por partícula, com `w` dado por `wOf(i)`. */
export function vec4Of(
    xyz: ArrayLike<number> | undefined,
    count: number,
    wOf: (i: number) => number = () => 0,
): Float32Array {
    const out = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
        out[i * 4] = xyz?.[i * 3] ?? 0;
        out[i * 4 + 1] = xyz?.[i * 3 + 1] ?? 0;
        out[i * 4 + 2] = xyz?.[i * 3 + 2] ?? 0;
        out[i * 4 + 3] = wOf(i);
    }
    return out;
}

/** O mesmo vetor repetido para `count` partículas. */
export function repeated(values: readonly number[], count: number): Float32Array {
    const out = new Float32Array(values.length * count);
    for (let i = 0; i < count; i++) out.set(values, i * values.length);
    return out;
}
