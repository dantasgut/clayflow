import type { SceneContext } from '../../scene/SceneContext';
import { Input } from '../input/Input';
import { InteractionSystem } from '../input/InteractionSystem';

/** `Input` e `InteractionSystem` de uma cena e quantas aplicações os usam. */
interface SceneInteraction {
    readonly input: Input;
    readonly system: InteractionSystem;
    users: number;
}

const BY_SCENE = new WeakMap<SceneContext, SceneInteraction>();

/**
 * O `Input` (Resource singleton, inserido no World) e o `InteractionSystem` da cena (spec 007): criados pela primeira
 * aplicação, com os dispositivos ligados ao canvas dela; aplicações seguintes na mesma cena compartilham. Pareado com
 * `releaseSceneInteraction`.
 */
export function acquireSceneInteraction(
    scene: SceneContext,
    canvas: HTMLCanvasElement,
): SceneInteraction {
    const existing = BY_SCENE.get(scene);
    if (existing !== undefined) {
        existing.users++;
        return existing;
    }
    const input = new Input();
    scene.world.insert(input);
    const system = new InteractionSystem(
        { canvas, window: typeof window !== 'undefined' ? window : null },
        scene.events,
        scene.world,
        input,
    );
    system.attach();
    const entry: SceneInteraction = { input, system, users: 1 };
    BY_SCENE.set(scene, entry);
    return entry;
}

/** Libera um uso; o último descarta o `InteractionSystem` e tira o `Input` do World. */
export function releaseSceneInteraction(scene: SceneContext): void {
    const entry = BY_SCENE.get(scene);
    if (entry === undefined || --entry.users > 0) return;
    BY_SCENE.delete(scene);
    entry.system.dispose();
    scene.world.remove(entry.input);
}
