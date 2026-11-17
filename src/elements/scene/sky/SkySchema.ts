import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/**
 * Parâmetros do céu físico (uniform, spec 033, R4): o sol (direção para ele, iluminância com o raio angular em `w`), os
 * coeficientes da atmosfera em km — Rayleigh (espalhamento, altura de escala), Mie (espalhamento, extinção, altura de
 * escala, assimetria), ozônio (absorção, centro) —, os raios (chão, topo, meia largura do ozônio, altitude do
 * observador), o albedo do chão, o piso noturno, o slot da luz do sol no pool `Light`, se há algo cobrindo o céu (`cover`: uma `CloudLayer`, spec 041) e
 * o slot da câmera ativa (a tabela da perspectiva aérea, spec 041).
 */
export const SkySchema = new StructSchema(
    'Sky',
    {
        sunDirection: FieldType.vec4f,
        sunIlluminance: FieldType.vec4f,
        rayleigh: FieldType.vec4f,
        mie: FieldType.vec4f,
        ozone: FieldType.vec4f,
        radii: FieldType.vec4f,
        ground: FieldType.vec4f,
        night: FieldType.vec4f,
        sunSlot: FieldType.u32,
        sunDisk: FieldType.u32,
        cover: FieldType.u32,
        cameraSlot: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Alcance da tabela da perspectiva aérea (km, spec 041): além dele, a razão das transmitâncias. */
export const SKY_AERIAL_RANGE_KM = 32;
