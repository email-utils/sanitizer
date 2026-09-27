export type LocalSanitizeConfig = {
  removePeriods: boolean;
  removePlusTag: boolean;
};

export type CommonSanitizeConfig = {
  lowercase: boolean;
};

export type SanitizeConfig = {
  common: CommonSanitizeConfig;
  local: LocalSanitizeConfig;
};

export type SanitizeParam = {
  common?: Partial<CommonSanitizeConfig>;
  local?: Partial<LocalSanitizeConfig>;
};
