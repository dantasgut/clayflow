import { wgslModule } from '../../scene/shaders/WgslModule';
import { FluidSurfaceMaterialSchema } from './FluidSurfaceMaterialSchema';

/**
 * IOR efetivo da água para o raio refratado (spec 034): o físico (`ior`) escalado pelo `refraction` do material — 0,05
 * (o padrão) é o desvio físico, 0 não desvia. O mesmo na entrada da água (os pedidos dela) e nas faces dela atingidas
 * pelos raios (`ray_volume_medium`).
 */
export const fluidRefractionIor = wgslModule({
    name: 'fluid_refraction_ior',
    structs: [FluidSurfaceMaterialSchema],
    source: `/** O valor de refraction do material que dá o desvio físico pelo IOR. */
const FLUID_REFRACTION_PHYSICAL: f32 = 0.05;

fn fluid_refraction_ior(m: FluidSurfaceMaterial) -> f32 {
    return 1.0 + (max(m.ior, 1.0) - 1.0) * max(m.refraction, 0.0) / FLUID_REFRACTION_PHYSICAL;
}`,
});
