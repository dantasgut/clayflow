import { FieldType } from '../descriptors/FieldType';
import type { FieldSpec, StructSchema } from '../descriptors/StructSchema';
import { wgslModule, type WgslModule } from './WgslModule';
import { wgslResource } from './WgslResource';
import { WgslCompositionError } from './WgslCompositionError';

/**
 * As arenas de pools da C2 (T060i): pools moram em regiões de um buffer só (palavras de 32 bits). A arena da CPU
 * (`pool_arena`) guarda os pools que a CPU envia e que só se leem; a da GPU (`pool_arena_gpu`), os que os estágios
 * produzem (`upload: 'never'`), lidos e escritos pelos acessores. O cabeçalho tem `POOL_ARENA_SLOTS` bases (a palavra
 * `k` é a primeira palavra da região `k`) e, depois, as capacidades (a palavra `POOL_ARENA_SLOTS + k`: elementos da
 * região `k`). Quem usa liga um buffer só por arena e lê (e, na da GPU, escreve) pelos acessores gerados: `nome[i]`,
 * `nome[i].campo`, `arrayLength(&nome)`, `nome[i] = v` e `nome[i].campo = v` no fonte de quem usa são reescritos na
 * montagem. Um kernel que lê e escreve a arena da GPU a liga uma vez, em leitura e escrita (a montagem promove a
 * ligação de leitura): o WebGPU não aceita o mesmo buffer escrito numa ligação e lido noutra no mesmo despacho.
 */

/** Regiões no máximo (o cabeçalho reserva todas). */
export const POOL_ARENA_SLOTS = 256;
/** Palavras do cabeçalho: as bases e as capacidades. */
export const POOL_ARENA_HEADER_WORDS = 2 * POOL_ARENA_SLOTS;
/** Alinhamento das regiões em bytes (o de uma ligação de storage com deslocamento, `minStorageBufferOffsetAlignment`). */
export const POOL_ARENA_ALIGN = 256;

/** Chave de uma região: o pool (os elementos) ou os vivos dele. */
export type PoolArenaRegion = `pool:${string}` | `live:${string}`;

/** A arena: a dos pools que a CPU envia ou a dos que a GPU produz. */
export type PoolArenaKind = 'cpu' | 'gpu';

/** A variável WGSL de cada arena. */
const ARENA_VAR: Readonly<Record<PoolArenaKind, string>> = {
    cpu: 'pool_arena',
    gpu: 'pool_arena_gpu',
};

const slots = new Map<PoolArenaRegion, number>();
const kinds = new Map<PoolArenaRegion, PoolArenaKind>();

/**
 * O índice fixo da região `key` no cabeçalho (atribuído na primeira vez, para o processo inteiro: os shaders o levam
 * como constante), na arena `kind`. Os índices são únicos entre as duas arenas.
 * @throws RangeError passando de `POOL_ARENA_SLOTS` regiões.
 * @throws Error a região já foi posta na outra arena.
 */
export function poolArenaSlot(key: PoolArenaRegion, kind: PoolArenaKind = 'cpu'): number {
    let k = slots.get(key);
    if (k === undefined) {
        k = slots.size;
        if (k >= POOL_ARENA_SLOTS)
            throw new RangeError(`poolArena: mais de ${POOL_ARENA_SLOTS} regiões (${key})`);
        slots.set(key, k);
        kinds.set(key, kind);
    } else if (kinds.get(key) !== kind) {
        throw new Error(
            `poolArena: '${key}' já mora na arena '${kinds.get(key)}', não na '${kind}'`,
        );
    }
    return k;
}

/** O índice da região `key`, se algum leitor a declarou (o pool mora numa arena). */
export function poolArenaSlotOf(key: PoolArenaRegion): number | undefined {
    return slots.get(key);
}

/** A arena da região `key`, se algum leitor ou escritor a declarou. */
export function poolArenaKindOf(key: PoolArenaRegion): PoolArenaKind | undefined {
    return kinds.get(key);
}

/** O buffer da arena da CPU (resolver `PoolArena`, registrado pela C2). */
export const poolArenaResource = wgslResource({
    name: 'pool_arena',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: 'PoolArena' },
});

/** O buffer da arena da GPU, em leitura (resolver `PoolArenaGpu`, registrado pela C2). */
export const poolArenaGpuResource = wgslResource({
    name: 'pool_arena_gpu',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: 'PoolArenaGpu' },
});

/** O buffer da arena da GPU, em leitura e escrita (o mesmo resolver; a montagem promove a de leitura a esta). */
export const poolArenaGpuWriteResource = wgslResource({
    name: 'pool_arena_gpu',
    binding: { storage: 'read_write' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: 'PoolArenaGpu' },
});

