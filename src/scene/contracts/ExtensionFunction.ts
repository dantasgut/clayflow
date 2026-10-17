import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { NodeGraph } from '../graph/NodeGraph';
import type { StructSchema } from '../descriptors/StructSchema';
import type { ExtensionParamType, ExtensionParamValue } from './ExtensionParams';
import { paramValues } from './ParamRecord';
import { renameTokens } from '../shaders/instantiate';
import { wgslModule, type WgslModule } from '../shaders/WgslModule';
import type { PointImplementation, PointRecord, WgslPoint } from '../shaders/WgslPoint';
import { Entity } from './Entity';
import type { Resource } from './Resource';
import { ResourceState } from './ResourceState';

export type { ExtensionParamType, ExtensionParamValue } from './ExtensionParams';

/** Opções de uma função de ponto escrita em WGSL. */
export interface ExtensionCodeOptions {
    /** Código WGSL com a função do ponto (e auxiliares). Usa o struct de parâmetros pelo alias do ponto. */
    readonly code: string;
    readonly graph?: undefined;
    /** Parâmetros: nome → tipo (campos do registro tipado da forma; sem teto; `revision` é reservado). */
    readonly params?: Readonly<Record<string, ExtensionParamType>>;
    /** Valores iniciais (default 0). */
    readonly values?: Readonly<Record<string, ExtensionParamValue>>;
    /** Módulos do núcleo que o código usa (ex.: `wgslLib.quat`, `wgslLib.noise`). */
    readonly requires?: readonly WgslModule[];
}

/**
 * Opções de uma função de ponto montada por um grafo de nós (spec 031, US2): o código é gerado do grafo (um `let` por
 * nó), os parâmetros são os dos nós (`nó_parâmetro`) e os módulos, os dos nós.
 */
export interface ExtensionGraphOptions {
    readonly graph: NodeGraph;
    readonly code?: undefined;
    /** Valores iniciais por cima dos do grafo (`nó_parâmetro`). */
    readonly values?: Readonly<Record<string, ExtensionParamValue>>;
}

/** Opções de uma função de ponto: código WGSL ou grafo de nós. */
export type ExtensionFunctionOptions = ExtensionCodeOptions | ExtensionGraphOptions;

/**
 * Dado de uma função de ponto: o registro tipado da forma (spec 031, R8) — um campo por parâmetro, com o valor (número
 * ou vetor), e a revisão do código.
 */
export interface ExtensionParamsData {
    /** Revisão do código (sobe a cada `setCode`/`setGraph`). */
    revision: number;
    /** Valores dos parâmetros, por nome. */
    [param: string]: number | number[];
}

/**
 * Módulos já gerados e validados, por ponto, hash (ponto, parâmetros, código, módulos exigidos) e variante: instâncias
 * com o mesmo código compartilham o módulo (e portanto o shader montado) e a validação roda uma vez.
 */
const built = new Map<
    string,
    {
        readonly module: WgslModule;
        readonly prefix: number;
        readonly optionals: Set<string>;
        readonly composite: WgslModule;
    }
>();

/**
 * A função com os nomes do sufixo do hash (spec 033): várias funções do mesmo ponto convivem num shader — a composição
 * dos pontos de cena e, nos pontos por entidade, quem as reúne num kernel escolhendo pela entidade (os materiais nos
 * acertos dos raios da iluminação global).
 */
export interface CompositeFunction {
    /** Módulo com a função obrigatória, as opcionais, o alias e o carregador renomeados. */
    readonly module: WgslModule;
    /** Nome da função obrigatória no módulo. */
    readonly functionName: string;
    /** Nome do carregador de parâmetros no módulo. */
    readonly loaderName: string;
}

