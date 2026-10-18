import assert from 'node:assert/strict'
import { validRequestOrigin } from '../lib/request-origin'
const canonical = 'https://app.axildb.com'
function check(
  origin: string | undefined,
  host = 'axildb.home.arpa',
  proto?: string,
  configured = canonical,
  extra = {}
) {
  return validRequestOrigin(
    {
      url: 'http://0.0.0.0:3000/api/server/application-updates',
      headers: new Headers({
        host,
        ...(origin === undefined ? {} : { origin }),
        ...(proto ? { 'x-forwarded-proto': proto } : {}),
        ...extra,
      }),
    },
    configured
  )
}
assert(check(canonical), 'trusted public origin survives tunnel Host rewrite')
assert(check('https://axildb.home.arpa', undefined, 'https'))
assert(check('http://localhost:3113', 'localhost:3113'))
assert(check('https://localhost:3113', 'localhost:3113', 'https'))
assert(!check('https://attacker.invalid'))
assert(
  !check('https://attacker.invalid', undefined, 'https', canonical, {
    'x-forwarded-host': 'attacker.invalid',
  })
)
assert(
  !check('http://app.axildb.com', 'app.axildb.com', 'http'),
  'public host cannot downgrade'
)
assert(!check('https://app.axildb.com:444', 'app.axildb.com:444', 'https'))
assert(!check('https://axildb.home.arpa:444', undefined, 'https'))
assert(!check('https://axildb.home.arpa', undefined, 'https, http'))
assert(!check('https://axildb.home.arpa', undefined, 'ftp'))
assert(!check('https://axildb.home.arpa/path', undefined, 'https'))
assert(!check('https://axildb.home.arpa/', undefined, 'https'))
assert(!check('https://user:pass@axildb.home.arpa', undefined, 'https'))
assert(!check('null'))
assert(!check(undefined))
assert(!check(canonical, ''))
assert(!check(canonical, 'evil/path'))
assert(check('https://[::1]:3113', '[::1]:3113', 'https'))
assert(
  validRequestOrigin(
    {
      url: 'https://axildb.home.arpa/api',
      headers: new Headers({
        origin: 'https://axildb.home.arpa',
        host: 'axildb.home.arpa',
      }),
    },
    ''
  )
)
assert(!check('file:///etc/passwd'))
assert(!check(canonical, 'axildb.home.arpa', undefined, 'bad config'))
console.log(
  'Request-origin checks passed: direct HTTP, proxy TLS, trusted canonical Host rewrite, exact ports, malformed/missing origins, public downgrade and forged forwarded-host rejection.'
)
