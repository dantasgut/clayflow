/**
 * NeighborSearchGrid — serviço GPU de busca de vizinhos por raio h.
 *
 * Não implementa PhysicsComputePass — é um utilitário injetável em SPHComputePass e
 * PBFComputePass via constructor. Análogo ao GraphColorSolver (utilitário compartilhado).
 *
 * ## Algoritmo por build
 *
 *   1. clearBuffer(cell_count)            — zera contagens
 *   2. clearBuffer(neighbor_count)        — zera counts de saída
 *   3. ns_assign_count                    — atribui célula + conta por célula
 *   4. ns_scan_local                      — prefix scan local (por bloco de 256)
 *   5. ns_scan_groups                     — prefix scan das somas de grupo
 *   6. ns_scan_combine                    — adiciona offset de grupo ao prefix local → cell_start
 *   7. copyBufferToBuffer(start → cursor) — inicializa cursores para o scatter
 *   8. ns_scatter                         — ordena índices de partícula por célula
 *   9. ns_find                            — popula neighbor_list e neighbor_count
 *
 * ## Restrição
 *
 *   n_cells = config.dims[0]*dims[1]*dims[2] ≤ 65536.
 *   Para grades maiores, implementar scan de 3 níveis.
 *
 * ## Uso
 *
 * ```typescript
 * const grid = new NeighborSearchGrid(device, config, maxParticles);
 * // em execute():
 * grid.encodeNeighborBuild(encoder, particlesBuffer, count, strideFloats);
 * // bind neighbor_list e neighbor_count aos kernels SPH/PBF
 * const nbList  = grid.getNeighborListBuffer();
 * const nbCount = grid.getNeighborCountBuffer();
 * ```
 */

import { WebGPUEngineCore }     from '../../../core/WebGPUEngineCore';
import { WebGPUContext }         from '../../../core/context/WebGPUContext';
import {
    PIPELINE_IDS,
    ensurePhysicsPipelinesInitialized,
} from './ShaderLibrary';
import {
    NS_SIM_PARAMS_BYTES,
    NS_MAX_SCAN_GROUPS,
    writeNsSimParams,
    type NeighborSearchConfig,
} from './NeighborSearchGridLayout';

export class NeighborSearchGrid {

    private readonly _config:       NeighborSearchConfig;
    private readonly _maxParticles: number;
    private readonly _maxNeighbors: number;
    private readonly _nCells:       number;

    // Buffers GPU
    private _simParamsBuf!:    GPUBuffer;
    private _cellIdsBuf!:      GPUBuffer;
    private _cellCountBuf!:    GPUBuffer;
    private _cellStartBuf!:    GPUBuffer;
    private _cellCursorBuf!:   GPUBuffer;
    private _groupSumsBuf!:    GPUBuffer;
    private _sortedBuf!:       GPUBuffer;
    private _neighborListBuf!: GPUBuffer;
    private _neighborCountBuf!:GPUBuffer;

    // Bind groups cacheados (criados na primeira chamada a encodeNeighborBuild)
    private _bgAssign:          GPUBindGroup | undefined = undefined;
    private _bgAssignCount:     GPUBindGroup | undefined = undefined;
    private _bgScanLocal:       GPUBindGroup | undefined = undefined;
    private _bgScanGroups:      GPUBindGroup | undefined = undefined;
    private _bgScanCombine:     GPUBindGroup | undefined = undefined;
    private _bgScatter:         GPUBindGroup | undefined = undefined;
    private _bgFind:            GPUBindGroup | undefined = undefined;
    private _bgSimParams0:      GPUBindGroup | undefined = undefined;  // group(0) simParams — reutilizado em todos

    private _lastParticleCount: number = 0;

    constructor(config: NeighborSearchConfig, maxParticles: number) {
        this._config       = config;
        this._maxParticles = maxParticles;
        this._maxNeighbors = config.maxNeighbors ?? 64;
        this._nCells       = config.dims[0] * config.dims[1] * config.dims[2];

        if (this._nCells > 65536) {
            throw new Error(
                `NeighborSearchGrid: n_cells=${this._nCells} exceeds max 65536. ` +
                `Reduce grid dims or increase cellSize.`
            );
        }

        this._allocateBuffers();
    }

    // ── Buffers de saída ──────────────────────────────────────────────────────

    getNeighborListBuffer():  GPUBuffer { return this._neighborListBuf;  }
    getNeighborCountBuffer(): GPUBuffer { return this._neighborCountBuf; }

    // ── Build de vizinhos ─────────────────────────────────────────────────────

