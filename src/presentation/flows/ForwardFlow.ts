import type {
    BindGroupSpec,
    EngineCore,
    Frame,
    IndexBufferSpec,
    LayoutSpec,
    RenderPipelineSpec,
    RenderTarget,
    SamplerSpec,
    ShaderModuleSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
    VertexBufferSpec,
} from '../../core/contracts/index';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import type { Phase } from '../../scene/flows/Flow';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { ResourceSystem } from '../../scene/systems/ResourceSystem';
import type { World } from '../../scene/world/World';
import type { EntityId } from '../../scene/world/EntityId';
import { Camera } from '../../elements/scene/Camera';
import { Transform } from '../../elements/scene/Transform';
import { StandardMaterial } from '../../elements/material/StandardMaterial';
import type { Geometry } from '../../elements/geometry/Geometry';
import type { Material } from '../../elements/material/Material';
import type { ShadowFlow } from './ShadowFlow';

interface RenderableSlot {
    readonly entityId: EntityId;
    readonly geometry: Geometry;
    readonly material: Material;
    readonly transform: Transform;
    vbo: VertexBufferSpec;
    ibo: IndexBufferSpec;
    cameraBuffer: UniformBufferSpec;
    cameraBindGroup: BindGroupSpec;
    transformBuffer: UniformBufferSpec;
    transformBindGroup: BindGroupSpec;
    materialBuffer: UniformBufferSpec;
    materialBindGroup: BindGroupSpec;
    pipeline: RenderPipelineSpec;
}

export class ForwardFlow extends RenderFlow {
    readonly type = 'ForwardFlow';
    readonly bodyType = '';
    readonly phase: Phase = 'forward';
    override priority = 0;

    private depthTexture: TextureSpec | null = null;
    private depthView: TextureViewSpec | null = null;
    private cachedSlots = new Map<EntityId, RenderableSlot>();
    private readonly canvasSize = { width: 0, height: 0 };

    private cameraLayout: LayoutSpec | null = null;
    private transformLayout: LayoutSpec | null = null;
    private materialLayout: LayoutSpec | null = null;
    private shadowLayout: LayoutSpec | null = null;
    private shadowParamsBuffer: UniformBufferSpec | null = null;
    private shadowSampler: SamplerSpec | null = null;
    private shadowDummyTexture: TextureSpec | null = null;
    private shadowDummyView: TextureViewSpec | null = null;
    private shadowBindGroup: BindGroupSpec | null = null;
    private lastShadowDiscriminator: string | null = null;

    private outputColorTexture: TextureSpec | null = null;
    private outputColorView: TextureViewSpec | null = null;

