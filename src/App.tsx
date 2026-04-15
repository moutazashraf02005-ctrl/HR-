import React, { useState } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  UserCheck, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Plus, 
  Trash2,
  ShieldAlert,
  Search,
  Briefcase,
  Upload,
  FileUp
} from "lucide-react";
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker source for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Decision, RiskLevel, type EvaluationResponse, type CandidateEvaluation } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [jobDescription, setJobDescription] = useState("");
  const [candidates, setCandidates] = useState([{ id: 1, text: "", isExtracting: false }]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [results, setResults] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addCandidate = () => {
    setCandidates([...candidates, { id: Date.now(), text: "", isExtracting: false }]);
  };

  const removeCandidate = (id: number) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter(c => c.id !== id));
    }
  };

  const updateCandidate = (id: number, text: string) => {
    setCandidates(candidates.map(c => c.id === id ? { ...c, text } : c));
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    
    return fullText;
  };

  const handleFileUpload = async (id: number, file: File) => {
    if (file.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }

    setCandidates(prev => prev.map(c => c.id === id ? { ...c, isExtracting: true } : c));
    
    try {
      const text = await extractTextFromPDF(file);
      updateCandidate(id, text);
    } catch (err) {
      console.error("PDF extraction error:", err);
      setError("Failed to extract text from PDF. Please try pasting the text manually.");
    } finally {
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, isExtracting: false } : c));
    }
  };

  const evaluate = async () => {
    if (!jobDescription.trim()) {
      setError("Please provide a Job Description.");
      return;
    }
    if (candidates.some(c => !c.text.trim())) {
      setError("Please provide text for all candidate CVs.");
      return;
    }

    setIsEvaluating(true);
    setError(null);
    setResults(null);

    try {
      const prompt = `
        You are a strict AI hiring filter system. Your primary goal is to REJECT unqualified candidates before scoring.
        
        JOB DESCRIPTION:
        ${jobDescription}
        
        CANDIDATE CVs:
        ${candidates.map((c, i) => `CANDIDATE ${i + 1}:\n${c.text}`).join("\n\n---\n\n")}
        
        FOLLOW THESE STEPS STRICTLY:
        
        STEP 0: JOB DESCRIPTION VALIDATION
        Check if the Job Description clearly includes: Required skills, Tools/technologies, Years of experience, Role/seniority level.
        If unclear or incomplete, include a "jdValidation" warning in the response.
        
        STEP 1: HARD REJECTION FILTER (CRITICAL)
        For each candidate: If ANY of the following are NOT met → IMMEDIATELY REJECT:
        - Missing MUST-HAVE skills explicitly mentioned in the job
        - Experience is below required minimum
        - Candidate field is not relevant to the role
        THEN: Decision = "Not a Fit", Score = 0, Skip detailed evaluation.
        
        STEP 2: MATCH VALIDATION (ONLY IF PASSED STEP 1)
        Check: Skills match accuracy, Experience relevance, Tools alignment.
        If weak alignment → downgrade score significantly.
        
        STEP 3: SCORING (ONLY IF PASSED STEP 1)
        Score out of 10 based on: Skills match (40%), Experience relevance (30%), Tools/technologies (20%), Education/certifications (10%).
        STRICT RULE: Do NOT assume missing skills. Do NOT inflate score. Average candidate = 5–6 max.
        
        STEP 4: DECISION TAG
        - Strong Fit (8–10 only)
        - Potential Fit (6–7.9 only)
        - Not a Fit (below 6 OR rejected)
        
        STEP 5-7: ANALYSIS, RISK, RECOMMENDATION
        Provide strengths, weaknesses, risk analysis, and final recommendation.
        
        OUTPUT FORMAT:
        Return a JSON object with:
        - jdValidation: string (optional)
        - evaluations: array of objects with:
          - name: string
          - decision: "Strong Fit" | "Potential Fit" | "Not a Fit"
          - score: number
          - reason: string (2-3 lines)
          - strengths: string[] (3-5)
          - weaknesses: string[] (2-4)
          - risk: { level: "Low" | "Medium" | "High", reason: string }
          - recommendation: string
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              jdValidation: { type: Type.STRING },
              evaluations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    decision: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    reason: { type: Type.STRING },
                    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                    risk: {
                      type: Type.OBJECT,
                      properties: {
                        level: { type: Type.STRING },
                        reason: { type: Type.STRING }
                      },
                      required: ["level", "reason"]
                    },
                    recommendation: { type: Type.STRING }
                  },
                  required: ["name", "decision", "score", "reason", "strengths", "weaknesses", "risk", "recommendation"]
                }
              }
            },
            required: ["evaluations"]
          }
        }
      });

      const data = JSON.parse(response.text || "{}") as EvaluationResponse;
      setResults(data);
    } catch (err) {
      console.error(err);
      setError("An error occurred during evaluation. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-brand-red/30">
      {/* Header */}
      <header className="bg-black artistic-header-border h-20 flex items-center justify-between px-8 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-black tracking-tighter text-brand-red">
            SENTINEL-X // FILTRATION
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[2px] text-zinc-500 font-bold">
          SCANNING MODE: AGGRESSIVE_REJECTION // ALPHA_BUILD_4
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-8">
        {!results && !isEvaluating ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12">
            {/* Input Section */}
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                  <Briefcase className="w-4 h-4 text-brand-red" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Job Specification</h2>
                </div>
                <Textarea 
                  placeholder="Paste the full job description here... (Include must-haves, experience, tools)"
                  className="min-h-[250px] bg-panel-bg border-zinc-800 text-zinc-200 focus:border-brand-red transition-colors rounded-none"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-brand-red" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Candidates</h2>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addCandidate}
                    className="border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-none h-8 text-[10px] uppercase tracking-wider"
                  >
                    <Plus className="w-3 h-3 mr-2" /> Add Candidate
                  </Button>
                </div>

                <div className="grid gap-6">
                  {candidates.map((candidate, index) => (
                    <motion.div
                      key={candidate.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <div className="bg-panel-bg border border-zinc-800 p-6 relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-brand-red/20" />
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Candidate Entry #{index + 1}</span>
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <input
                                type="file"
                                accept=".pdf"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(candidate.id, file);
                                }}
                                disabled={candidate.isExtracting}
                              />
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-none h-8 text-[10px] uppercase tracking-wider"
                                disabled={candidate.isExtracting}
                              >
                                {candidate.isExtracting ? (
                                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                ) : (
                                  <FileUp className="w-3 h-3 mr-2" />
                                )}
                                {candidate.isExtracting ? "Extracting..." : "Upload PDF"}
                              </Button>
                            </div>
                            {candidates.length > 1 && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => removeCandidate(candidate.id)}
                                className="text-zinc-600 hover:text-brand-red h-6 w-6"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <Textarea 
                          placeholder="Paste candidate CV/Resume text here..."
                          className="min-h-[150px] bg-black border-zinc-800 text-zinc-200 focus:border-brand-red rounded-none"
                          value={candidate.text}
                          onChange={(e) => updateCandidate(candidate.id, e.target.value)}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <Button 
                className="w-full h-16 bg-brand-red hover:bg-red-700 text-black font-black text-xl uppercase tracking-tighter rounded-none shadow-2xl"
                onClick={evaluate}
                disabled={isEvaluating}
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                    Executing Filtration...
                  </>
                ) : (
                  <>
                    <Search className="w-6 h-6 mr-3" />
                    Run Evaluation
                  </>
                )}
              </Button>

              {error && (
                <Alert variant="destructive" className="bg-red-950/50 border-brand-red text-red-200 rounded-none">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-xs font-bold uppercase tracking-widest">System Error</AlertTitle>
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}
            </div>

            {/* Empty State / Info */}
            <div className="hidden lg:block space-y-8">
              <div className="border border-zinc-800 p-8 bg-panel-bg/50">
                <FileText className="w-12 h-12 mb-6 text-zinc-800" />
                <h3 className="text-sm font-bold uppercase tracking-widest mb-4">Filtration Protocol</h3>
                <p className="text-zinc-500 text-sm leading-relaxed space-y-4">
                  The Sentinel-X system applies a multi-stage rejection logic. 
                  <br /><br />
                  <span className="text-brand-red">Stage 1:</span> Hard Filter. Missing core requirements triggers immediate disqualification.
                  <br /><br />
                  <span className="text-brand-red">Stage 2:</span> Alignment Scoring. Candidates are measured against the JD with zero assumptions.
                </p>
              </div>
            </div>
          </div>
        ) : isEvaluating ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="relative w-32 h-32 mb-8">
              <div className="absolute inset-0 border-2 border-brand-red/10 rounded-full"></div>
              <div className="absolute inset-0 border-2 border-brand-red border-t-transparent rounded-full animate-spin"></div>
              <ShieldAlert className="absolute inset-0 m-auto w-12 h-12 text-brand-red" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Analyzing Data Streams</h3>
            <p className="text-zinc-500 text-sm uppercase tracking-widest animate-pulse">
              Verifying mandatory skillsets // Calculating risk vectors
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {results?.jdValidation && (
              <Alert className="bg-amber-950/20 border-amber-900/50 text-amber-200 rounded-none">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-xs font-bold uppercase tracking-widest">JD Integrity Warning</AlertTitle>
                <AlertDescription className="text-sm">{results.jdValidation}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-12">
              {results?.evaluations.map((evalData, idx) => (
                <EvaluationResult key={idx} evaluation={evalData} />
              ))}
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => setResults(null)}
              className="border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-none uppercase text-[10px] tracking-widest"
            >
              ← Return to Input Mode
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

const EvaluationResult: React.FC<{ evaluation: CandidateEvaluation }> = ({ evaluation }) => {
  const isRejected = evaluation.decision === Decision.NOT_A_FIT;

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-[300px_1fr_280px] min-h-[500px] border border-zinc-800 bg-black overflow-hidden">
      {/* Sidebar */}
      <div className="bg-panel-bg border-r border-zinc-800 p-10 flex flex-col">
        <div className="candidate-name text-[42px] font-black leading-[0.9] uppercase mb-6 break-words">
          {evaluation.name.split(' ').map((part, i) => (
            <span key={i} className="block">{part}</span>
          ))}
        </div>
        
        <div className="inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-brand-red text-brand-red w-fit mb-12">
          {evaluation.decision}
        </div>

        <div className="mt-auto">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-2">Evaluation Score</span>
          <div className="text-[110px] font-black leading-[0.8] tracking-[-5px] flex items-baseline">
            {evaluation.score}
            <span className="text-2xl tracking-normal ml-2 text-zinc-700">/10</span>
          </div>
        </div>
      </div>

      {/* Main Panel */}
      <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-8">
          <div className="analysis-section">
            <h3 className="text-[11px] font-bold uppercase tracking-[2px] text-brand-red border-b border-zinc-800 pb-2 mb-6">Strengths</h3>
            <ul className="space-y-4">
              {evaluation.strengths.map((s, i) => (
                <li key={i} className="analysis-list-item text-sm text-zinc-300 leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-8">
          <div className="analysis-section">
            <h3 className="text-[11px] font-bold uppercase tracking-[2px] text-brand-red border-b border-zinc-800 pb-2 mb-6">Weaknesses / Gaps</h3>
            <ul className="space-y-4">
              {evaluation.weaknesses.map((w, i) => (
                <li key={i} className="analysis-list-item text-sm text-zinc-300 leading-relaxed">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Right Rail */}
      <div className="bg-panel-bg border-l border-zinc-800 p-10 flex flex-col">
        <div className="border border-zinc-800 p-6 mb-8">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Risk Level</div>
          <div className={`text-2xl font-black uppercase ${
            evaluation.risk.level === RiskLevel.HIGH ? "text-brand-red" :
            evaluation.risk.level === RiskLevel.MEDIUM ? "text-amber-500" : "text-green-500"
          }`}>
            {evaluation.risk.level}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-4 mb-1">Reason</div>
          <div className="text-xs text-zinc-400 leading-relaxed">{evaluation.risk.reason}</div>
        </div>

        <div className="text-[10px] leading-relaxed text-zinc-600 uppercase font-bold">
          INTERNAL NOTE:<br />
          {evaluation.reason}
        </div>
      </div>

      {/* Footer Strip */}
      <div className="col-span-1 lg:col-span-3 bg-brand-red text-black h-[120px] flex items-center px-10 justify-between">
        <div className="text-[48px] font-black uppercase tracking-[-2px]">{evaluation.decision === Decision.STRONG_FIT ? "HIRE" : evaluation.decision === Decision.POTENTIAL_FIT ? "REVIEW" : "REJECT"}</div>
        <div className="max-w-[500px] text-sm font-bold leading-tight px-8 border-x border-black/20 h-full flex items-center">
          {evaluation.recommendation}
        </div>
        <div className="text-sm font-black uppercase border-2 border-black px-6 py-2">
          PROCEED TO {evaluation.decision === Decision.STRONG_FIT ? "INTERVIEW" : evaluation.decision === Decision.POTENTIAL_FIT ? "TESTING" : "REJECTION"}
        </div>
      </div>

      {/* Hard Reject Stamp */}
      {isRejected && (
        <div className="absolute top-[100px] right-[320px] border-[4px] border-brand-red/30 text-brand-red/30 px-6 py-3 font-black text-[32px] -rotate-15 uppercase pointer-events-none select-none">
          HARD REJECT
        </div>
      )}
    </div>
  );
};
