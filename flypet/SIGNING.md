# Signing Fly Pet

Builds work without any of this, but unsigned installers scare people: Windows shows "unknown publisher" and macOS refuses to
open the app normally. That matters more for a download from a crypto project. Everything below is already wired into
`.github/workflows/flypet.yml`; each system starts signing as soon as its secrets are set. Linux needs nothing.

## What to buy

| System | What | Rough cost |
|---|---|---|
| macOS | Apple Developer Program | $99 a year |
| Windows | SSL.com code signing certificate with eSigner (cloud signing) | check ssl.com; other sellers list about $150-300 a year |

Check prices when you buy. Certificates now last about 15 months at most, so plan for renewals.

Why not the others on Windows:

- **Azure Artifact Signing** is the cheapest, but individuals must be in the US or Canada.
- **A certificate file** isn't possible for new certificates: since 2023 the key must live in hardware or a cloud service, so a
  USB token can't sign from GitHub's build machines.

A new certificate doesn't remove the SmartScreen warning at once for every download. Windows builds trust as a signed publisher
gets downloads, so expect it to fade rather than vanish on day one.

## macOS

1. Join the Apple Developer Program with the account that should own the app.
2. In Xcode or on developer.apple.com, create a **Developer ID Application** certificate and export it as a `.p12` with a password.
3. Create an app-specific password at account.apple.com.
4. Add these GitHub secrets:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | the `.p12` file, base64 encoded |
| `APPLE_CERTIFICATE_PASSWORD` | its password |
| `APPLE_ID` | the Apple account's email |
| `APPLE_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | the 10-character team ID |

With those set the build signs and notarizes the app.

## Windows

1. Buy the certificate from SSL.com and finish its identity check. An individual certificate shows your verified personal name
   to everyone who installs; an organization one shows the company's.
2. Turn on eSigner for it and note the credential ID and the TOTP secret from its setup.
3. Add these GitHub secrets:

| Secret | Value |
|---|---|
| `ESIGNER_USERNAME` | the SSL.com username |
| `ESIGNER_PASSWORD` | its password |
| `ESIGNER_CREDENTIAL_ID` | the eSigner credential ID |
| `ESIGNER_TOTP_SECRET` | the TOTP secret |

The workflow then downloads SSL.com's CodeSignTool and signs through `build/sign-win.cjs`. Check the first signed installer:
right-click it, Properties, Digital Signatures.

## Not tested yet

None of this has run against real accounts. Expect the first signed build to need a small fix, most likely the CodeSignTool
download address in the workflow.

Sources for the Windows rules: [Microsoft's code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options),
[SSL.com code signing](https://www.ssl.com/code-signing-certificates/code-signing/buy/).
