import type { Binder } from '../../contracts/passes/Binder';
import type { BundleRunner } from '../../contracts/passes/BundleRunner';
import type { Drawer } from '../../contracts/passes/Drawer';
import type { GeometryBinder } from '../../contracts/passes/GeometryBinder';
import type { RenderPass } from '../../contracts/passes/RenderPass';
import type { RenderState } from '../../contracts/passes/RenderState';
import type { BindGroupSpec } from '../../contracts/specs/BindGroupSpec';
import type { BundleSpec } from '../../contracts/specs/BundleSpec';
import type { IndexBufferSpec } from '../../contracts/specs/IndexBufferSpec';
import type { IndirectBufferSpec } from '../../contracts/specs/IndirectBufferSpec';
import type { RenderPipelineSpec } from '../../contracts/specs/RenderPipelineSpec';
import type { VertexBufferSpec } from '../../contracts/specs/VertexBufferSpec';
import { GpuResourceStore } from '../GpuResourceStore';
import { specHash } from '../specHash';

export class GpuBundleRenderPass
    implements RenderPass, Binder<RenderPipelineSpec>, GeometryBinder, RenderState, Drawer, BundleRunner
{
    constructor(
        private readonly encoder: GPURenderBundleEncoder,
        private readonly store: GpuResourceStore,
    ) {}

    get bind(): Binder<RenderPipelineSpec> { return this; }
    get geometry(): GeometryBinder { return this; }
    get state(): RenderState { return this; }
    get draw(): Drawer { return this; }
    get bundles(): BundleRunner { return this; }

    setPipeline(spec: RenderPipelineSpec): this {
        const pipeline = this.store.require<GPURenderPipeline>(specHash(spec), 'render-pipeline');
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

    vertex(slot: number, spec: VertexBufferSpec, offset?: number, size?: number): this {
        const buf = this.store.require<GPUBuffer>(specHash(spec), 'vertex-buffer');
        this.encoder.setVertexBuffer(slot, buf, offset, size);
        return this;
    }

    index(spec: IndexBufferSpec, offset?: number, size?: number): this {
        const buf = this.store.require<GPUBuffer>(specHash(spec), 'index-buffer');
        this.encoder.setIndexBuffer(buf, spec.format, offset, size);
        return this;
    }

    viewport(_x: number, _y: number, _w: number, _h: number, _minDepth: number, _maxDepth: number): this {
        return this;
    }

    scissor(_x: number, _y: number, _w: number, _h: number): this {
        return this;
    }

    blendConstant(_color: readonly [number, number, number, number]): this {
        return this;
    }

    stencilReference(_reference: number): this {
        return this;
    }

    vertices(count: number, instances?: number, firstVertex?: number, firstInstance?: number): this {
        this.encoder.draw(count, instances, firstVertex, firstInstance);
        return this;
    }

    indexed(count: number, instances?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): this {
        this.encoder.drawIndexed(count, instances, firstIndex, baseVertex, firstInstance);
        return this;
    }

    indirect(spec: IndirectBufferSpec, offset = 0): this {
        const buf = this.store.require<GPUBuffer>(specHash(spec), 'indirect-buffer');
        this.encoder.drawIndirect(buf, offset);
        return this;
    }

    indexedIndirect(spec: IndirectBufferSpec, offset = 0): this {
        const buf = this.store.require<GPUBuffer>(specHash(spec), 'indirect-buffer');
        this.encoder.drawIndexedIndirect(buf, offset);
        return this;
    }

    execute(_specs: readonly BundleSpec[]): this {
        return this;
    }

    marker(label: string): void {
        this.encoder.insertDebugMarker(label);
    }
}
