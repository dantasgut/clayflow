import type {
    ComputeKernel,
    ComputeKernelBinding,
    EngineCore,
    Frame,
    StorageBufferSpec,
} from '../../../core/contracts/index';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { FrameUniforms } from './FrameUniforms';
import { ScanLevelSchema } from './schemas';
import { scanCombine, scanLocal, scanTop } from './shaders';

/** Elementos por grupo da soma de prefixos (tamanho do workgroup dos kernels de scan). */
export const SCAN_GROUP = 256;

/**
 * Contagens de cada nível da soma de prefixos para `count` elementos: `n_0 = count`, `n_{l+1} = ⌈n_l / 256⌉`, até um
 * nível com ≤ 256 elementos (o topo, escaneado num grupo único). Sempre há ao menos um nível abaixo do topo.
 */
export function scanLevelCounts(count: number): number[] {
    const counts = [count];
    do {
        counts.push(Math.ceil(counts[counts.length - 1]! / SCAN_GROUP));
    } while (counts[counts.length - 1]! > SCAN_GROUP);
    return counts;
}

/** Opções de `PrefixSum`. */
export interface PrefixSumOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
    /** Maior `count` aceito por `record` (dimensiona os buffers dos níveis). */
    readonly capacity: number;
}

/** Argumentos de `PrefixSum.record`. */
export interface PrefixSumRecordArgs {
    /** Entrada `u32[count]`. Não é alterada quando difere de `dst`. */
    readonly src: StorageBufferSpec;
    /** Saída `u32[count]`; pode ser o próprio `src` (no lugar). */
    readonly dst: StorageBufferSpec;
    /** Elementos (≤ `capacity`). `0` não grava nada. */
    readonly count: number;
    /** `exclusive` (padrão): `dst[i] = Σ_{j<i} src[j]`; `inclusive`: `Σ_{j≤i}`. */
    readonly mode?: 'exclusive' | 'inclusive';
}

/** Kernels de um nível: subida, descida e topo, criados sob demanda. */
interface LevelKernels {
    local?: ComputeKernel;
    combine?: ComputeKernel;
    top?: ComputeKernel;
}

/**
 * Soma de prefixos u32 em vários níveis (research R8): por grupo de 256 (Hillis–Steele em memória de workgroup), com
 * os totais dos grupos subindo nível a nível até caber num grupo, e a descida somando o prefixo de cada grupo. Sem
 * teto de elementos além de `maxStorageBufferBindingSize`; o despacho linear da 004 cobre mais de 65 535 grupos.
 *
 * O nível 0 roda no lugar em `dst` (com `src ≠ dst`, `src` é copiado antes no fluxo de comandos); os níveis acima
 * vivem em buffers internos dimensionados pela capacidade. `count` e modo de cada chamada vão numa região própria de
 * uniform (`FrameUniforms`), então a mesma instância pode ser gravada várias vezes no quadro com contagens diferentes.
 */
export class PrefixSum {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly levelCapacity: readonly number[];
    private readonly params: FrameUniforms;
    /** Valores dos níveis k ≥ 1 (`upper[k - 1]` = nível k). */
    private upper: StorageBufferSpec[] = [];
    /** Kernels do nível 0, por buffer de saída. */
    private readonly base = new Map<StorageBufferSpec, LevelKernels>();
    /** Kernels dos níveis k ≥ 1 (`upperKernels[k - 1]`). */
    private upperKernels: LevelKernels[] = [];
    /** Geração do uniform com que os kernels foram ligados. */
    private kernelGeneration = -1;

    constructor(
        private readonly core: EngineCore,
        options: PrefixSumOptions,
    ) {
        if (!Number.isInteger(options.capacity) || options.capacity < 1) {
            throw new RangeError(
                `PrefixSum(${options.discriminator}): capacity deve ser inteiro ≥ 1 (recebeu ${options.capacity}).`,
            );
        }
        this.disc = options.discriminator;
        this.capacity = options.capacity;
        this.levelCapacity = scanLevelCounts(options.capacity);
        this.params = new FrameUniforms(core, {
            discriminator: `${this.disc}:scan`,
            schema: ScanLevelSchema,
        });
    }

