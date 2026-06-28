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
