import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type Feature = {
  icon: string;
  title: string;
  description: string;
  tag: string;
};

const FEATURES: Feature[] = [
  {
    icon: '⚡',
    title: 'Pipeline de Física Multi-Stage',
    description:
      'Force → Broadphase → Narrowphase → Resolution → Integration → Sleep → Sync. ' +
      'Substeps configuráveis (padrão 8) para estabilidade numérica.',
    tag: 'RigidBody · SoftBody',
  },
  {
    icon: '🎯',
    title: 'XPBD — Soft Bodies',
    description:
      'Malhas deformáveis com constraints de distância Extended Position-Based Dynamics. ' +
      'Compliance por aresta, partículas fixadas e colisão com SDF.',
    tag: 'XPBD · Spring-Mass',
  },
  {
    icon: '🔺',
    title: 'Colisão SAT & SDF',
    description:
      'Separating Axis Theorem para OBB×OBB, clipping Sutherland-Hodgman, ' +
      'manifolds multi-ponto e Signed Distance Fields para formas arbitrárias.',
    tag: 'SAT · Narrowphase',
  },
  {
    icon: '✨',
    title: 'Partículas GPU',
    description:
      '50k+ partículas via compute shader WebGPU. Workgroup 256, ring buffer, ' +
      'age < 0 = slot morto. Shapes: Point, Sphere, Cone.',
    tag: 'Compute Shader · 50k+',
  },
  {
    icon: '🎨',
    title: 'Rendering PBR',
    description:
      'Standard Material com cor, roughness, metallic e emissive. ' +
      'Iluminação Lambertian via WGSL. Batching por pipeline e render bundles para geometria estática.',
    tag: 'WebGPU · WGSL · PBR',
  },
  {
    icon: '📐',
    title: 'Geometrias Paramétricas',
    description:
      'f(u,v) → vec3 genérico. Exemplos inclusos: toro, Klein, onda. ' +
      'Wireframe grosso via expansão de quads no vertex shader.',
    tag: 'Paramétricas · Wireframe',
  },
];

type QuickLink = {
  icon: string;
  label: string;
  sub: string;
  to: string;
};

const QUICK_LINKS: QuickLink[] = [
  {
    icon: '🏛️',
    label: 'Classes',
    sub: '44 classes documentadas',
    to: '/docs/classes/WebGPURenderer',
  },
  {
    icon: '🔌',
    label: 'Interfaces',
    sub: '25 interfaces & contratos',
    to: '/docs/interfaces/PhysicsStage',
  },
  {
    icon: '🔢',
    label: 'Enumerações',
    sub: 'Enums do engine',
    to: '/docs/enumerations/ResolutionType',
  },
  {
    icon: '📦',
    label: 'Tipos',
    sub: 'Type aliases exportados',
    to: '/docs/type-aliases/VertexFormatType',
  },
];

function FeatureCard({ icon, title, description, tag }: Feature) {
  return (
    <div className={styles.card}>
      <span className={styles.cardIcon}>{icon}</span>
      <div className={styles.cardTitle}>{title}</div>
      <p className={styles.cardDesc}>{description}</p>
      <span className={styles.cardTag}>{tag}</span>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <>
      {/* Features */}
      <section className={styles.section}>
        <div className="container">
          <Heading as="h2" className={styles.sectionTitle}>
            O que o Clay Engine oferece
          </Heading>
          <p className={styles.sectionSubtitle}>
            Motor 3D WebGPU em TypeScript com física, rendering e partículas em tempo real
          </p>
          <div className={styles.grid}>
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className={styles.linksSection}>
        <div className="container">
          <Heading as="h2" className={styles.linksSectionTitle}>
            Navegar na API
          </Heading>
          <div className={styles.linksGrid}>
            {QUICK_LINKS.map((l) => (
              <Link key={l.label} to={l.to} className={styles.linkCard}>
                <span className={styles.linkCardIcon}>{l.icon}</span>
                <div>
                  <div className={styles.linkCardLabel}>{l.label}</div>
                  <div className={styles.linkCardSub}>{l.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
