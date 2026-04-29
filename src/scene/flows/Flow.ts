import type { Frame } from '../../core/contracts/index';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';

export type Phase = 'physics' | 'shadow' | 'forward' | 'post' | 'ui';

export abstract class Flow {
    abstract readonly type: string;
    abstract readonly bodyType: string;
    abstract readonly phase: Phase;
    priority: number = 0;

    abstract getPipelineDescriptors(): readonly PipelineDescriptor[];
    abstract dispatch(frame: Frame): void;

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
     * cacheiam slots por EntityId devem limpar os entries afetados.
     */
    onEntitiesRemoved(_entityIds: readonly number[]): void {
        // default: no-op
    }

    /**
     * Chamado quando o canvas é redimensionado. Subclasses que mantêm
     * textures de tamanho-de-canvas (depth, color offscreen, ping-pong)
     * devem invalidar para recriarem na próxima dispatch.
     */
    onCanvasResized(_width: number, _height: number): void {
        // default: no-op
    }

    isReady(): boolean {
        return true;
    }
}
