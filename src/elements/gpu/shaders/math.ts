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
import colliderSurfaceSource from '../wgsl/math/collider_surface.wgsl?raw';
import fluidBoundarySource from '../wgsl/math/fluid_boundary.wgsl?raw';
import surfaceColliderHitSource from '../wgsl/math/surface_collider_hit.wgsl?raw';
import colliderHitSource from '../wgsl/math/collider_hit.wgsl?raw';
import fluidBoundsSource from '../wgsl/math/fluid_bounds.wgsl?raw';
import lcpStateSource from '../wgsl/math/lcp_state.wgsl?raw';
import femSource from '../wgsl/math/fem.wgsl?raw';
import noiseSource from '../wgsl/math/noise.wgsl?raw';
import randomSource from '../wgsl/math/random.wgsl?raw';
import hashAddressSource from '../wgsl/math/hash_address.wgsl?raw';
import basisSource from '../wgsl/math/basis.wgsl?raw';
import samplingSource from '../wgsl/math/sampling.wgsl?raw';
import xformRigidSource from '../wgsl/math/xform_rigid.wgsl?raw';
import xformAffineSource from '../wgsl/math/xform_affine.wgsl?raw';
import xformProjectiveSource from '../wgsl/math/xform_projective.wgsl?raw';
import xformTrsSource from '../wgsl/math/xform_trs.wgsl?raw';
import viewSpaceSource from '../wgsl/math/view_space.wgsl?raw';
import temporalSource from '../wgsl/temporal/temporal.wgsl?raw';
import colorSource from '../wgsl/math/color.wgsl?raw';
import presentSource from '../wgsl/math/present.wgsl?raw';
import bsdfSource from '../wgsl/math/bsdf.wgsl?raw';
import brdfSource from '../wgsl/math/brdf.wgsl?raw';
import mpmMaterialSource from '../wgsl/math/mpm_material.wgsl?raw';
import cameraSource from '../wgsl/math/camera.wgsl?raw';
import finiteSource from '../wgsl/math/finite.wgsl?raw';
import constantsSource from '../wgsl/math/constants.wgsl?raw';
import { LCPSchema } from '../../physics/bodies/schemas/LCPSchema';
import { BoxCollider } from '../../physics/colliders/BoxCollider';
import { PlaneCollider } from '../../physics/colliders/PlaneCollider';
import { MeshCollider } from '../../physics/colliders/MeshCollider';
import { SphereCollider } from '../../physics/colliders/SphereCollider';
import {
    ColliderSetCountsSchema,
    colliderResources,
} from '../../physics/colliders/colliderResources';
import { NONE } from '../../../scene/shaders/engineConstants';
import { RBSimParamsSchema } from '../../physics/schemas/simParams';
import {
    RBBodyCorrectionSchema,
    RBBodyDeltaSchema,
    RBWarmEntrySchema,
} from '../../physics/schemas/simState';

/** Constantes matemáticas canônicas (spec 037): `PI`, `TAU`, `INV_PI`. */
export const constants = wgslModule({ name: 'constants', source: constantsSource });

/**
 * Endereçamento (spec 037): `hash_cell` (Teschner) e `hash_knuth`, sem a redução — a família das tabelas, separada
 * da aleatoriedade.
 */
export const hashAddress = wgslModule({ name: 'hash_address', source: hashAddressSource });

/** Bases ortonormais (spec 037): `basis_duff` e `basis_cross` (com o eixo auxiliar de cada uso). */
export const basis = wgslModule({ name: 'basis', source: basisSource });

/** Amostragem (spec 037): cosseno, esfera, cone e triângulo, de números uniformes em [0, 1)². */
export const sampling = wgslModule({
    name: 'sampling',
    source: samplingSource,
    requires: [constants],
});

/** Teste de valor finito (sem NaN nem ±∞) de `vec3f`/`vec4f` — o saneamento único das saídas de funções e grafos. */
export const finite = wgslModule({ name: 'finite', source: finiteSource });

