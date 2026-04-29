import type {
    BindGroupSpec,
    EngineCore,
    Frame,
    IndexBufferSpec,
    LayoutSpec,
    RenderPipelineSpec,
    RenderTarget,
    ShaderModuleSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
    VertexBufferSpec,
} from '../../core/contracts/index';
import { Flow } from '../../scene/flows/Flow';
import type { Phase } from '../../scene/flows/Flow';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { ResourceSystem } from '../../scene/systems/ResourceSystem';
import type { World } from '../../scene/world/World';
import type { EntityId } from '../../scene/world/EntityId';
import type { Geometry } from '../../elements/geometry/Geometry';
import { Transform } from '../../elements/scene/Transform';
import { DirectionalLight } from '../../elements/scene/DirectionalLight';
import shadowDepthWGSL from './shadow_depth.wgsl?raw';

const SHADOW_MAP_SIZE = 1024;

interface ShadowSlot {
    readonly entityId: EntityId;
    readonly geometry: Geometry;
    readonly transform: Transform;
    vbo: VertexBufferSpec;
    ibo: IndexBufferSpec;
    transformBuffer: UniformBufferSpec;
    transformBindGroup: BindGroupSpec;
}

export interface ShadowFlowOptions {
    readonly mapSize?: number;
}

export class ShadowFlow extends Flow {
    readonly type = 'ShadowFlow';
    readonly bodyType = '';
    readonly phase: Phase = 'shadow';

