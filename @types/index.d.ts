type LocalSanitizeConfig = {
  removePeriods: boolean
  removePlusTag: boolean
}

type CommonSanitizeConfig = {
  lowercase: boolean
}

type SanitizeConfig = {
  common: CommonSanitizeConfig
  local: LocalSanitizeConfig
}

type SanitizeParam = {
  common?: CommonSanitizeConfig
  local?: LocalSanitizeConfig
}
