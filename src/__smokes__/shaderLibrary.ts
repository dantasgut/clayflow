// Spec 005 — Smoke da biblioteca de shaders (FR-018, FR-031, SC-002).
//
// Na GPU real:
//   (a) cada módulo da `wgslLib` compila (montado num kernel de teste);
//   (b) valores de referência de cada módulo batem com a CPU (quaternion, álgebra 3×3, matrizes e decomposição polar,
//       SDF, núcleos SPH, pesos MPM, FEM, ruído, cor, iluminação, XPBD/LCP);
//   (c) para cada schema do motor, um kernel grava sentinelas campo a campo no struct gerado e a CPU confere que cada
//       campo está exatamente no `offsetOf` do schema (layout TS ≡ layout WGSL).
//
// Para rodar: `npm run smoke -- shaderLibrary`. Resultado: `SHADERLIBRARY SMOKE PASSED` ou `FAIL: …`.
import { Application, createScene } from 'clayflow';
import type { StagingBufferSpec, StorageBufferSpec } from 'clayflow';
import { createComputeKernel, destroyComputeKernel } from '../scene/flows/createComputeKernel';
import { wgslModule, type WgslModule } from '../scene/shaders/WgslModule';
import { FieldType } from '../scene/descriptors/FieldType';
import type { StructSchema } from '../scene/descriptors/StructSchema';
import { wgslLib } from '../elements/gpu/shaders/index';
import * as Bodies from '../elements/physics/bodies/schemas/index';
import { PlaneCollider } from '../elements/physics/colliders/PlaneCollider';
import { BoxCollider } from '../elements/physics/colliders/BoxCollider';
import { SphereCollider } from '../elements/physics/colliders/SphereCollider';
import { MeshCollider } from '../elements/physics/colliders/MeshCollider';
import { ColliderSetCountsSchema } from '../elements/physics/colliders/ColliderSet';
import { DistanceConstraint } from '../elements/physics/constraints/DistanceConstraint';
import * as Params from '../elements/physics/schemas/simParams';
import * as State from '../elements/physics/schemas/simState';
import { NsSimParamsSchema } from '../elements/gpu/schemas';
import { AtomicAllocCounterSchema, ScanLevelSchema } from '../elements/gpu/compute/schemas';
import { TransformParamsSchema } from '../elements/scene/flows/TransformParams';
import { Transform } from '../elements/scene/Transform';
import { Camera } from '../elements/scene/Camera';
import { StandardMaterialSchema } from '../elements/material/StandardMaterialSchema';
import { ForwardShadowParamsSchema } from '../elements/material/forwardSchemas';
import { ParticleMaterial } from '../elements/physics/materials/ParticleMaterial';
import * as Render from '../presentation/flows/renderSchemas';
import { gradientNoise2, gradientNoise3, valueNoise2, valueNoise3 } from './support/noiseReference';

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

/** Gerador determinístico (mulberry32). */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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

const PI = 3.14159265;
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
        name: 'color (exposição, gama, luminância)',
        requires: [wgslLib.color],
        body: 'return vec4f(tonemap_exposure(a.xyz, 1.5).x, gamma_encode(a.xyz, 2.2).y, luminance(a.xyz), 0.0);',
        input: (r) => [
            [r() * 2, r(), r(), 0],
            [0, 0, 0, 0],
        ],
        cpu: (a) => [
            1 - Math.exp(-a[0] * 1.5),
            a[1] ** (1 / 2.2),
            0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2],
            0,
        ],
        tol: 2e-5,
    },
    {
        name: 'brdf (Lambert com ambiente)',
        requires: [wgslLib.brdf],
        body: `let n = normalize(a.xyz);
            let l = normalize(b.xyz);
            let ndl = lambert_diffuse(n, l);
            return vec4f(lambert_lit(vec3f(0.8, 0.5, 0.2), ndl, a.w), ndl);`,
        input: (r) => [
            [r() - 0.5, r() - 0.5, r() - 0.5, r()],
            [r() - 0.5, r() - 0.5, r() - 0.5, 0],
        ],
        cpu: (a, b) => {
            const la = Math.hypot(a[0], a[1], a[2]);
            const lb = Math.hypot(b[0], b[1], b[2]);
            const ndl = Math.max((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb), 0);
            const k = 0.18 + ndl * 0.82 * a[3];
            return [k * 0.8, k * 0.5, k * 0.2, ndl];
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
    const r = rng(1000 + index);
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
        requires: [...c.requires],
        source: `
@group(0) @binding(0) var<storage, read> inp: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outp: array<vec4f>;
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
        bindings: [
            { binding: 0, type: 'read-only-storage', buffer: inBuf },
            { binding: 1, type: 'storage', buffer: outBuf },
        ],
    });
    app.core.record('shaderlib-case', (frame) => {
        frame.compute('shaderlib.case', (pass) => {
            pass.bind.setPipeline(kernel.pipeline).setBindGroup(0, kernel.bindGroup);
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
    ScanLevelSchema,
    AtomicAllocCounterSchema,
    TransformParamsSchema,
    Transform.schema,
    Transform.worldSchema,
    Camera.schema,
    StandardMaterialSchema,
    ForwardShadowParamsSchema,
    ParticleMaterial.schema,
    ...Object.values(Render),
];

async function runLayout(app: Application, schema: StructSchema, index: number): Promise<void> {
    const { wgsl, probes } = probeProgram(schema);
    const buf = storage(app, `shaderlib_layout_${index}`, Math.max(16, schema.stride));
    const module = wgslModule({
        name: `shaderlib_layout_${index}`,
        structs: [schema],
        source: `
@group(0) @binding(0) var<storage, read_write> outp: array<${schema.wgslName}>;
@compute @workgroup_size(1)
fn probe_main() {
    ${wgsl}
}`,
    });
    const kernel = createComputeKernel(app.core, {
        discriminator: `shaderlib_layout_${index}`,
        shader: module,
        entryPoint: 'probe_main',
        bindings: [{ binding: 0, type: 'storage', buffer: buf }],
    });
    app.core.record('shaderlib-layout', (frame) => {
        frame.clear(buf);
        frame.compute('shaderlib.layout', (pass) => {
            pass.bind.setPipeline(kernel.pipeline).setBindGroup(0, kernel.bindGroup);
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
                const buf = storage(app, `shaderlib_compile_buf_${key}`, 16);
                const k = createComputeKernel(app.core, {
                    discriminator: `shaderlib_compile_${key}`,
                    shader: probe,
                    entryPoint: 'compile_main',
                    bindings: [{ binding: 0, type: 'storage', buffer: buf }],
                });
                destroyComputeKernel(app.core, k);
            });
        } catch (e) {
            failures.push(`(a) ${key}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    log(`(a) ${Object.keys(wgslLib).length} módulos compilados`);

    for (let i = 0; i < CASES.length; i++) await runReference(app, CASES[i]!, i);
    for (let i = 0; i < SCHEMAS.length; i++) await runLayout(app, SCHEMAS[i]!, i);
    log(`(c) ${SCHEMAS.length} schemas: offsets conferidos na GPU`);

    app.dispose();
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('SHADERLIBRARY SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
