import type { ExtensionParamType } from '../contracts/ExtensionParams';
import { paramFields } from '../contracts/ParamRecord';
import { FieldType } from '../descriptors/FieldType';
import type { Schema } from '../descriptors/Schema';
import { StructSchema } from '../descriptors/StructSchema';
import { bindPoints, type BindablePoint } from './bindPoints';
import { composeWgsl } from './composeWgsl';
import { stripWgslComments } from './scanWgslSymbols';
import { WgslCompositionError } from './WgslCompositionError';
import type { WgslModule } from './WgslModule';
import { wgslResource, type WgslResource } from './WgslResource';

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
    /**
     * Retornos alternativos aceitos (spec 011): a função pode devolver um deles no lugar de `returns`; quem hospeda o
     * ponto escolhe o adaptador pelo retorno lido (ex.: o ponto `material` aceita `SurfaceParams` ou `Closure`).
     */
    readonly alternatives?: readonly string[];
    /**
     * Nomes dos parâmetros (spec 031: os argumentos que um grafo de nós lê pelo nome); padrão `a0`, `a1`… O parâmetro
     * de `POINT_PARAMS` é sempre `data`.
     */
    readonly names?: readonly string[];
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
    /** Estágio em que a função é avaliada (spec 031: nós só de fragmento valem só em `fragment`). Padrão `compute`. */
    readonly context?: 'fragment' | 'vertex' | 'compute';
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
    /** Slot do registro de parâmetros da função no pool da forma dela (registro tipado, spec 031 R8). */
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
    /** Implementação pronta. */
    readonly ready: WgslModule;
    /** Kernels que usam o ponto. */
    readonly hosts: () => readonly WgslModule[];
    /** Ponto de cena (funções compostas para a cena inteira); `undefined` nos pontos por entidade. */
    readonly scene: ScenePointOptions | undefined;
    /** Estágio em que a função é avaliada. */
    readonly context: 'fragment' | 'vertex' | 'compute';
    /**
     * Valida a implementação `module` (struct de parâmetros `paramsStruct`): a função obrigatória existe com a
     * assinatura; as opcionais definidas têm a assinatura; cada kernel monta com ela (sem símbolo em conflito nem
     * chamada sem definição). Lança `WgslCompositionError` (`point-signature`, `symbol-conflict`, …) nomeando o
     * ponto, o esperado e o recebido.
     */
    check(module: WgslModule, paramsStruct: string): void;
    /** As funções opcionais que `module` define. */
    optionalIn(module: WgslModule): readonly WgslPointSignature[];
    /**
     * Registro tipado da forma `params` (spec 031, R8): um struct por forma, memorizado — a mesma forma (mesmos nomes e
     * tipos, na ordem) dá o mesmo schema e o mesmo pool, quaisquer que sejam os valores.
     * @throws TypeError nome de parâmetro inválido ou reservado (`revision`), ou tipo não suportado.
     */
    record(params: Readonly<Record<string, ExtensionParamType>>): PointRecord;
    /** `schema` é o registro de alguma forma deste ponto (o que os estágios escutam: `Flow.listens`)? */
    isRecord(schema: Schema): boolean;
}

/**
 * Registro dos parâmetros de uma forma de função de ponto (spec 031, R8): o struct `<alias>_<hash>` com um campo por
 * parâmetro, com o tipo declarado, e a revisão do código (`revision`) — sem `bitcast` e sem teto de escalares. O nome
 * do schema, `<ponto>:<hash>`, é a chave do pool: as funções da mesma forma ocupam o mesmo pool, um registro cada.
 */
export interface PointRecord {
    /** Schema do registro (nome `<ponto>:<hash>`, struct `<alias>_<hash>`). */
    readonly schema: StructSchema;
    /**
     * O pool da forma no shader (`<ponto>_records_<hash>: array<struct>`, frequência `batch`, fornecido pelo pool): o
     * carregador gerado de cada função da forma lê o registro dela por slot.
     */
    readonly resource: WgslResource;
    /** Hash da forma (ponto, nomes e tipos dos parâmetros). */
    readonly hash: string;
}

/** Campo da revisão do código no registro (nome reservado para parâmetros). */
const REVISION = 'revision';

