// Spec 004 — Smoke dos contatos compactados do LCP (SC-013).
//
// Valida na GPU real pilhas de esferas e caixas (colunas em grade, camadas sobrepostas) soltas dentro de um recinto
// estático (chão e quatro paredes), com 1 000 e com 10 000 corpos. Após 12 s simulados:
//   - nenhum corpo atravessa o chão (ponto mais baixo ≥ topo do chão − folga − 1 cm) nem sai do recinto;
//   - repouso: ≥ 99 % dos corpos abaixo de 0,05 m/s (limiar de sono), velocidade média < 0,01 m/s e nenhum corpo
//     acima de 1 m/s (sem explosão) — numa pilha de milhares de corpos sempre resta algum se acomodando nas bordas;
//   - nenhum contato acima da capacidade.
// Registra o tempo de GPU por quadro (quadro sincronizado por leitura de volta).
//
// Para rodar: `npm run smoke -- rigidContacts` (servidor do bench). Resultado: `RIGIDCONTACTS SMOKE PASSED` ou `FAIL`.
import { Application, createScene, GravityField, RigidBody } from 'clayflow';
import type { StagingBufferSpec } from 'clayflow';

const BODY_STRIDE_F32 = 40; // RigidBody: pos(0) vel(4) ...
const RADIUS = 0.25;
const BOX_HALF = 0.2;
const GROUND_HALF = 20;
const WALL_HEIGHT = 4;
const SLOP = 0.005;
const SIM_SECONDS = 12;
const REST_SPEED = 0.05;
const REST_FRACTION = 0.99;
const MEAN_SPEED = 0.01;
const EXPLOSION_SPEED = 1;

