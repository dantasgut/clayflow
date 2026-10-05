// Spec 003 — Smoke de transformações reativas.
//
// Valida na GPU real:
//   (1) o pool WorldTransform produzido pelo TransformFlow é igual a um oráculo T·R·S / R·S⁻¹
//       calculado aqui (tolerância 1e-5) — inclui escala não uniforme, espelhada e quaternion
//       não normalizado;
//   (2) cada cubo aparece no centro projetado da sua posição (cor esperada em 3×3 pixels — 1 px);
//   (3) mutar `data.position` (campo inteiro e componente) reflete no quadro seguinte;
//   (4) corpos rígidos caem e a escala visual do Transform (0.5) é preservada.
//
// Para rodar: `cp src/__smokes__/transforms.ts src/main.ts && npm run dev`
// Resultado: `TRANSFORMS SMOKE PASSED` ou `FAIL: …` no console e no #log.
import { Application } from '../presentation/index';
import {
    BoxGeometry,
    SphereGeometry,
    StandardMaterial,
    Camera,
    DirectionalLight,
    Transform,
    GravityField,
    RigidBody,
} from '../elements/index';
import type { StagingBufferSpec } from '../core/contracts/index';
import type { EntityId } from '../scene/world/EntityId';

type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];
type Mat4 = number[]; // column-major, 16

