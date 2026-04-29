// Fase D.5 smoke — Controllers polish.
// Valida: OrbitController damping (velocidade decai exponencialmente após drag),
// pinch-zoom (TouchDevice → OrbitController.distance), FlyController com
// keymap customizada, FpsController construído com canvas para auto pointer-lock.
import { Application, OrbitController, FlyController, FpsController } from './presentation/index';
import { Input } from './presentation/index';
import type { ControllerContext } from './presentation/index';
import { Camera } from './elements/index';

const log = (m: string) => {
    console.log(`[ctrl] ${m}`);
    const el = document.getElementById('log');
    if (el) el.textContent += m + '\n';
};
const fail = (m: string) => {
    console.error(`[ctrl] FAIL: ${m}`);
    const el = document.getElementById('log');
    if (el) el.textContent += `FAIL: ${m}\n`;
    throw new Error(m);
};

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
    canvas.width = 800; canvas.height = 600;
    const app = await Application.create({ canvas });
    log('app created');

    // Test 1: OrbitController damping.
    {
        const cam = new Camera({ aspect: 1 });
        const orbit = new OrbitController(cam, {
            target: [0, 0, 0], distance: 5, damping: 0.7,
        });
        const input = new Input();
        // Drag — velocidade injetada
        input.state.pointerButtons = 1;
        input.state.pointerDeltaX = 100;
        const ctx: ControllerContext = { input, dt: 1/60 };
        orbit.update(ctx);
        const camPosA = (cam.data['position'] as number[]).slice();
        // Solta drag — damping deve decair
        input.state.pointerButtons = 0;
        input.state.pointerDeltaX = 0;
        for (let i = 0; i < 60; i++) orbit.update(ctx);
        const camPosB = (cam.data['position'] as number[]).slice();
        // Após 60 frames de damping a 0.7^60, velocidade ~ 0; câmera deve
        // estar essencialmente parada após N=60 vs. paragem brusca onde
        // câmera ficaria no exato ponto após o drag.
        // Sanidade: positions A e B devem diferir (damping ainda movimentou).
        const diff = Math.hypot(
            camPosB[0]! - camPosA[0]!,
            camPosB[1]! - camPosA[1]!,
            camPosB[2]! - camPosA[2]!,
        );
        if (diff < 1e-6) fail(`damping não causou movimento residual após drag (diff=${diff})`);
        log(`OrbitController damping OK (deslocamento residual=${diff.toFixed(4)})`);
    }

    // Test 2: OrbitController pinch consume.
    {
        const cam = new Camera({ aspect: 1 });
        const orbit = new OrbitController(cam, {
            target: [0, 0, 0], distance: 10, pinchSensitivity: 0.01, damping: 0,
        });
        const input = new Input();
        input.state.pinchDelta = 50; // afasta dedos = zoom-in
        const ctx: ControllerContext = { input, dt: 1/60 };
        orbit.update(ctx);
        const pos = cam.data['position'] as number[];
        const dist = Math.hypot(pos[0]!, pos[1]!, pos[2]!);
        // Distance deve ter diminuído (zoom-in: distance × exp(-50 × 0.01) ≈ 10 × 0.6065 ≈ 6.06)
        if (dist > 7 || dist < 5) fail(`pinch zoom: distance=${dist.toFixed(2)} esperado~6.06`);
        log(`OrbitController pinch OK (distance=${dist.toFixed(2)} após pinch=+50)`);
    }

    // Test 3: FlyController keymap customizada.
    {
        const cam = new Camera({ aspect: 1 });
        const fly = new FlyController(cam, {
            position: [0, 0, 0], speed: 1,
            keymap: { up: ['KeyU'], down: ['KeyJ'] },
        });
        const input = new Input();
        const ctx: ControllerContext = { input, dt: 1/60 };
        // Default Q/E NÃO devem mais acionar up/down
        input.state.keys.add('KeyE');
        for (let i = 0; i < 10; i++) fly.update(ctx);
        const posAfterE = (cam.data['position'] as number[]).slice();
        if (Math.abs(posAfterE[1]!) > 1e-3) fail(`KeyE moveu y para ${posAfterE[1]} apesar de keymap custom`);
        // KeyU deve mover up
        input.state.keys.delete('KeyE');
        input.state.keys.add('KeyU');
        for (let i = 0; i < 10; i++) fly.update(ctx);
        const posAfterU = cam.data['position'] as number[];
        if (posAfterU[1]! <= 0) fail(`KeyU não moveu y (y=${posAfterU[1]})`);
        log(`FlyController keymap OK (KeyU=up, default KeyE inativo)`);
    }

    // Test 4: FpsController construção com canvas (auto pointer-lock).
    {
        const cam = new Camera({ aspect: 1 });
        const fps = new FpsController(cam, { canvas, position: [0, 0, 0] });
        const input = new Input();
        const ctx: ControllerContext = { input, dt: 1/60 };
        fps.update(ctx); // só verifica que não throw
        log('FpsController canvas-binding OK (sem crash; click chama requestPointerLock)');
    }

    log('CONTROLLERS POLISH SMOKE PASSED');
    void app;
}

main().catch(err => fail(String(err?.message ?? err)));