function log(msg: string): void {
    console.log(`[rigidContacts] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** Gerador determinístico (mulberry32) — mesmo arranjo a cada execução. */
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

/** Ponto mais baixo do corpo: esfera pelo raio; caixa pelo canto mais baixo (rotação no quatérnio em f32 12..15). */
function lowestPoint(pool: Float32Array, base: number): number {
    const y = pool[base + 1]!;
    if (pool[base + 32] === 0) return y - pool[base + 33]!; // body_shape.x = 0 (esfera), .y = raio
    const [qx, qy, qz, qw] = [
        pool[base + 12]!,
        pool[base + 13]!,
        pool[base + 14]!,
        pool[base + 15]!,
    ];
    // Linha y da matriz de rotação: extensão vertical da caixa = Σ |R_yk| · h_k.
    const ry = [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)];
    const h = [pool[base + 33]!, pool[base + 34]!, pool[base + 35]!];
    return y - (Math.abs(ry[0]!) * h[0]! + Math.abs(ry[1]!) * h[1]! + Math.abs(ry[2]!) * h[2]!);
}

async function readPool(app: Application): Promise<Float32Array> {
    const pool = app.resources.poolBufferSpec('LCPSchema')!;
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `rigid_contacts_staging_${pool.byteSize}_${app.time.frame}`,
        byteSize: pool.byteSize,
    });
    app.core.record('rigid-contacts-readback', (frame) => {
        frame.copy(pool, staging, pool.byteSize);
    });
    app.core.submit();
    const data = new Float32Array(await app.core.readback(staging));
    app.core.destroy(staging);
    return data;
}

async function scenario(count: number, failures: string[]): Promise<void> {
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
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '));
        originalWarn(...args);
    };
    let engineErrors = 0;
    app.events.on('engineError', (e) => {
        engineErrors++;
        if (engineErrors <= 3) log(`!! engineError: ${e.message}`);
    });
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.world.insert(
        new RigidBody({
            shape: 'box',
            mass: 0,
            halfExtents: [GROUND_HALF, 0.5, GROUND_HALF],
            position: [0, -0.5, 0],
        }),
    );
    for (const [x, z, hx, hz] of [
        [GROUND_HALF + 0.5, 0, 0.5, GROUND_HALF + 1],
        [-GROUND_HALF - 0.5, 0, 0.5, GROUND_HALF + 1],
        [0, GROUND_HALF + 0.5, GROUND_HALF + 1, 0.5],
        [0, -GROUND_HALF - 0.5, GROUND_HALF + 1, 0.5],
    ] as const) {
        app.world.insert(
            new RigidBody({
                shape: 'box',
                mass: 0,
                halfExtents: [hx, WALL_HEIGHT / 2, hz],
                position: [x, WALL_HEIGHT / 2, z],
            }),
        );
    }
    // Pilhas: colunas numa grade com espaçamento maior que um diâmetro e camadas sucessivas (sem sobreposição inicial),
    // com ruído pequeno para quebrar a simetria.
    const random = rng(1337);
    const spacing = 0.6;
    const perRow = Math.floor((GROUND_HALF * 1.5) / spacing);
    const perLayer = perRow * perRow;
    for (let i = 0; i < count; i++) {
        const layer = Math.floor(i / perLayer);
        const cell = i % perLayer;
        const jitter = (): number => (random() * 2 - 1) * 0.05;
        const position = [
            ((cell % perRow) - (perRow - 1) / 2) * spacing + jitter(),
            0.5 + layer * spacing,
            (Math.floor(cell / perRow) - (perRow - 1) / 2) * spacing + jitter(),
        ] as const;
        app.world.insert(
            i % 2 === 0
                ? new RigidBody({
                      shape: 'sphere',
                      radius: RADIUS,
                      mass: 1,
                      rollingFriction: 0.01,
                      position,
                  })
                : new RigidBody({
                      shape: 'box',
                      halfExtents: [BOX_HALF, BOX_HALF, BOX_HALF],
                      mass: 1,
                      position,
                  }),
        );
    }

    // Tempo de GPU por quadro: 4 quadros sincronizados por leitura de volta.
    app.step(1 / 60, 2);
    await readPool(app);
    const gpuTimes: number[] = [];
    for (let i = 0; i < 4; i++) {
        const t0 = performance.now();
        app.step(1 / 60);
        await readPool(app);
        gpuTimes.push(performance.now() - t0);
    }
    // Restante da simulação, aguardando a GPU a cada 30 quadros (não acumula trabalho sem limite).
    const remaining = SIM_SECONDS * 60 - 6;
    for (let done = 0; done < remaining; done += 30) {
        app.step(1 / 60, Math.min(30, remaining - done));
        await readPool(app);
    }
    const pool = await readPool(app);
    const bodies = app.resources.poolCount('LCPSchema');
    let lowest = Infinity;
    let fastest = 0;
    let resting = 0;
    let speedSum = 0;
    let dynamic = 0;
    let through = 0;
    let escaped = 0;
    for (let slot = 0; slot < bodies; slot++) {
        const base = slot * BODY_STRIDE_F32;
        if (pool[base + 3] === 0) continue; // recinto estático (inv_mass 0)
        const bottom = lowestPoint(pool, base);
        lowest = Math.min(lowest, bottom);
        if (bottom < -(SLOP + 0.01)) through++;
        if (Math.max(Math.abs(pool[base]!), Math.abs(pool[base + 2]!)) > GROUND_HALF) escaped++;
        const speed = Math.hypot(pool[base + 4]!, pool[base + 5]!, pool[base + 6]!);
        fastest = Math.max(fastest, speed);
        speedSum += speed;
        dynamic++;
        if (speed < REST_SPEED) resting++;
    }
    const overflow = warnings.filter((w) => w.includes('acima da capacidade'));
    const gpuMean = gpuTimes.reduce((a, b) => a + b, 0) / gpuTimes.length;
    const restFraction = resting / Math.max(1, dynamic);
    const meanSpeed = speedSum / Math.max(1, dynamic);
    log(
        `${count} corpos: GPU+CPU por quadro ${gpuMean.toFixed(1)} ms; após ${SIM_SECONDS} s: base mais baixa `
            + `${lowest.toFixed(4)} m, ${through} abaixo do chão, ${escaped} fora do recinto, `
            + `${(restFraction * 100).toFixed(2)} % em repouso, velocidade média ${meanSpeed.toFixed(4)} m/s, `
            + `máxima ${fastest.toFixed(4)} m/s, memória ${(app.core.memoryUsage().totalBytes / 1048576).toFixed(1)} MiB`,
    );
    if (through > 0)
        failures.push(
            `${count}: ${through} corpos atravessaram o chão (base mais baixa ${lowest})`,
        );
    if (!(restFraction >= REST_FRACTION))
        failures.push(`${count}: só ${(restFraction * 100).toFixed(2)} % dos corpos em repouso`);
    if (!(meanSpeed < MEAN_SPEED))
        failures.push(`${count}: velocidade média ${meanSpeed} m/s — corpos não repousaram`);
    if (!(fastest < EXPLOSION_SPEED))
        failures.push(`${count}: corpo a ${fastest} m/s — explosão do solver`);
    if (escaped > 0) failures.push(`${count}: ${escaped} corpos saíram do recinto`);
    if (overflow.length > 0) failures.push(`${count}: excedente de contatos — ${overflow[0]}`);
    if (engineErrors > 0) failures.push(`${count}: engineErrors=${engineErrors}`);
    console.warn = originalWarn;
    app.dispose();
}

async function main(): Promise<void> {
    const failures: string[] = [];
    await scenario(1000, failures);
    await scenario(10_000, failures);
    if (failures.length > 0) {
        for (const f of failures) log(`  ✗ ${f}`);
        throw new Error(`${failures.length} verificações falharam`);
    }
    log('RIGIDCONTACTS SMOKE PASSED');
}

main().catch((err: unknown) => {
    console.error('[rigidContacts] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
});