/** FNV-1a de 32 bits em hexadecimal. */
function fnv(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/**
 * Ponto de contribuição de cena (spec 031, R4): um lugar no shader (ex.: `light_visibility`) cujas implementações vêm
 * de Resources da cena (`getSceneContributions`) — a sombra, a água — e que o shader chama sem conhecê-las. Sem
 * contribuinte, fica o pronto. Com um, o módulo dele toma o lugar do pronto; com vários, `combine` recebe os módulos
 * (instanciados com sufixo, na ordem) e devolve o módulo que toma o lugar do pronto.
 */
export interface ContributionPoint extends BindablePoint {
    /** Nome da função do ponto (o que os contribuintes definem). */
    readonly functionName: string;
    /** Combina dois ou mais contribuintes (os nomes das funções vêm com o sufixo `_<k>`, k na ordem). */
    combine(modules: readonly WgslModule[]): WgslModule;
}

/** Contribuição de um Resource para um ponto de cena (spec 031). */
export interface SceneContribution {
    /** O ponto. */
    readonly point: ContributionPoint;
    /** Ordem entre os contribuintes do ponto (menor primeiro). */
    readonly order: number;
    /** Pools de cujos slots o módulo depende (escritas neles reavaliam a contribuição). */
    readonly pools: readonly StructSchema[];
    /**
     * O módulo da contribuição para os slots atuais da entidade do Resource nos pools (`slotOf`), ou `undefined` se o
     * Resource não contribui agora (slot ainda ausente, condição desligada).
     */
    build(slotOf: (pool: StructSchema) => number | undefined): WgslModule | undefined;
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
    /**
     * A implementação tem função própria. `false` (grafo sem saída, spec 031): o módulo é o pronto do ponto e, nos
     * pontos de cena, a função não entra na composição.
     */
    readonly implemented: boolean;
    /** Nome da função obrigatória no módulo (com o sufixo do hash nos pontos de cena). */
    readonly functionName: string;
    /** Nome do carregador de parâmetros no módulo. */
    readonly loaderName: string;
    /** Nome no módulo da função opcional `name` do ponto, se a implementação a define (sufixo do hash nos de cena). */
    optionalName(name: string): string | undefined;
    /** Linha no código do usuário de uma linha do módulo (≤ 0: trecho gerado). */
    codeLine(moduleLine: number): number;
}

/** Assinatura lida de uma função WGSL: tipos dos parâmetros e retorno (sem espaços). */
export interface ParsedFn {
    readonly params: readonly string[];
    readonly returns: string;
}

const FN = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/** Tira espaços (tipos comparados sem formatação: `vec3< f32 >` ≡ `vec3<f32>`). */
const norm = (type: string): string => type.replace(/\s+/g, '');

/** Lê as funções de nível superior do fonte: tipos dos parâmetros e retorno. */
export function parseWgslFunctions(source: string): Map<string, ParsedFn> {
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
    `fn ${s.name}(${s.params.join(', ')})${s.returns === '' ? '' : ` -> ${[s.returns, ...(s.alternatives ?? [])].join(' | ')}`}`;

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
    /** Registros por forma (assinatura dos campos) e os schemas deles. */
    const records = new Map<string, PointRecord>();
    const schemas = new WeakSet<Schema>();
    const matches = (sig: WgslPointSignature, fn: ParsedFn, paramsStruct: string): boolean => {
        if (fn.params.length !== sig.params.length) return false;
        if (
            norm(sig.returns) !== fn.returns
            && !(sig.alternatives ?? []).map(norm).includes(fn.returns)
        )
            return false;
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
        ready: options.ready,
        hosts,
        scene: options.scene,
        context: options.context ?? 'compute',
        check(module: WgslModule, paramsStruct: string): void {
            const fns = parseWgslFunctions(module.source);
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
                                  implemented: true,
                                  functionName: options.required.name,
                                  loaderName: `${options.required.name}_params`,
                                  optionalName: (name) =>
                                      point.optionalIn(module).some((s) => s.name === name)
                                          ? name
                                          : undefined,
                                  codeLine: (line) => line,
                              },
                              slot: 0,
                          },
                      ]);
            for (const host of hosts()) composeWgsl(bindPoints(host, new Map([[point, impl]])));
        },
        optionalIn(module: WgslModule): readonly WgslPointSignature[] {
            const fns = parseWgslFunctions(module.source);
            return optional.filter((s) => fns.has(s.name));
        },
        record(params: Readonly<Record<string, ExtensionParamType>>): PointRecord {
            const fields = paramFields(options.name, params, [REVISION]);
            const signature = Object.entries(fields)
                .map(([n, t]) => `${n}:${t}`)
                .join(',');
            const known = records.get(signature);
            if (known !== undefined) return known;
            const hash = fnv(`${options.name}|${signature}`);
            const schema = new StructSchema(
                `${options.name}:${hash}`,
                { ...fields, [REVISION]: FieldType.u32 },
                { wgslName: `${options.paramsAlias}_${hash}` },
            );
            const record: PointRecord = Object.freeze({
                schema,
                hash,
                resource: wgslResource({
                    name: `${options.name}_records_${hash}`,
                    binding: { storage: 'read' },
                    type: { schema, array: true },
                    frequency: 'batch',
                    provider: { pool: schema.name },
                }),
            });
            records.set(signature, record);
            schemas.add(schema);
            return record;
        },
        isRecord(schema: Schema): boolean {
            return schemas.has(schema);
        },
    };
    const frozen = Object.freeze(point);
    if (options.scene !== undefined) sceneByReady.set(options.ready, frozen);
    return frozen;
}
