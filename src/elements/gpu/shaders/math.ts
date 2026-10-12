import { wgslModule } from '../../../scene/shaders/WgslModule';
import quatSource from '../wgsl/math/quat.wgsl?raw';
import matSource from '../wgsl/math/mat.wgsl?raw';
import linalgSource from '../wgsl/math/linalg.wgsl?raw';
import sdfSource from '../wgsl/math/sdf.wgsl?raw';
import sphKernelsSource from '../wgsl/math/sph_kernels.wgsl?raw';
import mpmWeightsSource from '../wgsl/math/mpm_weights.wgsl?raw';
import xpbdSource from '../wgsl/math/xpbd.wgsl?raw';
import lcpSource from '../wgsl/math/lcp.wgsl?raw';
import colliderSetSource from '../wgsl/math/collider_set.wgsl?raw';
import lcpStateSource from '../wgsl/math/lcp_state.wgsl?raw';
import femSource from '../wgsl/math/fem.wgsl?raw';
import noiseSource from '../wgsl/math/noise.wgsl?raw';
import colorSource from '../wgsl/math/color.wgsl?raw';
import brdfSource from '../wgsl/math/brdf.wgsl?raw';
import mpmMaterialSource from '../wgsl/math/mpm_material.wgsl?raw';
import { LCPSchema } from '../../physics/bodies/schemas/LCPSchema';
import { BoxCollider } from '../../physics/colliders/BoxCollider';
import { PlaneCollider } from '../../physics/colliders/PlaneCollider';
import { SphereCollider } from '../../physics/colliders/SphereCollider';
import { ColliderSetCountsSchema } from '../../physics/colliders/ColliderSet';
import { RBSimParamsSchema } from '../../physics/schemas/simParams';
import {
    RBBodyCorrectionSchema,
    RBBodyDeltaSchema,
    RBWarmEntrySchema,
} from '../../physics/schemas/simState';

/** Quaternions: produto, rotação de vetor (e inversa), normalização, integração, Δ de velocidade angular. */
export const quat = wgslModule({ name: 'quat', source: quatSource });

/** Álgebra 3×3: determinante, inversa, transposta, produto, norma de Frobenius. */
export const linalg = wgslModule({ name: 'linalg', source: linalgSource });

/** Construção de matrizes: de quaternion/colunas, TRS, inversa rígida, decomposição polar. */
export const mat = wgslModule({ name: 'mat', source: matSource, requires: [quat, linalg] });

/** Funções de distância com sinal (esfera, caixa, plano) e gradientes. */
export const sdf = wgslModule({ name: 'sdf', source: sdfSource });

/** Núcleos de suavização do SPH (spline cúbica, viscosidade). */
export const sphKernels = wgslModule({ name: 'sph_kernels', source: sphKernelsSource });

/** Pesos B-spline quadráticos do MPM e índices de nó. */
export const mpmWeights = wgslModule({ name: 'mpm_weights', source: mpmWeightsSource });

/** XPBD: Δλ com compliance, correção de posição, massa generalizada de corpo rígido. */
export const xpbd = wgslModule({ name: 'xpbd', source: xpbdSource });

/** LCP: Delassus, viés, passos PGS (normal e atrito), matemática de contato e impulso (atrito de Coulomb). */
export const lcp = wgslModule({
    name: 'lcp',
    source: lcpSource,
    requires: [xpbd],
    structs: [LCPSchema, RBSimParamsSchema],
});

/** Estado dos contatos do LCP: chaves/regiões do warm start e escala do ponto fixo das somas por corpo (com os structs). */
export const lcpState = wgslModule({
    name: 'lcp_state',
    source: lcpStateSource,
    structs: [RBWarmEntrySchema, RBBodyDeltaSchema, RBBodyCorrectionSchema],
});

/** Tipos de material do MPM (`material_id`). */
export const mpmMaterial = wgslModule({ name: 'mpm_material', source: mpmMaterialSource });

/** Conjunto de colliders (grupo 2): pose pelo corpo dono, SDF, push-out de partículas, restrição de nós. */
export const colliderSet = wgslModule({
    name: 'collider_set',
    source: colliderSetSource,
    requires: [quat, sdf],
    structs: [
        ColliderSetCountsSchema,
        PlaneCollider.schema,
        BoxCollider.schema,
        SphereCollider.schema,
        LCPSchema,
    ],
});

/** FEM por XPBD: cinemática do tetraedro (D_s, F, J) e restrições hidrostática e desviadora. */
export const fem = wgslModule({ name: 'fem', source: femSource, requires: [linalg, mat] });

/** Ruído determinístico: hash PCG, ruído de valor e de gradiente 2D/3D em [-1, 1]. */
export const noise = wgslModule({ name: 'noise', source: noiseSource });

/** Cor: exposição, codificação gama, luminância. */
export const color = wgslModule({ name: 'color', source: colorSource });

/** Iluminação: Lambert com ambiente e sombra por PCF 3×3. */
export const brdf = wgslModule({ name: 'brdf', source: brdfSource });
