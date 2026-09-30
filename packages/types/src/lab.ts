/** Offline labs / project reviews: faculty mark students against criteria (e.g. Presentation /5). */

export interface LabCriterion {
  id: string;
  text: string;
  max: number;
}

export interface LabStats {
  students: number;
  marked: number;
  absent: number;
  /** Over marked, present students. */
  average: number | null;
  highest: number | null;
  lowest: number | null;
  /** Average per criterion id. */
  criteriaAverage: Record<string, number | null>;
}

export interface LabSummary {
  id: string;
  title: string;
  description: string | null;
  heldOn: string | null;
  criteria: LabCriterion[];
  maxTotal: number;
  assignToAll: boolean;
  departments: { id: string; name: string }[];
  createdBy: string | null;
  createdAt: string;
  stats: LabStats;
}

export interface LabSheetRow {
  userId: string;
  fullName: string;
  externalId: string | null;
  department: string | null;
  scores: Record<string, number | null>;
  absent: boolean;
  remarks: string | null;
  total: number | null;
  updatedAt: string | null;
}

export interface LabSheet extends LabSummary {
  rows: LabSheetRow[];
}

export interface MyLabResult {
  id: string;
  title: string;
  description: string | null;
  heldOn: string | null;
  organizationName: string;
  criteria: LabCriterion[];
  maxTotal: number;
  scores: Record<string, number | null>;
  absent: boolean;
  remarks: string | null;
  total: number | null;
  classAverage: number | null;
  highest: number | null;
  updatedAt: string;
}