/** Uma leitura pela arena: o nome no fonte de quem usa e os acessores que o substituem. */
export interface ArenaRead {
    readonly name: string;
    readonly at: string;
    readonly len: string;
    /** A arena. */
    readonly kind: PoolArenaKind;
    /** O schema dos elementos (só nos leitores de elementos; o dos vivos não tem). */
    readonly schema?: StructSchema;
    /** Os campos do elemento com acessor próprio (`nome_at_<campo>`, e `nome_store_<campo>` no escritor). */
    readonly fields?: readonly string[];
    /** O prefixo das escritas (`nome_store`, `nome_store_<campo>`): só no escritor. */
    readonly store?: string;
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
    /** A arena (padrão: a da CPU). */
    readonly arena?: PoolArenaKind;
}

/**
 * Os elementos do pool `pool` lidos pela arena (T060i): `name_at(i)` devolve o elemento `i` montado das palavras,
 * `name_at_<campo>(i)` só o campo e `name_len()` a capacidade; quem usa escreve `name[i]`, `name[i].campo` e
 * `arrayLength(&name)` e a montagem reescreve. Declarar o leitor põe o pool na arena (a C2 o aloca numa região).
 */
export function poolArenaReader(options: PoolArenaReaderOptions): ArenaReader {
    return elementReader(options, `pool_arena_${options.name}`, false);
}

/**
 * Os elementos do pool `pool` lidos e escritos pela arena da GPU: o leitor e mais `name_store(i, v)` e
 * `name_store_<campo>(i, v)` — quem usa escreve `name[i] = v` e `name[i].campo = v`. O kernel liga a arena da GPU em
 * leitura e escrita (e lê por ela os outros pools dela).
 */
export function poolArenaWriter(options: Omit<PoolArenaReaderOptions, 'arena'>): ArenaReader {
    return elementReader({ ...options, arena: 'gpu' }, `pool_arena_${options.name}_rw`, true);
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
        const kind = reader.arenaRead.kind;
        const k = poolArenaSlot(`pool:${pool}`, kind);
        out = elementReader(
            { name: reader.arenaRead.name, pool, schema, arena: kind },
            `${reader.name}_r${k}`,
            reader.arenaRead.store !== undefined,
        );
        byPool.set(pool, out);
    }
    return out;
}

