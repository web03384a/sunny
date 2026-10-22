# Sunny

Sunny is an installable progressive web app for short, personalized wellbeing resets.

## Run locally

```sh
python3 -m http.server 4173
```

Open <http://localhost:4173>.

## Test

```sh
npm test
```

## Deployment

Pull requests targeting `main` run the test suite. Pushes to `main` are tested
and automatically deployed to GitHub Pages by
`.github/workflows/deploy-pages.yml`.

The workflow publishes an explicit allowlist of runtime files. Tests, internal
review notes, and local prototypes are not included in the Pages artifact.

### Security-header limitation

GitHub Pages does not support custom response headers. The production baseline
is therefore the Content Security Policy delivered by the `<meta>` element in
`index.html`; policies that require HTTP headers, including clickjacking
protection via `frame-ancestors` or `X-Frame-Options`, cannot be enforced on
this host. If those headers become necessary, deploy the same static artifact
to a host that supports response-header configuration.

## Node.js version

Use Node.js 24.22.1 or a newer 24.x patch release. Run `nvm install && nvm use`
to select the patched version in `.nvmrc`. The minimum includes the October 21, 2026
[Node.js security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).

The patched Node.js range is enforced by `devEngines.runtime` before npm install,
CI, and script commands. `.npmrc` also enables strict engine checks for installs
with older npm versions. Use the npm bundled with the supported Node.js release;
run `nvm install && nvm use` if a command reports an incompatible runtime.
