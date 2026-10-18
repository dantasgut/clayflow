import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Valores de uma `Refraction`. */
export interface RefractionValues {
    /**
     * Interfaces seguidas pelo raio refratado (entradas, saídas e reflexões internas totais) antes de ler a cópia da
     * cena. Default 6 — entra e sai de dois vidros, com folga para a reflexão interna.
     */
    readonly maxInterfaces?: number;
    /** Desfoque da rugosidade da transmissão (o cone da rugosidade sobre a imagem traçada). Default `true`. */
    readonly roughnessBlur?: boolean;
    /**
     * Antisserrilhado da imagem refratada: nos pixels onde ela muda de um para o vizinho (bordas, padrões finos vistos
     * pela lente), mais três raios dentro do pixel. Default `true`.
     */
    readonly antialias?: boolean;
}

/** Dado de uma `Refraction` (layout de `Refraction.schema`). */
export interface RefractionData {
    maxInterfaces: number;
    roughnessBlur: number;
    antialias: number;
}

/** Uniform da refração. */
export const RefractionSchema = new StructSchema(
    'RefractionParams',
    {
        maxInterfaces: FieldType.u32,
        roughnessBlur: FieldType.u32,
        antialias: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Parâmetros do quadro do traçado (uniform privado de quem traça: o desenho, a água): câmera ativa, tempo e fundo. */
export const RefractionFrameSchema = new StructSchema(
    'RefractionFrame',
    {
        cameraSlot: FieldType.u32,
        time: FieldType.f32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        /** Cor de limpeza da tela (rgb) e, em w, 1 quando ela é o fundo (sem céu na cena): o que vê o raio que escapa. */
        clear: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);

/**
 * Refração pela estrutura de raios (spec 034, R1): o que se vê através de um material com transmissão (vidro, líquidos,
 * parede fina) é o raio refratado traçado por pixel pela cena — nítido em qualquer ampliação, com o que está fora da
 * tela ou encoberto. Uma por cena, inserida pelos estágios padrão e exposta em `defaults.refraction`; ajustável. As
 * texturas do traçado são alocadas só enquanto há material com transmissão na cena.
 */
export class Refraction extends Entity<RefractionData> implements Resource {
    /** Parâmetros da refração (uniform). */
    static readonly schema = RefractionSchema;

    state: ResourceState = ResourceState.Uninitialized;

    constructor(values: RefractionValues = {}) {
        super();
        const interfaces = values.maxInterfaces ?? 6;
        if (!Number.isInteger(interfaces) || interfaces < 1 || interfaces > 32)
            throw new RangeError(
                `Refraction: maxInterfaces deve ser um inteiro em [1, 32] (recebido ${interfaces})`,
            );
        this.data = {
            maxInterfaces: interfaces,
            roughnessBlur: values.roughnessBlur === false ? 0 : 1,
            antialias: values.antialias === false ? 0 : 1,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'params', role: 'uniform', schema: Refraction.schema }];
    }

    /**
     * Os bytes do uniform do quadro do traçado (`RefractionFrameSchema`) de quem traça: a câmera ativa, o tempo e o
     * fundo de quem escapa — o céu da cena (`sky`) ou a cor de limpeza `clear`.
     */
    static frameParams(
        cameraSlot: number,
        time: number,
        clear: readonly number[],
        sky: boolean,
    ): Uint8Array {
        return RefractionFrameSchema.pack({
            cameraSlot,
            time,
            clear: [clear[0] ?? 0, clear[1] ?? 0, clear[2] ?? 0, sky ? 0 : 1],
        });
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
