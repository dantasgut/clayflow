import type { CanvasOptions, EngineCore } from '../contracts/EngineCore';
import type { Frame } from '../contracts/Frame';
import type { Profiler } from '../contracts/Profiler';
import type { BindGroupSpec } from '../contracts/specs/BindGroupSpec';
import type { BufferSpec } from '../contracts/specs/BufferSpec';
import type { BundleSpec } from '../contracts/specs/BundleSpec';
import type { ComputePipelineSpec } from '../contracts/specs/ComputePipelineSpec';
import type { LayoutSpec } from '../contracts/specs/LayoutSpec';
import type { RenderPipelineSpec } from '../contracts/specs/RenderPipelineSpec';
import type {
    AnyBufferSpec,
    AnyPipelineSpec,
    ResourceSpec,
} from '../contracts/specs/ResourceSpec';
import type { SamplerSpec } from '../contracts/specs/SamplerSpec';
import type { ShaderModuleSpec } from '../contracts/specs/ShaderModuleSpec';
import type { StagingBufferSpec } from '../contracts/specs/StagingBufferSpec';
import type { TextureSpec } from '../contracts/specs/TextureSpec';
import type { TextureViewSpec } from '../contracts/specs/TextureViewSpec';
import { createGpuContext, type GpuContext } from './GpuContext';
import { GpuCommandState } from './GpuCommandState';
import { GpuFrame } from './GpuFrame';
import { GpuResourceStore } from './GpuResourceStore';
import { GpuProfilerSystem } from './profiler/GpuProfilerSystem';
import { specHash } from './specHash';

function bufferUsage(spec: BufferSpec): number {
    const U = GPUBufferUsage;
    switch (spec.subkind) {
        case 'vertex':
            return U.VERTEX | U.STORAGE | U.COPY_SRC | U.COPY_DST;
        case 'index':
            return U.INDEX | U.STORAGE | U.COPY_SRC | U.COPY_DST;
        case 'uniform':
            return U.UNIFORM | U.COPY_DST;
        case 'storage':
            return U.STORAGE | U.COPY_SRC | U.COPY_DST;
        case 'indirect':
            return U.INDIRECT | U.STORAGE | U.COPY_SRC | U.COPY_DST;
        case 'staging':
            return U.COPY_DST | U.MAP_READ;
    }
}

function bufferByteSize(spec: AnyBufferSpec): number {
    return spec.byteSize;
}

export class GpuEngineCore implements EngineCore {
    private context: GpuContext | null = null;
    private readonly store = new GpuResourceStore();
    private readonly command = new GpuCommandState();
    private readonly profilerSystem = new GpuProfilerSystem();
    private currentFrame: GpuFrame | null = null;

    get profiler(): Profiler {
        return this.profilerSystem;
    }

    get canvasFormat(): GPUTextureFormat {
        return this.requireContext().canvasFormat;
    }

    async initialize(canvas?: HTMLCanvasElement, options?: CanvasOptions): Promise<void> {
        if (this.context !== null) {
            this.applyCanvas(this.context, canvas ?? null, options);
            return;
        }
        const { device, queue, canvasFormat } = await createGpuContext();
        const ctx: GpuContext = {
            device,
            queue,
            canvas: null,
            canvasContext: null,
            canvasFormat,
        };
        this.applyCanvas(ctx, canvas ?? null, options);
        this.context = ctx;
        this.profilerSystem.attach(device);
    }

    reconfigureCanvas(options?: CanvasOptions): void {
        const ctx = this.requireContext();
        if (ctx.canvas === null || ctx.canvasContext === null) {
            throw new Error('GpuEngineCore: no canvas attached to reconfigure.');
        }
        this.configureCanvasContext(ctx, options);
    }

    create<S extends ResourceSpec>(spec: S): S {
        const hash = specHash(spec);
        if (this.store.has(hash)) return spec;
        const obj = this.materialize(spec, hash);
        this.store.set(hash, obj);
        return spec;
    }

    async createAsync<S extends ResourceSpec>(spec: S): Promise<S> {
        if (spec.kind !== 'pipeline') return this.create(spec);
        const hash = specHash(spec);
        if (this.store.has(hash)) return spec;
        const ctx = this.requireContext();
        const pipeline = await this.materializePipelineAsync(spec, ctx);
        this.store.set(hash, pipeline);
        return spec;
    }

