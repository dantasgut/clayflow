import { FieldType } from '../descriptors/FieldType';
import type { FieldSpec, StructSchema } from '../descriptors/StructSchema';
import { wgslModule, type WgslModule } from './WgslModule';
import { wgslResource } from './WgslResource';
import { WgslCompositionError } from './WgslCompositionError';

/**
 * A arena de pools da C2 (T060i): os pools que a CPU envia e que só se leem moram em regiões de um buffer só
 * (`pool_arena`, palavras de 32 bits). O cabeçalho tem `POOL_ARENA_SLOTS` bases (a palavra `k` é a primeira palavra da
 * região `k`) e, depois, as capacidades (a palavra `POOL_ARENA_SLOTS + k`: elementos da região `k`). Quem lê pela arena
 * liga um buffer só para todos esses pools e lê pelos acessores gerados (`nome_at(i)`, `nome_len()`); `nome[i]` e
 * `arrayLength(&nome)` no fonte de quem usa são reescritos na montagem.
 */

/** Regiões no máximo (o cabeçalho reserva todas). */
export const POOL_ARENA_SLOTS = 256;
/** Palavras do cabeçalho: as bases e as capacidades. */
export const POOL_ARENA_HEADER_WORDS = 2 * POOL_ARENA_SLOTS;
/** Alinhamento das regiões em bytes (o de uma ligação de storage com deslocamento, `minStorageBufferOffsetAlignment`). */
export const POOL_ARENA_ALIGN = 256;

/** Chave de uma região: o pool (os elementos) ou os vivos dele. */
export type PoolArenaRegion = `pool:${string}` | `live:${string}`;

const slots = new Map<PoolArenaRegion, number>();

/**
 * O índice fixo da região `key` no cabeçalho (atribuído na primeira vez, para o processo inteiro: os shaders o levam
 * como constante).
 * @throws RangeError passando de `POOL_ARENA_SLOTS` regiões.
 */
export function poolArenaSlot(key: PoolArenaRegion): number {
    let k = slots.get(key);
    if (k === undefined) {
        k = slots.size;
        if (k >= POOL_ARENA_SLOTS)
            throw new RangeError(`poolArena: mais de ${POOL_ARENA_SLOTS} regiões (${key})`);
        slots.set(key, k);
    }
    return k;
}

/** O índice da região `key`, se algum leitor a declarou (o pool mora na arena). */
export function poolArenaSlotOf(key: PoolArenaRegion): number | undefined {
    return slots.get(key);
}

/** O buffer da arena (resolver `PoolArena`, registrado pela C2). */
export const poolArenaResource = wgslResource({
    name: 'pool_arena',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: 'PoolArena' },
});

/** Uma leitura pela arena: o nome no fonte de quem usa e os acessores que o substituem. */
export interface ArenaRead {
    readonly name: string;
    readonly at: string;
    readonly len: string;
    /** O schema dos elementos (só nos leitores de elementos; o dos vivos não tem). */
    readonly schema?: StructSchema;
}

/** Um módulo leitor da arena: os acessores e o nome que eles substituem. */
export interface ArenaReader extends WgslModule {
    readonly arenaRead: ArenaRead;
}

/** O módulo lê pela arena? */
export function isArenaReader(m: WgslModule): m is ArenaReader {
    return (m as Partial<ArenaReader>).arenaRead !== undefined;
}

/** Opções de `poolArenaReader`. */
export interface PoolArenaReaderOptions {
    /** O nome no fonte de quem usa (como o de um `array<T>`). */
    readonly name: string;
    /** O pool (chave). */
    readonly pool: string;
    /** O schema dos elementos (o do pool). */
    readonly schema: StructSchema;
}

/**
 * Os elementos do pool `pool` lidos pela arena (T060i): `name_at(i)` devolve o elemento `i` montado das palavras e
 * `name_len()` a capacidade; quem usa escreve `name[i]` e `arrayLength(&name)` e a montagem reescreve. Declarar o
 * leitor põe o pool na arena (a C2 o aloca numa região).
 */
export function poolArenaReader(options: PoolArenaReaderOptions): ArenaReader {
    return elementReader(options, `pool_arena_${options.name}`);
}

const swapped = new WeakMap<ArenaReader, Map<string, ArenaReader>>();

/**
 * O leitor `reader` lendo a região de outro pool no mesmo layout (`pools` no descritor de um pipeline): o mesmo nome e
 * o mesmo struct, a região de `pool`. Memorizado por `(reader, pool)` — o mesmo par dá o mesmo módulo.
 * @throws TypeError `reader` não é um leitor de elementos.
 */
export function poolArenaReaderOf(reader: ArenaReader, pool: string): ArenaReader {
    const schema = reader.arenaRead.schema;
    if (schema === undefined)
        throw new TypeError(`poolArena: '${reader.name}' não lê elementos de um pool`);
    let byPool = swapped.get(reader);
    if (byPool === undefined) swapped.set(reader, (byPool = new Map()));
    let out = byPool.get(pool);
    if (out === undefined) {
        const k = poolArenaSlot(`pool:${pool}`);
        out = elementReader({ name: reader.arenaRead.name, pool, schema }, `${reader.name}_r${k}`);
        byPool.set(pool, out);
    }
    return out;
}

