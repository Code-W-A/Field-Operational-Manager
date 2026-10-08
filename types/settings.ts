import type { Timestamp } from "firebase/firestore";
import type {
  Setting as CanonicalSetting,
  SettingHistory as CanonicalSettingHistory,
} from "@/packages/fom-domain/settings";
export type Setting = CanonicalSetting<Timestamp>;
export type SettingHistory = CanonicalSettingHistory<Timestamp>;
export type {
  SettingType,
  ValueType,
  HistoryAction,
  CreateSettingData,
  UpdateSettingData,
  BulkCreateData,
} from "@/packages/fom-domain/settings";
