import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';

/**
 * Contagem de um conjunto de um grafo de nós (spec 031, R10), escrita só pela GPU: o número de elementos e, derivados
 * dele no próprio fluxo (`CountToArgs`), os argumentos de despacho (byte 4: `x, y, z`) e de desenho (byte 16: indexado
 * `indexCount, instanceCount, firstIndex, baseVertex, firstInstance`; os quatro primeiros servem ao desenho não
 * indexado). Vários registros num descritor `indirect`, lidos como `array<SetCount>` pelo índice do conjunto.
 */
export const SetCountSchema = new StructSchema('SetCount', {
    count: FieldType.u32,
    dispatch_x: FieldType.u32,
    dispatch_y: FieldType.u32,
    dispatch_z: FieldType.u32,
    index_count: FieldType.u32,
    instance_count: FieldType.u32,
    first_index: FieldType.u32,
    base_vertex: FieldType.i32,
    first_instance: FieldType.u32,
    _pad0: FieldType.u32,
    _pad1: FieldType.u32,
    _pad2: FieldType.u32,
});

/** Byte dos argumentos de despacho num registro `SetCount`. */
export const SET_COUNT_DISPATCH_OFFSET = 4;
/** Byte dos argumentos de desenho num registro `SetCount`. */
export const SET_COUNT_DRAW_OFFSET = 16;
