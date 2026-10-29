import { inputTracking } from "./input-tracking";
import type { ProtectionModule } from "./types";

/** Protections applied to every page realm, in order. */
export const MODULES: readonly ProtectionModule[] = [inputTracking];
