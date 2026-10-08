import type {
  CanonicalCommand,
  CommandPayloadMap,
  InstallationCommandInput,
} from "./commands";
export const payload: CommandPayloadMap["postpone"] = {
  motivAmanare: "Piese lipsă",
};
const invalidPostpone = { raportGenerat: true };
// @ts-expect-error Client may not set report state through postponement.
export const forbidden: CommandPayloadMap["postpone"] = invalidPostpone;
const invalidInstallation = {
  action: "save" as const,
  sheetId: "sheet",
  revision: 1,
  finding: "Wrong",
};
// @ts-expect-error Installation commands retain the Next.js nested fields shape.
export const flattened: InstallationCommandInput = invalidInstallation;
const invalidRequest = {
  kind: "CORRECT_HOURS" as const,
  sectorId: "department",
  payload: {
    kind: "CO" as const,
    startDate: "2026-12-01",
    endDate: "2026-12-02",
  },
};
// @ts-expect-error Correct-hours request cannot contain a vacation period.
export const mismatched: CommandPayloadMap["request.create"] = invalidRequest;
export type TypedRevisionCommand = CanonicalCommand<"revision.save">;
