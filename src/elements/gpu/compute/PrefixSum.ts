import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { SCAN_GROUP as SCAN_GROUP_CONSTANT } from '../shaders/constants';
import type {
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { CountToArgs, type GpuCount } from './CountToArgs';
import { FrameUniforms } from './FrameUniforms';
import { ScanLevelSchema } from './schemas';
import {
    scanCombine,
    scanCountGpu,
    scanCountPoint,
    scanLocal,
    scanResources,
    scanTop,
    setCountResources,
} from './shaders';

/** Elementos por grupo da soma de prefixos (tamanho do workgroup dos kernels de scan). */
export const SCAN_GROUP = SCAN_GROUP_CONSTANT.value;

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
    /**
     * Elementos (≤ `capacity`). `0` não grava nada. Ou a contagem lida na GPU (`GpuCount`, com `dst` preparado com o
     * mesmo `counts`): todos os níveis da capacidade são gravados e a contagem real limita cada um no kernel.
     */
    readonly count: number | GpuCount;
    /** `exclusive` (padrão): `dst[i] = Σ_{j<i} src[j]`; `inclusive`: `Σ_{j≤i}`. */
    readonly mode?: 'exclusive' | 'inclusive';
}

/** Kernels de um nível: subida, descida e topo. */
interface LevelKernels {
    local?: ComputeKernel;
    combine?: ComputeKernel;
    top?: ComputeKernel;
}

/** Kernels de uma origem da contagem: do nível 0 por buffer de saída e dos níveis k ≥ 1 (`upper[k - 1]`). */
interface CountVariant {
    readonly base: Map<StorageBufferSpec, LevelKernels>;
    readonly upper: LevelKernels[];
}

/** Despacho de um passe: `invocations(n, 256)`, o indireto do registro `SetCount`, ou um grupo (`null`, topo). */
type LevelDispatch = number | GpuCount | null;

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
 * Contagem da GPU (spec 031, R10): preparada com `counts`, a soma aceita `count: { counts, index }` — a contagem vem
 * do registro `SetCount` no próprio kernel (ponto `scan_count`, nível pela profundidade), sem leitura de volta. O nível
 * 0 despacha pelo argumento indireto do registro, que precisa já trazer o despacho para grupos de 256 (`CountToArgs`
 * com `workgroupSize: 256` gravado antes no mesmo fluxo); os níveis de cima despacham pela capacidade e os acima do
 * topo real rodam com contagem 1 (o total, cujo prefixo exclusivo é 0) ou 0, o que não muda o resultado. Com
 * `src ≠ dst`, a cópia leva a capacidade (limitada pelos dois buffers). A contagem do registro deve ser ≤ `capacity`.
 *
 * Duas fases (spec 006): `prepare(dst, gravaçõesPorQuadro, counts?)` cria buffers, kernels e regiões de uniform —
 * fora da gravação, numa transição do Flow; `record` só grava.
 */
export class PrefixSum {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly levelCapacity: readonly number[];
    private readonly params: FrameUniforms;
    /** Valores dos níveis k ≥ 1 (`upper[k - 1]` = nível k). */
    private upper: StorageBufferSpec[] = [];
    /** Kernels por origem da contagem: `null` = CPU (uniform); um buffer `SetCount` = variante da GPU ligada a ele. */
    private readonly variants = new Map<IndirectBufferSpec | null, CountVariant>();

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
     * todos os níveis possíveis e regiões de uniform. Com `counts`, também os kernels da variante de contagem da GPU
     * ligados a esse buffer de registros `SetCount` (memorizados por buffer). Idempotente; chamado fora da gravação.
     */
    prepare(dst: StorageBufferSpec, recordsPerFrame = 1, counts?: IndirectBufferSpec): void {
        if (this.params.reserve(this.regionsPerRecord * recordsPerFrame)) this.releaseKernels();
        if (this.upper.length === 0) this.allocateLevels();
        for (const source of counts === undefined ? [null] : [null, counts]) {
            this.prepareVariant(dst, source);
        }
    }

