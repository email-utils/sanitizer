import type { SanitizeConfig, SanitizeParam } from './types';

class EmailSanitizer {
  defaultConfig: SanitizeConfig = {
    common: {
      lowercase: true,
    },
    local: {
      removePeriods: false,
      removePlusTag: false,
    },
  };
  config: SanitizeConfig = this.defaultConfig;
  email = '';
  originalEmail = '';

  constructor(configParam: SanitizeParam = {}) {
    let key: keyof SanitizeParam;

    for (key in configParam) {
      const configGroup = configParam[key];
      Object.assign(this.config[key], configGroup);
    }
  }
  private removePeriodsFromLocal() {
    const atIndex = this.email.indexOf('@');
    if (atIndex !== -1) {
      const domain = this.email.slice(atIndex, this.email.length);
      this.email = `${this.email
        .substring(0, this.email.indexOf('@'))
        .replace(/\./g, '')}${domain}`;
    }
  }
  private removePlusTag() {
    const atIndex = this.email.indexOf('@');
    if (atIndex !== -1) {
      const domain = this.email.slice(atIndex, this.email.length);

      const plusIndex = this.email.indexOf('+');
      if (plusIndex !== -1 && plusIndex < atIndex) {
        this.email = `${this.email.substring(0, plusIndex)}${domain}`;
      }
    }
  }
  private setEmailDetails(email: string) {
    if (typeof email !== 'string') {
      throw new Error(`Email not a string. ${String(email)}`);
    } else if (!email) {
      throw new Error(`Email not provided. ${email}`);
    }

    this.originalEmail = email;
    this.email = email;
  }
  public sanitize(email: string): string {
    this.setEmailDetails(email);

    if (this.config.common.lowercase) {
      this.email = this.email.toLowerCase();
    }

    if (this.config.local.removePeriods) {
      this.removePeriodsFromLocal();
    }

    if (this.config.local.removePlusTag) {
      this.removePlusTag();
    }

    return this.email;
  }
  // 0.0.1 behavior: returns nothing, and strips dots that Google Workspace
  // treats as significant. Replaced by `normalizeEmail` (sanitizer#7).
  public sanitizeGSuite(email: string): void {
    this.setEmailDetails(email);

    this.removePeriodsFromLocal();
    this.removePlusTag();
  }
}

export default EmailSanitizer;
export type {
  CommonSanitizeConfig,
  LocalSanitizeConfig,
  SanitizeConfig,
  SanitizeParam,
} from './types';
