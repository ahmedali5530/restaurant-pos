'use strict';

/**
 * Generic AI profile + task routing from env.
 *
 * Profiles are operator-chosen labels (cheap, strong, vision, …). Each has
 * AI_{NAME}_URL / KEY / MODEL / AUTH / COMPACT / PROXY_URL. Tasks map via
 * AI_TASK_<TASK>=profile. No vendor names are hardcoded.
 */

const KNOWN_TASKS = ['reporting', 'analysis', 'forecast', 'ocr'];

function env(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  let trimmed = String(raw).trim();
  // Defensive: strip wrapping quotes if a loader left them in place.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Expand ${VAR} in a string against process.env (one level / nested via repeats).
 * Unresolved tokens are left as-is.
 */
function expandValue(value, maxPasses = 5) {
  if (typeof value !== 'string' || !value.includes('${')) {
    return value;
  }
  const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let current = value;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    const next = current.replace(pattern, (match, name) => {
      const replacement = process.env[name];
      if (replacement === undefined || replacement === null || String(replacement).trim() === '') {
        return match;
      }
      changed = true;
      return String(replacement);
    });
    current = next;
    if (!changed) {
      break;
    }
  }
  return current;
}

function envExpanded(name) {
  const value = env(name);
  return value === undefined ? undefined : expandValue(value);
}

