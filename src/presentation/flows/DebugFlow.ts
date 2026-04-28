import type { Frame } from '../../core/contracts/index';
import { Flow } from '../../scene/flows/Flow';
import type { Phase } from '../../scene/flows/Flow';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';

export class DebugFlow extends Flow {
    readonly type = 'DebugFlow';
    readonly bodyType = '';
    readonly phase: Phase = 'forward';
    override priority = -100; // após ForwardFlow

    private enabled = false;

    getPipelineDescriptors(): readonly PipelineDescriptor[] { return []; }

    setEnabled(value: boolean): void { this.enabled = value; }

    override isReady(): boolean { return this.enabled; }

    dispatch(_frame: Frame): void {
        // overlay de debug (gizmos, axes, lines) — opcional.
    }
}
