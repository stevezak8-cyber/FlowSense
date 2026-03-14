const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["scheduled", "cancelled"],
  scheduled: ["en_route", "cancelled"],
  en_route: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedTransitions(from: string): string[] {
  return VALID_TRANSITIONS[from] ?? [];
}
