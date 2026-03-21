import { ParticleEmitter } from '../../scene/components/particles/ParticleEmitter';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import type { ComputeManager } from '../../core/interfaces/ComputeManager';
import type { EmitterShape } from '../../scene/systems/particles/EmitterShape';
import { PointEmitterShape } from './shapes/PointEmitterShape';

// ─── WGSL: Update pass ──────────────────────────────────────────────────────
// Layout Particle (32 bytes = 8 floats):
//   pos(vec3) @ offset 0 | age(f32) @ offset 12
//   vel(vec3) @ offset 16 | maxLife(f32) @ offset 28
// Layout Params (16 bytes = 4 floats):
//   dt | gravity.x | gravity.y | gravity.z
const PARTICLE_UPDATE_WGSL = /* wgsl */`
struct Particle {
    pos:     vec3<f32>,
    age:     f32,
    vel:     vec3<f32>,
    maxLife: f32,
}

struct Params {
    dt:        f32,
    gravity_x: f32,
    gravity_y: f32,
    gravity_z: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform>             params:    Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= arrayLength(&particles)) { return; }

    var p = particles[i];
    if (p.age < 0.0) { return; }

    p.age += params.dt;
    if (p.age >= p.maxLife) {
        p.age = -1.0;
    } else {
        let g = vec3<f32>(params.gravity_x, params.gravity_y, params.gravity_z);
        p.vel += g * params.dt;
        p.pos += p.vel * params.dt;
    }
    particles[i] = p;
}
`;

export interface GPUParticleEmitterOptions {
    maxParticles?: number;
    emissionRate?: number;
    maxLife?:      number;
    initialSpeed?: number;
    gravity?:      [number, number, number];
    shape?:        EmitterShape;
}

/**
 * Emissor de partículas simulado na GPU via compute shader. (Camada 3)
 *
 * Spawn: CPU grava novas partículas diretamente no storage buffer (ring buffer).
 * Update: compute shader integra todas as partículas vivas em paralelo.
 *
 * Requer `GPUDevice` no construtor para criar o bind group de compute a partir
 * do layout inferido pelo pipeline (`layout: 'auto'`) — não modifica nenhuma
 * interface da camada 1.
 *
 * @example
 * const emitter = new GPUParticleEmitter(engine.compute, device, { maxParticles: 100_000 });
 * entity.add(emitter);
 */
export class GPUParticleEmitter extends ParticleEmitter {
    public readonly maxParticles: number;
    public emissionRate: number;
    public maxLife:      number;
    public initialSpeed: number;
    public gravity:      [number, number, number];
    public shape:        EmitterShape;

    private readonly compute: ComputeManager;
    private readonly gpuDevice:  GPUDevice;

    private rm:            ResourceManager | null = null;
    private particleBufId: string = '';
    private uniformBufId:  string = '';
    private renderBgId:    string = '';
    private computeBg:     GPUBindGroup | null = null;
    private pipelineId:    string = '';

    private spawnData:  Float32Array;
    private nextSlot:   number = 0;
    private emitAccum:  number = 0;
    private birthTimes: Float32Array;

    private static readonly FLOATS_PER_PARTICLE = 8;

    constructor(compute: ComputeManager, device: GPUDevice, options: GPUParticleEmitterOptions = {}) {
        super();
        this.compute       = compute;
        this.gpuDevice     = device;
        this.maxParticles  = options.maxParticles  ?? 10_000;
        this.emissionRate  = options.emissionRate  ?? 500;
        this.maxLife       = options.maxLife        ?? 3.0;
        this.initialSpeed  = options.initialSpeed  ?? 2.0;
        this.gravity       = options.gravity        ?? [0, -9.81, 0];
        this.shape         = options.shape          ?? new PointEmitterShape();

        this.spawnData  = new Float32Array(GPUParticleEmitter.FLOATS_PER_PARTICLE);
        this.birthTimes = new Float32Array(this.maxParticles).fill(-1);

        this.bindGroupSchema = [{
            binding:    0,
            visibility: GPUShaderStage.VERTEX,
            buffer:     { type: 'read-only-storage' as GPUBufferBindingType },
        }];
    }

