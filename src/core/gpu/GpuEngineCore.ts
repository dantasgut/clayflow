import type {
    CanvasOptions,
    ComputeKernel,
    ComputeKernelOptions,
    DeviceLostHandler,
    DeviceLostInfo,
    EngineCore,
} from '../contracts/EngineCore';
import type { Frame } from '../contracts/Frame';
import type { Profiler } from '../contracts/Profiler';
import type { BindGroupSpec } from '../contracts/specs/BindGroupSpec';
import type { BufferSpec } from '../contracts/specs/BufferSpec';
import type { BundleSpec } from '../contracts/specs/BundleSpec';
import type { ComputePipelineSpec } from '../contracts/specs/ComputePipelineSpec';
import type { LayoutSpec } from '../contracts/specs/LayoutSpec';
import type { RenderPipelineSpec } from '../contracts/specs/RenderPipelineSpec';
import type { AnyBufferSpec, AnyPipelineSpec, ResourceSpec } from '../contracts/specs/ResourceSpec';
import type { SamplerSpec } from '../contracts/specs/SamplerSpec';
import type { ShaderModuleSpec } from '../contracts/specs/ShaderModuleSpec';
import type { StagingBufferSpec } from '../contracts/specs/StagingBufferSpec';
import type { TextureSpec } from '../contracts/specs/TextureSpec';
import type { TextureViewSpec } from '../contracts/specs/TextureViewSpec';
import { createGpuContext, type GpuContext } from './GpuContext';
import { GpuCommandState } from './GpuCommandState';
import { GpuFrame } from './GpuFrame';
import { GpuResourceStore, type MemoryUsageReport, type StoredGpuObject } from './GpuResourceStore';
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

/**
 * Bytes/pixel para os formatos WebGPU mais comuns. Formatos não listados
 * caem no fallback de 4 bytes (conservador, não infla budget).
 */
function bytesPerPixel(format: GPUTextureFormat): number {
    switch (format) {
        case 'r8unorm':
        case 'r8snorm':
        case 'r8uint':
        case 'r8sint':
        case 'stencil8':
            return 1;
        case 'rg8unorm':
        case 'rg8snorm':
        case 'rg8uint':
        case 'rg8sint':
        case 'r16uint':
        case 'r16sint':
        case 'r16float':
        case 'depth16unorm':
            return 2;
        case 'rgba8unorm':
        case 'rgba8unorm-srgb':
        case 'rgba8snorm':
        case 'rgba8uint':
        case 'rgba8sint':
        case 'bgra8unorm':
        case 'bgra8unorm-srgb':
        case 'rg16uint':
        case 'rg16sint':
        case 'rg16float':
        case 'r32uint':
        case 'r32sint':
        case 'r32float':
        case 'depth32float':
        case 'depth24plus':
        case 'depth24plus-stencil8':
        case 'rgb10a2unorm':
        case 'rg11b10ufloat':
            return 4;
        case 'rgba16uint':
        case 'rgba16sint':
        case 'rgba16float':
        case 'rg32uint':
        case 'rg32sint':
        case 'rg32float':
            return 8;
        case 'rgba32uint':
        case 'rgba32sint':
        case 'rgba32float':
            return 16;
        default:
            return 4;
    }
}

function textureByteSize(spec: TextureSpec): number {
    const layers = spec.depthOrArrayLayers ?? 1;
    const mipLevels = spec.mipLevelCount ?? 1;
    const sampleCount = spec.sampleCount ?? 1;
    const bpp = bytesPerPixel(spec.format);
    let total = 0;
    for (let m = 0; m < mipLevels; m++) {
        const w = Math.max(1, spec.width >> m);
        const h = Math.max(1, spec.height >> m);
        total += w * h * layers * bpp * sampleCount;
    }
    return total;
}

