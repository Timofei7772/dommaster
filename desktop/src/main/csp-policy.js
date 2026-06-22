function buildContentSecurityPolicy(isDev = false) {
  const basePolicy = [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data:",
    "font-src 'self' data: https://fonts.gstatic.com",
  ]

  const connectSources = isDev
    ? ["'self'", 'https:', 'ws://localhost:*', 'ws://127.0.0.1:*', 'http://localhost:*', 'http://127.0.0.1:*']
    : ["'self'", 'https:', 'ws://localhost:*', 'ws://127.0.0.1:*', 'http://localhost:*', 'http://127.0.0.1:*']

  return [...basePolicy, `connect-src ${connectSources.join(' ')}`].join('; ')
}

module.exports = {
  buildContentSecurityPolicy,
}
