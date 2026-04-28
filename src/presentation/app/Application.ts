import {
    bootstrap,
    engine,
    events,
    flows,
    resourceSystem,
    world,
    consumers,
    layoutInferencer,
    executionSystem,
} from '../../scene/index';
import type { CanvasOptions, FlowRegistry, World } from '../../scene/index';
import { GameLoop } from './GameLoop';
import { Time } from './Time';
import {
    registerPresentationDefaults,
    type PresentationDefaults,
} from '../flows/defaults';

export interface ApplicationOptions {
    canvas: HTMLCanvasElement;
    canvasOptions?: CanvasOptions;
}

export class Application {
    readonly world: World;
    readonly flows: FlowRegistry;
    readonly time: Time;
    readonly defaults: PresentationDefaults;
    readonly canvas: HTMLCanvasElement;
    private readonly loop: GameLoop;

    private constructor(options: ApplicationOptions, defaults: PresentationDefaults) {
        this.canvas = options.canvas;
        this.world = world;
        this.flows = flows;
        this.time = new Time();
        this.defaults = defaults;
        this.loop = new GameLoop(events, this.time);
        world.insert(this.time);
    }

    static async create(options: ApplicationOptions): Promise<Application> {
        if (options.canvasOptions !== undefined) {
            await bootstrap({ canvas: options.canvas, canvasOptions: options.canvasOptions });
        } else {
            await bootstrap({ canvas: options.canvas });
        }
        const defaults = registerPresentationDefaults(flows, {
            canvas: options.canvas,
            core: engine,
            world,
            resources: resourceSystem,
        });
        return new Application(options, defaults);
    }

    start(): void {
        this.loop.start();
    }

    stop(): void {
        this.loop.stop();
    }

    isRunning(): boolean {
        return this.loop.isRunning();
    }

    get core() { return engine; }
    get events() { return events; }
    get resources() { return resourceSystem; }
    get consumers() { return consumers; }
    get layoutInferencer() { return layoutInferencer; }
    get executionSystem() { return executionSystem; }
}
