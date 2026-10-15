import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { EXTENSION_PARAMS_CAPACITY } from '../descriptors/ExtensionRecord';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import { wgslModule, type WgslModule } from '../shaders/WgslModule';
import type { PointImplementation, WgslPoint } from '../shaders/WgslPoint';
import { Entity } from './Entity';
import type { Resource } from './Resource';
import { ResourceState } from './ResourceState';

/** Tipo de um parâmetro de função de ponto. */
export type ExtensionParamType =
    | 'f32'
    | 'u32'
    | 'i32'
    | 'vec2f'
    | 'vec3f'
    | 'vec4f'
    | 'vec2u'
    | 'vec3u'
    | 'vec4u'
    | 'vec2i'
    | 'vec3i'
    | 'vec4i';

/** Valor de um parâmetro: número (escalar) ou lista (vetor). */
export type ExtensionParamValue = number | readonly number[];

/** Opções de uma função de ponto. */
export interface ExtensionFunctionOptions {
    /** Código WGSL com a função do ponto (e auxiliares). Usa o struct de parâmetros pelo alias do ponto. */
    readonly code: string;
    /** Parâmetros: nome → tipo (até 32 escalares no total). */
    readonly params?: Readonly<Record<string, ExtensionParamType>>;
    /** Valores iniciais (default 0). */
    readonly values?: Readonly<Record<string, ExtensionParamValue>>;
    /** Módulos do núcleo que o código usa (ex.: `wgslLib.quat`, `wgslLib.noise`). */
    readonly requires?: readonly WgslModule[];
}

/** Dado de uma função de ponto (layout de `extensionRecordSchema`). */
export interface ExtensionParamsData {
    v0: number[];
    v1: number[];
    v2: number[];
    v3: number[];
    v4: number[];
    v5: number[];
    v6: number[];
    v7: number[];
    revision: number;
    kind: number;
    _pad1: number;
    _pad2: number;
}