    write(spec: AnyBufferSpec, data: ArrayBufferView, offset = 0): void {
        const ctx = this.requireContext();
        const buf = this.requireBuffer(spec);
        ctx.queue.writeBuffer(buf, offset, data as ArrayBufferView<ArrayBuffer>);
    }

    writeTexture(
        spec: TextureSpec,
        data: ArrayBufferView,
        layout: GPUImageDataLayout,
        size: GPUExtent3DStrict,
    ): void {
        const ctx = this.requireContext();
        const tex = this.requireTexture(spec);
        ctx.queue.writeTexture({ texture: tex }, data as ArrayBufferView<ArrayBuffer>, layout, size);
    }

    destroy(spec: ResourceSpec): void {
        const hash = specHash(spec);
        const obj = this.store.get<GPUBuffer | GPUTexture>(hash);
        if (obj === undefined) return;
        if ('destroy' in obj && typeof obj.destroy === 'function') {
            obj.destroy();
        }
        this.store.delete(hash);
    }

    async readback(spec: StagingBufferSpec): Promise<ArrayBuffer> {
        const buf = this.requireBuffer(spec);
        await buf.mapAsync(GPUMapMode.READ);
        const range = buf.getMappedRange();
        const copy = range.slice(0);
        buf.unmap();
        return copy;
    }

    record(...args: [body: (frame: Frame) => void] | [label: string, body: (frame: Frame) => void]): void {
        const ctx = this.requireContext();
        const [label, body] = args.length === 1
            ? [undefined, args[0]] as const
            : [args[0], args[1]] as const;
        if (this.currentFrame !== null) {
            throw new Error('GpuEngineCore: nested record() not allowed.');
        }
        this.command.open(ctx.device, label);
        const frame = new GpuFrame(ctx, this.store, this.command);
        this.currentFrame = frame;
        try {
            body(frame);
        } finally {
            this.currentFrame = null;
        }
    }

    submit(): void {
        const ctx = this.requireContext();
        const cmd = this.command.finishAndClose();
        ctx.queue.submit([cmd]);
    }

    async withErrorScope<T>(filter: GPUErrorFilter, body: () => T | Promise<T>): Promise<T> {
        const ctx = this.requireContext();
        ctx.device.pushErrorScope(filter);
        try {
            const result = await body();
            const err = await ctx.device.popErrorScope();
            if (err !== null) throw err;
            return result;
        } catch (e) {
            await ctx.device.popErrorScope().catch(() => null);
            throw e;
        }
    }

    shutdown(): void {
        this.profilerSystem.detach();
        this.store.clear();
        const ctx = this.context;
        if (ctx !== null) {
            ctx.canvasContext?.unconfigure();
            ctx.device.destroy();
        }
        this.context = null;
    }

    private requireContext(): GpuContext {
        if (this.context === null) {
            throw new Error('GpuEngineCore: not initialized. Call initialize() first.');
        }
        return this.context;
    }

    private applyCanvas(ctx: GpuContext, canvas: HTMLCanvasElement | null, options: CanvasOptions | undefined): void {
        if (canvas === null) {
            ctx.canvas = null;
            ctx.canvasContext = null;
            return;
        }
        if (ctx.canvas !== canvas) {
            const cctx = canvas.getContext('webgpu');
            if (cctx === null) throw new Error('GpuEngineCore: failed to get webgpu canvas context.');
            ctx.canvas = canvas;
            ctx.canvasContext = cctx;
        }
        this.configureCanvasContext(ctx, options);
    }

    private configureCanvasContext(ctx: GpuContext, options: CanvasOptions | undefined): void {
        if (ctx.canvasContext === null) return;
        const config: GPUCanvasConfiguration = {
            device: ctx.device,
            format: ctx.canvasFormat,
            alphaMode: options?.alphaMode ?? 'opaque',
            ...(options?.colorSpace !== undefined ? { colorSpace: options.colorSpace } : {}),
        };
        ctx.canvasContext.configure(config);
    }

    private requireBuffer(spec: AnyBufferSpec): GPUBuffer {
        const hash = specHash(spec);
        return this.store.require<GPUBuffer>(hash, `buffer:${spec.subkind}`);
    }

