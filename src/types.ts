export enum Decision {
  STRONG_FIT = "Strong Fit",
  POTENTIAL_FIT = "Potential Fit",
  NOT_A_FIT = "Not a Fit",
}

export enum RiskLevel {
  LOW = "Low",
  MEDIUM = "Medium",
  HIGH = "High",
}

export interface CandidateEvaluation {
  name: string;
  decision: Decision;
  score: number;
  reason: string;
  strengths: string[];
  weaknesses: string[];
  risk: {
    level: RiskLevel;
    reason: string;
  };
  recommendation: string;
}

export interface EvaluationResponse {
  jdValidation?: string;
  evaluations: CandidateEvaluation[];
}
