export const VERSION = '0.0.0' as const

export { decodePobCode } from './decode'
export { parsePobXml } from './parse'
export { mapPobToBuild } from './map'
export { emitBuildFile, deriveBuildFilename } from './emit'

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
  Skill,
  SkillSet,
  Skills,
  Slot,
  Spec,
  Tree
} from './types'

export type { AscendancyLookup, MapOptions, PassiveLookup } from './map'