    private requireTexture(spec: TextureSpec): GPUTexture {
        const hash = specHash(spec);
        return this.store.require<GPUTexture>(hash, 'texture');
    }

    private materialize(spec: ResourceSpec, _hash: string): GPUBuffer | GPUTexture | GPUTextureView | GPUSampler | GPUShaderModule | GPUBindGroupLayout | GPUBindGroup | GPUComputePipeline | GPURenderPipeline | GPURenderBundle {
        const ctx = this.requireContext();
        switch (spec.kind) {
            case 'buffer':       return this.materializeBuffer(spec, ctx);
            case 'texture':      return this.materializeTexture(spec, ctx);
            case 'textureview':  return this.materializeTextureView(spec, ctx);
            case 'sampler':      return this.materializeSampler(spec, ctx);
            case 'shader':       return this.materializeShader(spec, ctx);
            case 'layout':       return this.materializeLayout(spec, ctx);
            case 'bindgroup':    return this.materializeBindGroup(spec, ctx);
            case 'pipeline':     return this.materializePipelineSync(spec, ctx);
            case 'bundle':       return this.materializeBundle(spec, ctx);
        }
    }

    private materializeBuffer(spec: AnyBufferSpec, ctx: GpuContext): GPUBuffer {
        const desc: GPUBufferDescriptor = {
            size: bufferByteSize(spec),
            usage: bufferUsage(spec),
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        return ctx.device.createBuffer(desc);
    }

    private materializeTexture(spec: TextureSpec, ctx: GpuContext): GPUTexture {
        const size: GPUExtent3DDict = {
            width: spec.width,
            height: spec.height,
            ...(spec.depthOrArrayLayers !== undefined
                ? { depthOrArrayLayers: spec.depthOrArrayLayers }
                : {}),
        };
        const desc: GPUTextureDescriptor = {
            size,
            format: spec.format,
            usage: spec.usage,
            ...(spec.dimension !== undefined ? { dimension: spec.dimension } : {}),
            ...(spec.mipLevelCount !== undefined ? { mipLevelCount: spec.mipLevelCount } : {}),
            ...(spec.sampleCount !== undefined ? { sampleCount: spec.sampleCount } : {}),
            ...(spec.viewFormats !== undefined ? { viewFormats: spec.viewFormats } : {}),
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        return ctx.device.createTexture(desc);
    }

    private materializeTextureView(spec: TextureViewSpec, _ctx: GpuContext): GPUTextureView {
        const tex = this.requireTexture(spec.source);
        const desc: GPUTextureViewDescriptor = {
            ...(spec.format !== undefined ? { format: spec.format } : {}),
            ...(spec.dimension !== undefined ? { dimension: spec.dimension } : {}),
            ...(spec.aspect !== undefined ? { aspect: spec.aspect } : {}),
            ...(spec.baseMipLevel !== undefined ? { baseMipLevel: spec.baseMipLevel } : {}),
            ...(spec.mipLevelCount !== undefined ? { mipLevelCount: spec.mipLevelCount } : {}),
            ...(spec.baseArrayLayer !== undefined ? { baseArrayLayer: spec.baseArrayLayer } : {}),
            ...(spec.arrayLayerCount !== undefined ? { arrayLayerCount: spec.arrayLayerCount } : {}),
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        return tex.createView(desc);
    }

    private materializeSampler(spec: SamplerSpec, ctx: GpuContext): GPUSampler {
        return ctx.device.createSampler(spec.desc);
    }

    private materializeShader(spec: ShaderModuleSpec, ctx: GpuContext): GPUShaderModule {
        const desc: GPUShaderModuleDescriptor = {
            code: spec.source,
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        return ctx.device.createShaderModule(desc);
    }

    private materializeLayout(spec: LayoutSpec, ctx: GpuContext): GPUBindGroupLayout {
        const entries: GPUBindGroupLayoutEntry[] = spec.entries.map(entry => {
            const base = { binding: entry.binding, visibility: entry.visibility };
            switch (entry.kind) {
                case 'buffer':
                    return {
                        ...base,
                        buffer: {
                            type: entry.type ?? 'uniform',
                            hasDynamicOffset: entry.hasDynamicOffset ?? false,
                            minBindingSize: entry.minBindingSize ?? 0,
                        },
                    };
                case 'sampler':
                    return { ...base, sampler: { type: entry.type ?? 'filtering' } };
                case 'texture':
                    return {
                        ...base,
                        texture: {
                            sampleType: entry.sampleType ?? 'float',
                            viewDimension: entry.viewDimension ?? '2d',
                            multisampled: entry.multisampled ?? false,
                        },
                    };
                case 'storage-texture':
                    return {
                        ...base,
                        storageTexture: {
                            access: entry.access ?? 'write-only',
                            format: entry.format,
                            viewDimension: entry.viewDimension ?? '2d',
                        },
                    };
                case 'external-texture':
                    return { ...base, externalTexture: {} };
            }
        });
        const desc: GPUBindGroupLayoutDescriptor = {
            entries,
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        return ctx.device.createBindGroupLayout(desc);
    }

    private materializeBindGroup(spec: BindGroupSpec, ctx: GpuContext): GPUBindGroup {
        const layout = this.store.require<GPUBindGroupLayout>(specHash(spec.layout), 'layout');
        const entries: GPUBindGroupEntry[] = spec.bindings.map(b => {
            switch (b.kind) {
                case 'buffer': {
                    const buf = this.store.require<GPUBuffer>(specHash(b.buffer), 'buffer');
                    const resource: GPUBufferBinding = {
                        buffer: buf,
                        ...(b.offset !== undefined ? { offset: b.offset } : {}),
                        ...(b.size !== undefined ? { size: b.size } : {}),
                    };
                    return { binding: b.binding, resource };
                }
                case 'sampler': {
                    const sampler = this.store.require<GPUSampler>(specHash(b.sampler), 'sampler');
                    return { binding: b.binding, resource: sampler };
                }
                case 'textureview': {
                    const view = this.store.require<GPUTextureView>(specHash(b.view), 'textureview');
                    return { binding: b.binding, resource: view };
                }
            }
        });
        const desc: GPUBindGroupDescriptor = {
            layout,
            entries,
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        return ctx.device.createBindGroup(desc);
    }

    private materializePipelineSync(spec: AnyPipelineSpec, ctx: GpuContext): GPUComputePipeline | GPURenderPipeline {
        if (spec.subkind === 'compute') {
            return ctx.device.createComputePipeline(this.computePipelineDescriptor(spec));
        }
        return ctx.device.createRenderPipeline(this.renderPipelineDescriptor(spec));
    }

    private async materializePipelineAsync(spec: AnyPipelineSpec, ctx: GpuContext): Promise<GPUComputePipeline | GPURenderPipeline> {
        if (spec.subkind === 'compute') {
            return ctx.device.createComputePipelineAsync(this.computePipelineDescriptor(spec));
        }
        return ctx.device.createRenderPipelineAsync(this.renderPipelineDescriptor(spec));
    }

    private pipelineLayout(spec: AnyPipelineSpec, ctx: GpuContext): GPUPipelineLayout {
        const layouts = spec.layouts.map(l =>
            this.store.require<GPUBindGroupLayout>(specHash(l), 'layout'),
        );
        return ctx.device.createPipelineLayout({ bindGroupLayouts: layouts });
    }

    private computePipelineDescriptor(spec: ComputePipelineSpec): GPUComputePipelineDescriptor {
        const ctx = this.requireContext();
        const shader = this.store.require<GPUShaderModule>(specHash(spec.shader), 'shader');
        return {
            layout: this.pipelineLayout(spec, ctx),
            compute: {
                module: shader,
                entryPoint: spec.entryPoint,
                ...(spec.constants !== undefined ? { constants: spec.constants } : {}),
            },
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
    }

    private renderPipelineDescriptor(spec: RenderPipelineSpec): GPURenderPipelineDescriptor {
        const ctx = this.requireContext();
        const vertexShader = this.store.require<GPUShaderModule>(specHash(spec.vertex.shader), 'shader');
        const vertex: GPUVertexState = {
            module: vertexShader,
            entryPoint: spec.vertex.entryPoint,
            ...(spec.vertex.constants !== undefined ? { constants: spec.vertex.constants } : {}),
            ...(spec.vertex.buffers !== undefined
                ? {
                      buffers: spec.vertex.buffers.map(b => ({
                          arrayStride: b.arrayStride,
                          stepMode: b.stepMode ?? 'vertex',
                          attributes: b.attributes.map(a => ({
                              shaderLocation: a.shaderLocation,
                              offset: a.offset,
                              format: a.format,
                          })),
                      })),
                  }
                : {}),
        };
        const desc: GPURenderPipelineDescriptor = {
            layout: this.pipelineLayout(spec, ctx),
            vertex,
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        if (spec.fragment !== undefined) {
            const fragShader = this.store.require<GPUShaderModule>(specHash(spec.fragment.shader), 'shader');
            (desc as { fragment: GPUFragmentState }).fragment = {
                module: fragShader,
                entryPoint: spec.fragment.entryPoint,
                targets: spec.fragment.targets.map(t => ({
                    format: t.format,
                    ...(t.writeMask !== undefined ? { writeMask: t.writeMask } : {}),
                    ...(t.blend !== undefined ? { blend: { color: { ...t.blend.color }, alpha: { ...t.blend.alpha } } } : {}),
                })),
                ...(spec.fragment.constants !== undefined ? { constants: spec.fragment.constants } : {}),
            };
        }
        if (spec.primitive !== undefined) {
            (desc as { primitive: GPUPrimitiveState }).primitive = { ...spec.primitive };
        }
        if (spec.depthStencil !== undefined) {
            (desc as { depthStencil: GPUDepthStencilState }).depthStencil = {
                format: spec.depthStencil.format,
                ...(spec.depthStencil.depthWriteEnabled !== undefined ? { depthWriteEnabled: spec.depthStencil.depthWriteEnabled } : {}),
                ...(spec.depthStencil.depthCompare !== undefined ? { depthCompare: spec.depthStencil.depthCompare } : {}),
                ...(spec.depthStencil.stencilFront !== undefined ? { stencilFront: { ...spec.depthStencil.stencilFront } } : {}),
                ...(spec.depthStencil.stencilBack !== undefined ? { stencilBack: { ...spec.depthStencil.stencilBack } } : {}),
                ...(spec.depthStencil.stencilReadMask !== undefined ? { stencilReadMask: spec.depthStencil.stencilReadMask } : {}),
                ...(spec.depthStencil.stencilWriteMask !== undefined ? { stencilWriteMask: spec.depthStencil.stencilWriteMask } : {}),
                ...(spec.depthStencil.depthBias !== undefined ? { depthBias: spec.depthStencil.depthBias } : {}),
                ...(spec.depthStencil.depthBiasSlopeScale !== undefined ? { depthBiasSlopeScale: spec.depthStencil.depthBiasSlopeScale } : {}),
                ...(spec.depthStencil.depthBiasClamp !== undefined ? { depthBiasClamp: spec.depthStencil.depthBiasClamp } : {}),
            };
        }
        if (spec.multisample !== undefined) {
            (desc as { multisample: GPUMultisampleState }).multisample = { ...spec.multisample };
        }
        return desc;
    }

    private materializeBundle(spec: BundleSpec, ctx: GpuContext): GPURenderBundle {
        const desc: GPURenderBundleEncoderDescriptor = {
            colorFormats: spec.formats.colorFormats,
            ...(spec.formats.depthStencilFormat !== undefined ? { depthStencilFormat: spec.formats.depthStencilFormat } : {}),
            ...(spec.formats.sampleCount !== undefined ? { sampleCount: spec.formats.sampleCount } : {}),
            ...(spec.formats.depthReadOnly !== undefined ? { depthReadOnly: spec.formats.depthReadOnly } : {}),
            ...(spec.formats.stencilReadOnly !== undefined ? { stencilReadOnly: spec.formats.stencilReadOnly } : {}),
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        const encoder = ctx.device.createRenderBundleEncoder(desc);
        const bundlePass = new GpuBundleRenderPass(encoder, this.store);
        spec.body(bundlePass);
        const finishDesc: GPURenderBundleDescriptor = spec.label !== undefined ? { label: spec.label } : {};
        return encoder.finish(finishDesc);
    }
}

import { GpuBundleRenderPass } from './passes/GpuBundleRenderPass';
