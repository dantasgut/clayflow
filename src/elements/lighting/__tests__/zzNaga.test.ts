import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { LayoutInferencer } from '../../../scene/systems/LayoutInferencer';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { hitShade, hitShadeConstants } from '../../raytrace/hitShade';
import { rayWaveBins } from '../../raytrace/wave/shaders';
import { causticsInstances, causticsTrace } from '../caustics/shaders';
import { giProbeTrace, giScreenTrace } from '../shaders';
import { refractionCamera, refractionChain } from '../refraction/shaders';
import { fieldBodyClosures, fieldLightMap, fieldLightTransmission, fieldMesh, fieldRayLight, fieldRayTransmittance } from '../../fields/shaders';
import { refractionVolumeMesh } from '../refraction/shaders';
it('dump', () => {
    const f = new MaterialFunction({ code: 'fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    return closure_diffuse(m.albedo.rgb, 0.0);\n}' });
    const mods = { fieldRayLight, fieldMesh, volumeMesh: refractionVolumeMesh.single, fieldLightMap, fieldLightTransmission, refractionChain, refractionCamera, fieldBodyClosures, fieldRayTransmittance, causticsTrace, giProbeTrace, giScreenTrace, causticsInstances, rayWaveBins, hitShadeConstants, hitShade: hitShade({ ...f.composite!, returnsClosure: f.returnsClosure }) };
    for (const [name, m] of Object.entries(mods)) writeFileSync('/private/tmp/claude-501/-Users-dantasgut-Documents-dev-geom-diff-calc-clayflow/0db1165c-31da-4a98-aebf-d257d0e29a91/scratchpad/naga/' + name + '.wgsl', composeWgsl(m).spec.source);
    const entries: [unknown, string][] = [[causticsTrace, 'caustics_trace_main'], [causticsTrace, 'caustics_photon_hit_main'], [causticsTrace, 'caustics_photon_follow_main'], [causticsTrace, 'caustics_targets_main'], [giProbeTrace, 'gi_probe_trace_main'], [giScreenTrace, 'gi_screen_trace_main'], [refractionChain, 'refraction_chain_hit_main'], [refractionChain, 'refraction_chain_follow_main'], [refractionChain, 'refraction_chain_resolve_main'], [refractionChain, 'refraction_chain_roots_main']];
    for (const [m, e] of entries) {
        const l = new LayoutInferencer().infer(composeWgsl(m as never) as never, [e]);
        const st = l.groups.flatMap((g) => g.entries).filter((x) => String(x.resource).includes('storage')).map((x) => x.name);
        process.stdout.write(e + ' ' + st.length + ' ' + st.join(',') + '\n');
    }
});