    private readonly mapSize: number;
    private depthTexture: TextureSpec | null = null;
    private depthView: TextureViewSpec | null = null;
    private shadowParamsBuffer: UniformBufferSpec | null = null;
    private shadowParamsLayout: LayoutSpec | null = null;
    private shadowParamsBindGroup: BindGroupSpec | null = null;
    private transformLayout: LayoutSpec | null = null;
    private shader: ShaderModuleSpec | null = null;
    private pipeline: RenderPipelineSpec | null = null;
    private readonly slots = new Map<EntityId, ShadowSlot>();
    private lightViewProj: number[] = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    private lightDirection: [number, number, number, number] = [0.4, -1, 0.6, 0];

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: ShadowFlowOptions = {},
    ) {
        super();
        this.mapSize = options.mapSize ?? SHADOW_MAP_SIZE;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [{
            id: 'pipeline_shadow_depth',
            role: 'render',
            shaderSource: shadowDepthWGSL,
            entryPoints: ['vs_main'],
            consumes: ['Transform'],
        }];
    }

    override isReady(): boolean {
        return this.findShadowCaster() !== null && this.collectShadowReceivers().length > 0;
    }

    get depthTextureView(): TextureViewSpec | null {
        return this.depthView;
    }

    override onEntitiesRemoved(entityIds: readonly number[]): void {
        for (const id of entityIds) {
            this.slots.delete(id as EntityId);
        }
    }

    get currentLightViewProj(): readonly number[] {
        return this.lightViewProj;
    }

    get currentLightDirection(): readonly [number, number, number, number] {
        return this.lightDirection;
    }

    private ensureGpuObjects(): void {
        if (this.depthTexture === null) {
            this.depthTexture = this.core.create<TextureSpec>({
                kind: 'texture', discriminator: 'shadow_depth_tex',
                width: this.mapSize, height: this.mapSize,
                format: 'depth32float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
        }
        if (this.depthView === null) {
            this.depthView = this.core.create<TextureViewSpec>({
                kind: 'textureview', discriminator: 'shadow_depth_view',
                source: this.depthTexture, format: 'depth32float',
            });
        }
        if (this.shadowParamsBuffer === null) {
            this.shadowParamsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer', subkind: 'uniform',
                discriminator: 'shadow_params_buf', byteSize: 64,
            });
        }
        if (this.shadowParamsLayout === null) {
            this.shadowParamsLayout = this.core.create<LayoutSpec>({
                kind: 'layout', discriminator: 'shadow_params_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, kind: 'buffer', type: 'uniform' }],
            });
        }
        if (this.shadowParamsBindGroup === null) {
            this.shadowParamsBindGroup = this.core.create<BindGroupSpec>({
                kind: 'bindgroup', discriminator: 'shadow_params_bg',
                layout: this.shadowParamsLayout,
                bindings: [{ binding: 0, kind: 'buffer', buffer: this.shadowParamsBuffer }],
            });
        }
        if (this.transformLayout === null) {
            this.transformLayout = this.core.create<LayoutSpec>({
                kind: 'layout', discriminator: 'shadow_transform_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, kind: 'buffer', type: 'uniform' }],
            });
        }
        if (this.shader === null) {
            this.shader = this.core.create<ShaderModuleSpec>({
                kind: 'shader', discriminator: 'shadow_depth_shader', source: shadowDepthWGSL,
            });
        }
        if (this.pipeline === null) {
            this.pipeline = this.core.create<RenderPipelineSpec>({
                kind: 'pipeline', subkind: 'render', discriminator: 'shadow_depth_pipeline',
                layouts: [this.shadowParamsLayout, this.transformLayout],
                vertex: {
                    shader: this.shader, entryPoint: 'vs_main',
                    buffers: [{
                        arrayStride: 32, stepMode: 'vertex',
                        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
                    }],
                },
                primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
                depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
            });
        }
    }

    private findShadowCaster(): DirectionalLight | null {
        const ids = this.world.queryBySchemaName('Light');
        for (const id of ids) {
            const light = this.world.resourcesOf(id).find(r => r instanceof DirectionalLight) as DirectionalLight | undefined;
            if (light !== undefined && light.data['castShadow'] === 1) return light;
        }
        return null;
    }

    private collectShadowReceivers(): { entityId: EntityId; geometry: Geometry; transform: Transform }[] {
        const out: { entityId: EntityId; geometry: Geometry; transform: Transform }[] = [];
        const visited = new Set<EntityId>();
        for (const schemaName of ['BoxVertex', 'SphereVertex', 'PlaneVertex', 'ParametricVertex']) {
            for (const id of this.world.queryBySchemaName(schemaName)) {
                if (visited.has(id)) continue;
                visited.add(id);
                const resources = this.world.resourcesOf(id);
                const geometry = resources.find(r => isGeom(r)) as Geometry | undefined;
                const transform = resources.find(r => r.constructor === Transform) as Transform | undefined;
                if (geometry !== undefined && transform !== undefined) {
                    out.push({ entityId: id, geometry, transform });
                }
            }
        }
        return out;
    }

    private uploadShadowParams(light: DirectionalLight): void {
        if (this.shadowParamsBuffer === null) return;
        const dir = (light.data['direction'] as readonly number[]) ?? [0, -1, 0, 0];
        const dx = dir[0] ?? 0, dy = dir[1] ?? -1, dz = dir[2] ?? 0;
        this.lightDirection = [dx, dy, dz, 0];
        const eye = [-dx * 10, -dy * 10, -dz * 10];
        const view = lookAt([eye[0]!, eye[1]!, eye[2]!], [0, 0, 0], [0, 1, 0]);
        const proj = ortho(-10, 10, -10, 10, 0.1, 50);
        const vp = mul(proj, view);
        this.lightViewProj = vp;
        this.core.write(this.shadowParamsBuffer, new Float32Array(vp));
    }

    private ensureSlot(entityId: EntityId, geometry: Geometry, transform: Transform): ShadowSlot | null {
        const cached = this.slots.get(entityId);
        if (cached !== undefined) return cached;
        if (this.transformLayout === null) return null;
        const vertices = geometry.data['vertices'] as Float32Array | undefined;
        const indices = geometry.data['indices'] as Uint16Array | undefined;
        if (vertices === undefined || indices === undefined) return null;

        const vbo = this.core.create<VertexBufferSpec>({
            kind: 'buffer', subkind: 'vertex',
            discriminator: `shadow_vbo:${entityId}`,
            byteSize: vertices.byteLength, stride: 32, count: geometry.vertexCount,
        });
        this.core.write(vbo, vertices);

        const padded = padTo4(indices);
        const ibo = this.core.create<IndexBufferSpec>({
            kind: 'buffer', subkind: 'index',
            discriminator: `shadow_ibo:${entityId}`,
            byteSize: padded.byteLength, count: geometry.indexCount, format: 'uint16',
        });
        this.core.write(ibo, padded);

        const transformBuffer = this.core.create<UniformBufferSpec>({
            kind: 'buffer', subkind: 'uniform',
            discriminator: `shadow_transform:${entityId}`,
            byteSize: alignUp(Transform.schema.stride, 16),
        });
        const transformBindGroup = this.core.create<BindGroupSpec>({
            kind: 'bindgroup', discriminator: `shadow_transform_bg:${entityId}`,
            layout: this.transformLayout,
            bindings: [{ binding: 0, kind: 'buffer', buffer: transformBuffer }],
        });

        const slot: ShadowSlot = { entityId, geometry, transform, vbo, ibo, transformBuffer, transformBindGroup };
        this.slots.set(entityId, slot);
        return slot;
    }

    dispatch(frame: Frame): void {
        const light = this.findShadowCaster();
        if (light === null) return;
        const receivers = this.collectShadowReceivers();
        if (receivers.length === 0) return;
        this.ensureGpuObjects();
        if (this.pipeline === null || this.depthView === null || this.shadowParamsBindGroup === null) return;
        this.uploadShadowParams(light);
        const slots: ShadowSlot[] = [];
        for (const r of receivers) {
            const slot = this.ensureSlot(r.entityId, r.geometry, r.transform);
            if (slot === null) continue;
            this.core.write(slot.transformBuffer, Transform.schema.pack(r.transform.data));
            slots.push(slot);
        }
        const target: RenderTarget = {
            colorAttachments: [],
            depthStencilAttachment: {
                view: this.depthView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        };
        frame.render(target, 'ShadowFlow', pass => {
            for (const slot of slots) {
                pass.bind
                    .setPipeline(this.pipeline as RenderPipelineSpec)
                    .setBindGroup(0, this.shadowParamsBindGroup as BindGroupSpec)
                    .setBindGroup(1, slot.transformBindGroup);
                pass.geometry.vertex(0, slot.vbo).index(slot.ibo);
                pass.draw.indexed(slot.geometry.indexCount);
            }
        });
        void this.resources;
    }
}

