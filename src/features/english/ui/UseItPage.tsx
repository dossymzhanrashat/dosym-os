import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BridgeSheet } from '../../../core/bridge/BridgeSheet';
import type { AnyBridgeJob } from '../../../core/bridge/bridge';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { almatyParts } from '../../../core/planner/time';
import { gradeJob } from '../bridge/jobs';
import { addCorrectedExample, dismissAnswer, practiseAgain, USE_IT_BATCH, waitingAnswers } from '../data/useIt';
import type { Grade, UseItAnswer } from '../model/types';
import { useUseItAnswers } from './captureHooks';
import './english.css';

/*
 * Use-it feedback (SPEC § 12.3 as a weekly Claude Bridge batch, up to 20 sentences, best done with
 * the Sunday weekly review). Claude's grade is a suggestion: if it is lower than mine, one tap
 * brings the card back today; the corrected sentence can become the word's newest example.
 */

const GRADE_NAME: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
const NATURAL = ['not English', 'understandable but wrong', 'correct but awkward', 'natural'];
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Almaty' });

function Feedback({ a }: { a: UseItAnswer }) {
  const [done, setDone] = useState('');
  const f = a.feedback!;
  const lower = a.selfGrade !== undefined && f.suggestedGrade < a.selfGrade;
  return (
    <GlassCard size="md" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{a.target}</strong>
        <Chip tone={f.usedCorrectly ? 'good' : 'warm'}>{f.usedCorrectly ? 'used correctly' : 'not quite'}</Chip>
        <Chip>{NATURAL[f.naturalness]}</Chip>
        <span className="text-sm">{day.format(new Date(a.writtenAt))}</span>
      </div>
      <p className="m-0">
        <span className="text-sm">You wrote: </span>
        {a.sentence}
      </p>
      {f.corrected.trim() !== a.sentence.trim() && (
        <p className="m-0">
          <span className="text-sm">Better: </span>
          <strong>{f.corrected}</strong>
        </p>
      )}
      {f.errors.length > 0 && (
        <ul className="m-0 pl-5">
          {f.errors.map((e, i) => (
            <li key={i}>
              “{e.span}” — {e.type}: {e.explanation}
            </li>
          ))}
        </ul>
      )}
      {f.tip && <p className="m-0 text-sm">Tip: {f.tip}</p>}
      <p className="m-0 text-sm">
        Claude suggests <strong>{GRADE_NAME[f.suggestedGrade]}</strong>
        {a.selfGrade !== undefined && <> · you gave yourself {GRADE_NAME[a.selfGrade]}</>}
      </p>
      <div className="flex flex-wrap gap-2">
        {(lower || !f.usedCorrectly) && (
          <PillButton
            variant="secondary"
            onClick={async () => {
              await practiseAgain(a);
              setDone('Back in today’s reviews.');
            }}
          >
            Practise again today
          </PillButton>
        )}
        <PillButton
          variant="secondary"
          onClick={async () => {
            await addCorrectedExample(a);
            setDone('Saved as the word’s newest example.');
          }}
        >
          Keep {f.corrected.trim() !== a.sentence.trim() ? 'the corrected' : 'my'} sentence as an example
        </PillButton>
        <PillButton variant="secondary" onClick={() => void dismissAnswer(a)}>
          Hide
        </PillButton>
      </div>
      {done && (
        <p className="m-0 text-sm" role="status">
          {done}
        </p>
      )}
    </GlassCard>
  );
}

export function UseItPage() {
  const answers = useUseItAnswers();
  const [job, setJob] = useState<AnyBridgeJob | null>(null);
  const waiting = useMemo(() => waitingAnswers(answers), [answers]);
  const graded = useMemo(() => answers.filter((a) => a.feedback).sort((a, b) => (b.feedbackAt ?? '').localeCompare(a.feedbackAt ?? '')), [answers]);
  const sunday = almatyParts(new Date()).weekday === 0;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Use it
        </p>
        <h1 className="ff-title">Use-it feedback</h1>
        <p className="m-0">Sentences you wrote on Use-it cards, marked by Claude once a week like an IELTS examiner.</p>
      </header>

      <div className="grid gap-3">
        <GlassCard className="grid gap-3">
          <p className="m-0">
            <strong>{waiting.length}</strong> {waiting.length === 1 ? 'sentence is' : 'sentences are'} waiting for feedback.
            {!sunday && waiting.length > 0 && ' Best done on Sunday with the weekly review, but any day works.'}
          </p>
          {waiting.length > 0 && (
            <PillButton className="justify-self-start" onClick={() => setJob(gradeJob(waiting.slice(0, USE_IT_BATCH)))}>
              Get feedback ({Math.min(USE_IT_BATCH, waiting.length)})
            </PillButton>
          )}
          {waiting.length === 0 && <p className="m-0 text-sm">Use-it cards appear in reviews once a word holds for 7 days or more.</p>}
        </GlassCard>

        {graded.map((a) => (
          <Feedback key={a.id} a={a} />
        ))}
      </div>
      <BridgeSheet job={job} onClose={() => setJob(null)} />
    </>
  );
}
