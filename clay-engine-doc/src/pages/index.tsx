import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          <span className={styles.heroAccent}>Clay</span> Engine
        </Heading>
        <p className={styles.heroSubtitle}>
          {siteConfig.tagline}
        </p>
        <div className={styles.heroBadges}>
          <span className={styles.badge}>WebGPU</span>
          <span className={styles.badge}>TypeScript</span>
          <span className={styles.badge}>XPBD Physics</span>
          <span className={styles.badge}>Compute Shaders</span>
          <span className={styles.badge}>PBR Rendering</span>
        </div>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/classes/WebGPURenderer">
            Documentação API
          </Link>
          <Link
            className="button button--outline button--lg"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
            href="https://github.com/dantasgut/clayflow">
            GitHub →
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Clay Engine — Motor WebGPU"
      description="Motor 3D WebGPU em TypeScript com física XPBD, rendering PBR e partículas GPU">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