export class GpuEngineCore implements EngineCore {
    private context: GpuContext | null = null;
    private readonly store = new GpuResourceStore();
    private readonly command = new GpuCommandState();
    private readonly profilerSystem = new GpuProfilerSystem();
    private currentFrame: GpuFrame | null = null;
    private readonly deviceLostHandlers = new Set<DeviceLostHandler>();
    private shuttingDown = false;

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
        this.shuttingDown = false;
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
        this.watchDeviceLost(device);
    }

    onDeviceLost(handler: DeviceLostHandler): () => void {
        this.deviceLostHandlers.add(handler);
        return () => {
            this.deviceLostHandlers.delete(handler);
        };
    }

    async requestRecover(canvas?: HTMLCanvasElement, options?: CanvasOptions): Promise<void> {
        if (this.context !== null) {
            // Caller wants fresh device — simulate lost path para limpar tudo.
            this.handleDeviceLost(this.context.device, {
                reason: 'unknown',
                message: 'manual reset',
            });
        }
        await this.initialize(canvas, options);
    }

    private watchDeviceLost(device: GPUDevice): void {
        device.lost
            .then((info) => {
                this.handleDeviceLost(device, {
                    reason: info.reason,
                    message: info.message,
                });
            })
            .catch(() => null);
    }

    protected handleDeviceLost(device: GPUDevice, info: DeviceLostInfo): void {
        if (this.shuttingDown) return;
        // Guard contra handler stale (device já substituído por recover).
        if (this.context !== null && this.context.device !== device) return;
        this.context = null;
        this.profilerSystem.detach();
        this.store.clear();
        for (const handler of this.deviceLostHandlers) {
            handler(info);
        }
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
        this.storeWithMetadata(hash, spec, obj);
        return spec;
    }

    async createAsync<S extends ResourceSpec>(spec: S): Promise<S> {
        if (spec.kind !== 'pipeline') return this.create(spec);
        const hash = specHash(spec);
        if (this.store.has(hash)) return spec;
        const ctx = this.requireContext();
        const pipeline = await this.materializePipelineAsync(spec, ctx);
        this.storeWithMetadata(hash, spec, pipeline);
        return spec;
    }

    memoryUsage(topN?: number): MemoryUsageReport {
        return this.store.memoryUsage(topN);
    }

    compute(opts: ComputeKernelOptions): ComputeKernel {
        // Idempotente via specHash (cache em this.store).
        // Mesma lógica de scene/flows/createComputeKernel — duplicada aqui para
        // evitar dependência core → scene. createComputeKernel permanece como
        // helper público do scene layer (alias funcional).
        const layout = this.create<LayoutSpec>({
            kind: 'layout',
            discriminator: `${opts.discriminator}_layout`,
            entries: opts.bindings.map((b) => ({
                binding: b.binding,
                visibility: GPUShaderStage.COMPUTE,
                kind: 'buffer' as const,
                type: b.type,
            })),
        });
        const shader = this.create<ShaderModuleSpec>({
            kind: 'shader',
            discriminator: `${opts.discriminator}_shader`,
            source: opts.shaderSource,
        });
        const pipelineSpec: ComputePipelineSpec = {
            kind: 'pipeline',
            subkind: 'compute',
            discriminator: `${opts.discriminator}_pipeline`,
            layouts: [layout],
            shader,
            entryPoint: opts.entryPoint,
        };
        if (opts.preferAsync === true) {
            void this.createAsync<ComputePipelineSpec>(pipelineSpec);
        } else {
            this.create<ComputePipelineSpec>(pipelineSpec);
        }
        const bindGroup = this.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: `${opts.discriminator}_bg`,
            layout,
            bindings: opts.bindings.map((b) => ({
                binding: b.binding,
                kind: 'buffer' as const,
                buffer: b.buffer,
            })),
        });
        return { pipeline: pipelineSpec, bindGroup, layout };
    }

    private storeWithMetadata(hash: string, spec: ResourceSpec, obj: StoredGpuObject): void {
        if (spec.kind === 'buffer') {
            this.store.set(hash, obj, 'buffer', bufferByteSize(spec), spec.label);
        } else if (spec.kind === 'texture') {
            this.store.set(hash, obj, 'texture', textureByteSize(spec), spec.label);
        } else {
            this.store.set(hash, obj, 'other', 0, spec.label);
        }
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
        ctx.queue.writeTexture(
            { texture: tex },
            data as ArrayBufferView<ArrayBuffer>,
            layout,
            size,
        );
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

    record(
        ...args: [body: (frame: Frame) => void] | [label: string, body: (frame: Frame) => void]
    ): void {
        const ctx = this.requireContext();
        const [label, body] =
            args.length === 1 ? ([undefined, args[0]] as const) : ([args[0], args[1]] as const);
        if (this.currentFrame !== null) {
            throw new Error('GpuEngineCore: nested record() not allowed.');
        }
        this.command.open(ctx.device, label);
        const frame = new GpuFrame(ctx, this.store, this.command);
        this.currentFrame = frame;
        try {
            body(frame);
            // Resolve timestamp queries (no-op se profiler não suportado).
            if (this.profilerSystem.isSupported) {
                const encoder = this.command.requireEncoder();
                this.profilerSystem.resolveOnto(encoder);
            }
        } finally {
            this.currentFrame = null;
        }
    }

    submit(): void {
        const ctx = this.requireContext();
        const cmd = this.command.finishAndClose();
        ctx.queue.submit([cmd]);
        if (this.profilerSystem.isSupported) {
            this.profilerSystem.submitFrame();
        }
    }

    async withErrorScope<T>(filter: GPUErrorFilter, body: () => T | Promise<T>): Promise<T> {
        const ctx = this.requireContext();
        ctx.device.pushErrorScope(filter);
        try {
            const result = await body();
            const err = await ctx.device.popErrorScope();
            if (err !== null) throw new Error(`[${filter}] ${err.message}`);
            return result;
        } catch (e) {
            await ctx.device.popErrorScope().catch(() => null);
            throw e;
        }
    }

    shutdown(): void {
        this.shuttingDown = true;
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

    private applyCanvas(
        ctx: GpuContext,
        canvas: HTMLCanvasElement | null,
        options: CanvasOptions | undefined,
    ): void {
        if (canvas === null) {
            ctx.canvas = null;
            ctx.canvasContext = null;
            return;
        }
        if (ctx.canvas !== canvas) {
            const cctx = canvas.getContext('webgpu');
            if (cctx === null)
                throw new Error('GpuEngineCore: failed to get webgpu canvas context.');
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

    private materialize(
        spec: ResourceSpec,
        _hash: string,
    ):
        | GPUBuffer
        | GPUTexture
        | GPUTextureView
        | GPUSampler
        | GPUShaderModule
        | GPUBindGroupLayout
        | GPUBindGroup
        | GPUComputePipeline
        | GPURenderPipeline
        | GPURenderBundle {
        const ctx = this.requireContext();
        switch (spec.kind) {
            case 'buffer':
                return this.materializeBuffer(spec, ctx);
            case 'texture':
                return this.materializeTexture(spec, ctx);
            case 'textureview':
                return this.materializeTextureView(spec, ctx);
            case 'sampler':
                return this.materializeSampler(spec, ctx);
            case 'shader':
                return this.materializeShader(spec, ctx);
            case 'layout':
                return this.materializeLayout(spec, ctx);
            case 'bindgroup':
                return this.materializeBindGroup(spec, ctx);
            case 'pipeline':
                return this.materializePipelineSync(spec, ctx);
            case 'bundle':
                return this.materializeBundle(spec, ctx);
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
            ...(spec.arrayLayerCount !== undefined
                ? { arrayLayerCount: spec.arrayLayerCount }
                : {}),
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
        const entries: GPUBindGroupLayoutEntry[] = spec.entries.map((entry) => {
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
        const entries: GPUBindGroupEntry[] = spec.bindings.map((b) => {
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
                    const view = this.store.require<GPUTextureView>(
                        specHash(b.view),
                        'textureview',
                    );
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

    private materializePipelineSync(
        spec: AnyPipelineSpec,
        ctx: GpuContext,
    ): GPUComputePipeline | GPURenderPipeline {
        if (spec.subkind === 'compute') {
            return ctx.device.createComputePipeline(this.computePipelineDescriptor(spec));
        }
        return ctx.device.createRenderPipeline(this.renderPipelineDescriptor(spec));
    }

    private async materializePipelineAsync(
        spec: AnyPipelineSpec,
        ctx: GpuContext,
    ): Promise<GPUComputePipeline | GPURenderPipeline> {
        if (spec.subkind === 'compute') {
            return ctx.device.createComputePipelineAsync(this.computePipelineDescriptor(spec));
        }
        return ctx.device.createRenderPipelineAsync(this.renderPipelineDescriptor(spec));
    }

    private pipelineLayout(spec: AnyPipelineSpec, ctx: GpuContext): GPUPipelineLayout {
        const layouts = spec.layouts.map((l) =>
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
        const vertexShader = this.store.require<GPUShaderModule>(
            specHash(spec.vertex.shader),
            'shader',
        );
        const vertex: GPUVertexState = {
            module: vertexShader,
            entryPoint: spec.vertex.entryPoint,
            ...(spec.vertex.constants !== undefined ? { constants: spec.vertex.constants } : {}),
            ...(spec.vertex.buffers !== undefined
                ? {
                      buffers: spec.vertex.buffers.map((b) => ({
                          arrayStride: b.arrayStride,
                          stepMode: b.stepMode ?? 'vertex',
                          attributes: b.attributes.map((a) => ({
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
            const fragShader = this.store.require<GPUShaderModule>(
                specHash(spec.fragment.shader),
                'shader',
            );
            (desc as { fragment: GPUFragmentState }).fragment = {
                module: fragShader,
                entryPoint: spec.fragment.entryPoint,
                targets: spec.fragment.targets.map((t) => ({
                    format: t.format,
                    ...(t.writeMask !== undefined ? { writeMask: t.writeMask } : {}),
                    ...(t.blend !== undefined
                        ? { blend: { color: { ...t.blend.color }, alpha: { ...t.blend.alpha } } }
                        : {}),
                })),
                ...(spec.fragment.constants !== undefined
                    ? { constants: spec.fragment.constants }
                    : {}),
            };
        }
        if (spec.primitive !== undefined) {
            (desc as { primitive: GPUPrimitiveState }).primitive = { ...spec.primitive };
        }
        if (spec.depthStencil !== undefined) {
            (desc as { depthStencil: GPUDepthStencilState }).depthStencil = {
                format: spec.depthStencil.format,
                ...(spec.depthStencil.depthWriteEnabled !== undefined
                    ? { depthWriteEnabled: spec.depthStencil.depthWriteEnabled }
                    : {}),
                ...(spec.depthStencil.depthCompare !== undefined
                    ? { depthCompare: spec.depthStencil.depthCompare }
                    : {}),
                ...(spec.depthStencil.stencilFront !== undefined
                    ? { stencilFront: { ...spec.depthStencil.stencilFront } }
                    : {}),
                ...(spec.depthStencil.stencilBack !== undefined
                    ? { stencilBack: { ...spec.depthStencil.stencilBack } }
                    : {}),
                ...(spec.depthStencil.stencilReadMask !== undefined
                    ? { stencilReadMask: spec.depthStencil.stencilReadMask }
                    : {}),
                ...(spec.depthStencil.stencilWriteMask !== undefined
                    ? { stencilWriteMask: spec.depthStencil.stencilWriteMask }
                    : {}),
                ...(spec.depthStencil.depthBias !== undefined
                    ? { depthBias: spec.depthStencil.depthBias }
                    : {}),
                ...(spec.depthStencil.depthBiasSlopeScale !== undefined
                    ? { depthBiasSlopeScale: spec.depthStencil.depthBiasSlopeScale }
                    : {}),
                ...(spec.depthStencil.depthBiasClamp !== undefined
                    ? { depthBiasClamp: spec.depthStencil.depthBiasClamp }
                    : {}),
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
            ...(spec.formats.depthStencilFormat !== undefined
                ? { depthStencilFormat: spec.formats.depthStencilFormat }
                : {}),
            ...(spec.formats.sampleCount !== undefined
                ? { sampleCount: spec.formats.sampleCount }
                : {}),
            ...(spec.formats.depthReadOnly !== undefined
                ? { depthReadOnly: spec.formats.depthReadOnly }
                : {}),
            ...(spec.formats.stencilReadOnly !== undefined
                ? { stencilReadOnly: spec.formats.stencilReadOnly }
                : {}),
            ...(spec.label !== undefined ? { label: spec.label } : {}),
        };
        const encoder = ctx.device.createRenderBundleEncoder(desc);
        const bundlePass = new GpuBundleRenderPass(encoder, this.store);
        spec.body(bundlePass);
        const finishDesc: GPURenderBundleDescriptor =
            spec.label !== undefined ? { label: spec.label } : {};
        return encoder.finish(finishDesc);
    }
}

import { GpuBundleRenderPass } from './passes/GpuBundleRenderPass';
