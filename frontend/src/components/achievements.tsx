/* Public entry point for achievement UI. Implementation lives in ./achievements/. */
export { AchievementDrawer } from "./achievements/achievement-drawer";
export { AchievementRow } from "./achievements/achievement-row";
export { AddAchievementDialog, type AddMethod } from "./achievements/add-dialog";
export { ConfidenceText, CvUpdateNotice, DecisionStatus, EvidencePanel } from "./achievements/evidence";
export { CandidateItem, ContributionField, DuplicateNotice, PendingReview } from "./achievements/review";
export {
  CATEGORIES,
  CATEGORY_ICON,
  confidenceLevel,
  SOURCE_ICON,
  SOURCES,
  sourceRef,
  type CVUpdate,
  type CVUpdateStatus,
  type DiscoveryResult,
  type GithubRepo,
  type ScanResult,
} from "./achievements/shared";
export { useAchievementActions } from "./achievements/use-achievement-actions";
