import type { StructSchema } from '../descriptors/StructSchema';
import { bindPoints } from './bindPoints';
import { composeWgsl } from './composeWgsl';
import { stripWgslComments } from './scanWgslSymbols';
import { WgslCompositionError } from './WgslCompositionError';
import type { WgslModule } from './WgslModule';

/** Tipo de parâmetro que aceita o struct de parâmetros da função (ou o alias do ponto). */
export const POINT_PARAMS = '$P';

/** Assinatura de uma função de ponto: nome, tipos dos parâmetros (na ordem) e retorno. */
export interface WgslPointSignature {
    /** Nome da função WGSL. */
    readonly name: string;
    /** Tipos WGSL dos parâmetros; `POINT_PARAMS` = struct de parâmetros da função. */
    readonly params: readonly string[];
    /** Tipo de retorno (`''` = sem retorno). */
    readonly returns: string;
}

/** Opções de `wgslPoint`. */
export interface WgslPointOptions {
    /** Nome do ponto (ex.: `transform`). */
    readonly name: string;
    /** Função obrigatória. */
    readonly required: WgslPointSignature;
    /** Funções que a implementação pode definir (derivadas, Jacobiana, projeção). */
    readonly optional?: readonly WgslPointSignature[];
    /** Alias do struct de parâmetros que os kernels usam (ex.: `TransformFnParams`). */
    readonly paramsAlias: string;
    /** Schema do registro de parâmetros do ponto (`extensionRecordSchema`; um pool por ponto). */
    readonly record: StructSchema;
    /** Implementação pronta: o módulo que os kernels exigem e que uma função do usuário substitui. */
    readonly ready: WgslModule;
    /** Módulos de entrada (kernels) que usam o ponto — a validação monta cada um com a função do usuário. */
    readonly hosts?: () => readonly WgslModule[];
    /**
     * Ponto de cena (ex.: `field`, `space`): as funções inseridas na cena valem para todo pipeline cujo shader contém o
     * ponto — a C2 compõe as funções (`combine`) e troca o pronto em cada pipeline (spec 009).
     */
    readonly scene?: ScenePointOptions;
}

/** Uma função de ponto de cena composta: a implementação e o slot do seu registro de parâmetros. */
export interface ScenePointEntry {
    /** A função. */
    readonly impl: PointImplementation;
    /** Slot do registro de parâmetros da função no pool do ponto. */
    readonly slot: number;
}

/** Variável global de ponto de cena: um pool e a parte dele ligada. */
export interface ScenePointGlobal {
    /** Schema do pool. */
    readonly pool: StructSchema;
    /** Registros (default) ou o bitset dos slots vivos. */
    readonly part?: 'records' | 'live';
}

/** O que faz de um ponto um ponto de cena. */
export interface ScenePointOptions {
    /**
     * Variáveis globais que os kernels do ponto declaram e a C2 liga (nome → pool e parte): os registros do pool
     * (`'records'`) ou o bitset dos slots vivos (`'live'`), quando o pool existe; senão, um substituto zerado (nenhum
     * registro vivo).
     */
    readonly globals: Readonly<Record<string, ScenePointGlobal>>;
    /**
     * Módulo que toma o lugar do pronto com as funções da cena (as implementações são renomeadas com o hash para
     * conviverem no mesmo shader). Chamado só com ao menos uma função.
     */
    combine(entries: readonly ScenePointEntry[]): WgslModule;
}

/**
 * Ponto de extensão matemático (spec 009): uma função de assinatura fixa que um estágio chama e que o usuário pode
 * escrever. Os kernels exigem o módulo pronto (`ready`); `bindPoints` troca esse módulo pelo do usuário antes da
 * montagem, e `check` valida a troca na criação — nunca por quadro.
 */
export interface WgslPoint {
    /** Nome do ponto. */
    readonly name: string;
    /** Função obrigatória. */
    readonly required: WgslPointSignature;
    /** Funções opcionais. */
    readonly optional: readonly WgslPointSignature[];
    /** Alias do struct de parâmetros. */
    readonly paramsAlias: string;
    /** Schema do registro de parâmetros. */
    readonly record: StructSchema;
    /** Implementação pronta. */
    readonly ready: WgslModule;
    /** Kernels que usam o ponto. */
    readonly hosts: () => readonly WgslModule[];
    /** Ponto de cena (funções compostas para a cena inteira); `undefined` nos pontos por entidade. */
    readonly scene: ScenePointOptions | undefined;
    /**
     * Valida a implementação `module` (struct de parâmetros `paramsStruct`): a função obrigatória existe com a
     * assinatura; as opcionais definidas têm a assinatura; cada kernel monta com ela (sem símbolo em conflito nem
     * chamada sem definição). Lança `WgslCompositionError` (`point-signature`, `symbol-conflict`, …) nomeando o
     * ponto, o esperado e o recebido.
     */
    check(module: WgslModule, paramsStruct: string): void;
    /** As funções opcionais que `module` define. */
    optionalIn(module: WgslModule): readonly WgslPointSignature[];
}

/**
 * Implementação de um ponto composta num shader (a `ExtensionFunction` da cena): o que a C2 usa para traduzir a linha
 * de um erro do compilador e anunciar a rejeição.
 */
export interface PointImplementation {
    /** Ponto implementado. */
    readonly point: WgslPoint;
    /** Módulo gerado do código atual. */
    readonly module: WgslModule;
    /** Revisão do código. */
    readonly revision: number;
    /** Nome da função obrigatória no módulo (com o sufixo do hash nos pontos de cena). */
    readonly functionName: string;
    /** Nome do carregador de parâmetros no módulo. */
    readonly loaderName: string;
    /** Linha no código do usuário de uma linha do módulo (≤ 0: trecho gerado). */
    codeLine(moduleLine: number): number;
}

