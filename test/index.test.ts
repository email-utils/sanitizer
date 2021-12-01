import { expect } from 'chai'
import { describe, it } from 'mocha'
import EmailSanitizer from '../src'

describe('Check sanitizer. | Base config.', async () => {
  const emailSanitizer = new EmailSanitizer()
  const uppercasedEmail = 'tesT@example.com'
  const sanitizedUppercasedEmail = emailSanitizer.sanitize(uppercasedEmail)
  it(`When sanitize lowercase is true then emails should be lowercased. (${uppercasedEmail} - ${sanitizedUppercasedEmail})`, () =>
    expect(sanitizedUppercasedEmail).to.equal('test@example.com'))

  const gmailEmailWPeriods = 'test.testing@gmail.com'
  const sanitizedGmailEmailWPeriods =
    emailSanitizer.sanitize(gmailEmailWPeriods)
  it(`When sanitize gmail is true then gmail emails should have periods removed from the local section. (${gmailEmailWPeriods} - ${sanitizedGmailEmailWPeriods})`, () =>
    expect(sanitizedGmailEmailWPeriods).to.equal('testtesting@gmail.com'))

  const gmailEmailWComment = 'test+thisisacomment@gmail.com'
  const sanitizedGmailEmailWComment =
    emailSanitizer.sanitize(gmailEmailWComment)
  it(`When sanitize gmail is true then gmail emails should have comments (+thisisacomment) removed. (${gmailEmailWComment} - ${sanitizedGmailEmailWComment})`, () =>
    expect(sanitizedGmailEmailWComment).to.equal('test@gmail.com'))

  const gmailEmailNeedingSanitization = 'test.testing+thisisacomment@gmail.com'
  const sanitizedGmailEmailNeedingSanitization = emailSanitizer.sanitize(
    gmailEmailNeedingSanitization
  )
  it(`When sanitize gmail is true then gmail emails should have comments and periods stripped. (${gmailEmailNeedingSanitization} - ${sanitizedGmailEmailNeedingSanitization})`, () =>
    expect(sanitizedGmailEmailNeedingSanitization).to.equal(
      'testtesting@gmail.com'
    ))
})

describe('Check sanitizer. | Lowercase false.', async () => {
  const emailSanitizer = new EmailSanitizer({
    common: {
      lowercase: false,
    },
  })
  const uppercasedEmail = 'tesT@example.com'
  const sanitizedUppercasedEmail = emailSanitizer.sanitize(uppercasedEmail)
  it(`When sanitize lowercase is false then emails should be left with their casing. (${uppercasedEmail} - ${sanitizedUppercasedEmail})`, () =>
    expect(sanitizedUppercasedEmail).to.equal('tesT@example.com'))

  const gmailEmailWPeriods = 'test.testing@gmail.com'
  const sanitizedGmailEmailWPeriods =
    emailSanitizer.sanitize(gmailEmailWPeriods)
  it(`When sanitize gmail is true then gmail emails should have periods removed from the local section. (${gmailEmailWPeriods} - ${sanitizedGmailEmailWPeriods})`, () =>
    expect(sanitizedGmailEmailWPeriods).to.equal('testtesting@gmail.com'))

  const gmailEmailWComment = 'test+thisisacomment@gmail.com'
  const sanitizedGmailEmailWComment =
    emailSanitizer.sanitize(gmailEmailWComment)
  it(`When sanitize gmail is true then gmail emails should have comments (+thisisacomment) removed. (${gmailEmailWComment} - ${sanitizedGmailEmailWComment})`, () =>
    expect(sanitizedGmailEmailWComment).to.equal('test@gmail.com'))

  const gmailEmailNeedingSanitization = 'test.testing+thisisacomment@gmail.com'
  const sanitizedGmailEmailNeedingSanitization = emailSanitizer.sanitize(
    gmailEmailNeedingSanitization
  )
  it(`When sanitize gmail is true then gmail emails should have comments and periods stripped. (${gmailEmailNeedingSanitization} - ${sanitizedGmailEmailNeedingSanitization})`, () =>
    expect(sanitizedGmailEmailNeedingSanitization).to.equal(
      'testtesting@gmail.com'
    ))
})

describe('Check sanitizer. | Gsuite sanitize.', async () => {
  const emailSanitizer = new EmailSanitizer({
    local: {
      removePeriods: true,
      removePlusTag: true,
    },
  })
  const uppercasedEmail = 'tesT@example.com'
  const sanitizedUppercasedEmail = emailSanitizer.sanitize(uppercasedEmail)
  it(`When sanitize lowercase is true then emails should be lowercased. (${uppercasedEmail} - ${sanitizedUppercasedEmail})`, () =>
    expect(sanitizedUppercasedEmail).to.equal('test@example.com'))

  const gmailEmailWPeriods = 'test.testing@gmail.com'
  const sanitizedGmailEmailWPeriods =
    emailSanitizer.sanitize(gmailEmailWPeriods)
  it(`When sanitize gmail is true then gmail emails should retain their periods. (${gmailEmailWPeriods} - ${sanitizedGmailEmailWPeriods})`, () =>
    expect(sanitizedGmailEmailWPeriods).to.equal('testtesting@gmail.com'))

  const gmailEmailWComment = 'test+thisisacomment@gmail.com'
  const sanitizedGmailEmailWComment =
    emailSanitizer.sanitize(gmailEmailWComment)
  it(`When sanitize gmail is true then gmail emails should retain their comments. (${gmailEmailWComment} - ${sanitizedGmailEmailWComment})`, () =>
    expect(sanitizedGmailEmailWComment).to.equal('test@gmail.com'))

  const gmailEmailNeedingSanitization = 'test.testing+thisisacomment@gmail.com'
  const sanitizedGmailEmailNeedingSanitization = emailSanitizer.sanitize(
    gmailEmailNeedingSanitization
  )
  it(`When sanitize gmail is true then gmail emails should retain their comments and periods. (${gmailEmailNeedingSanitization} - ${sanitizedGmailEmailNeedingSanitization})`, () =>
    expect(sanitizedGmailEmailNeedingSanitization).to.equal(
      'testtesting@gmail.com'
    ))
})
