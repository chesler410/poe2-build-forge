export const VERSION = '0.0.0' as const

export { decodePobCode, encodePobCode } from './decode'
export { mapBuildToPob, EQUIPMENT_NOT_RECONSTRUCTED } from './reverse'
export type {
  BuildToPobOptions,
  BuildToPobReport,
  BuildToPobResult,
  CharacterEntry,
  ConvertedPassive,
  ConvertedSkillGroup,
  EquipmentSlotReport,
  SkippedPassive
} from './reverse'
export { parsePobXml } from './parse'
export { mapPobToBuild } from './map'
export { emitBuildFile, deriveBuildFilename } from './emit'
export { extractSidecar, composeSidecar } from './sidecar'
export type { Sidecar, SidecarEntry, SidecarSkillEntry } from './sidecar'

export type { EmitOptions, EmitResult } from './emit'

export type {
  Build,
  BuildFile,
  BuildItem,
  BuildPassive,
  BuildPassiveObject,
  BuildSkill,
  BuildSkillObject,
  BuildSupportObject,
  Gem,
  ItemSet,
  Items,
  PathOfBuilding2,
  PlayerStat,
  PobItem,
  Skill,
  SkillSet,
  Skills,
  Slot,
  Spec,
  Tree
} from './types'

export type {
  AscendancyLookup,
  MapOptions,
  MapResult,
  MapWarning,
  PassiveLookup
} from './map'
