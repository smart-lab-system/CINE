export type WorkstationOption = {
  id: string;
  assetCode: string;
  hostname: string;
  type?: 'master' | 'client';
};

/** Hostname to show on seat hover; null when the seat has no assigned workstation. */
export function assignedWorkstationHostname(
  workstationId: string | null | undefined,
  hostname: string | null | undefined,
): string | null {
  if (!workstationId) return null;
  const value = hostname?.trim();
  return value ? value : null;
}
