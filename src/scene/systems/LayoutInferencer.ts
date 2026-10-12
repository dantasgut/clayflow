import type { ComposedShader } from '../shaders/composeWgsl';
import { stripWgslComments } from '../shaders/scanWgslSymbols';

/** Estágio de shader de uma entrada (`@vertex`, `@fragment`, `@compute`). */
export type WgslStage = 'vertex' | 'fragment' | 'compute';

/**
 * Binding extraído do WGSL — um `@group(N) @binding(M) var…` declarado no fonte, com o tipo e os estágios cujas
 * entradas alcançam (por chamadas) uma função que cita a variável.
 */
export interface WgslBinding {
    /** Slot de bindgroup (`@group(N)`). */
    readonly group: number;
    /** Slot de binding dentro do bindgroup (`@binding(M)`). */
    readonly binding: number;
    /** Nome da variável no WGSL. */
    readonly name: string;
    /** Address space (`var<uniform>`, `var<storage>`); ausente em texturas e samplers. */
    readonly addressSpace?: 'uniform' | 'storage';
    /** Acesso declarado de um storage buffer (`read` quando omitido). */
    readonly access?: 'read' | 'write' | 'read_write';
    /** Texto WGSL do tipo (ex.: `array<RigidBody>`, `texture_depth_2d`). */
    readonly typeText: string;
    /** Estágios de todas as entradas do fonte que alcançam um uso da variável. */
    readonly stages: ReadonlySet<WgslStage>;
}

/** Resultado de `parseWGSL`. */
export interface WgslBindingInfo {
    /** Bindings na ordem do fonte. */
    readonly bindings: readonly WgslBinding[];
}

/** Recurso de uma entrada de layout inferida do tipo WGSL. */
export type InferredResource =
    | 'uniform'
    | 'read-only-storage'
    | 'storage'
    | {
          readonly texture: {
              readonly sampleType: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';
              readonly viewDimension: GPUTextureViewDimension;
              readonly multisampled: boolean;
          };
      }
    | {
          readonly storageTexture: {
              readonly format: GPUTextureFormat;
              readonly access: 'write-only' | 'read-only' | 'read-write';
              readonly viewDimension: GPUTextureViewDimension;
          };
      }
    | { readonly sampler: 'filtering' | 'comparison' };

/** Entrada de layout inferida para um binding usado pelas entradas pedidas. */
export interface InferredEntry {
    readonly binding: number;
    /** Nome da variável — chave dos bindings privados de um Flow. */
    readonly name: string;
    /** Struct (ou elemento de `array<…>`) do binding — chave de `consumes`. */
    readonly typeName: string;
    /** Bitmask `GPUShaderStage` dos estágios das entradas pedidas que usam o binding. */
    readonly visibility: number;
    readonly resource: InferredResource;
}

/** Entradas de um `@group(N)`. Grupos sem binding usado ficam com `entries` vazio (o índice é preservado). */
export interface InferredGroup {
    readonly group: number;
    readonly entries: readonly InferredEntry[];
}

/** Layout de um pipeline: um grupo por índice de 0 até o maior grupo usado. */
export interface InferredLayout {
    readonly groups: readonly InferredGroup[];
}

/** Erro de inferência: entrada inexistente ou tipo de binding que a inferência não sabe ligar. */
export class LayoutInferenceError extends Error {
    override readonly name = 'LayoutInferenceError';
}

const BINDING_PATTERN =
    /@group\s*\(\s*(\d+)\s*\)\s*@binding\s*\(\s*(\d+)\s*\)\s*var(?:\s*<\s*([a-z_]+)(?:\s*,\s*([a-z_]+))?\s*>)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^;]+);/g;
const FN_PATTERN = /((?:@[A-Za-z_]+(?:\s*\([^)]*\))?\s*)*)\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const CALL_PATTERN = /(?<![@.\w])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

const STAGE_BIT: Readonly<Record<WgslStage, number>> = { vertex: 1, fragment: 2, compute: 4 };

interface FnInfo {
    readonly name: string;
    readonly stage: WgslStage | undefined;
    readonly body: string;
    readonly calls: ReadonlySet<string>;
}