function isGeom(r: { constructor: { name: string } }): boolean {
    const n = r.constructor.name;
    return n === 'BoxGeometry' || n === 'SphereGeometry' || n === 'PlaneGeometry' || n === 'ParametricGeometry' || n === 'ParametricSurfaceGeometry';
}

function alignUp(v: number, a: number): number { return Math.ceil(v / a) * a; }

function padTo4(arr: Uint16Array): Uint8Array {
    const padded = Math.max(4, alignUp(arr.byteLength, 4));
    const out = new Uint8Array(padded);
    out.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    return out;
}

function lookAt(e: number[], t: number[], u: number[]): number[] {
    let zx = (e[0] ?? 0) - (t[0] ?? 0), zy = (e[1] ?? 0) - (t[1] ?? 0), zz = (e[2] ?? 0) - (t[2] ?? 0);
    const zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = (u[1] ?? 0) * zz - (u[2] ?? 0) * zy, xy = (u[2] ?? 0) * zx - (u[0] ?? 0) * zz, xz = (u[0] ?? 0) * zy - (u[1] ?? 1) * zx;
    const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * (e[0] ?? 0) + xy * (e[1] ?? 0) + xz * (e[2] ?? 0)),
        -(yx * (e[0] ?? 0) + yy * (e[1] ?? 0) + yz * (e[2] ?? 0)),
        -(zx * (e[0] ?? 0) + zy * (e[1] ?? 0) + zz * (e[2] ?? 0)), 1];
}

function ortho(l: number, r: number, b: number, t: number, n: number, f: number): number[] {
    return [
        2 / (r - l), 0, 0, 0,
        0, 2 / (t - b), 0, 0,
        0, 0, 1 / (n - f), 0,
        (r + l) / (l - r), (t + b) / (b - t), n / (n - f), 1,
    ];
}

function mul(a: number[], b: number[]): number[] {
    const o: number[] = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += (a[k * 4 + j] ?? 0) * (b[i * 4 + k] ?? 0);
            o[i * 4 + j] = s;
        }
    }
    return o;
}
