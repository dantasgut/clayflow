import type { EngineCore } from '../../core/contracts/index';
import type { FlowRegistry } from '../../scene/flows/FlowRegistry';
import type { ResourceSystem } from '../../scene/systems/ResourceSystem';
import type { World } from '../../scene/world/World';
import { ForwardFlow } from './ForwardFlow';
import { ShadowFlow } from './ShadowFlow';
import { PostFlow } from './PostFlow';
import { UIFlow } from './UIFlow';
import { DebugFlow } from './DebugFlow';

export interface PresentationDefaultsOptions {
    readonly canvas: HTMLCanvasElement;
    readonly core: EngineCore;
    readonly world: World;
    readonly resources: ResourceSystem;
}

export interface PresentationDefaults {
    readonly forward: ForwardFlow;
    readonly shadow: ShadowFlow;
    readonly post: PostFlow;
    readonly ui: UIFlow;
    readonly debug: DebugFlow;
}

export function registerPresentationDefaults(
    flows: FlowRegistry,
    options: PresentationDefaultsOptions,
): PresentationDefaults {
    const shadow = new ShadowFlow(options.core, options.world, options.resources);
    const forward = new ForwardFlow(options.core, options.world, options.resources, options.canvas).bindShadowFlow(shadow);
    const post = new PostFlow({ canvas: options.canvas }, options.core).bindForwardFlow(forward);
    forward.setRenderToOffscreen(true);
    const ui = new UIFlow(options.core, options.canvas);
    const debug = new DebugFlow();
    flows.register(shadow);
    flows.register(forward);
    flows.register(post);
    flows.register(debug);
    flows.register(ui);
    return { forward, shadow, post, ui, debug };
}
