# Code signing policy

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

[SignPath.io](https://about.signpath.io) provides the signing service; the certificate is issued to [SignPath Foundation](https://signpath.org).

## Publisher identity

Windows release artifacts are Authenticode-signed with a certificate issued to **SignPath Foundation** (OV), with the private key held in SignPath's HSM. Windows shows the publisher as `SignPath Foundation`. No private key is stored in this repository or in GitHub secrets; SignPath performs the signing inside its HSM.

## Scope

Signing covers the Windows release artifacts only:

- `wayforge-win32-x64.exe`
- `wayforge-win32-arm64.exe`
- `install.ps1`

All three are submitted inside a single ZIP archive per release. Linux/macOS binaries, the share archives, `wayforge-checksums.txt`, and `install.sh` are **out of scope** and are not signed.

## Roles

| Role | Members |
|---|---|
| Author | [@Macacoders/wayforge-maintainers](https://github.com/orgs/Macacoders/teams/wayforge-maintainers) |
| Reviewer | [@Macacoders/wayforge-maintainers](https://github.com/orgs/Macacoders/teams/wayforge-maintainers) |
| Approver | [@Macacoders/wayforge-maintainers](https://github.com/orgs/Macacoders/teams/wayforge-maintainers) |

All three roles are held by the `wayforge-maintainers` team, currently three members. Every signing request must be approved by a member of that team; the GitHub team is the single source of truth for membership.

## Release controls

- Every signing request requires **manual approval** by an Approver before SignPath signs.
- Signing requests must originate from the **trusted build**: GitHub Actions running on GitHub-hosted runners for this repository ([Macacoders/wayforge](https://github.com/Macacoders/wayforge)).
- Only artifacts built from this repository are signed; artifacts from forks or local builds are never submitted.
- Multi-factor authentication (MFA) is required for both GitHub and SignPath access.
- The SignPath API token is stored as a GitHub Actions secret and is never echoed or committed.

## Artifact configuration

The artifact configuration lives at [`.signpath/artifact-configuration.xml`](./.signpath/artifact-configuration.xml). The copy hosted in the SignPath project is kept identical to the repository copy. It restricts PE metadata to product name `wayforge` and a product version matching the release version (4-part form, e.g. `1.0.2.0`, derived from [`VERSION`](./VERSION)).

## Verification

Users can verify signatures on Windows:

```powershell
Get-AuthenticodeSignature .\wayforge-win32-x64.exe
Get-AuthenticodeSignature .\install.ps1
```

A valid result shows `Status -eq 'Valid'` and a signer certificate whose subject is SignPath Foundation.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

wayforge does not send telemetry. SignPath processes only the release artifacts submitted for signing and the associated repository metadata; nothing else is shared.
