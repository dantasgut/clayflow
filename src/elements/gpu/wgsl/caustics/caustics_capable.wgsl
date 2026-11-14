// O que faz cáustica (spec 034, T067c; antes na GI, spec 033 US5): o fechamento com transmissão lisa (vidro, água) ou
// metal liso — os fótons das cáusticas levam a luz pelo caminho especular deles, e quem coleta a luz rebatida (as sondas
// da GI) não lê de novo o especular direto deles com as cáusticas ativas.
// Requer: closure.

/** Rugosidade abaixo da qual vidro e metal fazem cáustica. */
const CAUSTICS_ROUGH: f32 = 0.3;

/** O fechamento faz cáustica (transmissão ou metal liso, `CAUSTICS_ROUGH`)? */
fn caustics_capable(c: Closure) -> bool {
    return (c.transmission_weight > 0.5 && c.transmission_roughness < CAUSTICS_ROUGH)
        || (c.conductor_weight > 0.5 && c.specular_roughness < CAUSTICS_ROUGH);
}
