// Smoke de stress para Fase A (hardening): valida cleanup de slots, pool growth e resize.
import { Application } from './presentation/index';
import {
    BoxGeometry,
    Camera,
    DirectionalLight,
    GravityField,
    LCPFlow,
    RigidBody,
    StandardMaterial,
    Transform,
} from './elements/index';

const log = (m: string) => {
    console.log(`[stress] ${m}`);
    const el = document.getElementById('log');
    if (el) el.textContent += m + '\n';
};
const fail = (m: string) => {
    console.error(`[stress] FAIL: ${m}`);
    const el = document.getElementById('log');
    if (el) el.textContent += `FAIL: ${m}\n`;
    throw new Error(m);
};

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);

    const app = await Application.create({ canvas });
    const camera = new Camera({ aspect: canvas.width / canvas.height });
    app.world.insert(camera);
    app.world.insert(new DirectionalLight({ direction: [0.4, -1, 0.6, 0], castShadow: true }));
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.flows.register(new LCPFlow(app.core, app.world, app.resources));
    log('bootstrap OK');

    // ── 1. Pool growth: 8 bodies, roda 3 frames, depois +12 (força realloc) ──
    for (let i = 0; i < 8; i++) {
        app.world.insert(new RigidBody({ position: [i * 0.3, 5, 0, 1], mass: 1.0 }));
    }
    for (let i = 0; i < 3; i++) app.events.emit('frameTick', { dt: 1/60, elapsed: i/60 });
    log('8 bodies + 3 frames pre-growth OK');

    for (let i = 8; i < 20; i++) {
        app.world.insert(new RigidBody({ position: [i * 0.3, 5, 0, 1], mass: 1.0 }));
    }
    const poolBuf = app.resources.poolBufferSpec('RigidBody:LCP');
    if (poolBuf === undefined || poolBuf.byteSize !== 32 * 160) {
        fail(`expected pool byteSize=${32*160} after growth, got ${poolBuf?.byteSize}`);
    }
    log(`pool growth OK — count=${app.resources.poolCount('RigidBody:LCP')}, byteSize=${poolBuf!.byteSize}`);

    // Roda 3 frames após growth — verifica que LCPFlow.bindGroup foi recriado.
    let cap: string | null = null;
    await app.core.withErrorScope('validation', async () => {
        for (let i = 0; i < 3; i++) app.events.emit('frameTick', { dt: 1/60, elapsed: (3+i)/60 });
    }).catch(e => { cap = String(e?.message ?? e); });
    if (cap !== null) fail(`post-growth dispatch: ${cap}`);
    log('3 frames post-growth OK (LCPFlow.bindGroup recriado)');

    // ── 2. cachedSlots em ForwardFlow ──
    const cubes: BoxGeometry[] = [];
    for (let i = 0; i < 30; i++) {
        const c = new BoxGeometry({ size: [0.2, 0.2, 0.2] });
        c.add(new StandardMaterial({ albedo: [Math.random(), Math.random(), Math.random(), 1] }));
        c.add(new Transform({ position: [(i % 6) * 0.5 - 1.5, 1, Math.floor(i / 6) * 0.5 - 1, 1] }));
        app.world.insert(c);
        cubes.push(c);
    }
    for (let i = 0; i < 3; i++) app.events.emit('frameTick', { dt: 1/60, elapsed: (6+i)/60 });
    const slotsBefore = (app.defaults.forward as unknown as { cachedSlots: Map<unknown, unknown> }).cachedSlots.size;
    if (slotsBefore < 30) fail(`expected ≥ 30 cached slots, got ${slotsBefore}`);
    log(`ForwardFlow.cachedSlots after 30 cubes: ${slotsBefore}`);

    // ── 3. Remove metade ──
    for (let i = 0; i < 15; i++) app.world.remove(cubes[i]!);
    const slotsAfter = (app.defaults.forward as unknown as { cachedSlots: Map<unknown, unknown> }).cachedSlots.size;
    log(`cachedSlots after 15 removes: ${slotsAfter}`);
    if (slotsAfter !== slotsBefore - 15) {
        fail(`expected slots=${slotsBefore - 15}, got ${slotsAfter}`);
    }

    // Continua dispatch após remove
    cap = null;
    await app.core.withErrorScope('validation', async () => {
        for (let i = 0; i < 3; i++) app.events.emit('frameTick', { dt: 1/60, elapsed: (9+i)/60 });
    }).catch(e => { cap = String(e?.message ?? e); });
    if (cap !== null) fail(`post-remove dispatch: ${cap}`);
    log('3 frames post-remove OK');

    // ── 4. Resize ──
    let resizeOk = 0;
    for (let i = 0; i < 5; i++) {
        canvas.width = 600 + i * 80;
        canvas.height = 400 + i * 50;
        app.core.reconfigureCanvas();
        app.events.emit('canvasReconfigured', {
            width: canvas.width, height: canvas.height, format: app.core.canvasFormat,
        });
        resizeOk++;
    }
    log(`resize x${resizeOk} OK (final ${canvas.width}×${canvas.height})`);

    cap = null;
    await app.core.withErrorScope('validation', async () => {
        for (let i = 0; i < 3; i++) app.events.emit('frameTick', { dt: 1/60, elapsed: (12+i)/60 });
    }).catch(e => { cap = String(e?.message ?? e); });
    if (cap !== null) fail(`post-resize dispatch: ${cap}`);
    log('3 frames post-resize OK');

    log('STRESS PASSED');
}

main().catch(err => fail(String(err?.message ?? err)));