    /** Grava a soma de prefixos de `src[0, count)` em `dst`. */
    record(frame: Frame, args: PrefixSumRecordArgs): void {
        const { src, dst, count } = args;
        if (!Number.isInteger(count) || count < 0) {
            throw new RangeError(
                `PrefixSum(${this.disc}): count deve ser inteiro ≥ 0 (recebeu ${count}).`,
            );
        }
        if (count > this.capacity) {
            throw new RangeError(
                `PrefixSum(${this.disc}): count ${count} acima da capacidade ${this.capacity}.`,
            );
        }
        if (count === 0) return;
        const inclusive = args.mode === 'inclusive';
        const counts = scanLevelCounts(count);
        const top = counts.length - 1;

        if (this.upper.length === 0) this.allocateLevels();
        const offsets = counts.map((n, k) =>
            this.params.allocate(frame, { count: n, inclusive: inclusive && k === 0 ? 1 : 0 }),
        );
        if (this.kernelGeneration !== this.params.generation) this.releaseKernels();
        this.kernelGeneration = this.params.generation;

        if (src !== dst) frame.copy(src, dst, count * 4);
        const values = (k: number): StorageBufferSpec => (k === 0 ? dst : this.upper[k - 1]!);
        const kernels = (k: number): LevelKernels => {
            if (k > 0) return (this.upperKernels[k - 1] ??= {});
            let entry = this.base.get(dst);
            if (entry === undefined) {
                entry = {};
                this.base.set(dst, entry);
            }
            return entry;
        };

        for (let k = 0; k < top; k++) {
            const kernel = (kernels(k).local ??= this.levelKernel(
                'scan_local',
                values(k),
                values(k + 1),
            ));
            this.run(frame, 'PrefixSum.scan_local', kernel, offsets[k]!, counts[k]!);
        }
        const topKernel = (kernels(top).top ??= this.levelKernel('scan_top', values(top)));
        this.run(frame, 'PrefixSum.scan_top', topKernel, offsets[top]!, null);
        for (let k = top - 1; k >= 0; k--) {
            const kernel = (kernels(k).combine ??= this.levelKernel(
                'scan_combine',
                values(k),
                values(k + 1),
            ));
            this.run(frame, 'PrefixSum.scan_combine', kernel, offsets[k]!, counts[k]!);
        }
    }

    /** Libera kernels, buffers dos níveis e uniforms. A instância volta a alocar no próximo `record`. */
    destroy(): void {
        this.releaseKernels();
        for (const b of this.upper) this.core.destroy(b);
        this.upper = [];
        this.params.destroy();
        this.kernelGeneration = -1;
    }

    private allocateLevels(): void {
        this.upper = this.levelCapacity.slice(1).map((n, i) =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${this.disc}:scan_level:${i + 1}`,
                byteSize: Math.max(16, n * 4),
            }),
        );
    }

    private levelKernel(
        kind: 'scan_local' | 'scan_top' | 'scan_combine',
        values: StorageBufferSpec,
        above?: StorageBufferSpec,
    ): ComputeKernel {
        const shader =
            kind === 'scan_local' ? scanLocal : kind === 'scan_top' ? scanTop : scanCombine;
        const data: ComputeKernelBinding[] = [{ binding: 0, type: 'storage', buffer: values }];
        if (above !== undefined) {
            const type = kind === 'scan_combine' ? 'read-only-storage' : 'storage';
            data.push({ binding: 1, type, buffer: above });
        }
        return createComputeKernel(this.core, {
            discriminator: `${this.disc}:${kind}`,
            shader,
            entryPoint: `${kind}_main`,
            bindGroups: [{ bindings: [this.params.binding(0)] }, { bindings: data }],
        });
    }

    /** `count = null` despacha um grupo (topo); senão `invocations(count, 256)`. */
    private run(
        frame: Frame,
        label: string,
        kernel: ComputeKernel,
        offset: number,
        count: number | null,
    ): void {
        frame.compute(label, (pass) => {
            pass.bind
                .setPipeline(kernel.pipeline)
                .setBindGroup(0, kernel.bindGroups[0]!, [offset])
                .setBindGroup(1, kernel.bindGroups[1]!);
            if (count === null) pass.dispatch.workgroups(1);
            else pass.dispatch.invocations(count, SCAN_GROUP);
        });
    }

    private releaseKernels(): void {
        const all = [...this.base.values(), ...this.upperKernels];
        for (const level of all) {
            for (const k of [level.local, level.combine, level.top]) {
                if (k !== undefined) destroyComputeKernel(this.core, k);
            }
        }
        this.base.clear();
        this.upperKernels = [];
    }
}
