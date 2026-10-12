export const PEC_STAGES: string[];
export const BILLING_STAGES: string[];
export const BILLING_STATUSES: string[];
export const BUSINESS_STATUSES: string[];
export const DOCUMENT_KINDS: Record<string,string>;
export const cents: (value: unknown) => number;
export function pecAmounts(task: Record<string,any>): {total_reimbursed:number;patient_share:number;optimization_gain:number;mutual_optimization:number;eligible:boolean;optimized:boolean;billed_amount:number};
export function automaticSummary(task: Record<string,any>, financial?: boolean): string;