    /**
     * Insere no encoder todos os compute passes necessários para construir
     * a lista de vizinhos a partir de `particleBuffer`.
     *
     * @param encoder         encoder ativo (pode conter outros passes antes/depois)
     * @param particleBuffer  storage buffer com partículas; pos.xyz em offset 0
     * @param particleCount   número de partículas ativas
     * @param strideFloats    stride em float32 (bytes / 4) — ex.: 16 para 64 bytes/partícula
     */
    encodeNeighborBuild(
        encoder:        GPUCommandEncoder,
        particleBuffer: GPUBuffer,
        particleCount:  number,
        strideFloats:   number,
    ): void {
        const core = WebGPUEngineCore.getInstance();
        ensurePhysicsPipelinesInitialized(core);

        // Atualiza simParams se count ou stride mudaram
        if (particleCount !== this._lastParticleCount) {
            this._writeSimParams(particleCount, strideFloats);
            this._invalidateBindGroups();
            this._lastParticleCount = particleCount;
        }

        // Garante bind groups criados (dependem do particleBuffer)
        this._ensureBindGroups(core, particleBuffer);

        const n = particleCount;
        const nCells = this._nCells;

        // 1. Zera cell_count e neighbor_count
        encoder.clearBuffer(this._cellCountBuf,    0, nCells * 4);
        encoder.clearBuffer(this._neighborCountBuf, 0, n * 4);

        const pass = encoder.beginComputePass({ label: 'ns_neighbor_build' });

        // 2. ns_assign_count
        const pipelineAssign = core.compute.getComputePipeline(PIPELINE_IDS.NS_ASSIGN_COUNT)!;
        pass.setPipeline(pipelineAssign);
        pass.setBindGroup(0, this._bgSimParams0!);
        pass.setBindGroup(1, this._bgAssign!);
        pass.setBindGroup(2, this._bgAssignCount!);
        pass.dispatchWorkgroups(Math.ceil(n / 64));

        // 3. ns_scan_local
        const nGroups = Math.ceil(nCells / 256);
        const pipelineScanL = core.compute.getComputePipeline(PIPELINE_IDS.NS_SCAN_LOCAL)!;
        pass.setPipeline(pipelineScanL);
        pass.setBindGroup(0, this._bgSimParams0!);
        pass.setBindGroup(1, this._bgScanLocal!);
        pass.dispatchWorkgroups(nGroups);

        // 4. ns_scan_groups
        const pipelineScanG = core.compute.getComputePipeline(PIPELINE_IDS.NS_SCAN_GROUPS)!;
        pass.setPipeline(pipelineScanG);
        pass.setBindGroup(0, this._bgSimParams0!);
        pass.setBindGroup(1, this._bgScanGroups!);
        pass.dispatchWorkgroups(1);

        // 5. ns_scan_combine
        const pipelineScanC = core.compute.getComputePipeline(PIPELINE_IDS.NS_SCAN_COMBINE)!;
        pass.setPipeline(pipelineScanC);
        pass.setBindGroup(0, this._bgSimParams0!);
        pass.setBindGroup(1, this._bgScanCombine!);
        pass.dispatchWorkgroups(nGroups);

        pass.end();

        // 6. Copia cell_start → cell_cursor (antes do scatter)
        encoder.copyBufferToBuffer(
            this._cellStartBuf,  0,
            this._cellCursorBuf, 0,
            nCells * 4,
        );

        const pass2 = encoder.beginComputePass({ label: 'ns_scatter_find' });

        // 7. ns_scatter
        const pipelineScatter = core.compute.getComputePipeline(PIPELINE_IDS.NS_SCATTER)!;
        pass2.setPipeline(pipelineScatter);
        pass2.setBindGroup(0, this._bgSimParams0!);
        pass2.setBindGroup(1, this._bgScatter!);
        pass2.dispatchWorkgroups(Math.ceil(n / 64));

        // 8. ns_find
        const pipelineFind = core.compute.getComputePipeline(PIPELINE_IDS.NS_FIND)!;
        pass2.setPipeline(pipelineFind);
        pass2.setBindGroup(0, this._bgSimParams0!);
        pass2.setBindGroup(1, this._bgFind!);
        pass2.dispatchWorkgroups(Math.ceil(n / 64));

        pass2.end();
    }

    dispose(): void {
        this._simParamsBuf.destroy();
        this._cellIdsBuf.destroy();
        this._cellCountBuf.destroy();
        this._cellStartBuf.destroy();
        this._cellCursorBuf.destroy();
        this._groupSumsBuf.destroy();
        this._sortedBuf.destroy();
        this._neighborListBuf.destroy();
        this._neighborCountBuf.destroy();
    }

    // ── Privados ──────────────────────────────────────────────────────────────

