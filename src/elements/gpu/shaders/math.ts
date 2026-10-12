import { wgslModule } from '../../../scene/shaders/WgslModule';
import quatSource from '../wgsl/math/quat.wgsl?raw';
import matSource from '../wgsl/math/mat.wgsl?raw';
import sdfSource from '../wgsl/math/sdf.wgsl?raw';
import sphKernelsSource from '../wgsl/math/sph_kernels.wgsl?raw';
import mpmWeightsSource from '../wgsl/math/mpm_weights.wgsl?raw';
import xpbdSource from '../wgsl/math/xpbd.wgsl?raw';
import contactMathSource from '../wgsl/math/contact_math.wgsl?raw';
import impulseSource from '../wgsl/math/impulse.wgsl?raw';
import lcpSource from '../wgsl/math/lcp.wgsl?raw';
import colliderSetSource from '../wgsl/math/collider_set.wgsl?raw';
import { colliderDescStructs, rbSimParamsStructs, rigidBodyStructs } from './structs';

/** Quaternions: produto, rotação de vetor (e inversa), normalização, integração, Δ de velocidade angular. */
export const quat = wgslModule({ name: 'quat', source: quatSource });

/** Matrizes: de quaternion/colunas, TRS, inversa rígida, operações 3×3. */
export const mat = wgslModule({ name: 'mat', source: matSource });

/** Funções de distância com sinal (esfera, caixa, plano) e gradientes. */
export const sdf = wgslModule({ name: 'sdf', source: sdfSource });

/** Núcleos de suavização do SPH (spline cúbica, viscosidade). */
export const sphKernels = wgslModule({ name: 'sph_kernels', source: sphKernelsSource });

/** Pesos B-spline quadráticos do MPM e índices de nó. */
export const mpmWeights = wgslModule({ name: 'mpm_weights', source: mpmWeightsSource });

/** XPBD: Δλ com compliance, correção de posição, massa generalizada de corpo rígido. */
export const xpbd = wgslModule({ name: 'xpbd', source: xpbdSource });

/** Matemática de contato (tangente ortogonal, Δλ com compliance). */
export const contactMath = wgslModule({ name: 'contact_math', source: contactMathSource });

/** Impulso: velocidade no ponto de contato, correção giroscópica, atrito de Coulomb. */
export const impulse = wgslModule({ name: 'impulse', source: impulseSource });

/** LCP: diagonal de Delassus, viés, passos PGS (normal e atrito). */
export const lcp = wgslModule({
    name: 'lcp',
    source: lcpSource,
    requires: [xpbd, rigidBodyStructs, rbSimParamsStructs],
});

/** Conjunto de colliders (grupo 2): pose pelo corpo dono, SDF, push-out de partículas, restrição de nós. */
export const colliderSet = wgslModule({
    name: 'collider_set',
    source: colliderSetSource,
    requires: [quat, sdf, colliderDescStructs, rigidBodyStructs],
});
