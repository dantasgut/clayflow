// Spec 037 — Smoke da série temporal da energia dos corpos rígidos (o canal temporal da C2 aplicado à física; FR-020,
// FR-021).
//
// Com um `EnergyMeter` na cena, o `EnergyFlow` grava a cada passo de física, no canal `BodyEnergy` (8 fatias, no slot do
// corpo), a energia cinética e potencial de cada corpo, a potência dissipada no passo e a energia dissipada na janela.
//   - exact: 48 esferas e caixas soltas no ar (sem contato), com velocidade, rotação e orientação aleatórias, sob a
//     gravidade padrão: a cinética e a potencial da GPU contra a referência f64 (`physics/reference/energy.ts`) no
//     estado lido da GPU no mesmo quadro;
//   - damping: uma esfera livre sem gravidade, com velocidade e rotação: o solver multiplica as duas por (1 − k·dt) a
//     cada passo (`rb_lcp_commit.wgsl`, k = 0,1), então a potência e a janela, que a GPU tira das fatias anteriores do
//     canal, valem E·((1 − k·dt)⁻² − 1)/dt e E·((1 − k·dt)⁻¹⁴ − 1) — a solução analítica da lei discreta; antes de a série
//     ter as fatias, zero; quadros sem passo de física não giram o anel.
//
// Limiares (FR-021, do arredondamento f32): u = 2⁻²⁴. A energia de um corpo tem ≤ 40 arredondamentos de até u sobre as
// parcelas (|cinética| + |potencial|), mais as divisões do inverso da massa e da inércia (2,5 ulp no WGSL): 48u. A
// potência e a janela são diferenças de duas energias (cada uma com 48u) e da razão de velocidades acumulada em f32 (2u
// por passo, ao quadrado: 4u por passo), divididas pela própria diferença: (96u + 4u·passos)·(1 + r)/r, r a razão
// esperada menos 1.
//
// Para rodar: `npm run smoke -- energy`. Resultado: `ENERGY SMOKE PASSED` ou `FAIL: …`.
import { Application, createScene, EnergyMeter, GravityField, RigidBody } from 'clayflow/web';
import type { StagingBufferSpec } from 'clayflow/web';
import {
    bodyEnergy,
    dampedEnergyRatio,
    type RigidBodyState,
} from '../elements/physics/reference/energy';
import { mulberry32 } from './support/random';

const U = 2 ** -24;
const ENERGY_TOL = 48 * U;
/** O amortecimento do solver LCP (`LCPFlow`: linear_damping = angular_damping = 0,1) e o passo de física. */
const DAMPING = 0.1;
const DT = 1 / 60;
/** f32 por corpo no pool do LCP e na série da energia. */
const BODY_F32 = 40;
const ENERGY_F32 = 4;

const failures: string[] = [];

