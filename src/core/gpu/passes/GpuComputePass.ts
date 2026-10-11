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
        /** `maxComputeWorkgroupsPerDimension` do device. */
        private readonly maxWorkgroupsPerDimension = 65_535,
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

    invocations(count: number, workgroupSize: number): this {
        if (!Number.isInteger(count) || count < 0) {
            throw new RangeError(`invocations: count deve ser inteiro ≥ 0 (recebido ${count}).`);
        }
        if (!Number.isInteger(workgroupSize) || workgroupSize < 1) {
            throw new RangeError(
                `invocations: workgroupSize deve ser inteiro ≥ 1 (recebido ${workgroupSize}).`,
            );
        }
        if (count === 0) return this;
        const groups = Math.ceil(count / workgroupSize);
        const x = Math.min(groups, this.maxWorkgroupsPerDimension);
        return this.workgroups(x, Math.ceil(groups / x), 1);
    }

    workgroups(x: number, y = 1, z = 1): this {
        const max = this.maxWorkgroupsPerDimension;
        if (x > max || y > max || z > max) {
            throw new RangeError(
                `workgroups(${x}, ${y}, ${z}) excede maxComputeWorkgroupsPerDimension (${max}) do device — `
                    + 'use invocations(count, workgroupSize) para despachos lineares.',
            );
        }
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
