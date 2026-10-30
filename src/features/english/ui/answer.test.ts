import { describe, expect, it } from 'vitest';
import { nextAllowed } from '../data/planner';
import { editDistance, gradeTyped, letterDiff, splitTarget } from './answer';

describe('typed answers', () => {
  it('pre-selects Good for exact, Hard for one typo, Again otherwise', () => {
    expect(gradeTyped(' Accommodation ', 'accommodation')).toBe(3);
    expect(gradeTyped('accomodation', 'accommodation')).toBe(2);
    expect(gradeTyped('acomodation', 'accommodation')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('marks wrong letters for the spelling card', () => {
    expect(letterDiff('necesary', 'necessary').map((l) => l.ok)).toEqual([true, true, true, true, true, false, false, false]);
  });

  it('finds the example target for cloze and highlighting', () => {
    expect(splitTarget('The debate continues unabated.', 'unabated')).toEqual(['The debate continues ', 'unabated', '.']);
    expect(splitTarget('Immersive experiences matter.', 'immersive')).toEqual(['', 'Immersive', ' experiences matter.']);
    expect(splitTarget('No match here', 'absent')).toBeNull();
  });
});

describe('English notification times (tests run in Almaty time)', () => {
  const school = { start: '08:00', end: '15:00' };
  const at = (iso: string) => new Date(iso);
  const hhmm = (d: Date) => `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  it('keeps 07:15 on a school day, moves school hours to 15:00 and quiet hours to 07:00', () => {
    expect(hhmm(nextAllowed(at('2026-11-02T07:15:00+05:00'), school))).toBe('2 07:15'); // Monday
    expect(hhmm(nextAllowed(at('2026-11-03T09:30:00+05:00'), school))).toBe('3 15:00'); // Tuesday, school
    expect(hhmm(nextAllowed(at('2026-11-03T23:10:00+05:00'), school))).toBe('4 07:00'); // quiet
    expect(hhmm(nextAllowed(at('2026-11-07T09:30:00+05:00'), school))).toBe('7 09:30'); // Saturday
  });
});
