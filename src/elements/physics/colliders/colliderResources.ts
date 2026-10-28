import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { BoxCollider } from './BoxCollider';
import { MeshCollider } from './MeshCollider';
import { PlaneCollider } from './PlaneCollider';
import { SphereCollider } from './SphereCollider';

/** Contagens dos pools do conjunto de colliders (`ColliderSetCounts` no WGSL). */
export const ColliderSetCountsSchema = new StructSchema('ColliderSetCounts', {
    plane_count: FieldType.u32,
    box_count: FieldType.u32,
    sphere_count: FieldType.u32,
    mesh_count: FieldType.u32,
    surface_count: FieldType.u32,
    /** Início das esferas no mapa de donos comum (`collider_owners`: caixas, depois esferas). */
    sphere_owner_base: FieldType.u32,
    _pad0: FieldType.u32,
    _pad1: FieldType.u32,
    /** Início do campo de cada colisor de superfície no pool (até `MAX_SURFACE_COLLIDERS`, 4 por vetor). */
    surface_first0: FieldType.vec4u,
    surface_first1: FieldType.vec4u,
    surface_first2: FieldType.vec4u,
    surface_first3: FieldType.vec4u,
});

const read = (name: string, type: WgslResourceType): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storage: 'read' },
        type,
        frequency: 'stage',
        provider: 'private',
    });

/**
 * Recursos do conjunto de colliders (spec 031): os pools tipados, os mapas de dono, os corpos donos e o campo das
 * superfícies — fornecidos pelo `ColliderSet` (`sources()`) ao estágio que colide.
 */
export const colliderResources = Object.freeze({
    counts: wgslResource({
        name: 'collider_counts',
        binding: { uniform: true },
        type: { schema: ColliderSetCountsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    planes: read('collider_planes', { schema: PlaneCollider.schema, array: true }),
    boxes: read('collider_boxes', { schema: BoxCollider.schema, array: true }),
    spheres: read('collider_spheres', { schema: SphereCollider.schema, array: true }),
    /** Donos das caixas e das esferas num só mapa (caixas a partir de 0, esferas a partir de `sphere_owner_base`). */
    owners: read('collider_owners', { wgsl: 'u32', array: true }),
    bodies: read('collider_bodies', { schema: LCPSchema, array: true }),
    meshes: read('collider_meshes', { schema: MeshCollider.schema, array: true }),
    meshOwners: read('collider_mesh_owners', { wgsl: 'u32', array: true }),
    surfaceField: read('collider_surface_field', { wgsl: 'f32', array: true }),
    /**
     * A superfície física de cada collider (spec 034): a entrada na tabela das `SurfacePhysics` da cena (0 o padrão,
     * k + 1 a k-ésima), na ordem planos, caixas, esferas, superfícies.
     */
    surfaces: read('collider_surfaces', { wgsl: 'u32', array: true }),
});