    private shadowFlow: ShadowFlow | null = null;
    private renderToOffscreen = false;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        private readonly canvas: HTMLCanvasElement,
    ) {
        super();
    }

    bindShadowFlow(shadowFlow: ShadowFlow): this {
        this.shadowFlow = shadowFlow;
        return this;
    }

    setRenderToOffscreen(enabled: boolean): this {
        this.renderToOffscreen = enabled;
        return this;
    }

    get colorOutputView(): TextureViewSpec | null {
        return this.outputColorView;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    override isReady(): boolean {
        return true;
    }

    override onPoolReallocated(_poolKey: string): void {
        // ForwardFlow não consome diretamente nenhum pool — meshes vivem em VBO/IBO
        // por entityId, não em pool. Se renderer evoluir para pool de transforms,
        // invalidar `cachedSlots` aqui.
    }

    override onCanvasResized(_width: number, _height: number): void {
        // Sinaliza recriação na próxima dispatch via ensureDepth/ensureOutputColor
        // (esses checam canvasSize.width/height contra canvas.width/height).
        this.canvasSize.width = 0;
        this.canvasSize.height = 0;
        this.depthTexture = null;
        this.depthView = null;
        this.outputColorTexture = null;
        this.outputColorView = null;
    }

    override onEntitiesRemoved(entityIds: readonly number[]): void {
        for (const id of entityIds) {
            this.cachedSlots.delete(id as EntityId);
        }
    }

    override resolveTarget(): RenderTarget {
        throw new Error('ForwardFlow.resolveTarget called outside dispatch.');
    }

    override recordRenderPass(_frame: Frame, _target: RenderTarget): void {
        // not used — dispatch builds target itself
    }

    override dispatch(frame: Frame): void {
        this.ensureSharedLayouts();
        this.ensureDepth();
        this.ensureShadowResources();
        this.ensureOutputColor();
        const renderables = this.collectRenderables();
        if (renderables.length === 0 || this.depthView === null) return;
        for (const r of renderables) this.uploadPerFrameData(r);
        this.uploadShadowParams();

        const colorView = this.renderToOffscreen && this.outputColorView !== null
            ? this.outputColorView
            : frame.canvasView;
        const target: RenderTarget = {
            colorAttachments: [{
                view: colorView,
                clearValue: [0.05, 0.07, 0.12, 1.0],
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        };

        if (this.shadowBindGroup === null) return;
        const shadowBg = this.shadowBindGroup;
        frame.render(target, 'ForwardFlow', pass => {
            for (const r of renderables) {
                pass.bind
                    .setPipeline(r.pipeline)
                    .setBindGroup(0, r.cameraBindGroup)
                    .setBindGroup(1, r.transformBindGroup)
                    .setBindGroup(2, r.materialBindGroup)
                    .setBindGroup(3, shadowBg);
                pass.geometry
                    .vertex(0, r.vbo)
                    .index(r.ibo);
                pass.draw.indexed(r.geometry.indexCount);
            }
        });
        void this.resources;
    }

    private ensureSharedLayouts(): void {
        if (this.cameraLayout === null) {
            this.cameraLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'forward_camera_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, kind: 'buffer', type: 'uniform' }],
            });
        }
        if (this.transformLayout === null) {
            this.transformLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'forward_transform_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, kind: 'buffer', type: 'uniform' }],
            });
        }
        if (this.materialLayout === null) {
            this.materialLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'forward_material_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, kind: 'buffer', type: 'uniform' }],
            });
        }
        if (this.shadowLayout === null) {
            this.shadowLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'forward_shadow_layout',
                entries: [
                    { binding: 0, visibility: GPUShaderStage.FRAGMENT, kind: 'buffer', type: 'uniform' },
                    { binding: 1, visibility: GPUShaderStage.FRAGMENT, kind: 'texture', sampleType: 'depth', viewDimension: '2d', multisampled: false },
                    { binding: 2, visibility: GPUShaderStage.FRAGMENT, kind: 'sampler', type: 'comparison' },
                ],
            });
        }
        if (this.shadowParamsBuffer === null) {
            this.shadowParamsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer', subkind: 'uniform',
                discriminator: 'forward_shadow_params',
                byteSize: 96,
            });
        }
        if (this.shadowSampler === null) {
            this.shadowSampler = this.core.create<SamplerSpec>({
                kind: 'sampler',
                discriminator: 'forward_shadow_sampler',
                desc: { magFilter: 'linear', minFilter: 'linear', compare: 'less' },
            });
        }
    }

    private ensureShadowResources(): void {
        if (this.shadowDummyTexture === null) {
            this.shadowDummyTexture = this.core.create<TextureSpec>({
                kind: 'texture', discriminator: 'forward_shadow_dummy',
                width: 1, height: 1,
                format: 'depth32float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
            this.shadowDummyView = this.core.create<TextureViewSpec>({
                kind: 'textureview', discriminator: 'forward_shadow_dummy_view',
                source: this.shadowDummyTexture, format: 'depth32float',
            });
        }
        const shadowView = this.shadowFlow?.depthTextureView ?? this.shadowDummyView;
        if (shadowView === null) return;
        const disc = shadowView.discriminator ?? 'unknown';
        if (this.shadowBindGroup !== null && this.lastShadowDiscriminator === disc) return;
        if (this.shadowLayout === null || this.shadowParamsBuffer === null || this.shadowSampler === null) return;
        this.shadowBindGroup = this.core.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: `forward_shadow_bg:${disc}`,
            layout: this.shadowLayout,
            bindings: [
                { binding: 0, kind: 'buffer', buffer: this.shadowParamsBuffer },
                { binding: 1, kind: 'textureview', view: shadowView },
                { binding: 2, kind: 'sampler', sampler: this.shadowSampler },
            ],
        });
        this.lastShadowDiscriminator = disc;
    }

    private ensureOutputColor(): void {
        if (!this.renderToOffscreen) return;
        const w = this.canvas.width, h = this.canvas.height;
        if (w === 0 || h === 0) return;
        if (this.outputColorTexture !== null && this.canvasSize.width === w && this.canvasSize.height === h) return;
        this.outputColorTexture = this.core.create<TextureSpec>({
            kind: 'texture', discriminator: `forward_color:${w}x${h}`,
            width: w, height: h, format: this.core.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.outputColorView = this.core.create<TextureViewSpec>({
            kind: 'textureview', discriminator: `forward_color_view:${w}x${h}`,
            source: this.outputColorTexture, format: this.core.canvasFormat,
        });
    }

    private uploadShadowParams(): void {
        if (this.shadowParamsBuffer === null) return;
        // ShadowParams (96B): lightViewProj mat4@0..64, lightDir vec4@64..80, bias f32@80, enabled f32@84, _pad @ 88..96
        const buf = new ArrayBuffer(96);
        const f32 = new Float32Array(buf);
        const lvp = this.shadowFlow?.currentLightViewProj ?? identity();
        for (let i = 0; i < 16; i++) f32[i] = lvp[i] ?? 0;
        const lightDir = this.shadowFlow?.currentLightDirection ?? [0.4, -1, 0.6, 0];
        f32[16] = lightDir[0] ?? 0;
        f32[17] = lightDir[1] ?? -1;
        f32[18] = lightDir[2] ?? 0;
        f32[19] = 0;
        f32[20] = this.shadowFlow !== null ? 0.005 : 0;
        f32[21] = this.shadowFlow !== null ? 1.0 : 0.0;
        this.core.write(this.shadowParamsBuffer, new Uint8Array(buf));
    }

    private ensureDepth(): void {
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (w === 0 || h === 0) return;
        if (this.depthTexture !== null && this.canvasSize.width === w && this.canvasSize.height === h) return;
        this.depthTexture = this.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: `forward_depth:${w}x${h}`,
            width: w,
            height: h,
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthView = this.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: `forward_depthview:${w}x${h}`,
            source: this.depthTexture,
            format: 'depth24plus',
        });
        this.canvasSize.width = w;
        this.canvasSize.height = h;
    }

    private collectRenderables(): RenderableSlot[] {
        const out: RenderableSlot[] = [];
        const cameraId = this.world.queryBySchemaName('Camera')[0];
        if (cameraId === undefined) return out;
        const cameraResource = this.world.resourcesOf(cameraId).find(r => r.constructor === Camera) as Camera | undefined;
        if (cameraResource === undefined) return out;

        const seenSchemas = ['BoxVertex', 'SphereVertex', 'PlaneVertex', 'ParametricVertex'];
        const visited = new Set<EntityId>();
        for (const schemaName of seenSchemas) {
            for (const id of this.world.queryBySchemaName(schemaName)) {
                if (visited.has(id)) continue;
                visited.add(id);
                const resources = this.world.resourcesOf(id);
                const geometry = resources.find(r => isGeometry(r)) as Geometry | undefined;
                const material = resources.find(r => isMaterial(r)) as Material | undefined;
                const transform = resources.find(r => r.constructor === Transform) as Transform | undefined;
                if (geometry === undefined || material === undefined || transform === undefined) continue;
                const slot = this.ensureSlot(id, geometry, material, transform, cameraResource);
                if (slot !== null) out.push(slot);
            }
        }
        return out;
    }

    private ensureSlot(
        entityId: EntityId,
        geometry: Geometry,
        material: Material,
        transform: Transform,
        camera: Camera,
    ): RenderableSlot | null {
        const cached = this.cachedSlots.get(entityId);
        if (cached !== undefined) return cached;
        if (this.cameraLayout === null || this.transformLayout === null || this.materialLayout === null || this.shadowLayout === null) return null;

        const vertices = geometry.data['vertices'] as Float32Array | undefined;
        const indices = geometry.data['indices'] as Uint16Array | undefined;
        if (vertices === undefined || indices === undefined) return null;

        const vbo: VertexBufferSpec = this.core.create({
            kind: 'buffer', subkind: 'vertex',
            discriminator: `forward_vbo:${entityId}`,
            byteSize: vertices.byteLength,
            stride: 32,
            count: geometry.vertexCount,
        });
        this.core.write(vbo, vertices);

        const ibo: IndexBufferSpec = this.core.create({
            kind: 'buffer', subkind: 'index',
            discriminator: `forward_ibo:${entityId}`,
            byteSize: alignBufferSize(indices.byteLength),
            count: geometry.indexCount,
            format: 'uint16',
        });
        const paddedIndices = padTo4Bytes(indices);
        this.core.write(ibo, paddedIndices);

        const cameraBuffer: UniformBufferSpec = this.core.create({
            kind: 'buffer', subkind: 'uniform',
            discriminator: `forward_camera:${entityId}`,
            byteSize: alignUp(Camera.schema.stride, 16),
        });
        const cameraBindGroup: BindGroupSpec = this.core.create({
            kind: 'bindgroup',
            discriminator: `forward_camera_bg:${entityId}`,
            layout: this.cameraLayout,
            bindings: [{ binding: 0, kind: 'buffer', buffer: cameraBuffer }],
        });

        const transformBuffer: UniformBufferSpec = this.core.create({
            kind: 'buffer', subkind: 'uniform',
            discriminator: `forward_transform:${entityId}`,
            byteSize: alignUp(Transform.schema.stride, 16),
        });
        const transformBindGroup: BindGroupSpec = this.core.create({
            kind: 'bindgroup',
            discriminator: `forward_transform_bg:${entityId}`,
            layout: this.transformLayout,
            bindings: [{ binding: 0, kind: 'buffer', buffer: transformBuffer }],
        });

        const materialBuffer: UniformBufferSpec = this.core.create({
            kind: 'buffer', subkind: 'uniform',
            discriminator: `forward_material:${entityId}`,
            byteSize: alignUp(StandardMaterial.schema.stride, 16),
        });
        const materialBindGroup: BindGroupSpec = this.core.create({
            kind: 'bindgroup',
            discriminator: `forward_material_bg:${entityId}`,
            layout: this.materialLayout,
            bindings: [{ binding: 0, kind: 'buffer', buffer: materialBuffer }],
        });

        const pipelineDescs = material.getPipelineDescriptors();
        const matPipelineDesc = pipelineDescs[0];
        if (matPipelineDesc === undefined) return null;
        const shader: ShaderModuleSpec = this.core.create({
            kind: 'shader',
            discriminator: matPipelineDesc.id,
            source: matPipelineDesc.shaderSource,
        });
        const pipeline: RenderPipelineSpec = this.core.create<RenderPipelineSpec>({
            kind: 'pipeline', subkind: 'render',
            discriminator: `forward_pipeline:${matPipelineDesc.id}`,
            layouts: [this.cameraLayout, this.transformLayout, this.materialLayout, this.shadowLayout],
            vertex: {
                shader,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 32,
                    stepMode: 'vertex',
                    attributes: [
                        { shaderLocation: 0, offset: 0,  format: 'float32x3' },
                        { shaderLocation: 1, offset: 12, format: 'float32x3' },
                        { shaderLocation: 2, offset: 24, format: 'float32x2' },
                    ],
                }],
            },
            fragment: {
                shader,
                entryPoint: 'fs_main',
                targets: [{ format: this.core.canvasFormat }],
            },
            primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
            depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
        });

        const slot: RenderableSlot = {
            entityId, geometry, material, transform,
            vbo, ibo,
            cameraBuffer, cameraBindGroup,
            transformBuffer, transformBindGroup,
            materialBuffer, materialBindGroup,
            pipeline,
        };
        void camera;
        this.cachedSlots.set(entityId, slot);
        return slot;
    }

    private uploadPerFrameData(r: RenderableSlot): void {
        const cameraId = this.world.queryBySchemaName('Camera')[0];
        if (cameraId !== undefined) {
            const camera = this.world.resourcesOf(cameraId).find(rr => rr.constructor === Camera) as Camera | undefined;
            if (camera !== undefined) {
                this.core.write(r.cameraBuffer, Camera.schema.pack(camera.data));
            }
        }
        this.core.write(r.transformBuffer, Transform.schema.pack(r.transform.data));
        this.core.write(r.materialBuffer, materialPack(r.material));
    }
}

function isGeometry(r: { constructor: { name: string } }): boolean {
    const name = r.constructor.name;
    return name === 'BoxGeometry' || name === 'SphereGeometry' || name === 'PlaneGeometry' || name === 'ParametricGeometry' || name === 'ParametricSurfaceGeometry';
}

function isMaterial(r: { constructor: { name: string } }): boolean {
    const name = r.constructor.name;
    return name === 'StandardMaterial' || name === 'WireframeMaterial' || name === 'PointSpriteMaterial';
}

function materialPack(material: Material): ArrayBufferView {
    const ctor = material.constructor as unknown as { schema: { pack(data: Record<string, unknown>): ArrayBufferView } };
    return ctor.schema.pack(material.data);
}

function alignUp(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}

function alignBufferSize(byteSize: number): number {
    return Math.max(4, alignUp(byteSize, 4));
}

function padTo4Bytes(arr: Uint16Array): Uint8Array {
    const padded = alignBufferSize(arr.byteLength);
    const out = new Uint8Array(padded);
    out.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    return out;
}

function identity(): readonly number[] {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
