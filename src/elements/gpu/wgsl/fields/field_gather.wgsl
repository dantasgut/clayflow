// Junção das partículas dos fluidos com superfície (spec 033, R11): por corpo (uma região do uniform por corpo), a
// posição de cada partícula viva do pool vai ao array compacto `field_items` (xyz; w = o corpo, índice + 1, ≥ 1); a
// partícula de slot livre fica fora (w < 0: a grade de vizinhança e a marcação a ignoram).
// Depois da grade, `field_sort_main` (`field_sort.wgsl`) copia as partículas na ordem das células.
// O contato de cada partícula (o sólido mais próximo, escrito pelo solver; spec 034) vai a `field_contacts` no mesmo
// índice — normal zero quando o registro não o tem.
// A partícula viva retirada (a que saiu do domínio aberto ou passou à película, parada muito abaixo da cena) vai aos
// baldes das retiradas em `field_drips` (`field_drops.wgsl`): a película a devolve à simulação no pingo (T066d).
// A gota solta que desliza encostada num sólido (o estado que o solver deixou, `fluid_drop_state`) é água abaixo da
// resolução das partículas: vai aos baldes das passadas à película — a película recebe o volume dela (o ponto e a
// normal do contato pelo array compacto), e o corpo a retira no fim do quadro (T066d).
// A velocidade de cada partícula vai a `field_velocities` no mesmo índice (zero quando o registro não a tem): a água
// passada à película espalha pelo impacto (`field_absorb_prepare_main`).
// Requer: WORKGROUP_SIZE, NONE, field_gather, field_particles, field_live, pool_live, field_items (escrita),
// field_contacts (escrita), field_velocities (escrita), field_drips, field_drops, FIELD_FILM_DRIPS.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_gather_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= field_gather.count) { return; }
    let slot = field_gather.first + i;
    let p = field_particles[slot * field_gather.strideVec4 + field_gather.posOffsetVec4].xyz;
    let alive = pool_live(field_live[slot >> 5u], slot);
    let live = alive && all(abs(p) < vec3f(1e6));
    field_items[field_gather.base + i] = vec4f(p, select(-1.0, f32(field_gather.body), live));
    let item = field_gather.base + i;
    if (alive && p.y < -1e6) { atomicMax(&field_drips[field_retired_word(item % FIELD_FILM_DRIPS)], ~item); }
    var contact = vec4f(0.0, 0.0, 0.0, 3.0e38);
    if (field_gather.contactOffsetVec4 != NONE) {
        contact = field_particles[slot * field_gather.strideVec4 + field_gather.contactOffsetVec4];
    }
    field_contacts[field_gather.base + i] = contact;
    var vel = vec4f(0.0);
    if (field_gather.velOffsetVec4 != NONE) {
        vel = vec4f(field_particles[slot * field_gather.strideVec4 + field_gather.velOffsetVec4].xyz, 0.0);
    }
    field_velocities[field_gather.base + i] = vel;
    // A gota que desliza passa à película (o solver só a marca encostada).
    if (!live || field_gather.dropOffsetVec4 == NONE || dot(contact.xyz, contact.xyz) <= 0.25) { return; }
    if (field_particles[slot * field_gather.strideVec4 + field_gather.dropOffsetVec4].w >= 0.0) { return; }
    atomicMax(&field_drips[field_absorb_word(item % FIELD_FILM_DRIPS)], ~item);
}