    /**
     * Grava a soma de prefixos de `src[0, count)` em `dst`.
     * @throws Error se `dst` não foi preparado; RangeError para `count` inválido ou acima das regiões reservadas.
     */
    record(frame: Frame, args: PrefixSumRecordArgs): void {
        const { src, dst, count } = args;
        if (typeof count !== 'number') {
            this.recordGpu(frame, args, count);
            return;
        }
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
        const variant = this.variants.get(null);
        if (variant?.base.get(dst) === undefined) {
            throw new Error(`PrefixSum(${this.disc}): prepare(dst) antes de gravar.`);
        }
        const counts = scanLevelCounts(count);
        const offsets = this.allocateLevelParams(frame, args, counts, 0);
        if (src !== dst) frame.copy(src, dst, count * 4);
        this.runLevels(frame, variant, dst, offsets, counts, count);
    }

    /** Libera kernels, buffers dos níveis e uniforms. A instância volta a alocar no próximo `prepare`. */
    destroy(): void {
        this.releaseKernels();
        for (const b of this.upper) this.core.destroy(b);
        this.upper = [];
        this.params.destroy();
    }

    /**
     * Variante de contagem da GPU: todos os níveis da capacidade, contagens do registro `count` no kernel, nível 0 pelo
     * despacho indireto do registro e os de cima pela capacidade do nível.
     */
    private recordGpu(frame: Frame, args: PrefixSumRecordArgs, count: GpuCount): void {
        const owner = `PrefixSum(${this.disc})`;
        CountToArgs.check(owner, count);
        const { src, dst } = args;
        const variant = this.variants.get(count.counts);
        if (variant?.base.get(dst) === undefined) {
            throw new Error(`${owner}: prepare(dst, gravações, counts) antes de gravar.`);
        }
        const offsets = this.allocateLevelParams(frame, args, this.levelCapacity, count.index);
        if (src !== dst) {
            const bytes = Math.min(this.capacity * 4, src.byteSize, dst.byteSize);
            frame.copy(src, dst, bytes - (bytes % 4));
        }
        this.runLevels(frame, variant, dst, offsets, this.levelCapacity, count);
    }

    /** Uma região de uniform por nível: contagem (a da CPU, ou a capacidade do nível na variante da GPU) e modo. */
    private allocateLevelParams(
        frame: Frame,
        args: PrefixSumRecordArgs,
        counts: readonly number[],
        countIndex: number,
    ): number[] {
        const inclusive = args.mode === 'inclusive';
        return counts.map((n, k) =>
            this.params.allocate(frame, {
                count: n,
                inclusive: inclusive && k === 0 ? 1 : 0,
                depth: k,
                count_index: countIndex,
            }),
        );
    }

    /**
     * Subida (`scan_local`) até o topo, o topo num grupo e a descida (`scan_combine`). Os níveis k ≥ 1 despacham
     * `counts[k]` invocações (a contagem da CPU, ou a capacidade na variante da GPU); o nível 0, `first`.
     */
    private runLevels(
        frame: Frame,
        variant: CountVariant,
        dst: StorageBufferSpec,
        offsets: readonly number[],
        counts: readonly number[],
        first: number | GpuCount,
    ): void {
        const top = offsets.length - 1;
        const dispatches: LevelDispatch[] = [first, ...counts.slice(1)];
        const kernels = (k: number): LevelKernels =>
            k === 0 ? variant.base.get(dst)! : variant.upper[k - 1]!;
        for (let k = 0; k < top; k++) {
            this.run(frame, 'PrefixSum.scan_local', kernels(k).local!, offsets[k]!, dispatches[k]!);
        }
        this.run(frame, 'PrefixSum.scan_top', kernels(top).top!, offsets[top]!, null);
        for (let k = top - 1; k >= 0; k--) {
            this.run(
                frame,
                'PrefixSum.scan_combine',
                kernels(k).combine!,
                offsets[k]!,
                dispatches[k]!,
            );
        }
    }

