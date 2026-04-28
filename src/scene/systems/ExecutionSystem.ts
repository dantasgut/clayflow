import type { EngineCore } from '../../core/contracts/index';
import type { EventBus } from '../events/EventBus';
import { FlowRegistry } from '../flows/FlowRegistry';

export class ExecutionSystem {
    private elapsed = 0;
    private lastFrameAt = 0;

    constructor(
        private readonly core: EngineCore,
        private readonly events: EventBus,
        private readonly flows: FlowRegistry,
    ) {
        this.events.on('frameTick', e => this.onFrameTick(e.dt, e.elapsed));
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
        // touch dt to ensure parameter is recognized by linters
        void dt;
    }

    lastFrameTimestamp(): number {
        return this.lastFrameAt;
    }
}
