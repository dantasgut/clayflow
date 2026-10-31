import type { Frame } from '../../../scene/contracts/gpu';
import type { ResolvedSource } from '../../../scene/consumers/ResolvedSource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { WorkContext, WorkPart } from '../../../scene/flows/FlowWork';

/** Opções de `FrameUniforms`. */
interface FrameUniformsOptions {
    /** Id do descritor no Resource de trabalho (único nele). */
    readonly id: string;
    /** Schema dos parâmetros (`addressSpace: 'uniform'`). */
    readonly schema: StructSchema;
}

/**
 * Parâmetros por chamada de um kernel genérico gravado várias vezes no mesmo quadro (`count`, modo…): cada chamada
 * recebe a sua região de um uniforme por região (spec 039) do Resource de trabalho, ligada por offset dinâmico.
 *
 * Por que regiões (research A1 da 005): a escrita entra na fila antes do quadro inteiro — reescrever o mesmo uniform
 * entre duas gravações faz as duas lerem o último valor. Um quadro é um `core.record` (um envio): as regiões valem até
 * o fim dele e a primeira chamada de um quadro novo recomeça da região 0.
 *
 * Duas fases (spec 006): `reserve(n)` dimensiona **fora da gravação** (redescreve o trabalho; a C2 realoca) e devolve
 * se o buffer mudou — quem o liga refaz os kernels; `allocate` só grava a região da chamada pela C2
 * (`writeRegions`, válida durante a gravação) e nunca cria objetos: passar das regiões reservadas é erro.
 */
export class FrameUniforms implements WorkPart {
    private readonly schema: StructSchema;
    private readonly id: string;
    private regionCount = 0;
    private cursor = 0;
    private frame: Frame | null = null;
    private bufferGeneration = 0;

    constructor(
        private readonly ctx: WorkContext,
        options: FrameUniformsOptions,
    ) {
        if (options.schema.addressSpace !== 'uniform') {
            throw new TypeError(
                `FrameUniforms(${options.id}): o schema '${options.schema.name}' precisa ser de uniform.`,
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
            throw new Error(`FrameUniforms(${this.id}): reserve antes do uso.`);
        return stride;
    }

    /** Solta as regiões: o descritor sai do trabalho e a C2 libera o buffer (o próximo `reserve` declara de novo). */
    release(): void {
        if (this.regionCount === 0) return;
        this.regionCount = 0;
        this.ctx.work.refresh();
    }

    /** Regiões disponíveis por quadro. */
    get capacity(): number {
        return this.regionCount;
    }

    /** Incrementa a cada realocação — quem liga `source()` refaz os kernels. */
    get generation(): number {
        return this.bufferGeneration;
    }

    /**
     * Garante `regions` regiões por quadro (capacidade em potências de 2). Chamado fora da gravação: o trabalho se
     * redescreve e a C2 realoca na hora. Devolve `true` se o buffer mudou.
     */
    reserve(regions: number): boolean {
        if (!Number.isInteger(regions) || regions < 1) {
            throw new RangeError(`FrameUniforms(${this.id}): reserve(${regions}) — inteiro ≥ 1.`);
        }
        if (regions <= this.regionCount) return false;
        let capacity = Math.max(1, this.regionCount);
        while (capacity < regions) capacity *= 2;
        this.regionCount = capacity;
        this.bufferGeneration++;
        this.frame = null;
        this.cursor = 0;
        this.ctx.work.refresh();
        return true;
    }

    /**
     * Fonte de binding: uma região de `schema.stride` bytes, escolhida por offset dinâmico.
     * @throws Error antes do primeiro `reserve`.
     */
    source(): ResolvedSource {
        const buffer = this.ctx.resources.bufferOf(this.ctx.work, this.id);
        if (buffer === undefined || buffer.subkind === 'staging')
            throw new Error(`FrameUniforms(${this.id}): reserve antes do uso.`);
        return {
            kind: 'buffer',
            buffer,
            size: this.schema.stride,
            dynamic: { stride: this.regionSize },
        };
    }

    /**
     * Reserva a próxima região do quadro `frame`, grava `data` pelo schema (pela C2) e devolve o offset para
     * `setBindGroup(g, bg, [offset])`.
     * @throws RangeError se o quadro já usou todas as regiões reservadas.
     */
    allocate(frame: Frame, data: Record<string, unknown>): number {
        if (this.regionCount === 0)
            throw new Error(`FrameUniforms(${this.id}): reserve antes do uso.`);
        if (frame !== this.frame) {
            this.frame = frame;
            this.cursor = 0;
        }
        if (this.cursor === this.regionCount) {
            throw new RangeError(
                `FrameUniforms(${this.id}): mais de ${this.regionCount} chamadas no quadro — reserve antes de gravar.`,
            );
        }
        const region = this.cursor++;
        this.ctx.resources.writeRegions(this.ctx.work, this.id, [data], region);
        return region * this.regionSize;
    }
}