function elementReader(options: PoolArenaReaderOptions, moduleName: string): ArenaReader {
    const k = poolArenaSlot(`pool:${options.pool}`);
    const { name, schema } = options;
    const words = layoutOf({ kind: 'struct', schema }).size / 4;
    const source = [
        `/** ${name}: os elementos do pool ${options.pool} na arena (região ${k}, ${words} palavras cada). */`,
        `fn ${name}_len() -> u32 { return pool_arena[${POOL_ARENA_SLOTS + k}u]; }`,
        `fn ${name}_at(i: u32) -> ${schema.wgslName} {`,
        `    let b = pool_arena[${k}u] + i * ${words}u;`,
        `    return ${valueOf({ kind: 'struct', schema }, 0)};`,
        '}',
    ].join('\n');
    return reader(name, moduleName, source, [schema], schema);
}

/** Os vivos do pool `pool` lidos pela arena: `name_at(w)` é a palavra `w` do bitset (`pool_live`). */
export function poolArenaLiveReader(options: {
    readonly name: string;
    readonly pool: string;
}): ArenaReader {
    const k = poolArenaSlot(`live:${options.pool}`);
    const { name } = options;
    const source = [
        `/** ${name}: os vivos do pool ${options.pool} na arena (região ${k}, uma palavra por 32 slots). */`,
        `fn ${name}_len() -> u32 { return pool_arena[${POOL_ARENA_SLOTS + k}u]; }`,
        `fn ${name}_at(w: u32) -> u32 { return pool_arena[pool_arena[${k}u] + w]; }`,
    ].join('\n');
    return reader(name, `pool_arena_${name}`, source, []);
}

function reader(
    name: string,
    moduleName: string,
    source: string,
    structs: readonly StructSchema[],
    schema?: StructSchema,
): ArenaReader {
    const m = wgslModule({ name: moduleName, source, requires: [poolArenaResource], structs });
    return Object.freeze({
        ...m,
        arenaRead: Object.freeze({
            name,
            at: `${name}_at`,
            len: `${name}_len`,
            ...(schema === undefined ? {} : { schema }),
        }),
    });
}

/** Tamanho e alinhamento de um tipo no storage (as regras do `StructSchema`). */
function layoutOf(t: FieldSpec): { size: number; align: number } {
    if (typeof t === 'string') return primitive(t);
    if (t.kind === 'struct') return { size: t.schema.stride, align: t.schema.align };
    if (t.kind === 'runtimeArray')
        throw new TypeError('poolArena: array sem tamanho num elemento de pool');
    const e = layoutOf(t.element);
    return { size: alignTo(e.size, e.align) * t.length, align: e.align };
}

function primitive(t: FieldType): { size: number; align: number } {
    switch (t) {
        case FieldType.f32:
        case FieldType.u32:
        case FieldType.i32:
            return { size: 4, align: 4 };
        case FieldType.vec2f:
        case FieldType.vec2u:
        case FieldType.vec2i:
            return { size: 8, align: 8 };
        case FieldType.vec3f:
        case FieldType.vec3u:
        case FieldType.vec3i:
            return { size: 12, align: 16 };
        case FieldType.vec4f:
        case FieldType.vec4u:
        case FieldType.vec4i:
            return { size: 16, align: 16 };
        case FieldType.mat3x3f:
            return { size: 48, align: 16 };
        case FieldType.mat4x4f:
            return { size: 64, align: 16 };
        default:
            throw new TypeError(
                `poolArena: campo '${t}' não é lido pela arena (atômico num pool só de leitura)`,
            );
    }
}

function alignTo(v: number, a: number): number {
    return Math.ceil(v / a) * a;
}

/** A palavra `offset / 4` da região, a partir da base `b`. */
function word(offset: number): string {
    return `pool_arena[b + ${offset / 4}u]`;
}

/** A expressão WGSL do valor do tipo `t` na posição `offset` (bytes) do elemento. */
function valueOf(t: FieldSpec, offset: number): string {
    if (typeof t === 'string') return primitiveValue(t, offset);
    if (t.kind === 'struct') {
        const s = t.schema;
        const fields = [...s.fields.entries()].map(([f, spec]) =>
            valueOf(spec, offset + s.offsetOf(f)),
        );
        return `${s.wgslName}(${fields.join(', ')})`;
    }
    if (t.kind === 'runtimeArray') throw new TypeError('poolArena: array sem tamanho');
    const e = layoutOf(t.element);
    const stride = alignTo(e.size, e.align);
    const items = Array.from({ length: t.length }, (_, i) =>
        valueOf(t.element, offset + i * stride),
    );
    return `array<${wgslOf(t.element)}, ${t.length}>(${items.join(', ')})`;
}