/**
 * Inferência de layout da Camada 2 a partir do WGSL montado (`composeWgsl`): grupos, bindings, tipo de cada recurso
 * e visibilidade. A visibilidade de um binding é a união dos estágios das entradas que **alcançam** — por chamadas
 * transitivas entre funções de módulo — uma função que cita a variável; usar a variável só numa função auxiliar
 * conta. É a base da ligação feita pela C2 (`flowBinding`): o estágio nunca escreve layouts à mão.
 *
 * Não é um parser completo de WGSL: varre declarações de módulo (`fn`, `var` com `@group/@binding`) com o fonte sem
 * comentários, e corpos de função pelo casamento de chaves.
 */
export class LayoutInferencer {
    /** Bindings do fonte com os estágios de todas as entradas que os usam. */
    parseWGSL(source: string): WgslBindingInfo {
        const code = stripWgslComments(source);
        const fns = collectFunctions(code);
        const entries = [...fns.values()].filter((f) => f.stage !== undefined);
        return {
            bindings: collectBindings(code).map((b) => {
                const stages = new Set<WgslStage>();
                for (const e of entries) {
                    if (reachesUse(e.name, b.name, fns)) stages.add(e.stage!);
                }
                return { ...b, stages };
            }),
        };
    }

    /**
     * Layout das entradas `entryPoints` de um shader montado: só os bindings usados por elas, com visibilidade dos
     * estágios delas. Grupos sem uso entre 0 e o maior grupo usado aparecem vazios (o índice do `@group` é o índice
     * do layout no pipeline).
     *
     * @throws LayoutInferenceError se uma entrada não é função de entrada do fonte, ou se o tipo de um binding usado
     *   não é ligável (ex.: `texture_external`).
     */
    infer(shader: ComposedShader | string, entryPoints: readonly string[]): InferredLayout {
        const source = typeof shader === 'string' ? shader : shader.spec.source;
        const code = stripWgslComments(source);
        const fns = collectFunctions(code);
        for (const ep of entryPoints) {
            if (fns.get(ep)?.stage === undefined) {
                throw new LayoutInferenceError(
                    `LayoutInferencer: entrada '${ep}' não é função @vertex/@fragment/@compute do shader.`,
                );
            }
        }
        const byGroup = new Map<number, InferredEntry[]>();
        let maxGroup = -1;
        for (const b of collectBindings(code)) {
            let visibility = 0;
            for (const ep of entryPoints) {
                if (reachesUse(ep, b.name, fns)) visibility |= STAGE_BIT[fns.get(ep)!.stage!];
            }
            if (visibility === 0) continue;
            const list = byGroup.get(b.group) ?? [];
            list.push({
                binding: b.binding,
                name: b.name,
                typeName: typeNameOf(b.typeText),
                visibility,
                resource: resourceOf(b),
            });
            byGroup.set(b.group, list);
            maxGroup = Math.max(maxGroup, b.group);
        }
        const groups: InferredGroup[] = [];
        for (let g = 0; g <= maxGroup; g++) {
            const entries = (byGroup.get(g) ?? []).sort((a, b) => a.binding - b.binding);
            groups.push({ group: g, entries });
        }
        return { groups };
    }
}

type ParsedBinding = Omit<WgslBinding, 'stages'>;

function collectBindings(code: string): ParsedBinding[] {
    const out: ParsedBinding[] = [];
    for (const m of code.matchAll(BINDING_PATTERN)) {
        const [, group, binding, space, access, name, typeText] = m;
        out.push({
            group: Number(group),
            binding: Number(binding),
            name: name!,
            typeText: typeText!.trim(),
            ...(space === 'uniform' || space === 'storage' ? { addressSpace: space } : {}),
            ...(space === 'storage'
                ? { access: (access ?? 'read') as NonNullable<WgslBinding['access']> }
                : {}),
        });
    }
    return out;
}