    /** Kernels de todos os níveis da capacidade para a saída `dst`, na origem de contagem `counts`. */
    private prepareVariant(dst: StorageBufferSpec, counts: IndirectBufferSpec | null): void {
        let variant = this.variants.get(counts);
        if (variant === undefined) {
            variant = { base: new Map(), upper: [] };
            this.variants.set(counts, variant);
        }
        const top = this.levelCapacity.length - 1;
        for (let k = 0; k <= top; k++) {
            const kernels = this.kernelsOf(variant, k, dst);
            // O topo de uma gravação com contagem da CPU nunca é o nível 0 (sempre há um nível abaixo dele); a
            // variante da GPU grava todos os níveis da capacidade, com o topo também acima do 0.
            if (k > 0) kernels.top ??= this.levelKernel('scan_top', counts, this.values(k, dst));
            if (k === top) continue;
            kernels.local ??= this.levelKernel(
                'scan_local',
                counts,
                this.values(k, dst),
                this.values(k + 1, dst),
            );
            kernels.combine ??= this.levelKernel(
                'scan_combine',
                counts,
                this.values(k, dst),
                this.values(k + 1, dst),
            );
        }
    }

    private values(k: number, dst: StorageBufferSpec): StorageBufferSpec {
        return k === 0 ? dst : this.upper[k - 1]!;
    }

    private kernelsOf(variant: CountVariant, k: number, dst: StorageBufferSpec): LevelKernels {
        if (k > 0) return (variant.upper[k - 1] ??= {});
        let entry = variant.base.get(dst);
        if (entry === undefined) {
            entry = {};
            variant.base.set(dst, entry);
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
        counts: IndirectBufferSpec | null,
        values: StorageBufferSpec,
        above?: StorageBufferSpec,
    ): ComputeKernel {
        const ready =
            kind === 'scan_local' ? scanLocal : kind === 'scan_top' ? scanTop : scanCombine;
        const level = this.params.source();
        const r = scanResources;
        const bindings: Map<WgslResource, BindingSource> =
            kind === 'scan_top'
                ? new Map<WgslResource, BindingSource>([
                      [r.level, level],
                      [r.values, values],
                  ])
                : kind === 'scan_local'
                  ? new Map<WgslResource, BindingSource>([
                        [r.level, level],
                        [r.values, values],
                        [r.groupSums, above!],
                    ])
                  : new Map<WgslResource, BindingSource>([
                        [r.level, level],
                        [r.values, values],
                        [r.groupPrefix, above!],
                    ]);
        if (counts !== null) bindings.set(setCountResources.counts, counts);
        return createComputeKernel(this.core, {
            discriminator: `${this.disc}:${kind}${counts === null ? '' : ':gpu'}`,
            shader:
                counts === null
                    ? ready
                    : bindPoints(ready, new Map([[scanCountPoint, scanCountGpu]])),
            entryPoint: `${kind}_main`,
            bindings,
        });
    }

    /** `dispatch = null` despacha um grupo (topo); um número, `invocations(n, 256)`; `GpuCount`, o indireto. */
    private run(
        frame: Frame,
        label: string,
        kernel: ComputeKernel,
        offset: number,
        dispatch: LevelDispatch,
    ): void {
        frame.compute(label, (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind, { draw: [offset] });
            if (dispatch === null) pass.dispatch.workgroups(1);
            else if (typeof dispatch === 'number') pass.dispatch.invocations(dispatch, SCAN_GROUP);
            else
                pass.dispatch.workgroupsIndirect(
                    dispatch.counts,
                    CountToArgs.dispatchOffset(dispatch),
                );
        });
    }

    private releaseKernels(): void {
        for (const variant of this.variants.values()) {
            for (const level of [...variant.base.values(), ...variant.upper]) {
                for (const k of [level.local, level.combine, level.top]) {
                    if (k !== undefined) destroyComputeKernel(this.core, k);
                }
            }
        }
        this.variants.clear();
    }
}