function wgslOf(t: FieldSpec): string {
    if (typeof t === 'string') return t;
    if (t.kind === 'struct') return t.schema.wgslName;
    if (t.kind === 'runtimeArray') return `array<${wgslOf(t.element)}>`;
    return `array<${wgslOf(t.element)}, ${t.length}>`;
}

function primitiveValue(t: FieldType, o: number): string {
    const ws = (n: number): string[] => Array.from({ length: n }, (_, i) => word(o + 4 * i));
    switch (t) {
        case FieldType.u32:
            return word(o);
        case FieldType.f32:
            return `bitcast<f32>(${word(o)})`;
        case FieldType.i32:
            return `bitcast<i32>(${word(o)})`;
        case FieldType.vec2u:
            return `vec2u(${ws(2).join(', ')})`;
        case FieldType.vec3u:
            return `vec3u(${ws(3).join(', ')})`;
        case FieldType.vec4u:
            return `vec4u(${ws(4).join(', ')})`;
        case FieldType.vec2f:
            return `bitcast<vec2f>(vec2u(${ws(2).join(', ')}))`;
        case FieldType.vec3f:
            return `bitcast<vec3f>(vec3u(${ws(3).join(', ')}))`;
        case FieldType.vec4f:
            return `bitcast<vec4f>(vec4u(${ws(4).join(', ')}))`;
        case FieldType.vec2i:
            return `bitcast<vec2i>(vec2u(${ws(2).join(', ')}))`;
        case FieldType.vec3i:
            return `bitcast<vec3i>(vec3u(${ws(3).join(', ')}))`;
        case FieldType.vec4i:
            return `bitcast<vec4i>(vec4u(${ws(4).join(', ')}))`;
        case FieldType.mat3x3f:
            return `mat3x3f(${[0, 1, 2].map((c) => primitiveValue(FieldType.vec3f, o + 16 * c)).join(', ')})`;
        case FieldType.mat4x4f:
            return `mat4x4f(${[0, 1, 2, 3].map((c) => primitiveValue(FieldType.vec4f, o + 16 * c)).join(', ')})`;
        default:
            throw new TypeError(`poolArena: campo '${t}' não é lido pela arena`);
    }
}

/**
 * Reescreve, no fonte de quem usa, as leituras pela arena: `nome[expr]` → `nome_at(expr)` e `arrayLength(&nome)` →
 * `nome_len()` (comentários preservados; membros `.nome` ignorados). Outro uso do nome (endereço, escrita, passagem
 * como argumento) é erro: a arena só se lê por elemento.
 */
export function rewriteArenaReads(
    source: string,
    reads: readonly ArenaRead[],
    owner: string,
): string {
    if (reads.length === 0) return source;
    const byName = new Map(reads.map((r) => [r.name, r]));
    let out = '';
    let i = 0;
    const n = source.length;
    const isIdent = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9_]/.test(c);
    while (i < n) {
        const c = source[i]!;
        // Comentários: copiados como estão.
        if (c === '/' && source[i + 1] === '/') {
            const end = source.indexOf('\n', i);
            const stop = end < 0 ? n : end;
            out += source.slice(i, stop);
            i = stop;
            continue;
        }
        if (c === '/' && source[i + 1] === '*') {
            const end = source.indexOf('*/', i + 2);
            const stop = end < 0 ? n : end + 2;
            out += source.slice(i, stop);
            i = stop;
            continue;
        }
        if (!/[A-Za-z_]/.test(c) || isIdent(source[i - 1])) {
            out += c;
            i++;
            continue;
        }
        let j = i;
        while (j < n && isIdent(source[j])) j++;
        const ident = source.slice(i, j);
        if (ident === 'arrayLength') {
            const m = /^\s*\(\s*&\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/.exec(source.slice(j));
            const r = m === null ? undefined : byName.get(m[1]!);
            if (m !== null && r !== undefined) {
                out += `${r.len}()`;
                i = j + m[0].length;
                continue;
            }
        }
        const r = byName.get(ident);
        const member = /\.\s*$/.test(out);
        if (r === undefined || member) {
            out += ident;
            i = j;
            continue;
        }
        let k = j;
        while (k < n && /\s/.test(source[k]!)) k++;
        if (source[k] !== '[') {
            throw new WgslCompositionError(
                'arena-read',
                `${owner}: '${ident}' é lido pela arena — só por elemento (${ident}[i]) e arrayLength(&${ident})`,
                [ident, owner],
            );
        }
        let depth = 0;
        let end = k;
        for (; end < n; end++) {
            const d = source[end]!;
            if (d === '[') depth++;
            else if (d === ']' && --depth === 0) break;
        }
        const inner = rewriteArenaReads(source.slice(k + 1, end), reads, owner);
        out += `${r.at}(${inner})`;
        i = end + 1;
    }
    return out;
}
