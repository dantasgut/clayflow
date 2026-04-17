/**
 * EulerianGrid — serviço de grade euleriana compartilhada entre MPM e FLIP/APIC.
 *
 * Não implementa PhysicsComputePass. Gerencia dois buffers:
 *   - `gpu_eulerian_grid_momentum` (MPMGridNode[]) — compartilhado por MPM e FLIP no P2G/G2P
 *   - `gpu_eulerian_grid_pressure` (f32[]) — exclusivo FLIP para pressure projection
 *
 * ## Integração com MPMComputePass (F5)
 *
 *   Na Fase 5 (FLIP), MPMComputePass será refatorado para receber um EulerianGrid
 *   em vez de criar seu próprio buffer. Até lá, MPMComputePass continua criando o
 *   seu próprio buffer interno e EulerianGrid é usado apenas por FLIPComputePass.
 *
 * ## Uso
 *
 * ```typescript
 * const grid = new EulerianGrid({ dims: [32,32,32], cellSize: 0.375, origin: [-6,-1,-6] });
 * // Em MPMComputePass / FLIPComputePass:
 * grid.encodeClear(encoder);              // limpa gpu_eulerian_grid_momentum
 * const momBuf  = grid.getMomentumBuffer();
 * const presBuf = grid.getPressureBuffer();  // alocado lazily na primeira chamada
 * ```
 */

import { WebGPUContext }     from '../../../core/context/WebGPUContext';
import {
    GRID_NODE_STRIDE_BYTES,
    GRID_PRESSURE_STRIDE_BYTES,
    type EulerianGridConfig,
} from './EulerianGridLayout';

export class EulerianGrid {

    readonly config:    EulerianGridConfig;
    readonly cellCount: number;

    private _momentumBuffer: GPUBuffer | null = null;
    private _pressureBuffer: GPUBuffer | null = null;

    constructor(config: EulerianGridConfig) {
        this.config    = config;
        this.cellCount = config.dims[0] * config.dims[1] * config.dims[2];
    }

    // ── Buffers ───────────────────────────────────────────────────────────────

    /**
     * Retorna o buffer de momentum (MPMGridNode[], atomic<i32>).
     * Alocado lazily na primeira chamada.
     */
    getMomentumBuffer(): GPUBuffer {
        if (!this._momentumBuffer) {
            const device = WebGPUContext.getInstance().device;
            this._momentumBuffer = device.createBuffer({
                size:  this.cellCount * GRID_NODE_STRIDE_BYTES,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'eulerian_grid_momentum',
            });
        }
        return this._momentumBuffer;
    }

    /**
     * Retorna o buffer de pressão (f32 por célula), exclusivo FLIP.
     * Alocado lazily na primeira chamada.
     */
    getPressureBuffer(): GPUBuffer {
        if (!this._pressureBuffer) {
            const device = WebGPUContext.getInstance().device;
            this._pressureBuffer = device.createBuffer({
                size:  this.cellCount * GRID_PRESSURE_STRIDE_BYTES,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'eulerian_grid_pressure',
            });
        }
        return this._pressureBuffer;
    }

    // ── Operações de encoder ──────────────────────────────────────────────────

    /**
     * Insere clearBuffer do buffer de momentum no encoder.
     * Deve ser chamado no início de cada frame antes do P2G de MPM e/ou FLIP.
     */
    encodeClear(encoder: GPUCommandEncoder): void {
        if (this._momentumBuffer) {
            encoder.clearBuffer(this._momentumBuffer);
        }
    }

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    dispose(): void {
        this._momentumBuffer?.destroy();
        this._pressureBuffer?.destroy();
        this._momentumBuffer = null;
        this._pressureBuffer = null;
    }
}
