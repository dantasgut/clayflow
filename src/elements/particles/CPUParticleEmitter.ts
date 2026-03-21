import { ParticleEmitter } from '../../scene/components/particles/ParticleEmitter';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import type { EmitterShape } from '../../scene/systems/particles/EmitterShape';
import { PointEmitterShape } from './shapes/PointEmitterShape';

export interface CPUParticleEmitterOptions {
    maxParticles?: number;
    emissionRate?: number;  // partículas/segundo
    maxLife?:      number;  // segundos
    initialSpeed?: number;
    gravity?:      [number, number, number];
    shape?:        EmitterShape;
}

/**
 * Emissor de partículas simulado na CPU. (Camada 3)
 *
 * Simulação acontece em CPU via Float32Array e o resultado é enviado
 * ao storage buffer a cada frame. Simples e adequado para até ~5 000 partículas.
 *
 * Layout por partícula (8 floats = 32 bytes):
 *   [px, py, pz, age, vx, vy, vz, maxLife]
 *   age < 0 → morta (slot livre)
 *
 * @example
 * const emitter = new CPUParticleEmitter({ maxParticles: 1000, emissionRate: 100 });
 * entity.add(emitter);
 */
export class CPUParticleEmitter extends ParticleEmitter {
    public readonly maxParticles: number;
    public emissionRate: number;
    public maxLife:      number;
    public initialSpeed: number;
    public gravity:      [number, number, number];
    public shape:        EmitterShape;

    private particleData: Float32Array = new Float32Array(0);
    private emitAccum:    number = 0;
    private nextSlot:     number = 0;
    private rm:           ResourceManager | null = null;
    private bufId:        string = '';
    private bgId:         string = '';

    private static readonly FLOATS_PER_PARTICLE = 8;
    private static readonly IDX_AGE = 3;

    constructor(options: CPUParticleEmitterOptions = {}) {
        super();
        this.maxParticles  = options.maxParticles  ?? 1000;
        this.emissionRate  = options.emissionRate  ?? 100;
        this.maxLife       = options.maxLife        ?? 2.0;
        this.initialSpeed  = options.initialSpeed  ?? 1.0;
        this.gravity       = options.gravity        ?? [0, -9.81, 0];
        this.shape         = options.shape          ?? new PointEmitterShape();

        this.bindGroupSchema = [{
            binding:    0,
            visibility: GPUShaderStage.VERTEX,
            buffer:     { type: 'read-only-storage' as GPUBufferBindingType },
        }];
    }

    protected async doAllocate(rm: ResourceManager): Promise<void> {
        this.rm = rm;
        const byteSize = this.maxParticles * CPUParticleEmitter.FLOATS_PER_PARTICLE * 4;

        // Inicializa todas as partículas como mortas (age = -1)
        this.particleData = new Float32Array(this.maxParticles * CPUParticleEmitter.FLOATS_PER_PARTICLE);
        for (let i = 0; i < this.maxParticles; i++) {
            this.particleData[i * CPUParticleEmitter.FLOATS_PER_PARTICLE + CPUParticleEmitter.IDX_AGE] = -1;
        }

        this.bufId = `ptcl_cpu_buf_${this.uuid}`;
        rm.buffers.createStorageBuffer(this.bufId, byteSize);
        rm.buffers.writeBuffer(this.bufId, this.particleData);

        this.bgId = `ptcl_cpu_bg_${this.uuid}`;
        const bufNative = rm.buffers.getBuffer(this.bufId)!.native;
        rm.bindings.getLayout(this.shaderId, this.bindGroupSchema);
        const bg = rm.bindings.getBindGroup(this.bgId, this.shaderId, [
            { binding: 0, resource: { buffer: bufNative } },
        ]);
        this.bindGroupIds = [bg.id];
    }

    protected async doUpdate(rm: ResourceManager): Promise<void> {
        rm.buffers.writeBuffer(this.bufId, this.particleData);
    }

    protected doDispose(rm: ResourceManager): void {
        rm.buffers.destroyBuffer(this.bufId);
        rm.bindings.destroyBindGroup(this.bgId, this.shaderId);
        this.rm = null;
    }

    public step(_encoder: GPUCommandEncoder, dt: number): void {
        const data   = this.particleData;
        const stride = CPUParticleEmitter.FLOATS_PER_PARTICLE;
        const [gx, gy, gz] = this.gravity;

        // 1. Integra partículas vivas e conta alives
        let alive = 0;
        for (let i = 0; i < this.maxParticles; i++) {
            const base = i * stride;
            const age  = data[base + 3]!;
            if (age < 0) continue;

            const newAge = age + dt;
            if (newAge >= data[base + 7]!) {
                data[base + 3] = -1; // mata
                continue;
            }

            data[base + 3]  = newAge;
            data[base + 4]! += gx * dt;
            data[base + 5]! += gy * dt;
            data[base + 6]! += gz * dt;
            data[base + 0]! += data[base + 4]! * dt;
            data[base + 1]! += data[base + 5]! * dt;
            data[base + 2]! += data[base + 6]! * dt;
            alive++;
        }

        // 2. Spawn de novas partículas
        this.emitAccum += this.emissionRate * dt;
        const toSpawn = Math.floor(this.emitAccum);
        this.emitAccum -= toSpawn;

        for (let s = 0; s < toSpawn; s++) {
            const sample = this.shape.sample();
            const slot   = (this.nextSlot++ % this.maxParticles);
            const base   = slot * stride;
            data[base + 0] = sample.position[0];
            data[base + 1] = sample.position[1];
            data[base + 2] = sample.position[2];
            data[base + 3] = 0; // age = 0 → viva
            data[base + 4] = sample.direction[0] * this.initialSpeed;
            data[base + 5] = sample.direction[1] * this.initialSpeed;
            data[base + 6] = sample.direction[2] * this.initialSpeed;
            data[base + 7] = this.maxLife * (0.5 + Math.random() * 0.5);
            alive++;
        }

        this.aliveCount = Math.min(alive, this.maxParticles);

        // 3. Sobe dados para GPU
        if (this.rm) {
            this.rm.buffers.writeBuffer(this.bufId, this.particleData);
        }
    }
}
