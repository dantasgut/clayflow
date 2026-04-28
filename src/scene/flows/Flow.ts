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

    isReady(): boolean {
        return true;
    }
}
