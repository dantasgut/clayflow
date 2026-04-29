import type { EngineCore } from '../../core/contracts/index';
import type { EventBus } from '../events/EventBus';
import { FlowRegistry } from '../flows/FlowRegistry';
import type { EntityId } from '../world/EntityId';

export class ExecutionSystem {
    private elapsed = 0;
    private lastFrameAt = 0;

    constructor(
        private readonly core: EngineCore,
        private readonly events: EventBus,
        private readonly flows: FlowRegistry,
    ) {
        this.events.on('frameTick', e => this.onFrameTick(e.dt, e.elapsed));
        this.events.on('poolReallocated', e => this.broadcastPoolReallocated(e.poolKey));
        this.events.on('canvasReconfigured', e => this.broadcastCanvasResized(e.width, e.height));
        this.events.on('entitiesRemoved', e => this.broadcastEntitiesRemoved(e.entityIds));
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
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const start = now;
        this.core.record('frame', frame => {
            for (const phase of this.flows.phasesInOrder()) {
                for (const flow of this.flows.activeFlowsInPhase(phase)) {
                    flow.dispatch(frame);
                }
            }
        });
        this.core.submit();
        const finishedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
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
