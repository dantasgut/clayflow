import type { EngineCore } from '../../core/contracts/index';
import type { EventBus } from '../events/EventBus';
import { type FlowRegistry } from '../flows/FlowRegistry';
import type { EntityId } from '../world/EntityId';

/**
 * ExecutionSystem orquestra o dispatch dos Flows ativos em cada frame.
 * Reage a:
 *   - `frameTick` (do GameLoop) → executa `record(frame)` + `submit()`.
 *   - `poolReallocated` → broadcast para todos flows invalidarem caches.
 *   - `canvasReconfigured` → broadcast onCanvasResized.
 *   - `entitiesRemoved` → broadcast onEntitiesRemoved.
 *
 * Modo `captureErrors=true` envolve cada frame em error scope GPU; erros
 * viram `engineError` event sem propagar exception. Ativável via
 * `Application.create({ captureErrors: true })`.
 */
export class ExecutionSystem {
    private elapsed = 0;
    private lastFrameAt = 0;
    /**
     * Quando true, cada frame envolve record+submit em `core.withErrorScope('validation')`
     * e emite `engineError` em vez de propagar exception. GameLoop continua o próximo
     * frame normalmente. Ativado via `Application.create({ captureErrors: true })`.
     */
    captureErrors = false;

    constructor(
        private readonly core: EngineCore,
        private readonly events: EventBus,
        private readonly flows: FlowRegistry,
    ) {
        this.events.on('frameTick', (e) => {
            this.onFrameTick(e.dt, e.elapsed);
        });
        this.events.on('poolReallocated', (e) => {
            this.broadcastPoolReallocated(e.poolKey);
        });
        this.events.on('canvasReconfigured', (e) => {
            this.broadcastCanvasResized(e.width, e.height);
        });
        this.events.on('entitiesRemoved', (e) => {
            this.broadcastEntitiesRemoved(e.entityIds);
        });
    }

    /** Notifica todos os flows que um pool teve buffer realocado. */
    broadcastPoolReallocated(poolKey: string): void {
        for (const flow of this.flows.allFlows()) {
            flow.onPoolReallocated(poolKey);
        }
    }

    /** Notifica todos os flows que entidades foram removidas (no-op se vazia). */
    broadcastEntitiesRemoved(entityIds: readonly EntityId[]): void {
        if (entityIds.length === 0) return;
        for (const flow of this.flows.allFlows()) {
            flow.onEntitiesRemoved(entityIds);
        }
    }

    /** Notifica todos os flows que o canvas foi redimensionado. */
    broadcastCanvasResized(width: number, height: number): void {
        for (const flow of this.flows.allFlows()) {
            flow.onCanvasResized(width, height);
        }
    }

    private onFrameTick(dt: number, elapsed: number): void {
        this.elapsed = elapsed;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const start = now;
        const recordAndSubmit = (): void => {
            this.core.record('frame', (frame) => {
                for (const phase of this.flows.phasesInOrder()) {
                    for (const flow of this.flows.activeFlowsInPhase(phase)) {
                        flow.dispatch(frame);
                    }
                }
            });
            this.core.submit();
        };
        if (this.captureErrors) {
            // Fire-and-forget: error capturado vira evento, GameLoop continua.
            void this.core.withErrorScope('validation', recordAndSubmit).catch((e: unknown) => {
                const message = e instanceof Error ? e.message : String(e);
                this.events.emit('engineError', { stage: 'frame', filter: 'validation', message });
            });
        } else {
            recordAndSubmit();
        }
        const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.lastFrameAt = finishedAt;
        this.events.emit('frameComplete', {
            timestamp: finishedAt,
            dt: finishedAt - start,
            elapsed: this.elapsed,
        });
        void dt;
    }

    /** Timestamp (ms) do último `frameComplete` emitido. Útil para sleep detection. */
    lastFrameTimestamp(): number {
        return this.lastFrameAt;
    }
}
