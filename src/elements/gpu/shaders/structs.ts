import { wgslModule } from '../../../scene/shaders/WgslModule';
import colliderDescSource from '../wgsl/structs/collider_desc.wgsl?raw';
import distanceConstraintSource from '../wgsl/structs/distance_constraint.wgsl?raw';
import femSimParamsSource from '../wgsl/structs/fem_sim_params.wgsl?raw';
import mpmGridNodeSource from '../wgsl/structs/mpm_grid_node.wgsl?raw';
import mpmParticleSource from '../wgsl/structs/mpm_particle.wgsl?raw';
import mpmSimParamsSource from '../wgsl/structs/mpm_sim_params.wgsl?raw';
import nsScanLevelSource from '../wgsl/structs/ns_scan_level.wgsl?raw';
import nsSimParamsSource from '../wgsl/structs/ns_sim_params.wgsl?raw';
import particleSource from '../wgsl/structs/particle.wgsl?raw';
import pbfParticleSource from '../wgsl/structs/pbf_particle.wgsl?raw';
import pbfSimParamsSource from '../wgsl/structs/pbf_sim_params.wgsl?raw';
import rbContactSource from '../wgsl/structs/rb_contact.wgsl?raw';
import rbContactStateSource from '../wgsl/structs/rb_contact_state.wgsl?raw';
import rbSimParamsSource from '../wgsl/structs/rb_sim_params.wgsl?raw';
import rigidBodySource from '../wgsl/structs/rigid_body.wgsl?raw';
import simParamsSource from '../wgsl/structs/sim_params.wgsl?raw';
import sphParticleSource from '../wgsl/structs/sph_particle.wgsl?raw';
import sphSimParamsSource from '../wgsl/structs/sph_sim_params.wgsl?raw';
import transformSource from '../wgsl/structs/transform.wgsl?raw';
import worldTransformSource from '../wgsl/structs/world_transform.wgsl?raw';

// Módulos dos arquivos de struct escritos à mão — etapa da migração (spec 005, T015): a US2 os substitui por structs
// gerados dos schemas e remove este arquivo (T041).

/** Structs de `wgsl/structs/collider_desc.wgsl`. */
export const colliderDescStructs = wgslModule({
    name: 'structs/collider_desc',
    source: colliderDescSource,
});
/** Structs de `wgsl/structs/distance_constraint.wgsl`. */
export const distanceConstraintStructs = wgslModule({
    name: 'structs/distance_constraint',
    source: distanceConstraintSource,
});
/** Structs de `wgsl/structs/fem_sim_params.wgsl`. */
export const femSimParamsStructs = wgslModule({
    name: 'structs/fem_sim_params',
    source: femSimParamsSource,
});
/** Structs de `wgsl/structs/mpm_grid_node.wgsl`. */
export const mpmGridNodeStructs = wgslModule({
    name: 'structs/mpm_grid_node',
    source: mpmGridNodeSource,
});
/** Structs de `wgsl/structs/mpm_particle.wgsl`. */
export const mpmParticleStructs = wgslModule({
    name: 'structs/mpm_particle',
    source: mpmParticleSource,
});
/** Structs de `wgsl/structs/mpm_sim_params.wgsl`. */
export const mpmSimParamsStructs = wgslModule({
    name: 'structs/mpm_sim_params',
    source: mpmSimParamsSource,
});
/** Structs de `wgsl/structs/ns_scan_level.wgsl`. */
export const nsScanLevelStructs = wgslModule({
    name: 'structs/ns_scan_level',
    source: nsScanLevelSource,
});
/** Structs de `wgsl/structs/ns_sim_params.wgsl`. */
export const nsSimParamsStructs = wgslModule({
    name: 'structs/ns_sim_params',
    source: nsSimParamsSource,
});
/** Structs de `wgsl/structs/particle.wgsl`. */
export const particleStructs = wgslModule({ name: 'structs/particle', source: particleSource });
/** Structs de `wgsl/structs/pbf_particle.wgsl`. */
export const pbfParticleStructs = wgslModule({
    name: 'structs/pbf_particle',
    source: pbfParticleSource,
});
/** Structs de `wgsl/structs/pbf_sim_params.wgsl`. */
export const pbfSimParamsStructs = wgslModule({
    name: 'structs/pbf_sim_params',
    source: pbfSimParamsSource,
});
/** Structs de `wgsl/structs/rb_contact.wgsl`. */
export const rbContactStructs = wgslModule({ name: 'structs/rb_contact', source: rbContactSource });
/** Structs de `wgsl/structs/rb_contact_state.wgsl`. */
export const rbContactStateStructs = wgslModule({
    name: 'structs/rb_contact_state',
    source: rbContactStateSource,
});
/** Structs de `wgsl/structs/rb_sim_params.wgsl`. */
export const rbSimParamsStructs = wgslModule({
    name: 'structs/rb_sim_params',
    source: rbSimParamsSource,
});
/** Structs de `wgsl/structs/rigid_body.wgsl`. */
export const rigidBodyStructs = wgslModule({ name: 'structs/rigid_body', source: rigidBodySource });
/** Structs de `wgsl/structs/sim_params.wgsl`. */
export const simParamsStructs = wgslModule({ name: 'structs/sim_params', source: simParamsSource });
/** Structs de `wgsl/structs/sph_particle.wgsl`. */
export const sphParticleStructs = wgslModule({
    name: 'structs/sph_particle',
    source: sphParticleSource,
});
/** Structs de `wgsl/structs/sph_sim_params.wgsl`. */
export const sphSimParamsStructs = wgslModule({
    name: 'structs/sph_sim_params',
    source: sphSimParamsSource,
});
/** Structs de `wgsl/structs/transform.wgsl`. */
export const transformStructs = wgslModule({ name: 'structs/transform', source: transformSource });
/** Structs de `wgsl/structs/world_transform.wgsl`. */
export const worldTransformStructs = wgslModule({
    name: 'structs/world_transform',
    source: worldTransformSource,
});
