import type {
    ComputeKernelBinding,
    EngineCore,
    Frame,
    UniformBufferSpec,
} from '../../../core/contracts/index';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Opções de `FrameUniforms`. */
export interface FrameUniformsOptions {
    /** Prefixo do discriminator do buffer (único por instância). */
    readonly discriminator: string;
    /** Schema dos parâmetros (`addressSpace: 'uniform'`). */
    readonly schema: StructSchema;
    /** Regiões iniciais (cresce em potências de 2). Padrão 16. */
    readonly initialRegions?: number;
}

/**
 * Parâmetros por chamada de um kernel genérico gravado várias vezes no mesmo quadro (`count`, modo…): cada chamada
 * recebe a sua região de um uniform, ligada por offset dinâmico.
 *
 * Por que existe (research A1): `core.write` entra na fila antes do quadro inteiro — reescrever o mesmo uniform entre
 * duas gravações faz as duas lerem o último valor. Um quadro é um `core.record` (um envio): as regiões valem até o
 * fim dele e a primeira chamada de um quadro novo recomeça da região 0.
 *
 * Crescimento no meio do quadro cria um buffer maior e incrementa `generation` (quem liga `binding(...)` refaz os bind
 * groups); o buffer anterior ainda está ligado a passes já gravados, então só é destruído no quadro seguinte.
 */
export class FrameUniforms {
    private readonly schema: StructSchema;
    private readonly discriminator: string;
    private cachedRegionSize = 0;
    private spec: UniformBufferSpec | null = null;
    private regionCount: number;
    private cursor = 0;
    private frame: Frame | null = null;
    private bufferGeneration = 0;
    private retired: UniformBufferSpec[] = [];

    constructor(
        private readonly core: EngineCore,
        options: FrameUniformsOptions,
    ) {
        if (options.schema.addressSpace !== 'uniform') {
            throw new TypeError(
                `FrameUniforms(${options.discriminator}): o schema '${options.schema.name}' precisa ser de uniform.`,
            );
        }
        this.schema = options.schema;
        this.discriminator = options.discriminator;
        this.regionCount = Math.max(1, options.initialRegions ?? 16);
    }

    /** Bytes por região: o struct arredondado a `minUniformBufferOffsetAlignment` (lido no primeiro uso). */
    get regionSize(): number {
        if (this.cachedRegionSize === 0) {
            const alignment =
                this.core.capabilities().limits.minUniformBufferOffsetAlignment ?? 256;
            this.cachedRegionSize = Math.ceil(this.schema.stride / alignment) * alignment;
        }
        return this.cachedRegionSize;
    }

    /** Incrementa a cada (re)criação do buffer — bind groups com `binding(...)` precisam ser refeitos. */
    get generation(): number {
        return this.bufferGeneration;
    }

    /** Buffer atual (criado no primeiro uso). */
    get buffer(): UniformBufferSpec {
        if (this.spec === null) this.createBuffer();
        return this.spec!;
    }

    /**
     * Reserva a próxima região do quadro `frame`, grava `data` pelo schema e devolve o offset para
     * `setBindGroup(g, bg, [offset])`. Pode crescer o buffer (ver `generation`).
     */
    allocate(frame: Frame, data: Record<string, unknown>): number {
        if (frame !== this.frame) {
            this.frame = frame;
            this.cursor = 0;
            for (const old of this.retired) this.core.destroy(old);
            this.retired = [];
        }
        if (this.spec === null) this.createBuffer();
        if (this.cursor === this.regionCount) {
            this.retired.push(this.spec!);
            this.regionCount *= 2;
            this.createBuffer();
        }
        const offset = this.cursor * this.regionSize;
        this.cursor++;
        this.core.write(this.spec!, this.schema.pack(data), offset);
        return offset;
    }

    /** Entrada de bind group com offset dinâmico para o buffer atual no slot `binding`. */
    binding(binding: number): ComputeKernelBinding {
        return {
            binding,
            type: 'uniform',
            buffer: this.buffer,
            hasDynamicOffset: true,
            size: this.schema.stride,
        };
    }

    /** Destrói o buffer atual e os aposentados. */
    destroy(): void {
        for (const old of this.retired) this.core.destroy(old);
        this.retired = [];
        if (this.spec !== null) this.core.destroy(this.spec);
        this.spec = null;
        this.frame = null;
        this.cursor = 0;
    }

    private createBuffer(): void {
        this.bufferGeneration++;
        this.spec = this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `${this.discriminator}:frame_uniforms:${this.bufferGeneration}`,
            byteSize: this.regionCount * this.regionSize,
        });
    }
}
