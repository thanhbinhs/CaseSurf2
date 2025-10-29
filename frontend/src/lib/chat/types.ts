export type Phase = "idle" | "report" | "landing" | "script" | "hook";
export type MessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
};

export type AngleFull = {
  number?: number;
  title: string;
  persona?: string;
  core_message?: string;
  hook?: string;
  cta?: string;
  raw?: string;
};

export type ReportResp = {
  step: "report_done";
  report: string;
  options: { create_script: boolean; analyze_landing_page: boolean };
};

export type LandingResp = {
  step: "landing_done";
  landing_analysis: string;
  angles_text?: string;
  angles: string[];
  angles_full?: AngleFull[];
  angles_store?: { id: string; url: string };
};

export type ScriptResp = {
  step: "script_done";
  angle: string;
  script: string;
};

export type HookResp = {
  step: "hook_done";
  hooks: string; // markdown text
};
