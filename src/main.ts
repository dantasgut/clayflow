// Fase C.6 smoke — DistanceConstraint integration via XPBDFlow.
// Rope vertical: 10 SoftBody + 9 DistanceConstraint conectando bodies
// consecutivos. Top body fixado (mass=0 → invMass=0). Após N frames
// dispatcham predict + distance_solve × iters + velocity_update sem
// validation errors. Smoke nível "kernels compilam, dispatcham, e o pool de
// constraints é consumido pelo flow".
import { Application } from './presentation/index';
import {
    Camera, GravityField, SoftBody, DistanceConstraint, XPBDFlow,
} from './elements/index';
import type { StagingBufferSpec } from './core/contracts/index';

const log = (m: string) => {
    console.log(`[xpbd] ${m}`);
    const el = document.getElementById('log');
    if (el) el.textContent += m + '\n';
};
const fail = (m: string) => {
    console.error(`[xpbd] FAIL: ${m}`);
    const el = document.getElementById('log');
    if (el) el.textContent += `FAIL: ${m}\n`;
    throw new Error(m);
};

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const app = await Application.create({ canvas });
    log('app created');

    app.world.insert(new Camera({ aspect: canvas.width / canvas.height }));
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.flows.register(new XPBDFlow(app.core, app.world, app.resources, {
        constraintPoolKey: 'DistanceConstraint',
        solverIters: 4,
    }));

    const N = 10;
    const REST_LENGTH = 0.2;
    // Vertical chain: top em y=2.0 (fixo), bottom em y=2.0 - 9*0.2 = 0.2.
    for (let i = 0; i < N; i++) {
        const yi = 2.0 - i * REST_LENGTH;
        const isTop = (i === 0);
        app.world.insert(new SoftBody({
            position: [0, yi, 0, 1],
            mass: isTop ? 0 : 1, // mass=0 → invMass=0 (kinematic)
        }));
    }
    log(`inserted ${N} SoftBody`);

    for (let i = 0; i < N - 1; i++) {
        app.world.insert(new DistanceConstraint({
            i, j: i + 1, rest_length: REST_LENGTH, compliance: 0,
        }));
    }
    log(`inserted ${N - 1} DistanceConstraint`);

    let cap: string | null = null;
    const FRAMES = 60;
    await app.core.withErrorScope('validation', async () => {
        for (let i = 0; i < FRAMES; i++) {
            app.events.emit('frameTick', { dt: 1 / 60, elapsed: i / 60 });
        }
    }).catch(e => { cap = String(e?.message ?? e); });
    if (cap !== null) fail(`validation: ${cap}`);
    log(`${FRAMES} frames dispatched cleanly (predict + distance_solve×4 + velocity_update)`);

    // Readback do pool de SoftBody para verificar que o chain hangs em
    // equilíbrio (top fixed, segmentos com distância ≈ rest_length).
    const SOFT_STRIDE = 48; // 3 vec4f (pos, pred, vel)
    const poolBuf = app.resources.poolBufferSpec('SoftBody:XPBD');
    if (poolBuf === undefined) fail('SoftBody pool buffer não encontrado');
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer', subkind: 'staging',
        discriminator: 'rope_readback',
        byteSize: N * SOFT_STRIDE,
    });
    app.core.record(frame => {
        frame.copy(poolBuf!, staging, N * SOFT_STRIDE);
    });
    app.core.submit();
    const bytes = await app.core.readback(staging);
    const f32 = new Float32Array(bytes);
    const positions: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
        const off = i * (SOFT_STRIDE / 4);
        positions.push([f32[off + 0]!, f32[off + 1]!, f32[off + 2]!]);
    }
    log(`top y=${positions[0]![1].toFixed(3)} bottom y=${positions[N-1]![1].toFixed(3)}`);

    // Top deve estar fixo em y=2.0 (invMass=0).
    if (Math.abs(positions[0]![1] - 2.0) > 1e-3) {
        fail(`top body moveu de y=2.0 para y=${positions[0]![1]}`);
    }

    // Distância média entre segmentos consecutivos deve ≈ rest_length ± 30%.
    // Tolerância larga porque XPBD com substeps=1 e 4 iters não converge a 0;
    // só validamos ordem de magnitude (constraint ativo, não escapando).
    let totalDist = 0;
    let maxDist = 0;
    for (let i = 0; i < N - 1; i++) {
        const dx = positions[i+1]![0] - positions[i]![0];
        const dy = positions[i+1]![1] - positions[i]![1];
        const dz = positions[i+1]![2] - positions[i]![2];
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
        totalDist += d;
        maxDist = Math.max(maxDist, d);
    }
    const avgDist = totalDist / (N - 1);
    log(`avg segment dist=${avgDist.toFixed(3)} (rest=${REST_LENGTH}), max=${maxDist.toFixed(3)}`);

    const tolerance = REST_LENGTH * 0.3;
    if (Math.abs(avgDist - REST_LENGTH) > tolerance) {
        fail(`média=${avgDist.toFixed(3)} fora de rest_length=${REST_LENGTH} ±${tolerance}`);
    }

    log('XPBD ROPE SMOKE PASSED — top fixed, segments converged near rest_length');
}

main().catch(err => fail(String(err?.message ?? err)));