function elementReader(
    options: PoolArenaReaderOptions,
    moduleName: string,
    writable: boolean,
): ArenaReader {
    const kind = options.arena ?? 'cpu';
    const k = poolArenaSlot(`pool:${options.pool}`, kind);
    const v = ARENA_VAR[kind];
    const { name, schema } = options;
    const words = layoutOf({ kind: 'struct', schema }).size / 4;
    const base = `    let b = ${v}[${k}u] + i * ${words}u;`;
    const fields = [...schema.fields.entries()];
    const lines = [
        `/** ${name}: os elementos do pool ${options.pool} na arena ${kind} (região ${k}, ${words} palavras cada). */`,
        `fn ${name}_len() -> u32 { return ${v}[${POOL_ARENA_SLOTS + k}u]; }`,
        `fn ${name}_at(i: u32) -> ${schema.wgslName} {`,
        base,
        `    return ${valueOf(v, { kind: 'struct', schema }, 0)};`,
        '}',
    ];
    for (const [f, spec] of fields) {
        lines.push(
            `fn ${name}_at_${f}(i: u32) -> ${wgslOf(spec)} {`,
            base,
            `    return ${valueOf(v, spec, schema.offsetOf(f))};`,
            '}',
        );
    }
    if (writable) {
        lines.push(
            `fn ${name}_store(i: u32, x: ${schema.wgslName}) {`,
            base,
            ...storeOf(v, { kind: 'struct', schema }, 0, 'x').map((l) => `    ${l}`),
            '}',
        );
        for (const [f, spec] of fields) {
            lines.push(
                `fn ${name}_store_${f}(i: u32, x: ${wgslOf(spec)}) {`,
                base,
                ...storeOf(v, spec, schema.offsetOf(f), 'x').map((l) => `    ${l}`),
                '}',
            );
        }
    }
    const resource =
        kind === 'cpu'
            ? poolArenaResource
            : writable
              ? poolArenaGpuWriteResource
              : poolArenaGpuResource;
    const m = wgslModule({
        name: moduleName,
        source: lines.join('\n'),
        requires: [resource],
        structs: [schema],
    });
    return Object.freeze({
        ...m,
        arenaRead: Object.freeze({
            name,
            at: `${name}_at`,
            len: `${name}_len`,
            kind,
            schema,
            fields: Object.freeze(fields.map(([f]) => f)),
            ...(writable ? { store: `${name}_store` } : {}),
        }),
    });
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
    const m = wgslModule({ name: `pool_arena_${name}`, source, requires: [poolArenaResource] });
    return Object.freeze({
        ...m,
        arenaRead: Object.freeze({
            name,
            at: `${name}_at`,
            len: `${name}_len`,
            kind: 'cpu' as const,
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
                `poolArena: campo '${t}' não é lido pela arena (atômico num pool da arena)`,
            );
    }
}

function alignTo(v: number, a: number): number {
    return Math.ceil(v / a) * a;
}

/** A palavra `offset / 4` da região na arena `v`, a partir da base `b`. */
function word(v: string, offset: number): string {
    return `${v}[b + ${offset / 4}u]`;
}

/** A expressão WGSL do valor do tipo `t` na posição `offset` (bytes) do elemento, na arena `v`. */
function valueOf(v: string, t: FieldSpec, offset: number): string {
    if (typeof t === 'string') return primitiveValue(v, t, offset);
    if (t.kind === 'struct') {
        const s = t.schema;
        const fields = [...s.fields.entries()].map(([f, spec]) =>
            valueOf(v, spec, offset + s.offsetOf(f)),
        );
        return `${s.wgslName}(${fields.join(', ')})`;
    }
    if (t.kind === 'runtimeArray') throw new TypeError('poolArena: array sem tamanho');
    const e = layoutOf(t.element);
    const stride = alignTo(e.size, e.align);
    const items = Array.from({ length: t.length }, (_, i) =>
        valueOf(v, t.element, offset + i * stride),
    );
    return `array<${wgslOf(t.element)}, ${t.length}>(${items.join(', ')})`;
}

/** As escritas WGSL do valor `x` (do tipo `t`) nas palavras da posição `offset` (bytes) do elemento, na arena `v`. */
function storeOf(v: string, t: FieldSpec, offset: number, x: string): string[] {
    if (typeof t === 'string') return primitiveStore(v, t, offset, x);
    if (t.kind === 'struct') {
        const s = t.schema;
        return [...s.fields.entries()].flatMap(([f, spec]) =>
            storeOf(v, spec, offset + s.offsetOf(f), `${x}.${f}`),
        );
    }
    if (t.kind === 'runtimeArray') throw new TypeError('poolArena: array sem tamanho');
    const e = layoutOf(t.element);
    const stride = alignTo(e.size, e.align);
    return Array.from({ length: t.length }, (_, i) =>
        storeOf(v, t.element, offset + i * stride, `${x}[${i}]`),
    ).flat();
}

function wgslOf(t: FieldSpec): string {
    if (typeof t === 'string') return t;
    if (t.kind === 'struct') return t.schema.wgslName;
    if (t.kind === 'runtimeArray') return `array<${wgslOf(t.element)}>`;
    return `array<${wgslOf(t.element)}, ${t.length}>`;
}

function primitiveValue(v: string, t: FieldType, o: number): string {
    const ws = (n: number): string[] => Array.from({ length: n }, (_, i) => word(v, o + 4 * i));
    switch (t) {
        case FieldType.u32:
            return word(v, o);
        case FieldType.f32:
            return `bitcast<f32>(${word(v, o)})`;
        case FieldType.i32:
            return `bitcast<i32>(${word(v, o)})`;
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
            return `mat3x3f(${[0, 1, 2].map((c) => primitiveValue(v, FieldType.vec3f, o + 16 * c)).join(', ')})`;
        case FieldType.mat4x4f:
            return `mat4x4f(${[0, 1, 2, 3].map((c) => primitiveValue(v, FieldType.vec4f, o + 16 * c)).join(', ')})`;
        default:
            throw new TypeError(`poolArena: campo '${t}' não é lido pela arena`);
    }
}

function primitiveStore(v: string, t: FieldType, o: number, x: string): string[] {
    const set = (k: number, value: string): string => `${word(v, o + 4 * k)} = ${value};`;
    const comps = (n: number, cast: boolean): string[] =>
        ['x', 'y', 'z', 'w']
            .slice(0, n)
            .map((c, k) => set(k, cast ? `bitcast<u32>(${x}.${c})` : `${x}.${c}`));
    switch (t) {
        case FieldType.u32:
            return [set(0, x)];
        case FieldType.f32:
        case FieldType.i32:
            return [set(0, `bitcast<u32>(${x})`)];
        case FieldType.vec2u:
            return comps(2, false);
        case FieldType.vec3u:
            return comps(3, false);
        case FieldType.vec4u:
            return comps(4, false);
        case FieldType.vec2f:
        case FieldType.vec2i:
            return comps(2, true);
        case FieldType.vec3f:
        case FieldType.vec3i:
            return comps(3, true);
        case FieldType.vec4f:
        case FieldType.vec4i:
            return comps(4, true);
        case FieldType.mat3x3f:
            return [0, 1, 2].flatMap((c) =>
                primitiveStore(v, FieldType.vec3f, o + 16 * c, `${x}[${c}]`),
            );
        case FieldType.mat4x4f:
            return [0, 1, 2, 3].flatMap((c) =>
                primitiveStore(v, FieldType.vec4f, o + 16 * c, `${x}[${c}]`),
            );
        default:
            throw new TypeError(`poolArena: campo '${t}' não é escrito pela arena`);
    }
}

/** O fim (exclusivo) da expressão que começa em `from`: o `;` fora de parênteses e colchetes. */
function statementEnd(source: string, from: number): number {
    let depth = 0;
    for (let i = from; i < source.length; i++) {
        const c = source[i]!;
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ';' && depth === 0) return i;
    }
    return source.length;
}

/**
 * Reescreve, no fonte de quem usa, os acessos pela arena: `nome[expr]` → `nome_at(expr)`, `nome[expr].campo` →
 * `nome_at_campo(expr)`, `arrayLength(&nome)` → `nome_len()` e, nos escritores, `nome[expr] = v;` →
 * `nome_store(expr, v);` e `nome[expr].campo = v;` → `nome_store_campo(expr, v);` (comentários preservados; membros
 * `.nome` ignorados). Outro uso do nome (endereço, atribuição composta, escrita num leitor, passagem como argumento) é
 * erro: a arena só se acessa por elemento ou campo.
 */
export function rewriteArenaReads(
    source: string,
    reads: readonly ArenaRead[],
    owner: string,
): string {
    if (reads.length === 0) return source;
    const byName = new Map(reads.map((r) => [r.name, r]));
    const fail = (ident: string, what: string): never => {
        throw new WgslCompositionError(
            'arena-read',
            `${owner}: '${ident}' é acessado pela arena — ${what}`,
            [ident, owner],
        );
    };
    let out = '';
    // O último caractere de código (sem espaços nem comentários) escrito: um `.` antes do nome é acesso a membro.
    let last = '';
    const emit = (text: string): void => {
        out += text;
        const t = text.trimEnd();
        if (t.length > 0) last = t[t.length - 1]!;
    };
    let i = 0;
    const n = source.length;
    const isIdent = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9_]/.test(c);
    const skipSpace = (k: number): number => {
        while (k < n && /\s/.test(source[k]!)) k++;
        return k;
    };
    /** Em `k` há uma atribuição simples (`=` que não é `==`)? Atribuição composta é erro. */
    const assignmentAt = (k: number, ident: string): boolean => {
        if (/^(?:[-+*/%&|^]|<<|>>)=/.test(source.slice(k, k + 3)))
            fail(ident, 'atribuição composta não é aceita');
        return source[k] === '=' && source[k + 1] !== '=';
    };
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
            emit(c);
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
                emit(`${r.len}()`);
                i = j + m[0].length;
                continue;
            }
        }
        const r = byName.get(ident);
        const member = last === '.';
        if (r === undefined || member) {
            emit(ident);
            i = j;
            continue;
        }
        const k = skipSpace(j);
        if (source[k] !== '[') {
            fail(ident, `só por elemento (${ident}[i]), campo e arrayLength(&${ident})`);
        }
        let depth = 0;
        let end = k;
        for (; end < n; end++) {
            const d = source[end]!;
            if (d === '[') depth++;
            else if (d === ']' && --depth === 0) break;
        }
        const inner = rewriteArenaReads(source.slice(k + 1, end), reads, owner);
        let after = skipSpace(end + 1);
        // `.campo` de um campo com acessor próprio.
        let field: string | undefined;
        if (source[after] === '.') {
            const m = /^\.\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(after));
            if (m !== null && r.fields?.includes(m[1]!) === true) {
                field = m[1]!;
                after = skipSpace(after + m[0].length);
            }
        }
        if (assignmentAt(after, ident)) {
            if (r.store === undefined)
                fail(ident, 'só se lê (o pool está num leitor, não num escritor)');
            const stop = statementEnd(source, after + 1);
            const value = rewriteArenaReads(source.slice(after + 1, stop).trim(), reads, owner);
            emit(`${r.store}${field === undefined ? '' : `_${field}`}(${inner}, ${value})`);
            i = stop;
            continue;
        }
        if (field !== undefined) {
            emit(`${r.at}_${field}(${inner})`);
            i = source.slice(end + 1).indexOf(field) + end + 1 + field.length;
            continue;
        }
        emit(`${r.at}(${inner})`);
        i = end + 1;
    }
    return out;
}
