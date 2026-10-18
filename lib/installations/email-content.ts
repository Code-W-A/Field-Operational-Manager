export function installationCompletionEmail(workNumber: string) {
  return {
    subject: `Proces-verbal de instalare — ${workNumber}`,
    message:
      "Vă transmitem atașat procesul-verbal final de instalare, semnat de tehnician și beneficiar.\n\nCu stimă,\nFOM by NRG",
  };
}