/** Quaternions: produto, rotação de vetor (e inversa), normalização, integração, Δ de velocidade angular. */
export const quat = wgslModule({ name: 'quat', source: quatSource });

/** Álgebra 3×3: determinante, inversa, transposta, produto, norma de Frobenius. */
export const linalg = wgslModule({ name: 'linalg', source: linalgSource });

/** Construção de matrizes: de quaternion e de colunas, decomposição polar. */
export const mat = wgslModule({ name: 'mat', source: matSource, requires: [quat, linalg] });

/**
 * Transformações por classe (spec 037, R3): a mesma lista de operações em cada uma, escolhida pelo nome na montagem
 * (nunca por ramo em execução). Rígida: `rigid_compose`, `rigid_inverse`, `rigid_rotation_inverse`, `rigid_point`,
 * `rigid_direction`.
 */
export const xformRigid = wgslModule({ name: 'xform_rigid', source: xformRigidSource });

/** Afim: `affine_compose`, `affine_inverse` (singular → identidade), `affine_point`, `affine_direction`, `affine_normal`. */
export const xformAffine = wgslModule({
    name: 'xform_affine',
    source: xformAffineSource,
    requires: [linalg],
});

/** Projetiva: `projective_inverse` (cofatores), `projective_point` (com a divisão por w). */
export const xformProjective = wgslModule({
    name: 'xform_projective',
    source: xformProjectiveSource,
});

/** TRS: `trs_world` (T·R·S) e `trs_normal` (R·S⁻¹, escala 0 anula o eixo). */
export const xformTrs = wgslModule({
    name: 'xform_trs',
    source: xformTrsSource,
    requires: [quat, mat],
});

/** Espaços da tela (spec 037, R4): NDC ↔ uv ↔ pixel, divisão por w, ortográfica, profundidade, movimento. */
export const viewSpace = wgslModule({ name: 'view_space', source: viewSpaceSource });

/**
 * Peças temporais (spec 037, R5): reprojeção de um ponto, corte de câmera, validação por objeto e por plano, pesos por
 * contagem, por mudança (A-SVGF) e por histerese, momentos e variâncias — compostas por cada acumulador.
 */
export const temporal = wgslModule({
    name: 'temporal',
    source: temporalSource,
    requires: [viewSpace],
});

/** Câmera: projeções perspectiva e ortográfica e a vista a partir da matriz de mundo (spec 007). */
export const camera = wgslModule({
    name: 'camera',
    source: cameraSource,
    requires: [viewSpace, xformRigid],
});

/** Funções de distância com sinal (esfera, caixa, plano) e gradientes. */
export const sdf = wgslModule({ name: 'sdf', source: sdfSource });

/** Núcleos de suavização do SPH (spline cúbica, viscosidade). */
export const sphKernels = wgslModule({
    name: 'sph_kernels',
    source: sphKernelsSource,
    requires: [constants],
});

/** Pesos B-spline quadráticos do MPM e índices de nó. */
export const mpmWeights = wgslModule({
    name: 'mpm_weights',
    source: mpmWeightsSource,
    requires: [NONE.module],
});

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
    requires: [hashAddress],
    structs: [RBWarmEntrySchema, RBBodyDeltaSchema, RBBodyCorrectionSchema],
});

/** Tipos de material do MPM (`material_id`). */
export const mpmMaterial = wgslModule({ name: 'mpm_material', source: mpmMaterialSource });

/**
 * Consulta de um colisor de superfície (spec 010): altura ou distância com sinal da cópia do passo corrente; os
 * bindings (`collider_surfaces`, `collider_surface_field`, `collider_step`) são declarados por quem hospeda.
 */
/** Limites do domínio dos fluidos (spec 010): domínio aberto — retirada de quem sai da caixa, sem adesão aos planos. */
export const fluidBounds = wgslModule({ name: 'fluid_bounds', source: fluidBoundsSource });