function log(msg: string): void {
    console.log(`[energy] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

async function open(): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    app.events.on('engineError', (e) => failures.push(`engineError: ${e.message}`));
    return app;
}

/**
 * O pool dos corpos e a fatia mais recente gravada da série da energia (a de agora, se gravada no quadro; senão a
 * anterior: o anel gira no começo do quadro seguinte à gravação), copiados no mesmo envio.
 */
async function readBoth(app: Application): Promise<{ bodies: Float32Array; energy: Float32Array }> {
    const pool = app.resources.poolBufferSpec('LCPSchema')!;
    const channel = app.resources.channelOfPool('BodyEnergy');
    const slice = channel?.buffer(channel.stamp(0) !== undefined ? 0 : 1);
    if (slice === undefined) throw new Error('a série BodyEnergy não foi alocada');
    const staging = (bytes: number, name: string): StagingBufferSpec =>
        app.core.create<StagingBufferSpec>({
            kind: 'buffer',
            subkind: 'staging',
            discriminator: `energy_${name}_${bytes}_${app.time.frame}`,
            byteSize: bytes,
        });
    const a = staging(pool.byteSize, 'bodies');
    const b = staging(slice.byteSize, 'energy');
    app.core.record('energy-readback', (frame) => {
        frame.copy(pool, a, pool.byteSize);
        frame.copy(slice, b, slice.byteSize);
    });
    app.core.submit();
    const [bodies, energy] = await Promise.all([app.core.readback(a), app.core.readback(b)]);
    app.core.destroy(a);
    app.core.destroy(b);
    return { bodies: new Float32Array(bodies), energy: new Float32Array(energy) };
}

const stateAt = (pool: Float32Array, slot: number): RigidBodyState => {
    const o = slot * BODY_F32;
    const v = (k: number): [number, number, number] => [
        pool[o + k]!,
        pool[o + k + 1]!,
        pool[o + k + 2]!,
    ];
    return {
        invMass: pool[o + 3]!,
        position: v(0),
        velocity: v(4),
        omega: v(8),
        rotation: [pool[o + 12]!, pool[o + 13]!, pool[o + 14]!, pool[o + 15]!],
        inertiaInv: v(16),
    };
};

async function caseExact(): Promise<void> {
    const app = await open();
    app.world.insert(new EnergyMeter());
    const rand = mulberry32(37);
    const r = (lo: number, hi: number): number => lo + (hi - lo) * rand();
    const bodies: RigidBody[] = [];
    for (let k = 0; k < 48; k++) {
        const axis = [r(-1, 1), r(-1, 1), r(-1, 1)];
        const n = Math.hypot(axis[0]!, axis[1]!, axis[2]!);
        const half = r(0, Math.PI);
        const s = Math.sin(half) / n;
        const shape =
            k % 2 === 0
                ? ({ shape: 'sphere', radius: r(0.1, 0.4) } as const)
                : ({ shape: 'box', halfExtents: [r(0.1, 0.4), r(0.1, 0.4), r(0.1, 0.4)] } as const);
        const body = new RigidBody({
            ...shape,
            mass: r(0.5, 8),
            // Espaçados numa grade alta: nenhum contato nos quadros medidos.
            position: [(k % 8) * 3 - 10.5, 40 + Math.floor(k / 8) * 3, r(-1, 1)],
            rotation: [axis[0]! * s, axis[1]! * s, axis[2]! * s, Math.cos(half)],
        });
        const data = body.data as { vel: number[]; omega: number[] };
        data.vel = [r(-3, 3), r(-3, 3), r(-3, 3), 0];
        data.omega = [r(-4, 4), r(-4, 4), r(-4, 4), 0];
        app.world.insert(body);
        bodies.push(body);
    }
    await app.whenReady();
    app.step(DT, 10);
    const { bodies: pool, energy } = await readBoth(app);
    const count = app.resources.poolCount('LCPSchema');
    let worst = 0;
    let worstAt = -1;
    let measured = 0;
    for (let slot = 0; slot < count; slot++) {
        const state = stateAt(pool, slot);
        if (!(state.invMass > 0)) continue;
        const ref = bodyEnergy(state, [0, -9.81, 0]);
        const gpu = energy.subarray(slot * ENERGY_F32, slot * ENERGY_F32 + 2);
        const scale = Math.abs(ref.kinetic) + Math.abs(ref.potential);
        const err =
            Math.max(Math.abs(gpu[0]! - ref.kinetic), Math.abs(gpu[1]! - ref.potential)) / scale;
        if (err > worst) {
            worst = err;
            worstAt = slot;
        }
        measured++;
    }
    log(
        `exact: ${measured} corpos — pior erro relativo da energia contra a f64 ${worst.toExponential(2)} (corpo ${worstAt}; limite ${ENERGY_TOL.toExponential(2)} = 48u)`,
    );
    check(measured === bodies.length, `exact: ${measured} de ${bodies.length} corpos medidos`);
    check(worst <= ENERGY_TOL, `exact: erro da energia ${worst} acima de 48u`);
    app.dispose();
}

async function caseDamping(): Promise<void> {
    const app = await open();
    app.world.insert(new EnergyMeter());
    app.world.insert(new GravityField({ acceleration: [0, 0, 0, 0] }));
    const ball = new RigidBody({ shape: 'sphere', radius: 0.5, mass: 2, position: [0, 0, 0] });
    const data = ball.data as { vel: number[]; omega: number[] };
    data.vel = [1.5, 0, -0.5, 0];
    data.omega = [0, 3, 1, 0];
    app.world.insert(ball);
    const channel = (): number => app.resources.channelOfPool('BodyEnergy')?.frames ?? -1;

    // Primeiro passo: a série ainda não tem a anterior — potência e janela em zero.
    await app.whenReady();
    app.step(DT);
    const first = (await readBoth(app)).energy;
    log(`damping: passo 1 — potência ${first[2]}, janela ${first[3]}`);
    check(
        first[2] === 0 && first[3] === 0,
        'damping: potência ou janela antes de a série ter as fatias',
    );

    app.step(DT, 19);
    const { energy } = await readBoth(app);
    const e = energy[0]! + energy[1]!;
    const f = 1 - DAMPING * DT;
    const r1 = dampedEnergyRatio(DAMPING, DT, 1) - 1;
    const r7 = dampedEnergyRatio(DAMPING, DT, 7) - 1;
    const m1 = (energy[2]! * DT) / e;
    const m7 = energy[3]! / e;
    const tol1 = ((96 + 4) * U * (1 + r1)) / r1;
    const tol7 = ((96 + 4 * 7) * U * (1 + r7)) / r7;
    const e1 = Math.abs(m1 - r1) / r1;
    const e7 = Math.abs(m7 - r7) / r7;
    log(
        `damping: passo 20, E ${e.toFixed(6)} J — potência·dt/E ${m1.toExponential(5)} (analítico ${r1.toExponential(5)}, erro ${e1.toExponential(2)}, limite ${tol1.toExponential(2)}); janela/E ${m7.toExponential(5)} (analítico ${r7.toExponential(5)}, erro ${e7.toExponential(2)}, limite ${tol7.toExponential(2)}); fator ${f}`,
    );
    check(e1 <= tol1, `damping: potência com erro relativo ${e1} (limite ${tol1})`);
    check(e7 <= tol7, `damping: janela com erro relativo ${e7} (limite ${tol7})`);

    // Quadros sem passo de física: o primeiro gira a gravação do passo 20; daí em diante o anel para e a fatia mais
    // recente continua a mesma.
    app.step(0);
    const frames = channel();
    app.step(0, 3);
    const still = (await readBoth(app)).energy;
    log(`damping: 3 quadros sem passo — série ${frames} → ${channel()} passos gravados`);
    check(channel() === frames, 'damping: o anel girou sem passo de física');
    check(
        still[0] === energy[0] && still[2] === energy[2],
        'damping: a fatia mais recente mudou sem passo de física',
    );
    app.dispose();
}

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    const cases: Record<string, () => Promise<void>> = { exact: caseExact, damping: caseDamping };
    for (const [name, run] of Object.entries(cases)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    if (failures.length > 0) {
        log(`FAIL: ${failures.join(' | ')}`);
        return;
    }
    log('ENERGY SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
