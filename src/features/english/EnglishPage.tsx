import { SectionPlaceholder } from '../../app/SectionPlaceholder';

export function EnglishPage() {
  return (
    <SectionPlaceholder
      title="English"
      gloss="Ағылшын тілі"
      intro="Spaced-repetition vocabulary and IELTS practice: B2 now, 8.0 by May 2027."
      pages={[
        { name: 'Review', phase: 2 },
        { name: 'Word Inbox', phase: 3 },
        { name: 'Practice Log', phase: 2 },
        { name: 'Stats', phase: 2 },
      ]}
    />
  );
}
