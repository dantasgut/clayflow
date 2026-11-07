import type { EngineCore } from '../../core/contracts/index';
import { Entity } from '../contracts/Entity';
import type { ResourceDirectory } from '../contracts/ResourceDirectory';
import type { Resource } from '../contracts/Resource';
import { ResourceState } from '../contracts/ResourceState';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { Binder, ComputePipelineSpec } from '../../core/contracts/index';
import type { BindingSources, GroupOffsets, PreparedCompute } from './FlowBinding';
import type { WgslModule } from '../shaders/WgslModule';

/**
 * Parte do espaço de trabalho de um Flow (spec 039): quem precisa de dado de GPU além do da cena — os parâmetros por
 * passo, os níveis de uma soma de prefixos, as listas de uma busca de vizinhos — declara os descritores dele, com ids
 * próprios (um prefixo por instância). Os descritores mudam quando a capacidade da parte muda; o `FlowWork` dono se
 * redescreve no `refresh()`.
 */
export interface WorkPart {
    /** Os descritores atuais da parte (ids únicos no Resource de trabalho). */
    descriptors(): readonly GPUDescriptor[];
}

/**
 * Os pipelines do Flow dono do trabalho (T060g), pela C2: o que as partes do trabalho (as peças de compute: somas de
 * prefixos, ordenações, a grade hash…) preparam e ligam como o próprio Flow (`TransitionContext.prepare`/`bind`/
 * `release`), e o pipeline de compute pronto na gravação. Ids e ligações das partes levam o prefixo da instância: duas
 * peças iguais no mesmo Flow ligam pelo pipeline (`{ pipeline, resource }`).
 */
export interface WorkPipelines {
    /** Prepara um pipeline do Flow dono (idempotente por id). */
    prepare(descriptor: PipelineDescriptor): void;
    /** Liga (ou troca) fontes privadas dos pipelines do Flow dono. */
    bind(sources: BindingSources): void;
    /** Libera um pipeline preparado. */
    release(id: string): void;
    /**
     * Prepara um kernel de compute do Flow dono com as fontes privadas dele (ligadas só a ele, `{ pipeline, resource }`)
     * e devolve o id (o prefixo `discriminator` com um número: único no Flow). Para trocar uma fonte, `release` e um
     * kernel novo.
     */
    kernel(spec: WorkKernel): string;
    /** O pipeline de compute `id`, ou `undefined` se não foi preparado ou ainda não está pronto. */
    compute(id: string): PreparedCompute | undefined;
    /**
     * Grava o kernel `id` no passe: o pipeline e os grupos (com os offsets da frequência dos dinâmicos).
     * @throws Error se o kernel não está pronto (as partes preparam nas transições; a C2 compila antes da gravação).
     */
    use(binder: Binder<ComputePipelineSpec>, id: string, offsets?: GroupOffsets): void;
}

/** Um kernel de compute de uma parte do trabalho (`WorkPipelines.kernel`). */
export interface WorkKernel {
    /** Prefixo do id (o da instância da parte). */
    readonly discriminator: string;
    /** Módulo de entrada (montado pela C2). */
    readonly shader: WgslModule;
    /** A função `@compute` do módulo. */
    readonly entryPoint: string;
    /** As fontes privadas do kernel, por recurso declarado (uma chave por pipeline vale pelo recurso dela). */
    readonly bindings: BindingSources;
    /** Constantes `override` do shader. */
    readonly constants?: Readonly<Record<string, number>>;
}

/**
 * O que uma parte do espaço de trabalho recebe (spec 039): o Resource de trabalho dono (com os pipelines do Flow dono,
 * `work.pipelines`), o diretório da C2 (os objetos alocados, `writeRegions`, `read`) e o core só para consultas.
 */
export interface WorkContext {
    /** O core da cena, só para consultas (as capacidades do adaptador): nenhum objeto de GPU é criado por ele. */
    readonly core: EngineCore;
    /** O diretório da C2: os objetos alocados para os descritores do trabalho. */
    readonly resources: ResourceDirectory;
    /** O Resource de trabalho dono das partes. */
    readonly work: FlowWork;
}

/**
 * Resource de trabalho de um Flow (spec 039, `slot.work`): um Resource comum cujos descritores são os das partes que o
 * Flow e os seus auxiliares registram (`use`). A C2 o insere no World quando aloca o Flow e o remove no descarte;
 * `refresh()` redescreve quando alguma parte mudou de forma (cresce e encolhe), e a C2 realoca só o que mudou e religa
 * quem o usa. Cada Flow declara a sua subclasse com um `static schema` (o nome do tipo no World).
 */
export abstract class FlowWork extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    readonly #parts: WorkPart[] = [];
    #last: readonly GPUDescriptor[] = [];
    #pipelines: WorkPipelines | undefined;

    constructor() {
        super();
        this.data = {};
    }

    /**
     * Os pipelines do Flow dono (T060g): a C2 os entrega quando registra o Flow, antes de qualquer transição dele.
     * @throws Error antes disso (uma parte só prepara kernels nas transições do Flow dono).
     */
    get pipelines(): WorkPipelines {
        if (this.#pipelines === undefined)
            throw new Error(
                `${this.constructor.name}: os pipelines do Flow dono ainda não foram entregues pela C2.`,
            );
        return this.#pipelines;
    }

    /** A C2 entrega os pipelines do Flow dono (uma vez, no registro dele). */
    attachPipelines(pipelines: WorkPipelines): void {
        this.#pipelines = pipelines;
    }

    /** Registra uma parte; os descritores dela entram no próximo `refresh()` (ou na inserção). */
    use<P extends WorkPart>(part: P): P {
        this.#parts.push(part);
        this.refresh();
        return part;
    }

    /** Tira uma parte (ex.: uma busca recriada com outra grade): os descritores dela saem e a C2 os libera. */
    drop(part: WorkPart): void {
        const i = this.#parts.indexOf(part);
        if (i < 0) return;
        this.#parts.splice(i, 1);
        this.refresh();
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return this.#parts.flatMap((part) => part.descriptors());
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /**
     * Redescreve se algum descritor das partes mudou de forma desde a última vez; devolve `true` quando mudou (a C2
     * realocou o que mudou e os bind groups que o usam são refeitos).
     */
    refresh(): boolean {
        const next = this.getDescriptors();
        if (sameDescriptors(this.#last, next)) return false;
        const previous = this.#last;
        this.#last = next;
        this.redescribe(previous, { ...this.data });
        return true;
    }
}

function sameDescriptors(a: readonly GPUDescriptor[], b: readonly GPUDescriptor[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i]!;
        const y = b[i]!;
        if (
            x.id !== y.id
            || x.role !== y.role
            || x.schema !== y.schema
            || x.count !== y.count
            || x.regions?.count !== y.regions?.count
            || JSON.stringify(x.textureShape) !== JSON.stringify(y.textureShape)
        )
            return false;
    }
    return true;
}