interface ParsedFn {
    readonly params: readonly string[];
    readonly returns: string;
}

const FN = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/** Tira espaços (tipos comparados sem formatação: `vec3< f32 >` ≡ `vec3<f32>`). */
const norm = (type: string): string => type.replace(/\s+/g, '');

/** Lê as funções de nível superior do fonte: tipos dos parâmetros e retorno. */
function parseFunctions(source: string): Map<string, ParsedFn> {
    const src = stripWgslComments(source);
    const out = new Map<string, ParsedFn>();
    for (const m of src.matchAll(FN)) {
        const name = m[1]!;
        let i = m.index + m[0].length;
        let depth = 1;
        const start = i;
        for (; i < src.length && depth > 0; i++) {
            if (src[i] === '(') depth++;
            else if (src[i] === ')') depth--;
        }
        const inside = src.slice(start, i - 1);
        const params: string[] = [];
        let angle = 0;
        let cur = '';
        for (const c of inside) {
            if (c === '<') angle++;
            if (c === '>') angle--;
            if (c === ',' && angle === 0) {
                params.push(cur);
                cur = '';
            } else cur += c;
        }
        if (cur.trim().length > 0) params.push(cur);
        const types = params.map((p) => {
            const colon = p.indexOf(':');
            return norm(colon < 0 ? p : p.slice(colon + 1)).replace(/^@[^ ]*/, '');
        });
        const brace = src.indexOf('{', i);
        const head = src.slice(i, brace < 0 ? src.length : brace);
        const arrow = head.indexOf('->');
        const returns =
            arrow < 0 ? '' : norm(head.slice(arrow + 2)).replace(/^@[A-Za-z_]+(\([^)]*\))?/, '');
        out.set(name, { params: types, returns });
    }
    return out;
}

const show = (s: WgslPointSignature): string =>
    `fn ${s.name}(${s.params.join(', ')})${s.returns === '' ? '' : ` -> ${s.returns}`}`;

/** Pontos de cena pelo módulo pronto (os kernels exigem o pronto; a C2 acha o ponto pela árvore do shader). */
const sceneByReady = new WeakMap<WgslModule, WgslPoint>();

/** Os pontos de cena cujo módulo pronto está na árvore de `shader`. */
export function scenePointsIn(shader: WgslModule): readonly WgslPoint[] {
    const out: WgslPoint[] = [];
    const seen = new Set<WgslModule>();
    const walk = (m: WgslModule): void => {
        if (seen.has(m)) return;
        seen.add(m);
        const p = sceneByReady.get(m);
        if (p !== undefined) out.push(p);
        m.requires.forEach(walk);
    };
    walk(shader);
    return out;
}

/** Cria um ponto de extensão. */
export function wgslPoint(options: WgslPointOptions): WgslPoint {
    const optional = Object.freeze([...(options.optional ?? [])]);
    const hosts = options.hosts ?? (() => []);
    const matches = (sig: WgslPointSignature, fn: ParsedFn, paramsStruct: string): boolean => {
        if (fn.params.length !== sig.params.length) return false;
        if (norm(sig.returns) !== fn.returns) return false;
        return sig.params.every((t, k) =>
            t === POINT_PARAMS
                ? fn.params[k] === paramsStruct || fn.params[k] === options.paramsAlias
                : norm(t) === fn.params[k],
        );
    };
    const point: WgslPoint = {
        name: options.name,
        required: options.required,
        optional,
        paramsAlias: options.paramsAlias,
        record: options.record,
        ready: options.ready,
        hosts,
        scene: options.scene,
        check(module: WgslModule, paramsStruct: string): void {
            const fns = parseFunctions(module.source);
            for (const sig of [options.required, ...optional]) {
                const fn = fns.get(sig.name);
                if (fn === undefined) {
                    if (sig !== options.required) continue;
                    throw new WgslCompositionError(
                        'point-signature',
                        `ponto '${options.name}': falta a função ${show(sig)} em '${module.name}'`,
                        [options.name, show(sig), ''],
                    );
                }
                if (!matches(sig, fn, paramsStruct)) {
                    const got = show({ name: sig.name, params: fn.params, returns: fn.returns });
                    throw new WgslCompositionError(
                        'point-signature',
                        `ponto '${options.name}': assinatura esperada ${show(sig).replace(POINT_PARAMS, paramsStruct)}, recebida ${got}`,
                        [options.name, show(sig), got],
                    );
                }
            }
            // Ponto de cena: os kernels recebem a composição das funções (aqui, só esta), não a função crua.
            const impl =
                options.scene === undefined
                    ? module
                    : options.scene.combine([
                          {
                              impl: {
                                  point,
                                  module,
                                  revision: 0,
                                  functionName: options.required.name,
                                  loaderName: `${options.required.name}_params`,
                                  codeLine: (line) => line,
                              },
                              slot: 0,
                          },
                      ]);
            for (const host of hosts()) composeWgsl(bindPoints(host, new Map([[point, impl]])));
        },
        optionalIn(module: WgslModule): readonly WgslPointSignature[] {
            const fns = parseFunctions(module.source);
            return optional.filter((s) => fns.has(s.name));
        },
    };
    const frozen = Object.freeze(point);
    if (options.scene !== undefined) sceneByReady.set(options.ready, frozen);
    return frozen;
}
