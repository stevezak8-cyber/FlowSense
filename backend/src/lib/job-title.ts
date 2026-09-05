export function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human-readable label for a job, since Job has no stored `title` field. */
export function jobTitle(job: { equipmentType?: string | null; serviceType?: string | null }): string {
  if (job.equipmentType) return titleCase(job.equipmentType);
  if (job.serviceType) return titleCase(job.serviceType);
  return "Service Call";
}
