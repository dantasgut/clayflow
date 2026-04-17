import type {
    GpuPipelineEventBus,
    GpuPipelineEventMap,
    GpuPipelineEventType,
} from './GpuPipelineEventBus';

/**
 * Implementação padrão do GpuPipelineEventBus.
 * Handlers síncronos com snapshot para segurança durante emit.
 */
export class DefaultGpuPipelineEventBus implements GpuPipelineEventBus {

    private readonly handlers = new Map<string, Set<(payload: unknown) => void>>();

    on<K extends GpuPipelineEventType>(
        type:    K,
        handler: (payload: GpuPipelineEventMap[K]) => void,
    ): () => void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type)!.add(handler as (payload: unknown) => void);
        return () => this.off(type, handler);
    }

    off<K extends GpuPipelineEventType>(
        type:    K,
        handler: (payload: GpuPipelineEventMap[K]) => void,
    ): void {
        this.handlers.get(type)?.delete(handler as (payload: unknown) => void);
    }

    emit<K extends GpuPipelineEventType>(
        type:    K,
        payload: GpuPipelineEventMap[K],
    ): void {
        const set = this.handlers.get(type);
        if (!set || set.size === 0) return;
        for (const h of [...set]) {
            h(payload);
        }
    }
}