const log = (m: string): void => {
    console.log(`[transforms] ${m}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += m + '\n';
};

// ── Matemática de oráculo (só para verificação) ─────────────────────────────

function mul(a: Mat4, b: Mat4): Mat4 {
    const out = new Array<number>(16).fill(0);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
    return out;
}

function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const norm = (v: Vec3): Vec3 => {
        const l = Math.hypot(...v);
        return [v[0] / l, v[1] / l, v[2] / l];
    };
    const cross = (a: Vec3, b: Vec3): Vec3 => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = norm(sub(eye, target));
    const x = norm(cross(up, z));
    const y = cross(z, x);
    return [
        x[0],
        y[0],
        z[0],
        0,
        x[1],
        y[1],
        z[1],
        0,
        x[2],
        y[2],
        z[2],
        0,
        -dot(x, eye),
        -dot(y, eye),
        -dot(z, eye),
        1,
    ];
}

function perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fov / 2);
    // WebGPU: z de clip em [0, 1].
    return [
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
        far / (near - far),
        -1,
        0,
        0,
        (near * far) / (near - far),
        0,
    ];
}

function quatCols(q: Vec4): [Vec3, Vec3, Vec3] {
    const len = Math.hypot(...q);
    const [x, y, z, w] = len > 1e-7 ? (q.map((v) => v / len) as Vec4) : ([0, 0, 0, 1] as Vec4);
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
        [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
        [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
    ];
}

/** Oráculo: 16 floats de `world` seguidos de 12 floats de `normal` (mat3x3 com padding). */
function oracle(position: Vec4, rotation: Vec4, scale: Vec4): number[] {
    const r = quatCols(rotation);
    const inv = (v: number): number => (Math.abs(v) > 1e-12 ? 1 / v : 0);
    const world = [
        ...r[0].map((v) => v * scale[0]),
        0,
        ...r[1].map((v) => v * scale[1]),
        0,
        ...r[2].map((v) => v * scale[2]),
        0,
        position[0],
        position[1],
        position[2],
        1,
    ];
    const normal = [
        ...r[0].map((v) => v * inv(scale[0])),
        0,
        ...r[1].map((v) => v * inv(scale[1])),
        0,
        ...r[2].map((v) => v * inv(scale[2])),
        0,
    ];
    return [...world, ...normal];
}

function project(vp: Mat4, p: Vec3, w: number, h: number): [number, number] {
    const x = vp[0]! * p[0] + vp[4]! * p[1] + vp[8]! * p[2] + vp[12]!;
    const y = vp[1]! * p[0] + vp[5]! * p[1] + vp[9]! * p[2] + vp[13]!;
    const cw = vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
    return [Math.round(((x / cw) * 0.5 + 0.5) * w), Math.round((0.5 - (y / cw) * 0.5) * h)];
}

// ── Cena ────────────────────────────────────────────────────────────────────

interface CubeSpec {
    readonly name: string;
    readonly color: Vec3; // 0/1 por canal
    readonly position: Vec4;
    readonly rotation: Vec4;
    readonly scale: Vec4;
}

const s45 = Math.sin(Math.PI / 8);
const c45 = Math.cos(Math.PI / 8);
const s15 = Math.sin(Math.PI / 12);
const c15 = Math.cos(Math.PI / 12);

const CUBES: readonly CubeSpec[] = [
    {
        name: 'vermelho',
        color: [1, 0, 0],
        position: [-5, 0, 0, 1],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1, 1],
    },
    {
        name: 'verde',
        color: [0, 1, 0],
        position: [-3, 0, 0, 1],
        rotation: [0, s45, 0, c45],
        scale: [1, 1, 1, 1],
    },
    {
        name: 'azul',
        color: [0, 0, 1],
        position: [-1, 0, 0, 1],
        rotation: [0, 0, 0, 1],
        scale: [1.6, 0.8, 1, 1],
    },
    {
        name: 'amarelo',
        color: [1, 1, 0],
        position: [1, 0, 0, 1],
        rotation: [s15, 0, 0, c15],
        scale: [1, 0.6, 1.4, 1],
    },
    {
        name: 'magenta',
        color: [1, 0, 1],
        position: [3, 0, 0, 1],
        rotation: [0, 0, 0, 1],
        scale: [-1, 1, 1, 1],
    },
    {
        name: 'ciano',
        color: [0, 1, 1],
        position: [5, 0, 0, 1],
        rotation: [0, 2, 0, 2],
        scale: [1, 1, 1, 1],
    },
];

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement | null;
    if (canvas === null) throw new Error('canvas#gpuCanvas não encontrado');
    canvas.width = 640;
    canvas.height = 360;
    const W = canvas.width;
    const H = canvas.height;

    const app = await Application.create({ canvas, captureErrors: true, autoResize: false });
    let engineErrors = 0;
    app.events.on('engineError', (e) => {
        engineErrors++;
        log(`!! engineError: ${e.stage}/${e.filter}: ${e.message}`);
    });

    const eye: Vec3 = [0, 3, 14];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const projection = perspective(Math.PI / 4, W / H, 0.1, 100);
    const vp = mul(projection, view);
    app.world.insert(
        new Camera({
            view,
            projection,
            viewProjection: vp,
            position: [...eye, 1],
            fov: Math.PI / 4,
            aspect: W / H,
            near: 0.1,
            far: 100,
        }),
    );
    app.world.insert(
        new DirectionalLight({ direction: [-0.3, -1, -0.5, 0], castShadow: true, intensity: 1 }),
    );

    const ids: EntityId[] = [];
    const transforms: Transform[] = [];
    for (const c of CUBES) {
        const t = new Transform({ position: c.position, rotation: c.rotation, scale: c.scale });
        const box = new BoxGeometry({ size: [1, 1, 1] })
            .add(new StandardMaterial({ albedo: [...c.color, 1] }))
            .add(t);
        ids.push(app.world.insert(box));
        transforms.push(t);
    }

    let elapsed = 0;
    /** Um quadro dirigido manualmente; `inspect` roda no mesmo task (antes do present). */
    const step = (inspect?: () => void): void => {
        elapsed += 1 / 60;
        app.events.emit('frameTick', { dt: 1 / 60, elapsed });
        inspect?.();
    };

    const scratch = document.createElement('canvas');
    scratch.width = W;
    scratch.height = H;
    const ctx2d = scratch.getContext('2d', { willReadFrequently: true });
    if (ctx2d === null) throw new Error('2d context indisponível');
    let pixels: Uint8ClampedArray = new Uint8ClampedArray(0);
    const capture = (): void => {
        ctx2d.drawImage(canvas, 0, 0);
        pixels = ctx2d.getImageData(0, 0, W, H).data;
    };

    const colorMatches = (x: number, y: number, color: Vec3): boolean => {
        const i = (y * W + x) * 4;
        const rgb = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
        const on = rgb.filter((_, k) => color[k] === 1);
        const off = rgb.filter((_, k) => color[k] === 0);
        const minOn = Math.min(...on);
        return minOn > 25 && off.every((v) => v < minOn * 0.5);
    };

    const failures: string[] = [];
    const checkPixels = (label: string, positions: readonly Vec4[]): void => {
        CUBES.forEach((c, i) => {
            const p = positions[i]!;
            const [px, py] = project(vp, [p[0], p[1], p[2]], W, H);
            let ok = true;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) ok &&= colorMatches(px + dx, py + dy, c.color);
            if (!ok) failures.push(`${label}: cubo ${c.name} não está em (${px}, ${py})`);
        });
    };

    const readWorlds = async (entityIds: readonly EntityId[]): Promise<Float32Array[]> => {
        const pool = app.resources.poolBufferSpec('WorldTransform');
        if (pool === undefined) throw new Error('pool WorldTransform inexistente');
        const staging = app.core.create<StagingBufferSpec>({
            kind: 'buffer',
            subkind: 'staging',
            discriminator: `smoke_world_staging_${pool.byteSize}_${elapsed}`,
            byteSize: pool.byteSize,
        });
        app.core.record('smoke-readback', (frame) => {
            frame.copy(pool, staging, pool.byteSize);
        });
        app.core.submit();
        const all = new Float32Array(await app.core.readback(staging));
        return entityIds.map((id) => {
            const slot = app.resources.poolSlotOf('WorldTransform', id);
            if (slot === undefined) throw new Error(`entidade ${id} sem slot`);
            return all.slice((slot * 112) / 4, (slot * 112) / 4 + 28);
        });
    };

    const compare = (label: string, got: Float32Array, want: number[]): void => {
        for (let k = 0; k < 28; k++) {
            if (k >= 16 && (k - 16) % 4 === 3) continue; // padding das colunas da mat3x3
            if (Math.abs(got[k]! - want[k]!) > 1e-5) {
                failures.push(`${label}: componente ${k} = ${got[k]} ≠ ${want[k]}`);
                return;
            }
        }
    };

    // ── (1) e (2): posicionamento ──────────────────────────────────────────
    step();
    step();
    step(capture);
    checkPixels(
        'posicionamento',
        CUBES.map((c) => c.position),
    );
    const worlds = await readWorlds(ids);
    CUBES.forEach((c, i) => {
        compare(`oráculo ${c.name}`, worlds[i]!, oracle(c.position, c.rotation, c.scale));
    });
    log(`(1)(2) posicionamento verificado — falhas até aqui: ${failures.length}`);

    // ── (3): mutação reativa reflete no quadro seguinte ────────────────────
    const moved = CUBES.map((c) => [...c.position] as Vec4);
    moved[0] = [-5, 2, 0, 1];
    transforms[0]!.data.position = moved[0];
    moved[2] = [-1, -1.5, 0, 1];
    (transforms[2]!.data.position as number[])[1] = -1.5;
    step(capture);
    checkPixels('mutação', moved);
    const movedWorlds = await readWorlds([ids[0]!, ids[2]!]);
    compare(
        'mutação vermelho',
        movedWorlds[0]!,
        oracle(moved[0], CUBES[0]!.rotation, CUBES[0]!.scale),
    );
    compare('mutação azul', movedWorlds[1]!, oracle(moved[2], CUBES[2]!.rotation, CUBES[2]!.scale));
    log(`(3) mutação verificada — falhas até aqui: ${failures.length}`);

    // ── (4): corpos rígidos com escala visual preservada ───────────────────
    for (const id of ids) {
        const root = app.world.rootOf(id);
        if (root !== undefined) app.world.remove(root);
    }
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    const ground = new RigidBody({
        shape: 'box',
        mass: 0, // estático
        halfExtents: [8, 0.5, 8],
        position: [0, -1, 0],
    });
    ground.add(new BoxGeometry({ size: [16, 1, 16] }));
    ground.add(new StandardMaterial({ albedo: [0.4, 0.4, 0.45, 1] }));
    app.world.insert(ground);

    const ballIds: EntityId[] = [];
    for (let i = 0; i < 5; i++) {
        const ball = new RigidBody({
            shape: 'sphere',
            radius: 0.5,
            mass: 1,
            position: [i * 1.5 - 3, 4, 0],
        });
        const t = ball.attached.find((p) => p instanceof Transform)!;
        t.data.scale = [0.5, 0.5, 0.5, 1]; // esfera de raio 1 vista com raio 0.5
        ball.add(new SphereGeometry({ radius: 1 }));
        ball.add(new StandardMaterial({ albedo: [0.9, 0.5, 0.1, 1] }));
        ballIds.push(app.world.insert(ball));
    }
    // Compasso por MessageChannel: não é estrangulado em aba de segundo plano (setTimeout é).
    const yieldTask = (): Promise<void> =>
        new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (): void => {
                resolve();
            };
            channel.port2.postMessage(0);
        });
    for (let f = 0; f < 120; f++) {
        step();
        await yieldTask();
    }
    // A pose chega à CPU por readback assíncrono da física; espera ela refletir a queda.
    const deadline = performance.now() + 20_000;
    let ballWorlds = await readWorlds(ballIds);
    while (ballWorlds.some((m) => !(m[13]! < 4)) && performance.now() < deadline) {
        step();
        await yieldTask();
        ballWorlds = await readWorlds(ballIds);
    }
    ballWorlds.forEach((m, i) => {
        const y = m[13]!;
        const colLen = Math.hypot(m[0]!, m[1]!, m[2]!);
        if (!(y < 4)) failures.push(`física: esfera ${i} não caiu (y=${y})`);
        if (Math.abs(colLen - 0.5) > 1e-4)
            failures.push(`física: escala da esfera ${i} = ${colLen}, esperada 0.5`);
    });
    log(`(4) física verificada — falhas até aqui: ${failures.length}`);

    if (engineErrors > 0) failures.push(`engineErrors=${engineErrors}`);
    if (failures.length > 0) {
        for (const f of failures) log(`  ✗ ${f}`);
        throw new Error(`${failures.length} verificações falharam`);
    }
    log('TRANSFORMS SMOKE PASSED');
}

main().catch((err: unknown) => {
    console.error('[transforms] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
});
