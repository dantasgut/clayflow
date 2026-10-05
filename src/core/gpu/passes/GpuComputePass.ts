import type { Binder } from '../../contracts/passes/Binder';
import type { ComputePass } from '../../contracts/passes/ComputePass';
import type { Dispatcher } from '../../contracts/passes/Dispatcher';
import type { BindGroupSpec } from '../../contracts/specs/BindGroupSpec';
import type { ComputePipelineSpec } from '../../contracts/specs/ComputePipelineSpec';
import type { IndirectBufferSpec } from '../../contracts/specs/IndirectBufferSpec';
import { type FrameCounters } from '../FrameCounters';
import { type GpuResourceStore } from '../GpuResourceStore';
import { specHash } from '../specHash';

export class GpuComputePass implements ComputePass, Binder<ComputePipelineSpec>, Dispatcher {
    constructor(
        private readonly encoder: GPUComputePassEncoder,
        private readonly store: GpuResourceStore,
        /** Contadores do quadro (opcional: passes avulsos em testes não contam). */
        private readonly counters?: FrameCounters,
    ) {}

    get bind(): Binder<ComputePipelineSpec> {
        return this;
    }

    get dispatch(): Dispatcher {
        return this;
    }

    setPipeline(spec: ComputePipelineSpec): this {
        const pipeline = this.store.require<GPUComputePipeline>(specHash(spec), 'compute-pipeline');
        this.encoder.setPipeline(pipeline);
        return this;
    }

    setBindGroup(index: number, spec: BindGroupSpec, dynamicOffsets?: readonly number[]): this {
        const bg = this.store.require<GPUBindGroup>(specHash(spec), 'bindgroup');
        if (dynamicOffsets !== undefined && dynamicOffsets.length > 0) {
            this.encoder.setBindGroup(index, bg, dynamicOffsets as number[]);
        } else {
            this.encoder.setBindGroup(index, bg);
        }
        return this;
    }

    workgroups(x: number, y?: number, z?: number): this {
        this.encoder.dispatchWorkgroups(x, y, z);
        if (this.counters) this.counters.dispatches++;
        return this;
    }

    workgroupsIndirect(spec: IndirectBufferSpec, offset = 0): this {
        const buf = this.store.require<GPUBuffer>(specHash(spec), 'indirect-buffer');
        this.encoder.dispatchWorkgroupsIndirect(buf, offset);
        if (this.counters) this.counters.dispatches++;
        return this;
    }

    marker(label: string): void {
        this.encoder.insertDebugMarker(label);
    }

    end(): void {
        this.encoder.end();
    }
}
