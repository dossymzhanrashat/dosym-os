import { SectionPlaceholder } from '../../app/SectionPlaceholder';

export function TagylymPage() {
  return (
    <SectionPlaceholder
      title="Tagylym"
      gloss="Тағылым"
      intro="Kit options, decision matrix, pipelines and business tools for the grades 1–6 robotics kit."
      pages={[
        { name: 'Options', phase: 6 },
        { name: 'Compare', phase: 6 },
        { name: 'Pipeline', phase: 6 },
        { name: '3D Studio', phase: 7 },
      ]}
    />
  );
}