function collectFunctions(code: string): Map<string, FnInfo> {
    const fns = new Map<string, FnInfo>();
    for (const m of code.matchAll(FN_PATTERN)) {
        const attrs = m[1] ?? '';
        const name = m[2]!;
        const open = code.indexOf('{', m.index + m[0].length);
        if (open < 0) continue;
        const close = matchingBrace(code, open);
        const body = code.slice(open, close + 1);
        const stage = /@vertex\b/.test(attrs)
            ? 'vertex'
            : /@fragment\b/.test(attrs)
              ? 'fragment'
              : /@compute\b/.test(attrs)
                ? 'compute'
                : undefined;
        const calls = new Set<string>();
        for (const c of body.matchAll(CALL_PATTERN)) calls.add(c[1]!);
        fns.set(name, { name, stage, body, calls });
    }
    return fns;
}

function matchingBrace(code: string, open: number): number {
    let depth = 0;
    for (let i = open; i < code.length; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}' && --depth === 0) return i;
    }
    return code.length - 1;
}

/** A entrada `entry` alcança (ela ou uma função chamada transitivamente) um uso de `name`? */
function reachesUse(entry: string, name: string, fns: ReadonlyMap<string, FnInfo>): boolean {
    const word = new RegExp(`(?<![.\\w])${name}\\b`);
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length > 0) {
        const fn = fns.get(stack.pop()!);
        if (fn === undefined || seen.has(fn.name)) continue;
        seen.add(fn.name);
        if (word.test(fn.body)) return true;
        for (const c of fn.calls) if (fns.has(c)) stack.push(c);
    }
    return false;
}

/** Struct do binding: o elemento de `array<T>`/`array<T, N>`, senão o próprio tipo. */
function typeNameOf(typeText: string): string {
    const t = typeText.replace(/\s+/g, ' ').trim();
    const array = /^array\s*<\s*(.+?)\s*(?:,\s*[^,<>]+)?>$/.exec(t);
    return array !== null ? array[1]!.trim() : t;
}

const SAMPLE_TYPE: Readonly<Record<string, 'float' | 'sint' | 'uint'>> = {
    f32: 'float',
    i32: 'sint',
    u32: 'uint',
};

const ACCESS: Readonly<Record<string, 'write-only' | 'read-only' | 'read-write'>> = {
    write: 'write-only',
    read: 'read-only',
    read_write: 'read-write',
};

function viewDimensionOf(kind: string): GPUTextureViewDimension {
    if (kind.endsWith('2d_array')) return '2d-array';
    if (kind.endsWith('cube_array')) return 'cube-array';
    if (kind.endsWith('cube')) return 'cube';
    if (kind.endsWith('3d')) return '3d';
    if (kind.endsWith('1d')) return '1d';
    return '2d';
}

function resourceOf(b: ParsedBinding): InferredResource {
    if (b.addressSpace === 'uniform') return 'uniform';
    if (b.addressSpace === 'storage') return b.access === 'read' ? 'read-only-storage' : 'storage';
    const t = b.typeText.replace(/\s+/g, '');
    if (t === 'sampler') return { sampler: 'filtering' };
    if (t === 'sampler_comparison') return { sampler: 'comparison' };
    const storage = /^(texture_storage_\w+)<(\w+),(\w+)>$/.exec(t);
    if (storage !== null) {
        return {
            storageTexture: {
                format: storage[2] as GPUTextureFormat,
                access: ACCESS[storage[3]!] ?? 'write-only',
                viewDimension: viewDimensionOf(storage[1]!),
            },
        };
    }
    const depth = /^(texture_depth(?:_multisampled)?_\w+)$/.exec(t);
    if (depth !== null) {
        return {
            texture: {
                sampleType: 'depth',
                viewDimension: viewDimensionOf(depth[1]!),
                multisampled: depth[1]!.includes('multisampled'),
            },
        };
    }
    const sampled = /^(texture_(?:multisampled_)?\w+)<(\w+)>$/.exec(t);
    if (sampled !== null) {
        return {
            texture: {
                sampleType: SAMPLE_TYPE[sampled[2]!] ?? 'float',
                viewDimension: viewDimensionOf(sampled[1]!),
                multisampled: sampled[1]!.includes('multisampled'),
            },
        };
    }
    throw new LayoutInferenceError(
        `LayoutInferencer: binding '${b.name}' (@group(${b.group}) @binding(${b.binding})) com tipo '${b.typeText}' não é ligável.`,
    );
}