const SCALAR: Record<ExtensionParamType, ['f' | 'u' | 'i', number]> = {
    f32: ['f', 1],
    u32: ['u', 1],
    i32: ['i', 1],
    vec2f: ['f', 2],
    vec3f: ['f', 3],
    vec4f: ['f', 4],
    vec2u: ['u', 2],
    vec3u: ['u', 3],
    vec4u: ['u', 4],
    vec2i: ['i', 2],
    vec3i: ['i', 3],
    vec4i: ['i', 4],
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Módulos já gerados e validados, por ponto, hash (ponto, parâmetros, código, módulos exigidos) e variante: instâncias
 * com o mesmo código compartilham o módulo (e portanto o shader montado) e a validação roda uma vez.
 */
const built = new Map<string, { readonly module: WgslModule; readonly prefix: number }>();

/** FNV-1a de 32 bits em hexadecimal. */
function fnv(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/** Parâmetro com a posição dos seus escalares no registro. */
interface ParamSlot {
    readonly name: string;
    readonly type: ExtensionParamType;
    readonly kind: 'f' | 'u' | 'i';
    readonly first: number;
    readonly size: number;
}

const bits = new DataView(new ArrayBuffer(4));
function toBits(kind: 'f' | 'u' | 'i', value: number): number {
    if (kind === 'f') bits.setFloat32(0, value, true);
    else if (kind === 'i') bits.setInt32(0, value, true);
    else bits.setUint32(0, value, true);
    return bits.getUint32(0, true);
}
function fromBits(kind: 'f' | 'u' | 'i', raw: number): number {
    bits.setUint32(0, raw, true);
    if (kind === 'f') return bits.getFloat32(0, true);
    if (kind === 'i') return bits.getInt32(0, true);
    return raw;
}

/**
 * Função de um ponto de extensão (spec 009): Resource com o código WGSL do usuário para o ponto `point`, os
 * parâmetros declarados por nome e tipo e os seus valores. O código é validado na criação e em `setCode`
 * (`point.check`: assinatura, símbolos, montagem em cada kernel do ponto) — erro síncrono nomeando o ponto. Os
 * parâmetros vivem no pool do ponto (`point.record`, um registro por função); mudar `values` vale no quadro seguinte sem
 * recompilar. `setCode` troca o código: a revisão sobe, o estágio dono compila o módulo novo e só troca quando ele
 * compila (erro de compilação: evento `extensionRejected`, e o módulo anterior continua).
 *
 * O módulo gerado contém o struct dos parâmetros (`<alias>`: o alias do ponto, ex. `TransformFnParams`), o carregador
 * `<função>_params(r: <registro do ponto>) -> <alias>` e o código. Pontos com várias funções no mesmo shader (`field`)
 * recebem nomes com sufixo do hash (`renamed`).
 */
export abstract class ExtensionFunction
    extends Entity<ExtensionParamsData>
    implements Resource, PointImplementation
{
    state: ResourceState = ResourceState.Uninitialized;
    /** Ponto de extensão. */
    readonly point: WgslPoint;
    /** Parâmetros declarados (nome → tipo). */
    readonly params: Readonly<Record<string, ExtensionParamType>>;
    /** Valores dos parâmetros por nome (leitura e escrita; escrever envia no quadro seguinte). */
    readonly values: Record<string, ExtensionParamValue>;
    /** Módulos do núcleo que o código usa. */
    readonly requires: readonly WgslModule[];
    /** Renomeia a função, o alias e o carregador com o hash (ponto de cena: várias funções no mesmo shader). */
    readonly renamed: boolean;

    #code: string;
    #module: WgslModule;
    #prefixLines = 0;
    #hash = '';
    readonly #slots: readonly ParamSlot[];

    protected constructor(point: WgslPoint, options: ExtensionFunctionOptions) {
        super();
        this.point = point;
        // Pontos de cena compõem várias funções no mesmo shader: nomes com o sufixo do hash.
        const renamed = point.scene !== undefined;
        this.params = Object.freeze({ ...(options.params ?? {}) });
        this.requires = Object.freeze([...(options.requires ?? [])]);
        this.renamed = renamed;
        const slots: ParamSlot[] = [];
        let first = 0;
        for (const [name, type] of Object.entries(this.params)) {
            if (!IDENT.test(name))
                throw new TypeError(
                    `${point.name}: parâmetro '${name}' não é um identificador WGSL`,
                );
            // Tipo vindo de JavaScript sem checagem: confere em tempo de execução.
            const s = (SCALAR as Partial<Record<string, ['f' | 'u' | 'i', number]>>)[type];
            if (s === undefined)
                throw new TypeError(
                    `${point.name}: parâmetro '${name}' com tipo '${type}' não suportado`,
                );
            slots.push({ name, type, kind: s[0], first, size: s[1] });
            first += s[1];
        }
        if (first > EXTENSION_PARAMS_CAPACITY) {
            throw new RangeError(
                `${point.name}: ${first} escalares de parâmetros (máximo ${EXTENSION_PARAMS_CAPACITY})`,
            );
        }
        this.#slots = Object.freeze(slots);
        const data = point.record.applyDefaults({}) as unknown as ExtensionParamsData;
        for (let k = 0; k < 8; k++)
            (data as unknown as Record<string, number[]>)[`v${k}`] = [0, 0, 0, 0];
        this.data = data;
        this.values = this.#valuesAccessor();
        for (const [name, value] of Object.entries(options.values ?? {})) {
            if (!(name in this.params))
                throw new TypeError(`${point.name}: valor para parâmetro desconhecido '${name}'`);
            this.values[name] = value;
        }
        this.#code = options.code;
        this.#module = this.#build(options.code);
    }

    /** Código WGSL atual. */
    get code(): string {
        return this.#code;
    }

    /** Módulo gerado do código atual (struct, carregador e código). */
    get module(): WgslModule {
        return this.#module;
    }

    /** Revisão do código (sobe a cada `setCode`). */
    get revision(): number {
        return this.rawData.revision;
    }

    /** Nome do struct de parâmetros gerado. */
    get paramsStruct(): string {
        return `${this.point.paramsAlias}_${this.#hash}`;
    }

    /** Nome da função obrigatória no módulo (com sufixo quando `renamed`). */
    get functionName(): string {
        return this.renamed
            ? `${this.point.required.name}_${this.#hash}`
            : this.point.required.name;
    }

    /** Nome do carregador de parâmetros no módulo. */
    get loaderName(): string {
        const base = `${this.point.required.name}_params`;
        return this.renamed ? `${base}_${this.#hash}` : base;
    }

    /** Linha no código do usuário de uma linha do módulo gerado (≤ 0: no trecho gerado). */
    codeLine(moduleLine: number): number {
        return moduleLine - this.#prefixLines;
    }

    /**
     * Troca o código. Valida na hora (lança como na criação, e o código anterior continua); a revisão sobe e o
     * estágio dono compila o módulo novo.
     */
    setCode(code: string): void {
        const module = this.#build(code);
        this.#code = code;
        this.#module = module;
        this.data.revision = this.rawData.revision + 1;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'params', role: 'storage-ro', schema: this.point.record, storage: 'pool' }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    #build(code: string): WgslModule {
        const point = this.point;
        const sig = Object.entries(this.params)
            .map(([n, t]) => `${n}:${t}`)
            .join(',');
        const requires = this.requires.map((m) => m.name).join(',');
        const hash = fnv(`${point.name}|${sig}|${requires}|${code}`);
        const cacheKey = `${point.name}|${hash}|${this.renamed ? 'renamed' : 'plain'}`;
        const cached = built.get(cacheKey);
        if (cached?.module.requires.every((m, k) => m === this.requires[k]) === true) {
            this.#prefixLines = cached.prefix;
            this.#hash = hash;
            return cached.module;
        }
        const struct = `${point.paramsAlias}_${hash}`;
        const fields =
            this.#slots.length === 0
                ? ['    _unused: u32,']
                : this.#slots.map((s) => `    ${s.name}: ${s.type},`);
        const load = (k: number, kind: 'f' | 'u' | 'i'): string => {
            const raw = `r.v${Math.floor(k / 4)}[${k % 4}]`;
            return kind === 'u' ? raw : `bitcast<${kind === 'f' ? 'f32' : 'i32'}>(${raw})`;
        };
        const args =
            this.#slots.length === 0
                ? ['0u']
                : this.#slots.map((s) => {
                      const comps = Array.from({ length: s.size }, (_, c) =>
                          load(s.first + c, s.kind),
                      );
                      return s.size === 1 ? comps[0]! : `${s.type}(${comps.join(', ')})`;
                  });
        const make = (renamed: boolean): { module: WgslModule; prefix: number } => {
            const suffix = renamed ? `_${hash}` : '';
            const alias = renamed ? `${point.paramsAlias}${suffix}_alias` : point.paramsAlias;
            const loader = `${point.required.name}_params${suffix}`;
            const prefix = [
                `// Função do ponto '${point.name}' (gerado: struct de parâmetros e carregador).`,
                `struct ${struct} {`,
                ...fields,
                '}',
                `alias ${alias} = ${struct};`,
                `fn ${loader}(r: ${point.record.wgslName}) -> ${struct} {`,
                `    return ${struct}(${args.join(', ')});`,
                '}',
            ];
            const body = renamed
                ? code
                      .replace(
                          new RegExp(`\\b${point.required.name}\\b`, 'g'),
                          `${point.required.name}${suffix}`,
                      )
                      .replace(new RegExp(`\\b${point.paramsAlias}\\b`, 'g'), alias)
                : code;
            const module = wgslModule({
                name: `${point.name}_fn_${hash}`,
                source: `${prefix.join('\n')}\n${body}`,
                requires: this.requires,
                structs: [point.record],
            });
            return { module, prefix: prefix.length };
        };
        // A validação usa os nomes do ponto (é o que cada kernel do ponto monta); a versão renomeada é a usada quando
        // várias funções do ponto entram no mesmo shader.
        const plain = make(false);
        point.check(plain.module, struct);
        const { module, prefix } = this.renamed ? make(true) : plain;
        built.set(cacheKey, { module, prefix });
        this.#prefixLines = prefix;
        this.#hash = hash;
        return module;
    }

    #valuesAccessor(): Record<string, ExtensionParamValue> {
        const out: Record<string, ExtensionParamValue> = {};
        for (const s of this.#slots) {
            Object.defineProperty(out, s.name, {
                enumerable: true,
                get: (): ExtensionParamValue => {
                    const raw = this.rawData as unknown as Record<string, number[]>;
                    const read = (k: number): number =>
                        fromBits(s.kind, raw[`v${Math.floor(k / 4)}`]![k % 4]!);
                    return s.size === 1
                        ? read(s.first)
                        : Array.from({ length: s.size }, (_, c) => read(s.first + c));
                },
                set: (value: ExtensionParamValue): void => {
                    const list = typeof value === 'number' ? [value] : value;
                    if (list.length !== s.size || list.some((v) => !Number.isFinite(v))) {
                        throw new TypeError(
                            `${this.point.name}: '${s.name}' (${s.type}) espera ${s.size} número(s) finito(s)`,
                        );
                    }
                    const touched = new Set<number>();
                    const raw = this.rawData as unknown as Record<string, number[]>;
                    const next = new Map<number, number[]>();
                    for (let c = 0; c < s.size; c++) {
                        const k = s.first + c;
                        const v = Math.floor(k / 4);
                        touched.add(v);
                        const row = next.get(v) ?? [...raw[`v${v}`]!];
                        row[k % 4] = toBits(s.kind, list[c]!);
                        next.set(v, row);
                    }
                    // Atribui o vetor inteiro: a C2 vê a mutação e envia o registro.
                    const data = this.data as unknown as Record<string, number[]>;
                    for (const v of touched) data[`v${v}`] = next.get(v)!;
                },
            });
        }
        return Object.freeze(out);
    }
}