    private _allocateBuffers(): void {
        const device  = WebGPUContext.getInstance().device;
        const n       = this._maxParticles;
        const nCells  = this._nCells;
        const maxNb   = this._maxNeighbors;

        const STORAGE_RW = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
        const UNIFORM    = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

        this._simParamsBuf    = device.createBuffer({ size: NS_SIM_PARAMS_BYTES, usage: UNIFORM,    label: 'ns_sim_params'    });
        this._cellIdsBuf      = device.createBuffer({ size: n      * 4,          usage: STORAGE_RW, label: 'ns_cell_ids'      });
        this._cellCountBuf    = device.createBuffer({ size: nCells * 4,          usage: STORAGE_RW, label: 'ns_cell_count'    });
        this._cellStartBuf    = device.createBuffer({ size: nCells * 4,          usage: STORAGE_RW, label: 'ns_cell_start'    });
        this._cellCursorBuf   = device.createBuffer({ size: nCells * 4,          usage: STORAGE_RW, label: 'ns_cell_cursor'   });
        this._groupSumsBuf    = device.createBuffer({ size: NS_MAX_SCAN_GROUPS * 4, usage: STORAGE_RW, label: 'ns_group_sums' });
        this._sortedBuf       = device.createBuffer({ size: n      * 4,          usage: STORAGE_RW, label: 'ns_sorted'        });
        this._neighborListBuf = device.createBuffer({ size: n * maxNb * 4,       usage: STORAGE_RW, label: 'ns_neighbor_list' });
        this._neighborCountBuf= device.createBuffer({ size: n      * 4,          usage: STORAGE_RW, label: 'ns_neighbor_count'});
    }

    private _writeSimParams(particleCount: number, strideFloats: number): void {
        const buf = new ArrayBuffer(NS_SIM_PARAMS_BYTES);
        writeNsSimParams(buf, this._config, particleCount, strideFloats);
        WebGPUContext.getInstance().device.queue.writeBuffer(this._simParamsBuf, 0, buf);
    }

    private _invalidateBindGroups(): void {
        this._bgAssign      = undefined;
        this._bgAssignCount = undefined;
        this._bgScanLocal   = undefined;
        this._bgScanGroups  = undefined;
        this._bgScanCombine = undefined;
        this._bgScatter     = undefined;
        this._bgFind        = undefined;
        this._bgSimParams0  = undefined;
    }

    private _ensureBindGroups(core: ReturnType<typeof WebGPUEngineCore.getInstance>, particleBuffer: GPUBuffer): void {
        if (this._bgSimParams0) return;

        const cm  = core.compute;
        const bg  = (pipelineId: string, groupIndex: number, entries: GPUBindGroupEntry[], label: string) =>
            cm.createBindGroupFromPipeline(pipelineId, groupIndex, entries, label);

        const simEntry   = { binding: 0, resource: { buffer: this._simParamsBuf  } };
        const partEntry  = { binding: 0, resource: { buffer: particleBuffer      } };

        // group(0): simParams — mesmo layout em todos os kernels NS
        this._bgSimParams0  = bg(PIPELINE_IDS.NS_ASSIGN_COUNT, 0, [simEntry], 'ns_bg_params');

        // group(1) + group(2) para ns_assign_count
        this._bgAssign      = bg(PIPELINE_IDS.NS_ASSIGN_COUNT, 1, [
            partEntry,
            { binding: 1, resource: { buffer: this._cellIdsBuf } },
        ], 'ns_bg_assign');
        this._bgAssignCount = bg(PIPELINE_IDS.NS_ASSIGN_COUNT, 2, [
            { binding: 0, resource: { buffer: this._cellCountBuf } },
        ], 'ns_bg_assign_count');

        // ns_scan_local: group(1)
        this._bgScanLocal   = bg(PIPELINE_IDS.NS_SCAN_LOCAL, 1, [
            { binding: 0, resource: { buffer: this._cellCountBuf } },
            { binding: 1, resource: { buffer: this._cellStartBuf } },
            { binding: 2, resource: { buffer: this._groupSumsBuf } },
        ], 'ns_bg_scan_local');

        // ns_scan_groups: group(1)
        this._bgScanGroups  = bg(PIPELINE_IDS.NS_SCAN_GROUPS, 1, [
            { binding: 0, resource: { buffer: this._groupSumsBuf } },
        ], 'ns_bg_scan_groups');

        // ns_scan_combine: group(1)
        this._bgScanCombine = bg(PIPELINE_IDS.NS_SCAN_COMBINE, 1, [
            { binding: 0, resource: { buffer: this._cellStartBuf } },
            { binding: 1, resource: { buffer: this._groupSumsBuf } },
        ], 'ns_bg_scan_combine');

        // ns_scatter: group(1)
        this._bgScatter     = bg(PIPELINE_IDS.NS_SCATTER, 1, [
            { binding: 0, resource: { buffer: this._cellIdsBuf   } },
            { binding: 1, resource: { buffer: this._cellCursorBuf} },
            { binding: 2, resource: { buffer: this._sortedBuf    } },
        ], 'ns_bg_scatter');

        // ns_find: group(1)
        this._bgFind        = bg(PIPELINE_IDS.NS_FIND, 1, [
            partEntry,
            { binding: 1, resource: { buffer: this._cellStartBuf   } },
            { binding: 2, resource: { buffer: this._cellCountBuf   } },
            { binding: 3, resource: { buffer: this._sortedBuf      } },
            { binding: 4, resource: { buffer: this._neighborListBuf} },
            { binding: 5, resource: { buffer: this._neighborCountBuf}},
        ], 'ns_bg_find');
    }
}
