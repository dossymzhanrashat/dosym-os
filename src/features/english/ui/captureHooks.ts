import { useLive } from '../../../core/db/useLive';
import { useSetting } from '../../../core/planner/store';
import { EMPTY_EXPORT_STATE, EMPTY_HISTORY, EXPORT_STATE, IMPORT_HISTORY, type ExportState, type ImportRecord } from '../data/capture';
import { candidatesTable, useItTable } from '../data/db';
import type { Candidate, UseItAnswer } from '../model/types';

// Live reads for the capture pages.

const NO_CANDIDATES: Candidate[] = [];
const NO_ANSWERS: UseItAnswer[] = [];

export function useCandidates(): Candidate[] {
  return useLive(async () => (await candidatesTable.toArray()).filter((c) => !c.deletedAt), [], NO_CANDIDATES);
}

export function useUseItAnswers(): UseItAnswer[] {
  return useLive(async () => (await useItTable.toArray()).filter((a) => !a.deletedAt), [], NO_ANSWERS);
}

export function useImportHistory(): ImportRecord[] {
  return useSetting(IMPORT_HISTORY, EMPTY_HISTORY);
}

export function useExportState(): ExportState {
  return useSetting(EXPORT_STATE, EMPTY_EXPORT_STATE);
}
