import type { EngineCore, Frame, StorageBufferSpec } from '../../../scene/contracts/gpu';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
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
    /** Saída `u32[count]`, preparada antes (`prepare`); pode ser o próprio `src` (no lugar). */
    readonly dst: StorageBufferSpec;
    /** Elementos (≤ `capacity`). `0` não grava nada. */
    readonly count: number;
    /** `exclusive` (padrão): `dst[i] = Σ_{j<i} src[j]`; `inclusive`: `Σ_{j≤i}`. */
    readonly mode?: 'exclusive' | 'inclusive';
}

/** Kernels de um nível: subida, descida e topo. */
interface LevelKernels {
    local?: ComputeKernel;
    combine?: ComputeKernel;
    top?: ComputeKernel;
}

/**
 * Soma de prefixos u32 em vários níveis (research R8 da 005): por grupo de 256 (Hillis–Steele em memória de
 * workgroup), com os totais dos grupos subindo nível a nível até caber num grupo, e a descida somando o prefixo de
 * cada grupo. Sem teto de elementos além de `maxStorageBufferBindingSize`; o despacho linear da 004 cobre mais de
 * 65 535 grupos.
 *
 * O nível 0 roda no lugar em `dst` (com `src ≠ dst`, `src` é copiado antes no fluxo de comandos); os níveis acima
 * vivem em buffers internos dimensionados pela capacidade. `count` e modo de cada chamada vão numa região própria de
 * uniform (`FrameUniforms`), então a mesma instância pode ser gravada várias vezes no quadro com contagens diferentes.
 *
 * Duas fases (spec 006): `prepare(dst, gravaçõesPorQuadro)` cria buffers, kernels e regiões de uniform — fora da
 * gravação, numa transição do Flow; `record` só grava.
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

    /** Regiões de uniform que uma gravação usa no máximo (uma por nível). */
    get regionsPerRecord(): number {
        return this.levelCapacity.length;
    }

    /**
     * Prepara a soma com saída em `dst` para até `recordsPerFrame` gravações por quadro: buffers dos níveis, kernels de
     * todos os níveis possíveis e regiões de uniform. Idempotente; chamado fora da gravação.
     */
    prepare(dst: StorageBufferSpec, recordsPerFrame = 1): void {
        if (this.params.reserve(this.regionsPerRecord * recordsPerFrame)) this.releaseKernels();
        if (this.upper.length === 0) this.allocateLevels();
        const top = this.levelCapacity.length - 1;
        for (let k = 0; k <= top; k++) {
            const kernels = this.kernelsOf(k, dst);
            // O topo de uma gravação nunca é o nível 0 (sempre há um nível abaixo dele).
            if (k > 0) kernels.top ??= this.levelKernel('scan_top', this.values(k, dst));
            if (k === top) continue;
            kernels.local ??= this.levelKernel(
                'scan_local',
                this.values(k, dst),
                this.values(k + 1, dst),
            );
            kernels.combine ??= this.levelKernel(
                'scan_combine',
                this.values(k, dst),
                this.values(k + 1, dst),
            );
        }
    }

    /**
     * Grava a soma de prefixos de `src[0, count)` em `dst`.
     * @throws Error se `dst` não foi preparado; RangeError para `count` inválido ou acima das regiões reservadas.
     */
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
        const base = this.base.get(dst);
        if (base === undefined) {
            throw new Error(`PrefixSum(${this.disc}): prepare(dst) antes de gravar.`);
        }
        const inclusive = args.mode === 'inclusive';
        const counts = scanLevelCounts(count);
        const top = counts.length - 1;
        const offsets = counts.map((n, k) =>
            this.params.allocate(frame, { count: n, inclusive: inclusive && k === 0 ? 1 : 0 }),
        );
        if (src !== dst) frame.copy(src, dst, count * 4);
        const kernels = (k: number): LevelKernels => (k === 0 ? base : this.upperKernels[k - 1]!);
        for (let k = 0; k < top; k++) {
            this.run(frame, 'PrefixSum.scan_local', kernels(k).local!, offsets[k]!, counts[k]!);
        }
        this.run(frame, 'PrefixSum.scan_top', kernels(top).top!, offsets[top]!, null);
        for (let k = top - 1; k >= 0; k--) {
            this.run(frame, 'PrefixSum.scan_combine', kernels(k).combine!, offsets[k]!, counts[k]!);
        }
    }

    /** Libera kernels, buffers dos níveis e uniforms. A instância volta a alocar no próximo `prepare`. */
    destroy(): void {
        this.releaseKernels();
        for (const b of this.upper) this.core.destroy(b);
        this.upper = [];
        this.params.destroy();
    }

    private values(k: number, dst: StorageBufferSpec): StorageBufferSpec {
        return k === 0 ? dst : this.upper[k - 1]!;
    }

    private kernelsOf(k: number, dst: StorageBufferSpec): LevelKernels {
        if (k > 0) return (this.upperKernels[k - 1] ??= {});
        let entry = this.base.get(dst);
        if (entry === undefined) {
            entry = {};
            this.base.set(dst, entry);
        }
        return entry;
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
        const level = this.params.source();
        const bindings =
            kind === 'scan_top'
                ? { level, values }
                : kind === 'scan_local'
                  ? { level, values, group_sums: above! }
                  : { level, values, group_prefix: above! };
        return createComputeKernel(this.core, {
            discriminator: `${this.disc}:${kind}`,
            shader,
            entryPoint: `${kind}_main`,
            bindings,
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
