// Spec 005 — Smoke da biblioteca de shaders (FR-018, FR-031, SC-002).
//
// Na GPU real:
//   (a) cada módulo da `wgslLib` compila (montado num kernel de teste);
//   (b) valores de referência de cada módulo batem com a CPU (quaternion, álgebra 3×3, matrizes e decomposição polar,
//       SDF, núcleos SPH, pesos MPM, FEM, ruído, cor, iluminação, XPBD/LCP);
//   (b′) as transformações por classe (rígida, afim, projetiva, TRS) contra a referência f64 (spec 037, R3);
//   (c) para cada schema do motor, um kernel grava sentinelas campo a campo no struct gerado e a CPU confere que cada
//       campo está exatamente no `offsetOf` do schema (layout TS ≡ layout WGSL).
//
// Para rodar: `npm run smoke -- shaderLibrary`. Resultado: `SHADERLIBRARY SMOKE PASSED` ou `FAIL: …`.
import { Application, createScene } from 'clayflow';
import type { StagingBufferSpec, StorageBufferSpec } from 'clayflow';
import { createComputeKernel, destroyComputeKernel } from '../scene/flows/createComputeKernel';
import { wgslModule, type WgslModule } from '../scene/shaders/WgslModule';
import { wgslResource } from '../scene/shaders/WgslResource';

