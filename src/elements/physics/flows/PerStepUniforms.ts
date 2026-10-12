import type {
    ComputeKernelBinding,
    EngineCore,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ResolvedSource } from '../../../scene/consumers/ConsumerResolver';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Opções de `PerStepUniforms`. */
export interface PerStepUniformsOptions {
    /** Prefixo do discriminator do buffer (único por Flow). */
    readonly discriminator: string;
    /** Schema do struct de parâmetros (`addressSpace: 'uniform'`): layout, empacotamento e struct WGSL. */
    readonly schema: StructSchema;
}

/**
 * Parâmetros por iteração dos Flows de física: um buffer uniform com **uma região por iteração** do quadro,
 * alinhada a `minUniformBufferOffsetAlignment`, escrito **uma vez por quadro** e ligado por **offset dinâmico**.
 *
 * Por que existe (research A1): `core.write` entra na fila antes do command buffer do quadro — reescrever o mesmo
 * uniform durante a gravação faz todos os passes lerem o último valor. Com N passos × M substeps no mesmo quadro,
 * cada iteração precisa da sua região: o Flow grava cada região por campo (`write(i, dados)`, pelo schema), envia
 * tudo com `flush`, e liga a iteração `i` com `setBindGroup(g, bg, [offset(i)])`.
 *
 * Crescimento (`reserve` acima da capacidade) recria o buffer, destrói o anterior e incrementa `generation`. No modelo
 * de slots (spec 006) o Flow chama `reserve` numa **transição** (ex.: `resourceReady` do `Time`, quando o número de
 * passos do quadro muda) e, se o buffer foi recriado, religa `source()` (`ctx.bind`) — a C2 recria os bind groups.
 */
export class PerStepUniforms {
    private readonly schema: StructSchema;
    private cachedRegionSize = 0;
    private readonly discriminator: string;
    private spec: UniformBufferSpec | null = null;
    private staging = new ArrayBuffer(0);
    private regionCount = 0;
    private bufferGeneration = 0;

    constructor(
        private readonly core: EngineCore,
        options: PerStepUniformsOptions,
    ) {
        if (options.schema.addressSpace !== 'uniform') {
            throw new TypeError(
                `PerStepUniforms(${options.discriminator}): o schema '${options.schema.name}' precisa ser de uniform.`,
            );
        }
        this.schema = options.schema;
        this.discriminator = options.discriminator;
    }

    /**
     * Bytes por região: o struct arredondado a `minUniformBufferOffsetAlignment` do device (lido no primeiro uso,
     * para que o Flow possa ser construído antes do device existir).
     */
    get regionSize(): number {
        if (this.cachedRegionSize === 0) {
            const alignment =
                this.core.capabilities().limits.minUniformBufferOffsetAlignment ?? 256;
            this.cachedRegionSize = Math.ceil(this.schema.stride / alignment) * alignment;
        }
        return this.cachedRegionSize;
    }

    /** Regiões disponíveis no buffer atual. */
    get capacity(): number {
        return this.regionCount;
    }

    /** Incrementa a cada recriação do buffer — bind groups com `binding(...)` precisam ser refeitos. */
    get generation(): number {
        return this.bufferGeneration;
    }

    /** Buffer atual. Lança antes do primeiro `reserve`. */
    get buffer(): UniformBufferSpec {
        if (this.spec === null)
            throw new Error(`PerStepUniforms(${this.discriminator}): reserve() antes do uso.`);
        return this.spec;
    }

    /**
     * Garante espaço para `regions` regiões. Devolve `true` quando o buffer foi (re)criado — o chamador refaz os
     * bind groups. A capacidade cresce em potências de 2 para não recriar a cada aumento.
     */
    reserve(regions: number): boolean {
        if (regions <= this.regionCount && this.spec !== null) return false;
        let capacity = Math.max(1, this.regionCount);
        while (capacity < regions) capacity *= 2;
        const previous = this.spec;
        this.bufferGeneration++;
        this.spec = this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `${this.discriminator}:per_step:${this.bufferGeneration}`,
            byteSize: capacity * this.regionSize,
        });
        const staging = new ArrayBuffer(capacity * this.regionSize);
        new Uint8Array(staging).set(new Uint8Array(this.staging));
        this.staging = staging;
        this.regionCount = capacity;
        if (previous !== null) this.core.destroy(previous);
        return true;
    }

    /** Offset em bytes da região `i` (para `setBindGroup(g, bg, [offset(i)])`). */
    offset(i: number): number {
        return i * this.regionSize;
    }

    /** Grava a região `i` campo a campo pelo schema (padding zerado; campos ausentes ficam 0). */
    write(i: number, data: Record<string, unknown>): void {
        this.checkRegion(i);
        this.schema.packInto(this.staging, this.offset(i), data);
    }

    /** Envia as regiões `[0, count)` numa única escrita. `count = 0` não escreve. */
    flush(count: number): void {
        if (count === 0) return;
        if (count > this.regionCount) {
            throw new RangeError(
                `PerStepUniforms(${this.discriminator}): flush(${count}) além da capacidade ${this.regionCount}.`,
            );
        }
        this.core.write(this.buffer, new Uint8Array(this.staging, 0, count * this.regionSize));
    }

    /** Fonte de binding do buffer: uma região de `schema.stride` bytes, escolhida por offset dinâmico. */
    source(): ResolvedSource {
        return {
            kind: 'buffer',
            buffer: this.buffer,
            size: this.schema.stride,
            dynamic: { stride: this.regionSize },
        };
    }

    /**
     * Entrada de bind group por índice com offset dinâmico.
     * @deprecated Base de migração (spec 006): sai quando o último solver migrar; use `source()`.
     */
    binding(binding: number): ComputeKernelBinding {
        return {
            binding,
            type: 'uniform',
            buffer: this.buffer,
            hasDynamicOffset: true,
            size: this.schema.stride,
        };
    }

    /** Destrói o buffer. */
    dispose(): void {
        if (this.spec !== null) this.core.destroy(this.spec);
        this.spec = null;
        this.regionCount = 0;
    }

    private checkRegion(i: number): void {
        if (!Number.isInteger(i) || i < 0 || i >= this.regionCount) {
            throw new RangeError(
                `PerStepUniforms(${this.discriminator}): região ${i} fora de [0, ${this.regionCount}).`,
            );
        }
    }
}