function parseBool(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function profileEnvPrefix(profileName) {
  return `AI_${String(profileName).trim().toUpperCase().replace(/-/g, '_')}`;
}

function normalizeAuth(raw, url) {
  const value = (raw || 'bearer').toLowerCase();
  if (value === 'api-key' || value === 'apikey' || value === 'api_key') {
    return 'api-key';
  }
  if (value === 'none' || value === 'off' || value === 'false') {
    return 'none';
  }
  // Legacy Azure detection when AUTH is unset/default and URL looks like Azure.
  if ((!raw || value === 'bearer') && url && url.includes('openai.azure.com')) {
    return 'api-key';
  }
  return 'bearer';
}

function configError(message) {
  const err = new Error(message);
  err.statusCode = 500;
  err.code = 'AI_CONFIG';
  return err;
}

/**
 * Build a single profile from AI_{PREFIX}_* env vars.
 */
function readNamedProfile(name) {
  const prefix = profileEnvPrefix(name);
  const proxyUrl = envExpanded(`${prefix}_PROXY_URL`);
  const url = proxyUrl || envExpanded(`${prefix}_URL`);
  const key = envExpanded(`${prefix}_KEY`);
  const model = envExpanded(`${prefix}_MODEL`);
  const auth = normalizeAuth(env(`${prefix}_AUTH`), url);
  const compact = parseBool(env(`${prefix}_COMPACT`));

  return {
    name,
    url,
    key,
    model,
    auth,
    compact,
    prefix,
  };
}

/**
 * Legacy single-profile fallback from OPENAI_* when AI_PROFILES is unset.
 */
function legacyDefaultProfile() {
  const proxyUrl = envExpanded('OPENAI_PROXY_URL');
  const url = proxyUrl || envExpanded('OPENAI_API_URL');
  const key = envExpanded('OPENAI_API_KEY');
  const model = envExpanded('OPENAI_MODEL') || 'gpt-4o-mini';
  const auth = normalizeAuth(undefined, url);

  return {
    name: 'default',
    url,
    key,
    model,
    auth,
    compact: false,
    prefix: 'OPENAI',
    legacy: true,
  };
}

function listProfileNames() {
  const raw = env('AI_PROFILES');
  if (!raw) {
    return null;
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * @returns {Record<string, { name: string, url?: string, key?: string, model?: string, auth: string, compact: boolean, prefix: string, legacy?: boolean }>}
 */
function listProfiles() {
  const names = listProfileNames();
  if (!names || names.length === 0) {
    return { default: legacyDefaultProfile() };
  }

  const profiles = {};
  for (const name of names) {
    profiles[name] = readNamedProfile(name);
  }
  return profiles;
}

function getDefaultProfileName(profiles) {
  const configured = env('AI_DEFAULT_PROFILE');
  if (configured && profiles[configured]) {
    return configured;
  }
  const names = Object.keys(profiles);
  if (names.length === 0) {
    return 'default';
  }
  return names[0];
}

/**
 * Map known tasks (and any AI_TASK_* env) to profile names. Missing tasks
 * fall through to the default profile at resolve time.
 */
function getTaskMap(profiles) {
  const defaultName = getDefaultProfileName(profiles);
  const tasks = {};

  for (const task of KNOWN_TASKS) {
    const envKey = `AI_TASK_${task.toUpperCase()}`;
    const mapped = env(envKey);
    tasks[task] = mapped && profiles[mapped] ? mapped : defaultName;
  }

  // Include any extra AI_TASK_* keys operators may have set.
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('AI_TASK_') || !value) {
      continue;
    }
    const task = key.slice('AI_TASK_'.length).toLowerCase();
    if (!task || tasks[task]) {
      continue;
    }
    const mapped = String(value).trim();
    if (mapped && profiles[mapped]) {
      tasks[task] = mapped;
    }
  }

  return { defaultProfile: defaultName, tasks };
}

/**
 * Resolve the profile for a request task. task may be undefined.
 * Throws 500 with the env var name to set (never dumps keys).
 */
function resolveProfile(task) {
  const profiles = listProfiles();
  const { defaultProfile, tasks } = getTaskMap(profiles);

  const normalizedTask = task && String(task).trim() ? String(task).trim().toLowerCase() : undefined;
  const profileName = (normalizedTask && tasks[normalizedTask]) || defaultProfile;
  const profile = profiles[profileName];

  if (!profile) {
    throw configError(
      `AI profile "${profileName}" is not configured. Set AI_PROFILES and AI_${String(profileName).toUpperCase().replace(/-/g, '_')}_* in the api service environment.`
    );
  }

  if (!profile.url) {
    const urlVar = profile.legacy ? 'OPENAI_API_URL or OPENAI_PROXY_URL' : `${profile.prefix}_URL`;
    throw configError(`AI profile "${profile.name}" has no URL. Set ${urlVar} in the api service environment.`);
  }

  if (!profile.model) {
    const modelVar = profile.legacy ? 'OPENAI_MODEL' : `${profile.prefix}_MODEL`;
    throw configError(`AI profile "${profile.name}" has no model. Set ${modelVar} in the api service environment.`);
  }

  if (profile.auth !== 'none' && !profile.key) {
    const keyVar = profile.legacy ? 'OPENAI_API_KEY' : `${profile.prefix}_KEY`;
    throw configError(
      `AI profile "${profile.name}" requires a key (AUTH=${profile.auth}). Set ${keyVar} in the api service environment.`
    );
  }

  if (profile.key && profile.key.includes('${')) {
    const keyVar = profile.legacy ? 'OPENAI_API_KEY' : `${profile.prefix}_KEY`;
    throw configError(
      `AI profile "${profile.name}" key still contains an unresolved \${VAR} reference. Set the referenced variable or put the real key in ${keyVar}.`
    );
  }

  if (profile.url && profile.url.includes('${')) {
    const urlVar = profile.legacy ? 'OPENAI_API_URL or OPENAI_PROXY_URL' : `${profile.prefix}_URL`;
    throw configError(
      `AI profile "${profile.name}" URL still contains an unresolved \${VAR} reference. Set the referenced variable or put the real URL in ${urlVar}.`
    );
  }

  return {
    ...profile,
    task: normalizedTask || null,
  };
}

/**
 * Build upstream HTTP headers from profile AUTH.
 */
function buildHeaders(profile) {
  const headers = { 'Content-Type': 'application/json' };
  if (profile.auth === 'none' || !profile.key) {
    return headers;
  }
  if (profile.auth === 'api-key') {
    headers['api-key'] = profile.key;
    return headers;
  }
  headers.Authorization = `Bearer ${profile.key}`;
  return headers;
}

/**
 * Non-secret routing metadata for GET /ai/usage (no keys, no URLs).
 */
function getPublicConfig() {
  const profiles = listProfiles();
  const { defaultProfile, tasks } = getTaskMap(profiles);
  const publicProfiles = {};

  for (const [name, profile] of Object.entries(profiles)) {
    publicProfiles[name] = {
      model: profile.model || null,
      compact: Boolean(profile.compact),
      auth: profile.auth,
      configured: Boolean(profile.url && profile.model && (profile.auth === 'none' || profile.key)),
    };
  }

  return {
    defaultProfile,
    tasks,
    profiles: publicProfiles,
  };
}

module.exports = {
  KNOWN_TASKS,
  listProfiles,
  resolveProfile,
  buildHeaders,
  getPublicConfig,
  getTaskMap,
  getDefaultProfileName,
};
