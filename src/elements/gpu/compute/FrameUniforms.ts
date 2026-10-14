import type { EngineCore, Frame, UniformBufferSpec } from '../../../scene/contracts/gpu';
import type { ResolvedSource } from '../../../scene/consumers/ResolvedSource';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Opções de `FrameUniforms`. */
interface FrameUniformsOptions {
    /** Prefixo do discriminator do buffer (único por instância). */
    readonly discriminator: string;
    /** Schema dos parâmetros (`addressSpace: 'uniform'`). */
    readonly schema: StructSchema;
}

/**
 * Parâmetros por chamada de um kernel genérico gravado várias vezes no mesmo quadro (`count`, modo…): cada chamada
 * recebe a sua região de um uniform, ligada por offset dinâmico.
 *
 * Por que existe (research A1 da 005): `core.write` entra na fila antes do quadro inteiro — reescrever o mesmo uniform
 * entre duas gravações faz as duas lerem o último valor. Um quadro é um `core.record` (um envio): as regiões valem até
 * o fim dele e a primeira chamada de um quadro novo recomeça da região 0.
 *
 * Duas fases (spec 006): `reserve(n)` dimensiona o buffer **fora da gravação** (na preparação do kernel, numa
 * transição do Flow) e devolve se o buffer foi recriado — quem o liga refaz os kernels; `allocate` só grava a região
 * da chamada e nunca cria objetos: passar das regiões reservadas é erro.
 */
export class FrameUniforms {
    private readonly schema: StructSchema;
    private readonly discriminator: string;
    private cachedRegionSize = 0;
    private spec: UniformBufferSpec | null = null;
    private regionCount = 0;
    private cursor = 0;
    private frame: Frame | null = null;
    private bufferGeneration = 0;
    /** Cópia em CPU das regiões gravadas. */
    private staging = new ArrayBuffer(0);

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

    /** Regiões disponíveis por quadro. */
    get capacity(): number {
        return this.regionCount;
    }

    /** Incrementa a cada (re)criação do buffer — quem liga `source()` refaz os kernels. */
    get generation(): number {
        return this.bufferGeneration;
    }

    /**
     * Garante `regions` regiões por quadro (capacidade em potências de 2). Chamado fora da gravação: o buffer anterior
     * é destruído na hora. Devolve `true` se o buffer foi (re)criado.
     */
    reserve(regions: number): boolean {
        if (!Number.isInteger(regions) || regions < 1) {
            throw new RangeError(
                `FrameUniforms(${this.discriminator}): reserve(${regions}) — inteiro ≥ 1.`,
            );
        }
        if (this.spec !== null && regions <= this.regionCount) return false;
        let capacity = Math.max(1, this.regionCount);
        while (capacity < regions) capacity *= 2;
        if (this.spec !== null) this.core.destroy(this.spec);
        this.regionCount = capacity;
        this.staging = new ArrayBuffer(capacity * this.regionSize);
        this.bufferGeneration++;
        this.spec = this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `${this.discriminator}:frame_uniforms:${this.bufferGeneration}`,
            byteSize: capacity * this.regionSize,
        });
        this.frame = null;
        this.cursor = 0;
        return true;
    }

    /**
     * Fonte de binding do buffer: uma região de `schema.stride` bytes, escolhida por offset dinâmico.
     * @throws Error antes do primeiro `reserve`.
     */
    source(): ResolvedSource {
        return {
            kind: 'buffer',
            buffer: this.buffer,
            size: this.schema.stride,
            dynamic: { stride: this.regionSize },
        };
    }

    /**
     * Reserva a próxima região do quadro `frame`, grava `data` pelo schema e devolve o offset para
     * `setBindGroup(g, bg, [offset])`.
     * @throws RangeError se o quadro já usou todas as regiões reservadas.
     */
    allocate(frame: Frame, data: Record<string, unknown>): number {
        if (frame !== this.frame) {
            this.frame = frame;
            this.cursor = 0;
        }
        const spec = this.buffer;
        if (this.cursor === this.regionCount) {
            throw new RangeError(
                `FrameUniforms(${this.discriminator}): mais de ${this.regionCount} chamadas no quadro — reserve antes de gravar.`,
            );
        }
        const offset = this.cursor * this.regionSize;
        this.cursor++;
        this.schema.packInto(this.staging, offset, data);
        this.core.write(spec, new Uint8Array(this.staging, offset, this.schema.stride), offset);
        return offset;
    }

    /** Destrói o buffer. */
    destroy(): void {
        if (this.spec !== null) this.core.destroy(this.spec);
        this.spec = null;
        this.regionCount = 0;
        this.frame = null;
        this.cursor = 0;
    }

    private get buffer(): UniformBufferSpec {
        if (this.spec === null) {
            throw new Error(`FrameUniforms(${this.discriminator}): reserve antes do uso.`);
        }
        return this.spec;
    }
}
