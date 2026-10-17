import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { StructSchema } from '../../scene/descriptors/StructSchema';
import {
    RayBlasSchema,
    RayInstanceSchema,
    RayNodeSchema,
    RaySceneSchema,
    RaySphereSchema,
    RayTriangleSchema,
    RayVertexSchema,
} from './schemas';

/** Capacidades da estrutura (elementos de cada pool). */
export interface RaySceneCapacity {
    /** Vértices copiados das geometrias. */
    vertices: number;
    /** Triângulos. */
    triangles: number;
    /** Esferas (partículas de sprite). */
    spheres: number;
    /** Nós das hierarquias de baixo e da de cima. */
    nodes: number;
    /** Hierarquias de baixo. */
    blas: number;
    /** Instâncias. */
    instances: number;
}

/** Dado de uma `RayScene`: as faixas nos pools e a raiz da hierarquia de cima (o uniform) mais as capacidades. */
export interface RaySceneData extends RaySceneCapacity {
    vertexFirst: number;
    triangleFirst: number;
    sphereFirst: number;
    nodeFirst: number;
    blasFirst: number;
    instanceFirst: number;
    instanceCount: number;
    tlasRoot: number;
}

/** Capacidade inicial (cresce em potências de dois conforme a cena). */
const INITIAL: RaySceneCapacity = {
    vertices: 1024,
    triangles: 1024,
    spheres: 64,
    nodes: 4096,
    blas: 16,
    instances: 64,
};

/** Arredonda para a próxima potência de dois. */
function grow(current: number, needed: number): number {
    let c = Math.max(1, current);
    while (c < needed) c *= 2;
    return c;
}

/**
 * Estrutura de raios da cena (Camada 3, spec 033, R1): a geometria de todos os objetos desenhados em hierarquias de
 * caixas na GPU — uma de baixo (BLAS) por conteúdo de geometria ou corpo de partículas e uma de cima (TLAS) sobre as
 * instâncias —, consultada por qualquer estágio pelo módulo `ray_scene` sem conhecer a origem da geometria. Gerada da
 * cena pelo `RaySceneFlow`; sem dado de autoria.
 *
 * Os dados vivem em pools da C2 (`RayVertex`, `RayTriangle`, `RaySphere`, `RayNode`, `RayBlas`, `RayInstance`), escritos
 * só pela GPU, numa faixa por pool com a capacidade como contagem; quando a cena passa da capacidade, o estágio a
 * aumenta (`reserve`): as faixas são realocadas e os estágios que leem os pools são religados pela C2. O uniform `info`
 * diz onde começa cada faixa, quantas instâncias há e qual nó é a raiz.
 */
export class RayScene extends Entity<RaySceneData> implements Resource {
    /** O uniform da estrutura (as faixas e a raiz). */
    static readonly schema = RaySceneSchema;

    state: ResourceState = ResourceState.Uninitialized;

    constructor() {
        super();
        this.data = {
            ...INITIAL,
            vertexFirst: 0,
            triangleFirst: 0,
            sphereFirst: 0,
            nodeFirst: 0,
            blasFirst: 0,
            instanceFirst: 0,
            instanceCount: 0,
            tlasRoot: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const d = this.data;
        const pooled = (id: string, schema: StructSchema, count: number): GPUDescriptor => ({
            id,
            role: 'storage-rw',
            schema,
            storage: 'pool',
            count,
            upload: 'never',
        });
        return [
            { id: 'info', role: 'uniform', schema: RayScene.schema },
            pooled('vertices', RayVertexSchema, d.vertices),
            pooled('triangles', RayTriangleSchema, d.triangles),
            pooled('spheres', RaySphereSchema, d.spheres),
            pooled('nodes', RayNodeSchema, d.nodes),
            pooled('blas', RayBlasSchema, d.blas),
            pooled('instances', RayInstanceSchema, d.instances),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /**
     * Garante as capacidades pedidas (potências de dois). Devolve `true` quando alguma cresceu: as faixas dos pools são
     * realocadas pela C2 (o conteúdo de GPU se perde) e o estágio reconstrói a estrutura.
     */
    reserve(needed: RaySceneCapacity): boolean {
        const current = this.rawData;
        const next: RaySceneCapacity = {
            vertices: grow(current.vertices, needed.vertices),
            triangles: grow(current.triangles, needed.triangles),
            spheres: grow(current.spheres, needed.spheres),
            nodes: grow(current.nodes, needed.nodes),
            blas: grow(current.blas, needed.blas),
            instances: grow(current.instances, needed.instances),
        };
        const keys = Object.keys(next) as (keyof RaySceneCapacity)[];
        if (keys.every((k) => next[k] === current[k])) return false;
        this.redescribe(this.getDescriptors(), { ...current, ...next });
        return true;
    }
}
