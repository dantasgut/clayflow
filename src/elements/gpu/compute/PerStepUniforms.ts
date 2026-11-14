import type { ResolvedSource } from '../../../scene/consumers/ResolvedSource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { WorkContext, WorkPart } from '../../../scene/flows/FlowWork';

/** Opções de `PerStepUniforms`. */
export interface PerStepUniformsOptions {
    /** Id do descritor no Resource de trabalho (único nele). */
    readonly id: string;
    /** Schema do struct de parâmetros (`addressSpace: 'uniform'`): layout, empacotamento e struct WGSL. */
    readonly schema: StructSchema;
}

/**
 * Parâmetros por iteração de um Flow (passos e substeps da física, níveis da hierarquia de `Transform`): um uniforme
 * por região (spec 039) no Resource de trabalho do Flow — **uma região por iteração** do quadro, alinhada ao
 * `minUniformBufferOffsetAlignment` do adaptador, escrita **uma vez por quadro** e ligada por **offset dinâmico**.
 *
 * Por que regiões (research A1): a escrita entra na fila antes do command buffer do quadro — reescrever o mesmo
 * uniform durante a gravação faz todos os passes lerem o último valor. Com N passos × M substeps no mesmo quadro, cada
 * iteração tem a sua região: o Flow grava cada região por campo (`write(i, dados)`), envia com `flush` e liga a
 * iteração `i` com `setBindGroup(g, bg, [offset(i)])`.
 *
 * O buffer é da C2 (descritor `regions` do trabalho). `reserve` acima da capacidade redescreve o trabalho (a C2
 * realoca e incrementa `generation`): o Flow chama `reserve` numa **transição** e, se mudou, religa `source()`.
 */
export class PerStepUniforms implements WorkPart {
    private readonly schema: StructSchema;
    private readonly id: string;
    private records: Record<string, unknown>[] = [];
    private regionCount = 0;
    private bufferGeneration = 0;

    constructor(
        private readonly ctx: WorkContext,
        options: PerStepUniformsOptions,
    ) {
        if (options.schema.addressSpace !== 'uniform') {
            throw new TypeError(
                `PerStepUniforms(${options.id}): o schema '${options.schema.name}' precisa ser de uniform.`,
            );
        }
        this.schema = options.schema;
        this.id = options.id;
        ctx.work.use(this);
    }

    descriptors(): readonly GPUDescriptor[] {
        if (this.regionCount === 0) return [];
        return [
            {
                id: this.id,
                role: 'uniform',
                schema: this.schema,
                regions: { count: this.regionCount },
            },
        ];
    }

    /** Bytes por região: o stride do schema alinhado ao adaptador (pela C2). */
    get regionSize(): number {
        const stride = this.ctx.resources.regionStrideOf(this.ctx.work, this.id);
        if (stride === undefined)
            throw new Error(`PerStepUniforms(${this.id}): reserve() antes do uso.`);
        return stride;
    }

    /** Solta as regiões: o descritor sai do trabalho e a C2 libera o buffer (o próximo `reserve` declara de novo). */
    release(): void {
        if (this.regionCount === 0) return;
        this.regionCount = 0;
        this.ctx.work.refresh();
    }

    /** Regiões disponíveis. */
    get capacity(): number {
        return this.regionCount;
    }

    /** Incrementa a cada realocação — bind groups com `source()` precisam ser refeitos. */
    get generation(): number {
        return this.bufferGeneration;
    }

    /**
     * Garante espaço para `regions` regiões. Devolve `true` quando o buffer foi realocado — o chamador religa
     * `source()`. A capacidade cresce em potências de 2 para não realocar a cada aumento.
     */
    reserve(regions: number): boolean {
        if (regions <= this.regionCount) return false;
        let capacity = Math.max(1, this.regionCount);
        while (capacity < regions) capacity *= 2;
        this.regionCount = capacity;
        this.bufferGeneration++;
        this.ctx.work.refresh();
        return true;
    }

    /** Offset em bytes da região `i` (para `setBindGroup(g, bg, [offset(i)])`). */
    offset(i: number): number {
        return i * this.regionSize;
    }

    /** Grava a região `i` campo a campo pelo schema (campos ausentes ficam 0); vai à GPU no `flush`. */
    write(i: number, data: Record<string, unknown>): void {
        this.checkRegion(i);
        this.records[i] = { ...data };
    }

    /** Envia as regiões `[0, count)` numa única escrita da C2. `count = 0` não escreve. */
    flush(count: number): void {
        if (count === 0) return;
        if (count > this.regionCount) {
            throw new RangeError(
                `PerStepUniforms(${this.id}): flush(${count}) além da capacidade ${this.regionCount}.`,
            );
        }
        const records = Array.from({ length: count }, (_, i) => this.records[i] ?? {});
        this.ctx.resources.writeRegions(this.ctx.work, this.id, records);
    }

    /** Fonte de binding: uma região de `schema.stride` bytes, escolhida por offset dinâmico. */
    source(): ResolvedSource {
        const buffer = this.ctx.resources.bufferOf(this.ctx.work, this.id);
        if (buffer === undefined || buffer.subkind === 'staging')
            throw new Error(`PerStepUniforms(${this.id}): reserve() antes do uso.`);
        return {
            kind: 'buffer',
            buffer,
            size: this.schema.stride,
            dynamic: { stride: this.regionSize },
        };
    }

    private checkRegion(i: number): void {
        if (!Number.isInteger(i) || i < 0 || i >= this.regionCount) {
            throw new RangeError(
                `PerStepUniforms(${this.id}): região ${i} fora de [0, ${this.regionCount}).`,
            );
        }
    }
}
