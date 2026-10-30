import { SectionPlaceholder } from '../../app/SectionPlaceholder';

export function FrostPurePage() {
  return (
    <SectionPlaceholder
      title="FrostPure"
      intro="Team Ayaz's lab notebook, workshop, 3D unit and path to market."
      pages={[
        { name: 'Hub', phase: 5 },
        { name: 'Lab', phase: 5 },
        { name: '3D Unit', phase: 7 },
        { name: 'Path to Market', phase: 5 },
      ]}
    />
  );
}
