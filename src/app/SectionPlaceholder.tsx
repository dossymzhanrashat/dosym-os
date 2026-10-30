import type { ReactNode } from 'react';
import { FreezeFrontHeader } from '../core/design/FreezeFront';

interface Props {
  title: string;
  gloss?: string;
  intro: string;
  /** Main pages this section will hold, with the build phase that delivers each. */
  pages: { name: string; phase: number }[];
  children?: ReactNode;
}

/** Placeholder used by each section until its build phase lands. */
export function SectionPlaceholder({ title, gloss, intro, pages, children }: Props) {
  return (
    <>
      <FreezeFrontHeader title={title} gloss={gloss} eyebrow="Dosym OS" value={0} valueLabel={`${title} progress`} valueText="Not started">
        <p className="m-0">{intro}</p>
      </FreezeFrontHeader>
      <div className="grid gap-3">
        {children}
        <section className="card" aria-labelledby={`${title}-pages`}>
          <h2 id={`${title}-pages`} className="card-title">
            Coming next
          </h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {pages.map((p) => (
              <li key={p.name} className="flex items-center justify-between gap-3">
                <span>{p.name}</span>
                <span className="chip">Phase {p.phase}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