/** Pontos já avisados de grafo sem saída (aviso único por ponto). */
const warnedEmpty = new Set<string>();

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
 * Função de um ponto de extensão (spec 009): Resource com o código WGSL do usuário para o ponto `point`, os
 * parâmetros declarados por nome e tipo e os seus valores. O código é validado na criação e em `setCode`
 * (`point.check`: assinatura, símbolos, montagem em cada kernel do ponto) — erro síncrono nomeando o ponto.
 *
 * Os parâmetros vivem no registro tipado da forma (spec 031, R8: `point.record(params)` — struct `<alias>_<hash>` com
 * um campo por parâmetro, sem `bitcast` nem teto de escalares), no pool da forma (`<ponto>:<hash>`), um registro por
 * função: o descritor `params` é desse schema, e o `data` é o registro, campo a campo. Mudar `values` envia o registro
 * e vale no quadro seguinte sem recompilar. `setCode` troca o código: a revisão (campo do registro, separada da forma)
 * sobe, o estágio dono compila o módulo novo e só troca quando ele compila (erro de compilação: evento
 * `extensionRejected`, e o módulo anterior continua). `setGraph` com parâmetros de outra forma muda o registro: a C2
 * passa a função para o pool da forma nova (`Entity.redescribe`).
 *
 * O módulo gerado contém o alias do ponto para o struct da forma (ex. `alias TransformFnParams =
 * TransformFnParams_<hash>`), o carregador `<função>_params(slot: u32) -> <struct>` — que lê o registro no pool da forma
 * (recurso declarado `<ponto>_records_<hash>`) — e o código. Pontos com várias funções no mesmo shader (`field`)
 * recebem nomes com sufixo do hash (`renamed`).
 */