    protected async doAllocate(rm: ResourceManager): Promise<void> {
        this.rm = rm;
        const particleBytes = this.maxParticles * GPUParticleEmitter.FLOATS_PER_PARTICLE * 4;

        this.particleBufId = `ptcl_gpu_buf_${this.uuid}`;
        const particleBuf = rm.buffers.createStorageBuffer(this.particleBufId, particleBytes);

        const initial = new Float32Array(this.maxParticles * GPUParticleEmitter.FLOATS_PER_PARTICLE);
        for (let i = 0; i < this.maxParticles; i++) {
            initial[i * GPUParticleEmitter.FLOATS_PER_PARTICLE + 3] = -1;
        }
        rm.buffers.writeBuffer(this.particleBufId, initial);

        this.uniformBufId = `ptcl_gpu_ubo_${this.uuid}`;
        const uniformBuf = rm.buffers.createUniformBuffer(this.uniformBufId, 16);

        // createComputePipeline retorna o pipeline — usamos diretamente para
        // obter o layout derivado de 'auto', sem nenhuma extensão de interface.
        this.pipelineId = `ptcl_pipeline_${this.uuid}`;
        const pipeline = await this.compute.createComputePipeline(this.pipelineId, PARTICLE_UPDATE_WGSL);

        this.computeBg = this.gpuDevice.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: particleBuf.native } },
                { binding: 1, resource: { buffer: uniformBuf.native } },
            ],
        });

        // Render bind group — vertex shader lê partículas como read-only-storage
        this.renderBgId = `ptcl_gpu_render_bg_${this.uuid}`;
        rm.bindings.getLayout(this.shaderId, this.bindGroupSchema);
        const renderBg = rm.bindings.getBindGroup(this.renderBgId, this.shaderId, [
            { binding: 0, resource: { buffer: particleBuf.native } },
        ]);
        this.bindGroupIds = [renderBg.id];
    }

    protected async doUpdate(_rm: ResourceManager): Promise<void> { /* compute cuida disso */ }

    protected doDispose(rm: ResourceManager): void {
        rm.buffers.destroyBuffer(this.particleBufId);
        rm.buffers.destroyBuffer(this.uniformBufId);
        rm.bindings.destroyBindGroup(this.renderBgId, this.shaderId);
        this.computeBg = null;
        this.rm = null;
    }

    public step(encoder: GPUCommandEncoder, dt: number): void {
        if (!this.rm || !this.computeBg) return;

        const rm = this.rm;

        this.emitAccum += this.emissionRate * dt;
        const toSpawn = Math.floor(this.emitAccum);
        this.emitAccum -= toSpawn;

        const stride = GPUParticleEmitter.FLOATS_PER_PARTICLE;
        for (let s = 0; s < toSpawn; s++) {
            const sample = this.shape.sample();
            const slot   = this.nextSlot % this.maxParticles;
            const life   = this.maxLife * (0.5 + Math.random() * 0.5);

            this.spawnData[0] = sample.position[0];
            this.spawnData[1] = sample.position[1];
            this.spawnData[2] = sample.position[2];
            this.spawnData[3] = 0;
            this.spawnData[4] = sample.direction[0] * this.initialSpeed;
            this.spawnData[5] = sample.direction[1] * this.initialSpeed;
            this.spawnData[6] = sample.direction[2] * this.initialSpeed;
            this.spawnData[7] = life;

            rm.buffers.writeBuffer(this.particleBufId, this.spawnData, slot * stride * 4);
            this.birthTimes[slot] = 0;
            this.nextSlot++;
        }

        const [gx, gy, gz] = this.gravity;
        rm.buffers.writeBuffer(this.uniformBufId, new Float32Array([dt, gx, gy, gz]));

        const workgroups = Math.ceil(this.maxParticles / 256);
        this.compute.dispatch(encoder, this.pipelineId, [this.computeBg], workgroups);

        let alive = 0;
        for (let i = 0; i < this.maxParticles; i++) {
            if (this.birthTimes[i]! < 0) continue;
            this.birthTimes[i]! += dt;
            if (this.birthTimes[i]! >= this.maxLife) {
                this.birthTimes[i] = -1;
            } else {
                alive++;
            }
        }
        this.aliveCount = alive;
    }
}
