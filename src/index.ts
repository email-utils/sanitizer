class EmailSanitizer {
  defaultConfig: SanitizeConfig = {
    common: {
      lowercase: true,
    },
    local: {
      removePeriods: false,
      removePlusTag: false,
    },
  }
  config: SanitizeConfig = this.defaultConfig
  email = ''
  originalEmail = ''

  constructor(configParam: SanitizeParam = {} as SanitizeParam) {
    let key: keyof SanitizeParam

    for (key in configParam) {
      const configGroup = configParam[key]
      for (const subKey in configGroup) {
        const subKeyType = subKey as keyof typeof configGroup
        this.config[key][subKeyType] = configGroup[subKeyType]
      }
    }
  }
  private removePeriodsFromLocal() {
    const atIndex = this.email.indexOf('@')
    if (atIndex !== -1) {
      const domain = this.email.slice(atIndex, this.email.length)
      this.email = `${this.email
        .substring(0, this.email.indexOf('@'))
        .replace(/\./g, '')}${domain}`
    }
  }
  private removePlusTag() {
    const atIndex = this.email.indexOf('@')
    if (atIndex !== -1) {
      const domain = this.email.slice(atIndex, this.email.length)

      const plusIndex = this.email.indexOf('+')
      if (plusIndex !== -1 && plusIndex < atIndex) {
        this.email = `${this.email.substring(0, plusIndex)}${domain}`
      }
    }
  }
  private setEmailDetails(email: string) {
    if (typeof email !== 'string') {
      throw new Error(`Email not a string. ${email}`)
    } else if (!email) {
      throw new Error(`Email not provided. ${email}`)
    }

    this.originalEmail = email
    this.email = email
  }
  public sanitize(email: string) {
    this.setEmailDetails(email)

    if (this.config.common.lowercase) {
      this.email = this.email.toLowerCase()
    }

    if (this.config.local.removePeriods) {
      this.removePeriodsFromLocal()
    }

    if (this.config.local.removePlusTag) {
      this.removePlusTag()
    }

    return this.email
  }
  public sanitizeGSuite(email: string) {
    this.setEmailDetails(email)

    this.removePeriodsFromLocal()
    this.removePlusTag()
  }
}

export default EmailSanitizer