export abstract class ExtensionFunction
    extends Entity<ExtensionParamsData>
    implements Resource, PointImplementation
{
    state: ResourceState = ResourceState.Uninitialized;
    /** Ponto de extensão. */
    readonly point: WgslPoint;
    /** Renomeia a função, o alias e o carregador com o hash (ponto de cena: várias funções no mesmo shader). */
    readonly renamed: boolean;

    #params: Readonly<Record<string, ExtensionParamType>>;
    #values: Record<string, ExtensionParamValue>;
    #requires: readonly WgslModule[];
    #graph: NodeGraph | undefined;
    #code: string;
    #module: WgslModule;
    #prefixLines = 0;
    #hash = '';
    /** Funções opcionais do ponto que o código atual define. */
    #optionals = new Set<string>();
    /** Registro tipado da forma atual (ponto + parâmetros). */
    #record: PointRecord;
    /** A versão renomeada do código atual (`undefined` com a implementação pronta). */
    #composite: WgslModule | undefined;

    protected constructor(point: WgslPoint, options: ExtensionFunctionOptions) {
        super();
        this.point = point;
        // Pontos de cena compõem várias funções no mesmo shader: nomes com o sufixo do hash.
        this.renamed = point.scene !== undefined;
        const graph = options.graph;
        const code =
            graph === undefined ? options.code : ExtensionFunction.#graphCode(graph, point);
        this.#graph = graph;
        this.#params = Object.freeze({
            ...(graph === undefined ? (options.params ?? {}) : graph.params()),
        });
        this.#requires = Object.freeze([
            ...(graph === undefined ? (options.requires ?? []) : graph.modules()),
        ]);
        this.#record = point.record(this.#params);
        this.data = this.#record.schema.applyDefaults({}) as ExtensionParamsData;
        this.#values = this.#valuesAccessor();
        this.#assign({ ...(graph?.values() ?? {}), ...(options.values ?? {}) });
        this.#code = code;
        this.#module =
            graph?.output === undefined && graph !== undefined ? this.#ready() : this.#build(code);
    }

    /** Parâmetros declarados (nome → tipo); num grafo, `nó_parâmetro`. */
    get params(): Readonly<Record<string, ExtensionParamType>> {
        return this.#params;
    }

    /** Valores dos parâmetros por nome (leitura e escrita; escrever envia no quadro seguinte). */
    get values(): Record<string, ExtensionParamValue> {
        return this.#values;
    }

    /** Módulos que o código usa (num grafo, os módulos dos nós). */
    get requires(): readonly WgslModule[] {
        return this.#requires;
    }

    /** Tem função própria; `false` com um grafo sem saída (usa a implementação pronta do ponto). */
    get implemented(): boolean {
        return this.#graph === undefined || this.#graph.output !== undefined;
    }

    /** Grafo de nós que gera o código, ou `undefined` (código escrito à mão). */
    get graph(): NodeGraph | undefined {
        return this.#graph;
    }

    /** Código WGSL atual (num grafo, o gerado). */
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

    /** Nome do struct de parâmetros gerado (o do registro tipado da forma). */
    get paramsStruct(): string {
        return this.#record.schema.wgslName;
    }

    /** Schema do registro tipado da forma (spec 031, R8); o nome (`<ponto>:<hash>`) é a chave do pool. */
    get record(): StructSchema {
        return this.#record.schema;
    }

    /** Nome da função obrigatória no módulo (com sufixo quando `renamed`). */
    get functionName(): string {
        return this.renamed
            ? `${this.point.required.name}_${this.#hash}`
            : this.point.required.name;
    }

    /** Nome no módulo da função opcional `name`, se o código a define (com o sufixo do hash quando `renamed`). */
    optionalName(name: string): string | undefined {
        if (!this.#optionals.has(name)) return undefined;
        return this.renamed ? `${name}_${this.#hash}` : name;
    }

    /** Nome do carregador de parâmetros no módulo. */
    get loaderName(): string {
        const base = `${this.point.required.name}_params`;
        return this.renamed ? `${base}_${this.#hash}` : base;
    }

    /**
     * A função com os nomes do sufixo do hash (spec 033), para reunir várias funções do ponto num mesmo shader;
     * `undefined` com a implementação pronta (grafo sem saída).
     */
    get composite(): CompositeFunction | undefined {
        if (this.#composite === undefined) return undefined;
        return {
            module: this.#composite,
            functionName: `${this.point.required.name}_${this.#hash}`,
            loaderName: `${this.point.required.name}_params_${this.#hash}`,
        };
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
        if (this.#graph !== undefined)
            throw new TypeError(
                `${this.point.name}: função montada por grafo — troque com setGraph`,
            );
        const module = this.#build(code);
        this.#code = code;
        this.#module = module;
        this.data.revision = this.rawData.revision + 1;
    }

    /**
     * Troca o grafo (topologia nova: spec 031, US2). Valida e gera na hora (lança como na criação, e o grafo anterior
     * continua); parâmetros de mesmo nome e tipo mantêm o valor, os novos recebem o do grafo; a revisão sobe e o estágio
     * dono compila em transição. Com parâmetros de outra forma, o registro muda de schema e de pool (a C2 realoca a
     * função; R8). Mudar só valores não passa por aqui (`values`, sem recompilar).
     */
    setGraph(graph: NodeGraph): void {
        if (this.#graph === undefined)
            throw new TypeError(`${this.point.name}: função escrita em WGSL — troque com setCode`);
        const params = Object.freeze({ ...graph.params() });
        const record = this.point.record(params);
        const kept: Record<string, ExtensionParamValue> = {};
        for (const [name, type] of Object.entries(params))
            if (this.#params[name] === type) kept[name] = this.#values[name]!;
        const code = ExtensionFunction.#graphCode(graph, this.point);
        const previous = {
            params: this.#params,
            record: this.#record,
            requires: this.#requires,
        };
        this.#params = params;
        this.#record = record;
        this.#requires = Object.freeze([...graph.modules()]);
        let module: WgslModule;
        try {
            module = graph.output === undefined ? this.#ready() : this.#build(code);
        } catch (error) {
            this.#params = previous.params;
            this.#record = previous.record;
            this.#requires = previous.requires;
            throw error;
        }
        this.#graph = graph;
        this.#code = code;
        this.#module = module;
        const revision = this.rawData.revision + 1;
        if (record !== previous.record) {
            // Forma nova: registro novo (schema e pool da forma), com a revisão seguinte.
            const descriptors = [this.#descriptor(previous.record)];
            const data = record.schema.applyDefaults({ revision }) as ExtensionParamsData;
            this.redescribe(descriptors, data);
        } else this.data.revision = revision;
        this.#values = this.#valuesAccessor();
        this.#assign({ ...graph.values(), ...kept });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [this.#descriptor(this.#record)];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** Descritor do registro da forma `record` (no pool da forma). */
    #descriptor(record: PointRecord): GPUDescriptor {
        return { id: 'params', role: 'storage-ro', schema: record.schema, storage: 'pool' };
    }

    /** Atribui valores por nome (nome desconhecido lança). */
    #assign(values: Readonly<Record<string, ExtensionParamValue>>): void {
        for (const [name, value] of Object.entries(values)) {
            if (!(name in this.#params))
                throw new TypeError(
                    `${this.point.name}: valor para parâmetro desconhecido '${name}'`,
                );
            this.#values[name] = value;
        }
    }

    /** Código de um grafo para o ponto; grafo sem saída: vazio (a função usa a pronta, com aviso único). */
    static #graphCode(graph: NodeGraph, point: WgslPoint): string {
        if (graph.output !== undefined) return graph.compile(point);
        if (!warnedEmpty.has(point.name)) {
            warnedEmpty.add(point.name);
            console.warn(
                `[ExtensionFunction] grafo sem saída no ponto '${point.name}': usa a implementação pronta até a saída ser ligada.`,
            );
        }
        return '';
    }

    /**
     * A implementação pronta do ponto como módulo da função (grafo sem saída): os estágios montam o mesmo que sem a
     * função; nos pontos de cena a função não entra na composição (`implemented`).
     */
    #ready(): WgslModule {
        const point = this.point;
        this.#optionals = new Set();
        this.#prefixLines = 0;
        this.#hash = fnv(`${point.name}|ready`);
        this.#composite = undefined;
        return point.ready;
    }

    #build(code: string): WgslModule {
        const point = this.point;
        const sig = Object.entries(this.#params)
            .map(([n, t]) => `${n}:${t}`)
            .join(',');
        const requires = this.requires.map((m) => m.name).join(',');
        const hash = fnv(`${point.name}|${sig}|${requires}|${code}`);
        const cacheKey = `${point.name}|${hash}|${this.renamed ? 'renamed' : 'plain'}`;
        const cached = built.get(cacheKey);
        const requiresAll = [...this.requires, this.#record.resource];
        if (cached?.module.requires.every((m, k) => m === requiresAll[k]) === true) {
            this.#optionals = cached.optionals;
            this.#prefixLines = cached.prefix;
            this.#hash = hash;
            this.#composite = cached.composite;
            return cached.module;
        }
        const record = this.#record;
        const struct = record.schema.wgslName;
        const make = (renamed: boolean): { module: WgslModule; prefix: number } => {
            const suffix = renamed ? `_${hash}` : '';
            const alias = renamed ? `${point.paramsAlias}${suffix}_alias` : point.paramsAlias;
            const loader = `${point.required.name}_params${suffix}`;
            // O struct vem do schema da forma (pelo recurso do pool); o carregador lê o registro da função por slot.
            const prefix = [
                `// Função do ponto '${point.name}' (gerado: alias do registro tipado e carregador).`,
                `alias ${alias} = ${struct};`,
                `fn ${loader}(slot: u32) -> ${struct} {`,
                `    return ${record.resource.name}[slot];`,
                '}',
            ];
            // A função obrigatória, as opcionais e o alias com o sufixo, por token (spec 031, R7): várias funções no
            // mesmo shader.
            const body = renamed
                ? renameTokens(
                      renameTokens(
                          code,
                          new Set([point.required.name, ...point.optional.map((o) => o.name)]),
                          suffix,
                      ),
                      new Set([point.paramsAlias]),
                      `${suffix}_alias`,
                  )
                : code;
            const module = wgslModule({
                // A versão renomeada de um ponto por entidade tem nome próprio: pode conviver com a outra num shader.
                name: `${point.name}_fn_${hash}${renamed && !this.renamed ? '_composite' : ''}`,
                source: `${prefix.join('\n')}\n${body}`,
                requires: requiresAll,
            });
            return { module, prefix: prefix.length };
        };
        // A validação usa os nomes do ponto (é o que cada kernel do ponto monta); a versão renomeada é a usada quando
        // várias funções do ponto entram no mesmo shader.
        const plain = make(false);
        point.check(plain.module, struct);
        this.#optionals = new Set(point.optionalIn(plain.module).map((o) => o.name));
        const renamedVersion = make(true);
        const { module, prefix } = this.renamed ? renamedVersion : plain;
        built.set(cacheKey, {
            module,
            prefix,
            optionals: this.#optionals,
            composite: renamedVersion.module,
        });
        this.#prefixLines = prefix;
        this.#hash = hash;
        this.#composite = renamedVersion.module;
        return module;
    }

    #valuesAccessor(): Record<string, ExtensionParamValue> {
        return paramValues(
            this.point.name,
            this.#params,
            (name) => this.rawData[name],
            (name, value) => {
                this.data[name] = value;
            },
        );
    }
}
