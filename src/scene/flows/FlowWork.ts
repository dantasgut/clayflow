import type { EngineCore } from '../../core/contracts/index';
import { Entity } from '../contracts/Entity';
import type { ResourceDirectory } from '../contracts/ResourceDirectory';
import type { Resource } from '../contracts/Resource';
import { ResourceState } from '../contracts/ResourceState';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';

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
 * O que uma parte do espaço de trabalho recebe (spec 039): o Resource de trabalho dono, o diretório da C2 (os objetos
 * alocados, `writeRegions`, `read`) e o core só para consultas e para os utilitários da C2 (`createComputeKernel`).
 */
export interface WorkContext {
    /** O core da cena (capacidades do adaptador; utilitários da C2). Nenhum objeto de dado é criado por ele. */
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

    constructor() {
        super();
        this.data = {};
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
