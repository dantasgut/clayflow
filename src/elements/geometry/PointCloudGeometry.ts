import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry, type GeometryData } from './Geometry';

/** Dado de uma `PointCloudGeometry`. */
export interface PointCloudGeometryData extends GeometryData {
    /** Pontos que cabem no buffer. */
    maxPoints: number;
    /** Pontos desenhados (os primeiros do buffer). */
    activeCount: number;
}

/** Valores do construtor de uma `PointCloudGeometry`. */
export interface PointCloudGeometryValues {
    /** Capacidade de pontos. Default 1024. */
    readonly maxPoints?: number;
    /** Pontos desenhados. Default: todos. */
    readonly activeCount?: number;
}

/**
 * Nuvem de pontos escrita pela GPU (spec 008, R6): um vertex buffer de `maxPoints` vértices (posição, normal, uv; o
 * layout do forward) que **só a GPU escreve** (`upload: 'never'`) — por um estágio que declara a posse dele
 * (`slot.entities({ owns: [[PointCloudGeometry, 'vertices']] })`). Com `PointSpriteMaterial` cada ponto vira um sprite;
 * com material de triângulos ou linhas, os vértices são desenhados sem índices. Desenha os `activeCount` primeiros
 * (mutável: o desenho segue o valor do quadro). Própria da entidade (fora da deduplicação).
 */
export class PointCloudGeometry extends Geometry<PointCloudGeometryData> {
    /** Layout do ponto (o do forward: posição, normal, uv; 32 bytes). */
    static readonly vertexStruct = new StructSchema('PointCloudVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });

    /** @throws RangeError com capacidade não positiva ou `activeCount` fora de `[0, maxPoints]`. */
    constructor(values: PointCloudGeometryValues = {}) {
        super();
        const maxPoints = values.maxPoints ?? 1024;
        const activeCount = values.activeCount ?? maxPoints;
        if (!Number.isInteger(maxPoints) || maxPoints < 1) {
            throw new RangeError(
                `PointCloudGeometry: maxPoints deve ser inteiro ≥ 1 (recebeu ${maxPoints}).`,
            );
        }
        if (!Number.isInteger(activeCount) || activeCount < 0 || activeCount > maxPoints) {
            throw new RangeError(
                `PointCloudGeometry: activeCount ${activeCount} fora de [0, ${maxPoints}].`,
            );
        }
        this.data = { maxPoints, activeCount };
    }

    /** Vértices escritos só pela GPU. */
    override getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: PointCloudGeometry.vertexStruct,
                count: this.data.maxPoints,
                upload: 'never',
            },
        ];
    }

    /** Pontos desenhados (`activeCount`). */
    get vertexCount(): number {
        return this.data.activeCount;
    }

    /** Sem índices. */
    get indexCount(): number {
        return 0;
    }

    /** Própria da entidade: fora da deduplicação por conteúdo. */
    override get contentKey(): string | undefined {
        return undefined;
    }
}