/** Entradas e saída dos kernels de teste da biblioteca (spec 031). */
const caseInput = wgslResource({
    name: 'inp',
    binding: { storage: 'read' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});
const caseOutput = wgslResource({
    name: 'outp',
    binding: { storage: 'read_write' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});
import { FieldType } from '../scene/descriptors/FieldType';
import type { StructSchema } from '../scene/descriptors/StructSchema';
import { wgslLib } from '../elements/gpu/shaders/index';
import * as Bodies from '../elements/physics/bodies/schemas/index';
import { PlaneCollider } from '../elements/physics/colliders/PlaneCollider';
import { BoxCollider } from '../elements/physics/colliders/BoxCollider';
import { SphereCollider } from '../elements/physics/colliders/SphereCollider';
import { MeshCollider } from '../elements/physics/colliders/MeshCollider';
import { ColliderSetCountsSchema } from '../elements/physics/colliders/colliderResources';
import { DistanceConstraint } from '../elements/physics/constraints/DistanceConstraint';
import * as Params from '../elements/physics/schemas/simParams';
import * as State from '../elements/physics/schemas/simState';
import { NsSimParamsSchema } from '../elements/gpu/schemas';
import * as ComputeSchemas from '../elements/gpu/compute/schemas';
import { TransformParamsSchema } from '../elements/scene/flows/TransformParams';
import { Transform } from '../elements/scene/Transform';
import { Camera } from '../elements/scene/Camera';
import { StandardMaterialSchema } from '../elements/material/StandardMaterialSchema';
import { ForwardFrameParamsSchema } from '../elements/material/forwardSchemas';
import { ShadowMap } from '../elements/scene/ShadowMap';
import { ParticleMaterial } from '../elements/physics/materials/ParticleMaterial';
import * as Render from '../presentation/flows/renderSchemas';
import * as bsdfRef from '../elements/material/reference/bsdf';
import * as xf from '../elements/math/reference/xform';
import { luminance as luminanceRec709 } from '../elements/math/reference/color';
import {
    srgbEncode,
    tonemapAces,
    tonemapAgx,
    tonemapNeutral,
} from '../elements/material/reference/tonemap';
import {
    gradientNoise2,
    gradientNoise3,
    valueNoise2,
    valueNoise3,
} from '../elements/nodes/reference/noise';
import { mulberry32 } from './support/random';

function log(msg: string): void {
    console.log(`[shaderLibrary] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];

async function readBuffer(
    app: Application,
    src: StorageBufferSpec,
    byteSize: number,
): Promise<ArrayBuffer> {
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `shaderlib_staging_${src.discriminator}_${byteSize}`,
        byteSize,
    });
    app.core.record('shaderlib-readback', (frame) => {
        frame.copy(src, staging, byteSize);
    });
    app.core.submit();
    const data = await app.core.readback(staging);
    app.core.destroy(staging);
    return data;
}

function storage(app: Application, discriminator: string, byteSize: number): StorageBufferSpec {
    return app.core.create<StorageBufferSpec>({
        kind: 'buffer',
        subkind: 'storage',
        discriminator,
        byteSize,
    });
}

// ── (b) valores de referência ─────────────────────────────────────────────────────────────────────────────────────

type Vec4 = [number, number, number, number];

interface ReferenceCase {
    readonly name: string;
    readonly requires: readonly WgslModule[];
    /** Corpo de `fn eval_case(a: vec4f, b: vec4f) -> vec4f`. */
    readonly body: string;
    readonly input: (r: () => number) => [Vec4, Vec4];
    readonly cpu: (a: Vec4, b: Vec4) => Vec4;
    readonly tol: number;
}

const unitQuat = (r: () => number): Vec4 => {
    const ax = [r() - 0.5, r() - 0.5, r() - 0.5];
    const l = Math.hypot(ax[0]!, ax[1]!, ax[2]!) || 1;
    const ang = (r() - 0.5) * 6;
    const s = Math.sin(ang / 2) / l;
    return [ax[0]! * s, ax[1]! * s, ax[2]! * s, Math.cos(ang / 2)];
};

function rotate(q: Vec4, v: readonly number[]): [number, number, number] {
    const [x, y, z, w] = q;
    const [vx, vy, vz] = v as [number, number, number];
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    return [
        vx + w * tx + (y * tz - z * ty),
        vy + w * ty + (z * tx - x * tz),
        vz + w * tz + (x * ty - y * tx),
    ];
}

const det3 = (c0: number[], c1: number[], c2: number[]): number =>
    c0[0]! * (c1[1]! * c2[2]! - c2[1]! * c1[2]!)
    - c1[0]! * (c0[1]! * c2[2]! - c2[1]! * c0[2]!)
    + c2[0]! * (c0[1]! * c1[2]! - c1[1]! * c0[2]!);

const PI = Math.PI;
const H = 0.1;
function wCubic(r: number, h: number): number {
    const q = r / h;
    const sigma = 1 / (PI * h * h * h);
    if (q < 1) return sigma * (1 - 1.5 * q * q + 0.75 * q * q * q);
    if (q < 2) return sigma * 0.25 * (2 - q) ** 3;
    return 0;
}
const wPoly6 = (rSq: number, h: number): number =>
    rSq >= h * h ? 0 : (315 / (64 * PI * h ** 9)) * (h * h - rSq) ** 3;
const gradSpikyMag = (r: number, h: number): number =>
    r <= 0.0001 || r >= h ? 0 : (45 / (PI * h ** 6)) * (h - r) ** 2;
const lapVisc = (r: number, h: number): number => (r >= h ? 0 : (45 / (PI * h ** 6)) * (h - r));

const CASES: readonly ReferenceCase[] = [
    {
        name: 'quat (rotação de vetor e inversa)',
        requires: [wgslLib.quat],
        body: 'let v = quat_rotate_vec(a, b.xyz); return vec4f(v, length(quat_rotate_vec_inv(a, v) - b.xyz));',
        input: (r) => [unitQuat(r), [r() * 4 - 2, r() * 4 - 2, r() * 4 - 2, 0]],
        cpu: (a, b) => [...rotate(a, b), 0],
        tol: 2e-5,
    },
    {
        name: 'linalg (det, inversa, Frobenius)',
        requires: [wgslLib.linalg],
        body: `let m = mat3x3f(a.xyz, b.xyz, vec3f(a.w, b.w, 1.5));
            let e = mat3_mul(m, mat3_inverse(m)) - mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
            return vec4f(mat3_det(m), mat3_frobenius_norm(m), mat3_frobenius_norm(e), mat3_det(mat3_transpose(m)) - mat3_det(m));`,
        input: (r) => [
            [1 + r(), r() - 0.5, r() - 0.5, r() - 0.5],
            [r() - 0.5, 1 + r(), r() - 0.5, r() - 0.5],
        ],
        cpu: (a, b) => {
            const c2 = [a[3], b[3], 1.5];
            const d = det3([a[0], a[1], a[2]], [b[0], b[1], b[2]], c2);
            const fro = Math.hypot(a[0], a[1], a[2], b[0], b[1], b[2], ...c2);
            return [d, fro, 0, 0];
        },
        tol: 1e-4,
    },
    {
        name: 'mat (de quaternion; decomposição polar com partida a quente recupera a rotação)',
        requires: [wgslLib.mat],
        // A decomposição polar é iterativa (6 passos por chamada) e parte da estimativa anterior, como no shape
        // matching de quadro a quadro: oito chamadas encadeadas a partir da identidade.
        body: `let r = mat3_from_quat(a);
            let s = mat3x3f(vec3f(1.5, 0.0, 0.0), vec3f(0.0, 0.7, 0.0), vec3f(0.0, 0.0, 1.2));
            var q = vec4f(0.0, 0.0, 0.0, 1.0);
            for (var i = 0u; i < 8u; i++) { q = polar_decomp_quaternion(mat3_mul(r, s), q); }
            let v = mat3_from_quat(q) * b.xyz;
            return vec4f(r * b.xyz - quat_rotate_vec(a, b.xyz), length(v - r * b.xyz));`,
        input: (r) => {
            const ax = [r() - 0.5, r() - 0.5, r() - 0.5];
            const l = Math.hypot(ax[0]!, ax[1]!, ax[2]!) || 1;
            const half = (r() * 2 - 1) * 0.5; // ângulo em [-1, 1] rad
            const k = Math.sin(half) / l;
            return [
                [ax[0]! * k, ax[1]! * k, ax[2]! * k, Math.cos(half)],
                [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, 0],
            ];
        },
        cpu: () => [0, 0, 0, 0],
        tol: 2e-4,
    },
    {
        name: 'sdf (esfera, caixa, plano)',
        requires: [wgslLib.sdf],
        body: 'return vec4f(sdf_sphere(a.xyz, 0.5), sdf_box(a.xyz, vec3f(0.3, 0.4, 0.5)), sdf_plane(a.xyz, vec3f(0.0, 1.0, 0.0), 0.25), 0.0);',
        input: (r) => [
            [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, 0],
            [0, 0, 0, 0],
        ],
        cpu: (a) => {
            const q = [Math.abs(a[0]) - 0.3, Math.abs(a[1]) - 0.4, Math.abs(a[2]) - 0.5];
            const box =
                Math.hypot(...q.map((x) => Math.max(x, 0)))
                + Math.min(Math.max(q[0]!, q[1]!, q[2]!), 0);
            return [Math.hypot(a[0], a[1], a[2]) - 0.5, box, a[1] - 0.25, 0];
        },
        tol: 1e-5,
    },
    {
        name: 'sph_kernels (cúbica, poly6, spiky, viscosidade)',
        requires: [wgslLib.sphKernels],
        body: `let r = a.x;
            return vec4f(W_cubic(r, ${H}), W_poly6(r * r, ${H}), length(grad_W_spiky(vec3f(r, 0.0, 0.0), r, ${H})), laplacian_W_visc(r, ${H}));`,
        input: (r) => [
            [r() * 0.22, 0, 0, 0],
            [0, 0, 0, 0],
        ],
        cpu: (a) => [
            wCubic(a[0], H),
            wPoly6(a[0] * a[0], H),
            gradSpikyMag(a[0], H),
            lapVisc(a[0], H),
        ],
        tol: 5e-5, // relativo à escala (~10⁵) dos núcleos com h = 0,1 — ver comparação relativa abaixo
    },
    {
        name: 'mpm_weights (partição da unidade)',
        requires: [wgslLib.mpmWeights],
        body: `var w: array<vec3f, 3>;
            var dw: array<vec3f, 3>;
            mpm_compute_weights(a.xyz, 10.0, &w, &dw);
            var sw = 0.0;
            var sg = vec3f(0.0);
            for (var i = 0u; i < 3u; i++) { for (var j = 0u; j < 3u; j++) { for (var k = 0u; k < 3u; k++) {
                sw += mpm_weight_3d(&w, i, j, k);
                sg += mpm_grad_3d(&w, &dw, i, j, k);
            } } }
            return vec4f(sw, sg);`,
        input: (r) => [
            [0.5 + r(), 0.5 + r(), 0.5 + r(), 0],
            [0, 0, 0, 0],
        ],
        cpu: () => [1, 0, 0, 0],
        tol: 1e-5,
    },
    {
        name: 'fem (J de tetraedro escalado; gradientes somam zero)',
        requires: [wgslLib.fem],
        body: `let s = a.x;
            let dm_inv = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
            let ds = compute_Ds(vec3f(0.0), vec3f(s, 0.0, 0.0), vec3f(0.0, s, 0.0), vec3f(0.0, 0.0, s));
            let f = compute_F(ds, dm_inv);
            let j = compute_J(f);
            let g1 = grad_hydrostatic(f, j, vec3f(1.0, 0.0, 0.0));
            let g2 = grad_hydrostatic(f, j, vec3f(0.0, 1.0, 0.0));
            let g3 = grad_hydrostatic(f, j, vec3f(0.0, 0.0, 1.0));
            let g0 = grad_node0(g1, g2, g3);
            return vec4f(j, length(g0 + g1 + g2 + g3), fem_delta_lambda(0.5, 2.0, 0.0, 0.0), 0.0);`,
        input: (r) => [
            [0.5 + r(), 0, 0, 0],
            [0, 0, 0, 0],
        ],
        cpu: (a) => [a[0] ** 3, 0, -0.25, 0],
        tol: 1e-4,
    },
    {
        name: 'noise (valor e gradiente 2D/3D)',
        requires: [wgslLib.noise],
        body: 'return vec4f(value_noise2(a.xy), value_noise3(a.xyz), gradient_noise2(a.xy), gradient_noise3(a.xyz));',
        input: (r) => [
            [r() * 40 - 20, r() * 40 - 20, r() * 40 - 20, 0],
            [0, 0, 0, 0],
        ],
        cpu: (a) => [
            valueNoise2(a[0], a[1]),
            valueNoise3(a[0], a[1], a[2]),
            gradientNoise2(a[0], a[1]),
            gradientNoise3(a[0], a[1], a[2]),
        ],
        tol: 2e-5,
    },
    {
        name: 'color (gama, luminância)',
        requires: [wgslLib.color],
        body: 'return vec4f(grade_gamma(a.xyz, 2.2).x, grade_gamma(a.xyz, 2.2).y, luminance(a.xyz), 0.0);',
        input: (r) => [
            [r() * 2, r(), r(), 0],
            [0, 0, 0, 0],
        ],
        cpu: (a) => [a[0] ** (1 / 2.2), a[1] ** (1 / 2.2), luminanceRec709([a[0], a[1], a[2]]), 0],
        tol: 2e-5,
    },
    {
        // Spec 011: os operadores da apresentação contra a referência de CPU (a cor de entrada em HDR, até 64).
        name: 'present (AgX, ACES, neutro, sRGB)',
        requires: [wgslLib.present],
        body: `let c = a.xyz;
            return vec4f(tonemap_agx(c).y, tonemap_aces(c).x, tonemap_neutral(c).z, srgb_encode(b.xyz).x);`,
        input: (r) => [
            [Math.pow(2, r() * 12 - 6), Math.pow(2, r() * 12 - 6), Math.pow(2, r() * 12 - 6), 0],
            [r(), 0, 0, 0],
        ],
        cpu: (a, b) => [
            tonemapAgx([a[0], a[1], a[2]])[1],
            tonemapAces([a[0], a[1], a[2]])[0],
            tonemapNeutral([a[0], a[1], a[2]])[2],
            srgbEncode(b[0]),
        ],
        tol: 2e-4,
    },
    {
        // Spec 011: as funções físicas contra a referência de CPU (a = n·h, n·v, n·l, rugosidade; b = cos, espessura).
        name: 'bsdf (GGX, Smith, F82, Charlie)',
        requires: [wgslLib.bsdf],
        body: `let a2 = bsdf_alpha2(a.w);
            return vec4f(
                bsdf_d_ggx(a.x, a2),
                bsdf_v_smith_correlated(a.y, a.z, a2),
                bsdf_f82(vec3f(0.9, 0.6, 0.3), vec3f(0.5, 0.8, 1.0), b.x).y,
                bsdf_d_charlie(a.x, max(a.w, 0.2)),
            );`,
        input: (r) => [
            [0.3 + 0.7 * r(), 0.1 + 0.9 * r(), 0.1 + 0.9 * r(), 0.1 + 0.9 * r()],
            [r(), 0, 0, 0],
        ],
        cpu: (a, b) => {
            const a2 = bsdfRef.alpha2Of(a[3]);
            return [
                bsdfRef.dGgx(a[0], a2),
                bsdfRef.vSmithCorrelated(a[1], a[2], a2),
                bsdfRef.f82([0.9, 0.6, 0.3], [0.5, 0.8, 1], b[0])[1],
                bsdfRef.dCharlie(a[0], Math.max(a[3], 0.2)),
            ];
        },
        tol: 2e-3,
    },
    {
        // Spec 011: difuso energético, wrap da subsuperfície, filme fino e Fresnel exato contra a referência de CPU.
        name: 'bsdf (Oren-Nayar energético, wrap, filme fino, Fresnel)',
        requires: [wgslLib.bsdf],
        body: `return vec4f(
                bsdf_oren_nayar_energy(vec3f(0.8), a.w, a.x, a.y, a.z).x,
                bsdf_burley_wrap(vec3f(0.9), vec3f(0.5), a.x - 0.3).x,
                bsdf_thin_film(b.x, 300.0 + 400.0 * b.y, 1.3, vec3f(0.04)).y,
                bsdf_f_dielectric(b.x, 1.5),
            );`,
        input: (r) => {
            const nl = 0.1 + 0.9 * r();
            const nv = 0.1 + 0.9 * r();
            return [
                [nl, nv, nl * nv - 0.2 * r(), r()],
                [0.05 + 0.95 * r(), r(), 0, 0],
            ];
        },
        cpu: (a, b) => [
            bsdfRef.orenNayarEnergy([0.8, 0.8, 0.8], a[3], a[0], a[1], a[2])[0],
            bsdfRef.burleyWrap([0.9, 0.9, 0.9], [0.5, 0.5, 0.5], a[0] - 0.3)[0],
            bsdfRef.thinFilm(b[0], 300 + 400 * b[1], 1.3, [0.04, 0.04, 0.04])[1],
            bsdfRef.fDielectric(b[0], 1.5),
        ],
        tol: 2e-3,
    },
    {
        // Spec 007: projeções do estágio de câmera (clip z em [0, 1]).
        name: 'camera (perspectiva e ortográfica)',
        requires: [wgslLib.camera],
        body: `let p = camera_perspective(a.x, a.y, a.z, a.w);
            let o = camera_orthographic(b.x, b.y, b.z, b.w);
            return vec4f(p[0].x, p[2].z, p[3].z, o[2].z + o[3].z);`,
        input: (r) => [
            [0.3 + r(), 0.5 + r(), 0.05 + r() * 0.1, 50 + r() * 100],
            [1 + r() * 10, 0.5 + r(), 0.05 + r() * 0.1, 50 + r() * 100],
        ],
        cpu: (a, b) => {
            const f = 1 / Math.tan(a[0] / 2);
            const nf = 1 / (a[2] - a[3]);
            const onf = 1 / (b[2] - b[3]);
            return [f / a[1], a[3] * nf, a[3] * a[2] * nf, onf + b[2] * onf];
        },
        tol: 2e-4,
    },
    {
        // Spec 007: a vista da câmera é a inversa rígida da matriz de mundo; −Rᵀ·t na translação.
        name: 'mat (inversa rígida: translação −Rᵀ·t)',
        requires: [wgslLib.xformTrs, wgslLib.xformRigid],
        body: `let m = trs_world(b.xyz, normalize(a), vec3f(1.0));
            let inv = rigid_inverse(m);
            return inv[3];`,
        input: (r) => [
            [r() - 0.5, r() - 0.5, r() - 0.5, r() + 0.1],
            [r() * 10 - 5, r() * 10 - 5, r() * 10 - 5, 0],
        ],
        cpu: (a, b) => {
            const l = Math.hypot(a[0], a[1], a[2], a[3]);
            const [x, y, z, w] = [a[0] / l, a[1] / l, a[2] / l, a[3] / l];
            // Colunas de R (trs_world sem escala); translação da inversa = −(coluna i · t).
            const c0 = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
            const c1 = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
            const c2 = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
            const dot = (c: number[]) => c[0]! * b[0] + c[1]! * b[1] + c[2]! * b[2];
            return [-dot(c0), -dot(c1), -dot(c2), 1];
        },
        tol: 2e-5,
    },
    {
        // Spec 007: a matriz luz-vista-projeção do estágio de sombra (a conta que saiu da CPU do ShadowFlow): olho a
        // 10 m contra a direção da luz mirando a origem, ortográfica ±10 com clip z em [0, 1]; aplicada a um ponto.
        name: 'camera (look-at e ortográfica de caixa da sombra)',
        requires: [wgslLib.camera],
        body: `let view = camera_look_at(-a.xyz * 10.0, vec3f(0.0), vec3f(0.0, 1.0, 0.0));
            let proj = camera_orthographic_box(-10.0, 10.0, -10.0, 10.0, 0.1, 50.0);
            return proj * view * vec4f(b.xyz, 1.0);`,
        input: (r) => [
            [r() - 0.5, -0.5 - r(), r() - 0.5, 0],
            [r() * 10 - 5, r() * 10 - 5, r() * 10 - 5, 1],
        ],
        cpu: (a, b) => {
            const e = [-a[0] * 10, -a[1] * 10, -a[2] * 10];
            const zl = Math.hypot(e[0]!, e[1]!, e[2]!) || 1;
            const z = [e[0]! / zl, e[1]! / zl, e[2]! / zl];
            const xv = [z[2]!, 0, -z[0]!]; // (0, 1, 0) × z
            const xl = Math.hypot(xv[0]!, xv[1]!, xv[2]!) || 1;
            const x = [xv[0]! / xl, 0, xv[2]! / xl];
            const y = [
                z[1]! * x[2]! - z[2]! * x[1]!,
                z[2]! * x[0]! - z[0]! * x[2]!,
                z[0]! * x[1]! - z[1]! * x[0]!,
            ];
            const d = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
            const p = [b[0], b[1], b[2]];
            const vx = d(x, p) - d(x, e);
            const vy = d(y, p) - d(y, e);
            const vz = d(z, p) - d(z, e);
            const [n, f] = [0.1, 50];
            return [vx / 10, vy / 10, vz / (n - f) + n / (n - f), 1];
        },
        tol: 2e-5,
    },
    {
        name: 'xpbd e lcp (Δλ, massa generalizada, atrito)',
        requires: [wgslLib.xpbd, wgslLib.lcp],
        body: `return vec4f(xpbd_delta_lambda(a.x, a.y, a.z), rigid_generalized_mass(b.xyz, vec3f(0.0, 1.0, 0.0), 2.0, vec3f(1.0, 2.0, 3.0)),
                coulomb_clamp(a.w, b.w, 0.5), combine_mu(a.x, a.y));`,
        input: (r) => [
            [r() * 2 - 1, 0.5 + r(), r() * 0.1, r() * 3],
            [r() - 0.5, r() - 0.5, r() - 0.5, r() * 4 - 2],
        ],
        cpu: (a, b) => {
            const rxn = [-b[2], 0, b[0]]; // r × (0, 1, 0)
            const mass = 2 + rxn[0]! ** 2 * 1 + rxn[1]! ** 2 * 2 + rxn[2]! ** 2 * 3;
            const mu = a[0] > 0 && a[1] > 0 ? Math.sqrt(a[0] * a[1]) : Math.max(a[0], a[1]);
            return [-a[0] / (a[1] + a[2]), mass, Math.min(a[3], 0.5 * Math.abs(b[3])), mu];
        },
        tol: 2e-5,
    },
];

const N = 256;

async function runReference(app: Application, c: ReferenceCase, index: number): Promise<void> {
    const r = mulberry32(1000 + index);
    const inputs = Array.from({ length: N }, () => c.input(r));
    const inData = new Float32Array(N * 8);
    inputs.forEach(([a, b], i) => {
        inData.set(a, i * 8);
        inData.set(b, i * 8 + 4);
    });
    const inBuf = storage(app, `shaderlib_in_${index}`, inData.byteLength);
    const outBuf = storage(app, `shaderlib_out_${index}`, N * 16);
    app.core.write(inBuf, inData);
    const module = wgslModule({
        name: `shaderlib_case_${index}`,
        requires: [...c.requires, caseInput, caseOutput],
        source: `
fn eval_case(a: vec4f, b: vec4f) -> vec4f {
    ${c.body}
}
@compute @workgroup_size(64)
fn test_main(@builtin(global_invocation_id) g: vec3u) {
    if (g.x >= ${N}u) { return; }
    outp[g.x] = eval_case(inp[2u * g.x], inp[2u * g.x + 1u]);
}`,
    });
    const kernel = createComputeKernel(app.core, {
        discriminator: `shaderlib_case_${index}`,
        shader: module,
        entryPoint: 'test_main',
        bindings: new Map([
            [caseInput, inBuf],
            [caseOutput, outBuf],
        ]),
    });
    app.core.record('shaderlib-case', (frame) => {
        frame.compute('shaderlib.case', (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            pass.dispatch.invocations(N, 64);
        });
    });
    app.core.submit();
    const out = new Float32Array(await readBuffer(app, outBuf, N * 16));
    let worst = 0;
    for (let i = 0; i < N; i++) {
        const [a, b] = inputs[i]!;
        const expected = c.cpu(a, b);
        for (let k = 0; k < 4; k++) {
            const got = out[i * 4 + k]!;
            const exp = expected[k]!;
            // Erro relativo à escala do valor (núcleos SPH chegam a 10⁵); absoluto perto de zero.
            const err = Math.abs(got - exp) / Math.max(1, Math.abs(exp));
            worst = Math.max(worst, Number.isNaN(err) ? Infinity : err);
        }
    }
    log(`(b) ${c.name}: erro máximo ${worst.toExponential(2)}`);
    if (!(worst <= c.tol)) failures.push(`(b) ${c.name}: erro ${worst} > ${c.tol}`);
    destroyComputeKernel(app.core, kernel);
}

// ── (b′) transformações por classe contra a referência f64 (spec 037, R3) ─────────────────────────────────────────
// Cada caso recebe uma matriz 4×4 e dois vec4 (as entradas já arredondadas a f32, as mesmas que a referência usa) e
// devolve uma 4×4. Erro por componente em ulp da maior componente esperada (o arredondamento da escala do resultado).

interface XformCase {
    readonly name: string;
    readonly requires: readonly WgslModule[];
    /** Corpo de `fn eval_xform(m: mat4x4f, a: vec4f, b: vec4f) -> mat4x4f`. */
    readonly body: string;
    readonly input: (r: () => number) => { m: number[]; a: Vec4; b: Vec4 };
    readonly cpu: (m: number[], a: Vec4, b: Vec4) => number[];
    /** Erro máximo em ulp (rígida e TRS) ou relativo à maior componente (afim e projetiva). */
    readonly tol: { ulp: number } | { relative: number };
}

/**
 * Tolerância relativa da afim e da projetiva (spec 037, R3): o limite do erro de uma inversa calculada em f32 é κ·u, com
 * o número de condição κ ≤ 1e3 dos casos e u = 2⁻²⁴ o arredondamento unitário do f32 — 6e-5. Nenhuma conta em f32 faz
 * melhor que isso no pior caso (a mesma conta já era a dos nós de espaço).
 */
const AFFINE_TOL = 1e3 * 2 ** -24;

const f32 = (v: number[]): number[] => v.map(Math.fround);
const f32v = (v: number[]): Vec4 => f32(v) as Vec4;
const quatOf = (r: () => number): Vec4 => f32v([...unitQuat(r)]);
const vecIn = (r: () => number, lo: number, hi: number): number[] =>
    [0, 1, 2].map(() => lo + (hi - lo) * r());
/** Rotação · escala (número de condição até ~1e3) · rotação, mais translação: uma afim geral. */
function generalAffine(r: () => number): number[] {
    const a = xf.quatMatrix(unitQuat(r));
    const b = xf.quatMatrix(unitQuat(r));
    const s = [0, 1, 2].map(() => Math.pow(10, r() * 3 - 1.5) * (r() < 0.25 ? -1 : 1));
    const sb = b.map((v, k) => v * s[k % 3]!);
    const l = [0, 1, 2].flatMap((c) =>
        [0, 1, 2].map(
            (row) =>
                a[row]! * sb[3 * c]! + a[3 + row]! * sb[3 * c + 1]! + a[6 + row]! * sb[3 * c + 2]!,
        ),
    );
    return f32(xf.mat4FromAffine(l, vecIn(r, -3, 3) as unknown as xf.Vec3));
}
const asPoint = (p: readonly number[]): number[] => [
    p[0]!,
    p[1]!,
    p[2]!,
    0,
    ...new Array<number>(12).fill(0),
];
const cols3 = (m: readonly number[]): number[] => [
    m[0]!,
    m[1]!,
    m[2]!,
    0,
    m[3]!,
    m[4]!,
    m[5]!,
    0,
    m[6]!,
    m[7]!,
    m[8]!,
    0,
    0,
    0,
    0,
    0,
];
const MAT_OUT = 'mat4x4f(vec4f(o, 0.0), vec4f(0.0), vec4f(0.0), vec4f(0.0))';

const XFORM_CASES: readonly XformCase[] = [
    {
        name: 'rígida (inversa)',
        requires: [wgslLib.xformRigid],
        body: 'return rigid_inverse(m);',
        input: (r) => {
            const m = f32(
                xf.trsWorld(vecIn(r, -3, 3) as unknown as xf.Vec3, unitQuat(r), [1, 1, 1]),
            );
            return { m, a: [0, 0, 0, 0], b: [0, 0, 0, 0] };
        },
        cpu: (m) => xf.rigidInverse(m),
        tol: { ulp: 4 },
    },
    {
        name: 'rígida (compor, ponto, direção)',
        requires: [wgslLib.xformRigid],
        body: `let c = rigid_compose(m, rigid_inverse(m));
            return mat4x4f(vec4f(rigid_point(m, a.xyz), 0.0), vec4f(rigid_direction(m, a.xyz), 0.0), c[3], vec4f(0.0));`,
        input: (r) => ({
            m: f32(xf.trsWorld(vecIn(r, -3, 3) as unknown as xf.Vec3, unitQuat(r), [1, 1, 1])),
            a: f32v([...vecIn(r, -2, 2), 0]),
            b: [0, 0, 0, 0],
        }),
        cpu: (m, a) => {
            const p = xf.affinePoint(m, [a[0], a[1], a[2]]);
            const d = xf.affineDirection(m, [a[0], a[1], a[2]]);
            return [...p, 0, ...d, 0, 0, 0, 0, 1, 0, 0, 0, 0];
        },
        tol: { ulp: 4 },
    },
    {
        name: 'afim (inversa, κ ≤ 1e3)',
        requires: [wgslLib.xformAffine],
        body: 'return affine_inverse(m);',
        input: (r) => ({ m: generalAffine(r), a: [0, 0, 0, 0], b: [0, 0, 0, 0] }),
        cpu: (m) => xf.affineInverse(m),
        tol: { relative: AFFINE_TOL },
    },
    {
        name: 'afim (normal, ponto, direção)',
        requires: [wgslLib.xformAffine],
        body: `let n = affine_normal(m);
            return mat4x4f(vec4f(n[0], 0.0), vec4f(n[1], 0.0), vec4f(n[2], 0.0), vec4f(affine_point(m, a.xyz) - affine_direction(m, a.xyz), 0.0));`,
        input: (r) => ({ m: generalAffine(r), a: f32v([...vecIn(r, -2, 2), 0]), b: [0, 0, 0, 0] }),
        cpu: (m, a) => {
            const n = xf.affineNormal(m);
            const p = xf.affinePoint(m, [a[0], a[1], a[2]]);
            const d = xf.affineDirection(m, [a[0], a[1], a[2]]);
            return [...cols3(n).slice(0, 12), p[0] - d[0], p[1] - d[1], p[2] - d[2], 0];
        },
        tol: { relative: AFFINE_TOL },
    },
    {
        name: 'afim (singular → identidade)',
        requires: [wgslLib.xformAffine],
        body: 'return affine_inverse(mat4x4f(m[0], vec4f(0.0), m[2], m[3]));',
        input: (r) => ({ m: generalAffine(r), a: [0, 0, 0, 0], b: [0, 0, 0, 0] }),
        cpu: () => [...xf.MAT4_IDENTITY],
        tol: { relative: 0 },
    },
    {
        name: 'projetiva (inversa: o ponto reprojetado volta)',
        requires: [wgslLib.xformProjective],
        body: `let o = projective_point(projective_inverse(m), projective_point(m, a.xyz));
            return ${MAT_OUT};`,
        input: (r) => {
            const f = 1 / Math.tan((0.3 + r() * 0.9) / 2);
            const aspect = 0.5 + r() * 1.5;
            const near = 0.05 + r() * 0.45;
            const far = 20 + r() * 80;
            const nf = 1 / (near - far);
            const proj = [
                f / aspect,
                0,
                0,
                0,
                0,
                f,
                0,
                0,
                0,
                0,
                far * nf,
                -1,
                0,
                0,
                near * far * nf,
                0,
            ];
            const view = xf.trsWorld(vecIn(r, -3, 3) as unknown as xf.Vec3, unitQuat(r), [1, 1, 1]);
            const m = f32(xf.mat4Multiply(proj, xf.rigidInverse(view)));
            // Um ponto à frente da câmera (entre 1 e 15 unidades).
            const local = [r() * 2 - 1, r() * 2 - 1, -(1 + r() * 14)];
            const p = xf.affinePoint(view, local as unknown as xf.Vec3);
            return { m, a: f32v([...p, 0]), b: [0, 0, 0, 0] };
        },
        cpu: (_m, a) => asPoint(a),
        tol: { relative: AFFINE_TOL },
    },
    {
        name: 'TRS (mundo e normal)',
        requires: [wgslLib.xformTrs],
        body: `let w = trs_world(m[0].xyz, a, b.xyz);
            let n = trs_normal(a, b.xyz);
            return mat4x4f(w[0] + vec4f(0.0, 0.0, 0.0, n[0].x), w[1] + vec4f(0.0, 0.0, 0.0, n[0].y), w[2] + vec4f(0.0, 0.0, 0.0, n[0].z), w[3]);`,
        input: (r) => ({
            m: f32([...vecIn(r, -3, 3), 0, ...new Array<number>(12).fill(0)]),
            a: quatOf(r),
            b: f32v([...vecIn(r, 0.5, 2), 0]),
        }),
        cpu: (m, a, b) => {
            const w = xf.trsWorld([m[0]!, m[1]!, m[2]!], a, [b[0], b[1], b[2]]);
            const n = xf.trsNormal(a, [b[0], b[1], b[2]]);
            return [
                w[0]!,
                w[1]!,
                w[2]!,
                n[0]!,
                w[4]!,
                w[5]!,
                w[6]!,
                n[1]!,
                w[8]!,
                w[9]!,
                w[10]!,
                n[2]!,
                ...w.slice(12),
            ];
        },
        tol: { ulp: 4 },
    },
];

const ulpOf = (x: number): number =>
    x === 0 ? 2 ** -149 : 2 ** (Math.floor(Math.log2(Math.abs(x))) - 23);

async function runXform(app: Application, c: XformCase, index: number): Promise<void> {
    const r = mulberry32(2000 + index);
    const inputs = Array.from({ length: N }, () => c.input(r));
    const inData = new Float32Array(N * 24);
    inputs.forEach(({ m, a, b }, i) => {
        inData.set(m, i * 24);
        inData.set(a, i * 24 + 16);
        inData.set(b, i * 24 + 20);
    });
    const inBuf = storage(app, `shaderlib_xin_${index}`, inData.byteLength);
    const outBuf = storage(app, `shaderlib_xout_${index}`, N * 64);
    app.core.write(inBuf, inData);
    const module = wgslModule({
        name: `shaderlib_xform_${index}`,
        requires: [...c.requires, caseInput, caseOutput],
        source: `
fn eval_xform(m: mat4x4f, a: vec4f, b: vec4f) -> mat4x4f {
    ${c.body}
}
@compute @workgroup_size(64)
fn test_main(@builtin(global_invocation_id) g: vec3u) {
    if (g.x >= ${N}u) { return; }
    let k = 6u * g.x;
    let o = eval_xform(mat4x4f(inp[k], inp[k + 1u], inp[k + 2u], inp[k + 3u]), inp[k + 4u], inp[k + 5u]);
    for (var c = 0u; c < 4u; c++) { outp[4u * g.x + c] = o[c]; }
}`,
    });
    const kernel = createComputeKernel(app.core, {
        discriminator: `shaderlib_xform_${index}`,
        shader: module,
        entryPoint: 'test_main',
        bindings: new Map([
            [caseInput, inBuf],
            [caseOutput, outBuf],
        ]),
    });
    app.core.record('shaderlib-xform', (frame) => {
        frame.compute('shaderlib.xform', (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            pass.dispatch.invocations(N, 64);
        });
    });
    app.core.submit();
    const out = new Float32Array(await readBuffer(app, outBuf, N * 64));
    let worst = 0;
    for (let i = 0; i < N; i++) {
        const { m, a, b } = inputs[i]!;
        const expected = c.cpu(m, a, b);
        const scale = Math.max(...expected.map(Math.abs));
        for (let k = 0; k < 16; k++) {
            const d = Math.abs(out[i * 16 + k]! - expected[k]!);
            const err = 'ulp' in c.tol ? d / ulpOf(scale) : d / Math.max(scale, 1e-30);
            worst = Math.max(worst, Number.isNaN(err) ? Infinity : err);
        }
    }
    const limit = 'ulp' in c.tol ? c.tol.ulp : c.tol.relative;
    const unit = 'ulp' in c.tol ? ' ulp' : ' (relativo)';
    log(`(b′) ${c.name}: erro máximo ${worst.toExponential(2)}${unit}`);
    if (!(worst <= limit)) failures.push(`(b′) ${c.name}: erro ${worst}${unit} > ${limit}`);
    destroyComputeKernel(app.core, kernel);
}

// ── (c) layout dos schemas na GPU ─────────────────────────────────────────────────────────────────────────────────

interface Probe {
    readonly offset: number;
    readonly value: number;
    readonly view: 'f32' | 'u32' | 'i32';
}

const ELEMENT: Partial<
    Record<
        FieldType,
        { readonly n: number; readonly view: 'f32' | 'u32' | 'i32'; readonly cols?: number }
    >
> = {
    f32: { n: 1, view: 'f32' },
    vec2f: { n: 2, view: 'f32' },
    vec3f: { n: 3, view: 'f32' },
    vec4f: { n: 4, view: 'f32' },
    mat3x3f: { n: 3, view: 'f32', cols: 3 },
    mat4x4f: { n: 4, view: 'f32', cols: 4 },
    u32: { n: 1, view: 'u32' },
    vec2u: { n: 2, view: 'u32' },
    vec3u: { n: 3, view: 'u32' },
    vec4u: { n: 4, view: 'u32' },
    i32: { n: 1, view: 'i32' },
    vec2i: { n: 2, view: 'i32' },
    vec3i: { n: 3, view: 'i32' },
    vec4i: { n: 4, view: 'i32' },
    atomicU32: { n: 1, view: 'u32' },
    atomicI32: { n: 1, view: 'i32' },
};

/** WGSL que grava sentinelas em cada campo de `outp[0]` e as sondas esperadas. */
function probeProgram(schema: StructSchema): { wgsl: string; probes: Probe[] } {
    const lines: string[] = [];
    const probes: Probe[] = [];
    let field = 0;
    for (const [name, type] of schema.fields) {
        field++;
        if (typeof type !== 'string')
            throw new Error(`${schema.name}.${name}: campo composto fora da sonda`);
        const info = ELEMENT[type];
        if (info === undefined) throw new Error(`${schema.name}.${name}: tipo ${type} sem sonda`);
        const base = schema.offsetOf(name);
        const value = (col: number, row: number): number => field * 100 + col * 10 + row + 1;
        const lit = (v: number): string =>
            info.view === 'f32' ? `${v}.0` : info.view === 'u32' ? `${v}u` : `${v}i`;
        if (type === FieldType.atomicU32 || type === FieldType.atomicI32) {
            lines.push(`atomicStore(&outp[0].${name}, ${lit(value(0, 0))});`);
            probes.push({ offset: base, value: value(0, 0), view: info.view });
            continue;
        }
        const cols = info.cols ?? 1;
        const parts: string[] = [];
        for (let c = 0; c < cols; c++) {
            const comps: string[] = [];
            for (let r = 0; r < info.n; r++) {
                comps.push(lit(value(c, r)));
                probes.push({ offset: base + c * 16 + r * 4, value: value(c, r), view: info.view });
            }
            parts.push(
                info.n === 1
                    ? comps[0]!
                    : `vec${info.n}${info.view === 'f32' ? 'f' : info.view === 'u32' ? 'u' : 'i'}(${comps.join(', ')})`,
            );
        }
        lines.push(`outp[0].${name} = ${cols === 1 ? parts[0]! : `${type}(${parts.join(', ')})`};`);
    }
    return { wgsl: lines.join('\n    '), probes };
}

const SCHEMAS: readonly StructSchema[] = [
    ...Object.values(Bodies).filter(
        (s): s is StructSchema => typeof s === 'object' && 'wgslName' in s,
    ),
    PlaneCollider.schema,
    BoxCollider.schema,
    SphereCollider.schema,
    MeshCollider.schema,
    ColliderSetCountsSchema,
    DistanceConstraint.schema,
    ...Object.values(Params),
    ...Object.values(State),
    NsSimParamsSchema,
    ...Object.values(ComputeSchemas),
    TransformParamsSchema,
    Transform.schema,
    Transform.worldSchema,
    Camera.schema,
    StandardMaterialSchema,
    ForwardFrameParamsSchema,
    ShadowMap.schema,
    ShadowMap.matrixSchema,
    ParticleMaterial.schema,
    ...Object.values(Render),
];

async function runLayout(app: Application, schema: StructSchema, index: number): Promise<void> {
    const { wgsl, probes } = probeProgram(schema);
    const buf = storage(app, `shaderlib_layout_${index}`, Math.max(16, schema.stride));
    const probeOut = wgslResource({
        name: 'outp',
        binding: { storage: 'read_write' },
        type: { schema, array: true },
        frequency: 'stage',
        provider: 'private',
    });
    const module = wgslModule({
        name: `shaderlib_layout_${index}`,
        requires: [probeOut],
        structs: [schema],
        source: `
@compute @workgroup_size(1)
fn probe_main() {
    ${wgsl}
}`,
    });
    const kernel = createComputeKernel(app.core, {
        discriminator: `shaderlib_layout_${index}`,
        shader: module,
        entryPoint: 'probe_main',
        bindings: new Map([[probeOut, buf]]),
    });
    app.core.record('shaderlib-layout', (frame) => {
        frame.clear(buf);
        frame.compute('shaderlib.layout', (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            pass.dispatch.workgroups(1);
        });
    });
    app.core.submit();
    const bytes = await readBuffer(app, buf, Math.max(16, schema.stride));
    const views = {
        f32: new Float32Array(bytes),
        u32: new Uint32Array(bytes),
        i32: new Int32Array(bytes),
    };
    const wrong = probes.filter((p) => views[p.view][p.offset / 4] !== p.value);
    if (wrong.length > 0) {
        failures.push(
            `(c) ${schema.name}: ${wrong.length} sondas fora do lugar (ex.: offset ${wrong[0]!.offset})`,
        );
    }
    destroyComputeKernel(app.core, kernel);
}

async function main(): Promise<void> {
    const canvas = document.createElement('canvas');
    const app = await Application.create({
        // Antisserrilhado com que as medidas deste smoke foram calibradas (MSAA, o padrão antes da 034; o
        // temporal, padrão agora, tem o smoke `antialiasing`).
        antialias: 'msaa',
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });

    // (a) compilação de cada módulo da biblioteca, sozinho.
    for (const [key, module] of Object.entries(wgslLib)) {
        try {
            await app.core.withErrorScope('validation', () => {
                const probe = wgslModule({
                    name: `shaderlib_compile_${key}`,
                    requires: [module],
                    source: '@compute @workgroup_size(1) fn compile_main() {}',
                });
                const k = createComputeKernel(app.core, {
                    discriminator: `shaderlib_compile_${key}`,
                    shader: probe,
                    entryPoint: 'compile_main',
                    bindings: new Map(),
                });
                destroyComputeKernel(app.core, k);
            });
        } catch (e) {
            failures.push(`(a) ${key}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    log(`(a) ${Object.keys(wgslLib).length} módulos compilados`);

    for (let i = 0; i < CASES.length; i++) await runReference(app, CASES[i]!, i);
    for (let i = 0; i < XFORM_CASES.length; i++) await runXform(app, XFORM_CASES[i]!, i);
    for (let i = 0; i < SCHEMAS.length; i++) await runLayout(app, SCHEMAS[i]!, i);
    log(`(c) ${SCHEMAS.length} schemas: offsets conferidos na GPU`);

    app.dispose();
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('SHADERLIBRARY SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
