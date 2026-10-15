// Spec 004 — Smoke de malha grande (índices uint32).
//
// Valida na GPU real (SC-008): uma `ParametricGeometry` 300 × 300 (90 601 vértices, acima de 65 535) renderiza
// completa — a superfície plana cobre a área projetada esperada nas duas metades (a de cima usa vértices de
// índice ≥ 65 536, que com índices de 16 bits seriam truncados).
//
// Para rodar: `npm run smoke -- bigMesh` (servidor do bench). Resultado: `BIGMESH SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Camera,
    DirectionalLight,
    ParametricGeometry,
    StandardMaterial,
    Transform,
} from 'clayflow';

type Vec3 = [number, number, number];
type Mat4 = number[];

const log = (m: string): void => {
    console.log(`[bigMesh] ${m}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += m + '\n';
};

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
    // prettier-ignore
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

function perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fov / 2);
    // prettier-ignore
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, (near * far) / (near - far), 0];
}

function project(vp: Mat4, p: Vec3, w: number, h: number): [number, number] {
    const x = vp[0]! * p[0] + vp[4]! * p[1] + vp[8]! * p[2] + vp[12]!;
    const y = vp[1]! * p[0] + vp[5]! * p[1] + vp[9]! * p[2] + vp[13]!;
    const cw = vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
    return [((x / cw) * 0.5 + 0.5) * w, (0.5 - (y / cw) * 0.5) * h];
}

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement | null;
    if (canvas === null) throw new Error('canvas#gpuCanvas não encontrado');
    canvas.width = 256;
    canvas.height = 256;
    const W = canvas.width;
    const H = canvas.height;
    const app = await Application.create({ canvas, captureErrors: true, autoResize: false });
    let engineErrors = 0;
    app.events.on('engineError', (e) => {
        engineErrors++;
        log(`!! engineError: ${e.stage}/${e.filter}: ${e.message}`);
    });

    // Plano z = 0 de (-2, -2) a (2, 2). A ordem dos triângulos da ParametricGeometry é anti-horária vista de -z.
    const eye: Vec3 = [0, 0, -6];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const projection = perspective(Math.PI / 3, W / H, 0.1, 100);
    const vp = mul(projection, view);
    app.world.insert(
        new Camera({
            fov: Math.PI / 3,
            aspect: W / H,
            aspectMode: 'fixed',
            near: 0.1,
            far: 100,
        }).add(
            new Transform({
                position: [...eye, 1],
                rotation: Transform.lookRotation([...eye], [0, 0, 0]),
            }),
        ),
    );
    // Luz de frente para o plano (z = 0, normal −z para a câmera em z = −6): com as normais por derivadas da função
    // (spec 010) o plano é iluminado por inteiro; antes passava só pela normal fixa [0, 1, 0].
    app.world.insert(new DirectionalLight({ direction: [0, 0, 1, 0], intensity: 1 }));
    const surface = new ParametricGeometry({
        uSteps: 300,
        vSteps: 300,
        fn: (u: number, v: number) => [u * 4 - 2, v * 4 - 2, 0],
    });
    log(`vértices: ${surface.vertexCount}; formato de índice: ${surface.indexFormat}`);
    app.world.insert(
        surface.add(new StandardMaterial({ albedo: [1, 1, 1, 1] })).add(new Transform()),
    );

    const scratch = document.createElement('canvas');
    scratch.width = W;
    scratch.height = H;
    const ctx2d = scratch.getContext('2d', { willReadFrequently: true });
    if (ctx2d === null) throw new Error('2d context indisponível');
    let pixels = new Uint8ClampedArray(0);
    app.step(1 / 60, 2);
    app.step(1 / 60);
    ctx2d.drawImage(canvas, 0, 0);
    pixels = ctx2d.getImageData(0, 0, W, H).data;

    // Retângulo projetado da superfície, com 3 px de margem para dentro.
    const corners = (
        [
            [-2, -2, 0],
            [2, -2, 0],
            [2, 2, 0],
            [-2, 2, 0],
        ] as Vec3[]
    ).map((p) => project(vp, p, W, H));
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const x0 = Math.ceil(Math.min(...xs)) + 3;
    const x1 = Math.floor(Math.max(...xs)) - 3;
    const y0 = Math.ceil(Math.min(...ys)) + 3;
    const y1 = Math.floor(Math.max(...ys)) - 3;
    const lit = (x: number, y: number): boolean => {
        const i = (y * W + x) * 4;
        // fundo ≈ (13, 18, 31); a superfície branca iluminada fica bem acima
        return pixels[i]! > 80 && pixels[i + 1]! > 80 && pixels[i + 2]! > 80;
    };
    const coverage = (ya: number, yb: number): number => {
        let on = 0;
        let total = 0;
        for (let y = ya; y <= yb; y++)
            for (let x = x0; x <= x1; x++) {
                total++;
                if (lit(x, y)) on++;
            }
        return on / total;
    };
    const mid = Math.floor((y0 + y1) / 2);
    // Na tela, y cresce para baixo: a metade de cima da imagem é v alto (vértices de índice alto).
    const top = coverage(y0, mid);
    const bottom = coverage(mid + 1, y1);
    let outside = 0;
    for (let x = 0; x < W; x++) if (lit(x, 1) || lit(x, H - 2)) outside++;
    log(
        `área [${x0}..${x1}] × [${y0}..${y1}]: cobertura metade de cima ${(top * 100).toFixed(2)}%, `
            + `de baixo ${(bottom * 100).toFixed(2)}%; pixels acesos nas bordas da imagem: ${outside}`,
    );

    const failures: string[] = [];
    if (surface.indexFormat !== 'uint32') failures.push(`formato ${surface.indexFormat} ≠ uint32`);
    if (top < 0.99) failures.push(`metade de cima coberta ${(top * 100).toFixed(2)}% < 99%`);
    if (bottom < 0.99) failures.push(`metade de baixo coberta ${(bottom * 100).toFixed(2)}% < 99%`);
    if (outside > 0) failures.push(`${outside} pixels acesos fora da superfície`);
    if (engineErrors > 0) failures.push(`engineErrors=${engineErrors}`);
    app.dispose();
    if (failures.length > 0) {
        for (const f of failures) log(`  ✗ ${f}`);
        throw new Error(`${failures.length} verificações falharam`);
    }
    log('BIGMESH SMOKE PASSED');
}

main().catch((err: unknown) => {
    console.error('[bigMesh] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
});