/** Fronteira genérica de colisão: `ColliderHit` (distância com sinal e normal de mundo). */
export const colliderHit = wgslModule({ name: 'collider_hit', source: colliderHitSource });

export const surfaceColliderHit = wgslModule({
    name: 'surface_collider_hit',
    source: surfaceColliderHitSource,
    requires: [colliderHit, colliderResources.surfaceField],
});

/** Conjunto de colliders (grupo 2, com a malha): pose pelo corpo dono, SDF, push-out de partículas, restrição de nós. */
export const colliderSet = wgslModule({
    name: 'collider_set',
    source: colliderSetSource,
    requires: [
        quat,
        sdf,
        sphKernels,
        surfaceColliderHit,
        fluidBounds,
        NONE.module,
        colliderResources.counts,
        colliderResources.planes,
        colliderResources.boxes,
        colliderResources.spheres,
        colliderResources.owners,
        colliderResources.bodies,
        colliderResources.meshes,
        colliderResources.meshOwners,
        colliderResources.surfaceField,
    ],
    structs: [
        ColliderSetCountsSchema,
        PlaneCollider.schema,
        BoxCollider.schema,
        SphereCollider.schema,
        MeshCollider.schema,
        LCPSchema,
    ],
});

/** A superfície física (`SurfacePhysics`, spec 034) do collider mais próximo de um ponto. */
export const colliderSurface = wgslModule({
    name: 'collider_surface',
    source: colliderSurfaceSource,
    requires: [colliderSet, colliderResources.surfaces],
});

/**
 * Fronteira sólida dos fluidos de partículas (Akinci et al. 2012; spec 034): o volume do núcleo nos colliders e o
 * gradiente dele e o sólido mais próximo. O núcleo do solver é a constante de pipeline `FLUID_BOUNDARY_KERNEL`
 * (`FLUID_BOUNDARY_POLY6` no PBF).
 */
export const fluidBoundary = wgslModule({
    name: 'fluid_boundary',
    source: fluidBoundarySource,
    requires: [colliderSet],
});

/** Constante de pipeline do núcleo poly6 na fronteira sólida (PBF). */
export const FLUID_BOUNDARY_POLY6: Readonly<Record<string, number>> = Object.freeze({
    FLUID_BOUNDARY_KERNEL: 1,
});

/** FEM por XPBD: cinemática do tetraedro (D_s, F, J) e restrições hidrostática e desviadora. */
export const fem = wgslModule({ name: 'fem', source: femSource, requires: [linalg, mat] });

/**
 * Aleatoriedade (spec 037): `pcg_hash`, `hash2`, `hash3`, `hash_signed` (bit a bit), o gerador com estado `random_next`
 * e `random_unit` em [0, 1).
 */
export const random = wgslModule({ name: 'random', source: randomSource });

/** Ruído determinístico: ruído de valor e de gradiente 2D/3D em [-1, 1] sobre o hash PCG. */
export const noise = wgslModule({ name: 'noise', source: noiseSource, requires: [random] });

/** Cor (spec 037): luminância Rec.709, maior canal, YCoCg, curva sRGB, gradação gama, RGB em meia precisão. */
export const color = wgslModule({ name: 'color', source: colorSource });

/** Apresentação (spec 011): AgX, ACES, neutro, sRGB (padrão e estendido) e pontilhamento. */
export const present = wgslModule({ name: 'present', source: presentSource, requires: [color] });

/**
 * Funções físicas de espalhamento (spec 011): GGX iso/aniso, Smith correlacionado, Schlick, F82, Fresnel dielétrico
 * exato, Oren-Nayar energético, sheen, wrap da subsuperfície, filme fino, serrilhado especular e multiespalhamento.
 */
export const bsdf = wgslModule({ name: 'bsdf', source: bsdfSource, requires: [constants] });

/** Sombra por PCF (até 3×3, as amostras da penumbra do mapa; o sombreamento físico está em `bsdf` e no fechamento, spec 011). */
export const brdf = wgslModule({ name: 'brdf', source: brdfSource, requires: [viewSpace] });
