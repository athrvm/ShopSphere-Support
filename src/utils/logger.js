function redact(value) {
  let text = String(value);
  for (const [name, secret] of Object.entries(process.env)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(name) && secret && secret.length >= 6) {
      text = text.split(secret).join('[REDACTED]');
    }
  }
  return text.replace(/(Bearer\s+)[A-Za-z0-9_.-]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:key|api_key|token)=)[^\s&"']+/gi, '$1[REDACTED]');
}

function detailsToText(details) {
  if (details === undefined) return '';
  try {
    return ` ${redact(JSON.stringify(details))}`;
  } catch (error) {
    return ' [details could not be serialised]';
  }
}

function log(scope, message, details) {
  console.log(`[${new Date().toISOString()}] [${scope}] ${message}${detailsToText(details)}`);
}

function error(scope, message, details) {
  console.error(`[${new Date().toISOString()}] [${scope}] ${message}${detailsToText(details)}`);
}

function preview(value, maxLength = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

module.exports = { log, error, preview, redact };
