import type { EngineCore } from '../../core/contracts/index';
import type { EventBus } from '../events/EventBus';
import { type FlowRegistry } from '../flows/FlowRegistry';
import type { EntityId } from '../world/EntityId';

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

    broadcastPoolReallocated(poolKey: string): void {
        for (const flow of this.flows.allFlows()) {
            flow.onPoolReallocated(poolKey);
        }
    }

    broadcastEntitiesRemoved(entityIds: readonly EntityId[]): void {
        if (entityIds.length === 0) return;
        for (const flow of this.flows.allFlows()) {
            flow.onEntitiesRemoved(entityIds);
        }
    }

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

    lastFrameTimestamp(): number {
        return this.lastFrameAt;
    }
}
