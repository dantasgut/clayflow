import type { Frame } from '../../core/contracts/index';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';

/**
 * Phase determina a ordem de execução dos Flows dentro de um frame.
 * Ordem fixa: `physics` (integração+colisões) → `shadow` (depth maps)
 * → `forward` (render principal) → `post` (post-processamento) → `ui`.
 * Múltiplos Flows na mesma phase são ordenados por `priority` decrescente.
 */
export type Phase = 'physics' | 'shadow' | 'forward' | 'post' | 'ui';

/**
 * Flow é a unidade de trabalho por frame. Cada Flow concentra a lógica
 * de uma fase do pipeline (physics solver, shadow pass, render pass,
 * post-effect chain, etc.) e é executado pelo `ExecutionSystem` em ordem
 * de phase quando `isReady()` retorna true.
 *
 * Lifecycle:
 *   1. Construído pelo app/plugin e registrado em `FlowRegistry.register(flow)`.
 *   2. Em cada frameTick, ExecutionSystem invoca `dispatch(frame)` para Flows
 *      ready (em ordem de phase + priority).
 *   3. Reage a eventos via callbacks (`onPoolReallocated`, `onEntitiesRemoved`,
 *      `onCanvasResized`) para invalidar caches GPU dependentes.
 *
 * Subclasses concretas: ForwardFlow, ShadowFlow, PostFlow, UIFlow, DebugFlow,
 * LCPFlow, XPBDFlow, FEMFlow, MPMFlow, SPHFlow, PBFFlow.
 */
export abstract class Flow {
    /** Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug. */
    abstract readonly type: string;
    /**
     * Tipo de Resource consumido como "corpo" deste flow (e.g. 'RigidBody:LCP'
     * para LCPFlow). Vazio quando o flow não é body-bound. Usado por
     * FlowRegistry.resolve(bodyType) para encontrar o flow responsável por
     * cada Resource.
     */
    abstract readonly bodyType: string;
    /** Fase do pipeline em que o flow executa. */
    abstract readonly phase: Phase;
    /**
     * Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
     * Útil quando dois flows compartilham phase mas têm dependência de ordem
     * (e.g. um flow gera dado que outro consome).
     */
    priority = 0;

    /**
     * Retorna os descritores de pipelines GPU que este flow precisa criar
     * (para introspeção arquitetural / debugging — o flow ainda materializa
     * via core.create internamente).
     */
    abstract getPipelineDescriptors(): readonly PipelineDescriptor[];

    /**
     * Hot path: chamado uma vez por frame quando o flow está ready. O `frame`
     * contém o command encoder ativo — use `frame.compute(...)` ou
     * `frame.render(target, ...)` para emitir comandos GPU.
     */
    abstract dispatch(frame: Frame): void;

    /**
     * Hook genérico de eventos. Default no-op. A maioria dos flows usa os
     * hooks específicos abaixo (`onPoolReallocated`, etc.) ao invés deste.
     */
    onEvent(_event: string, _payload: unknown): void {
        // default: no-op. Subclasses override to react to events.
    }

    /**
     * Chamado quando um pool com `poolKey` tem seu buffer realocado pelo
     * ResourceSystem (growth 2× ou regeneração). Subclasses que cacheiam
     * `BindGroupSpec` dependentes do pool devem invalidar o cache aqui
     * (set para null) para que a próxima dispatch reconstrua via
     * `resources.poolBindGroup(poolKey)`.
     */
    onPoolReallocated(_poolKey: string): void {
        // default: no-op
    }

    /**
     * Chamado quando entidades são removidas do World. Subclasses que
     * cacheiam slots por EntityId devem limpar os entries afetados para
     * evitar leaks de slots órfãos.
     */
    onEntitiesRemoved(_entityIds: readonly number[]): void {
        // default: no-op
    }

    /**
     * Chamado quando o canvas é redimensionado. Subclasses que mantêm
     * textures de tamanho-de-canvas (depth, color offscreen, ping-pong)
     * devem destruir e nullificar para recriarem na próxima dispatch.
     * Importante: destruir bindgroups que referenciam essas textures ANTES
     * para evitar use-after-free na GPU.
     */
    onCanvasResized(_width: number, _height: number): void {
        // default: no-op
    }

    /**
     * Indica se o flow tem trabalho válido para esta frame. Default: true
     * (sempre dispatch). Override para gating em prerequisites: e.g. presença
     * de Camera no World, pool não-vazio, pipeline async ainda compilando.
     * ExecutionSystem skipa flows com `isReady() === false`.
     */
    isReady(): boolean {
        return true;
    }
}
