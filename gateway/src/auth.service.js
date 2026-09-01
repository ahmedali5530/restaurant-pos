'use strict';

const { getClient } = require('./surreal-client');

function serializeUser(row) {
  if (!row) return null;
  const { password: _password, ...safe } = row;
  const id = safe.id?.toString?.() || String(safe.id);
  const role = safe.user_role;
  const shift = safe.user_shift;

  return {
    ...safe,
    id,
    user_role: role
      ? {
          ...role,
          id: role.id?.toString?.() || role.id,
        }
      : role,
    user_shift: shift
      ? {
          ...shift,
          id: shift.id?.toString?.() || shift.id,
        }
      : shift,
  };
}

async function authenticatePosUser({ method, login, password }) {
  const db = await getClient();
  const cleanLogin = String(login || '').trim();
  const cleanPass = String(password || '');

  if (method === 'pin') {
    if (cleanLogin.length !== 4) {
      return null;
    }
  } else if (method === 'form') {
    if (!cleanLogin || !cleanPass) {
      return null;
    }
  } else {
    return null;
  }

  const query =
    method === 'pin'
      ? `SELECT * FROM user WHERE login = $login AND deleted_at = NONE AND (login_method = 'pin' OR login_method = NONE) AND crypto::bcrypt::compare(password, $password) = true FETCH user_role, user_shift`
      : `SELECT * FROM user WHERE login = $login AND deleted_at = NONE AND login_method = 'form' AND crypto::bcrypt::compare(password, $password) = true FETCH user_role, user_shift`;

  const result = await db.query(query, {
    login: cleanLogin,
    password: method === 'pin' ? cleanLogin : cleanPass,
  });

  const rows = Array.isArray(result) ? result[0] : result;
  const user = Array.isArray(rows) ? rows[0] : null;
  if (!user) return null;

  let fetchedRole = user.user_role;
  const roleId =
    typeof user.user_role === 'object' ? user.user_role?.id : user.user_role;

  if (roleId) {
    const roleResult = await db.query(
      `SELECT * FROM user_role WHERE id = $roleId AND deleted_at = NONE LIMIT 1`,
      { roleId }
    );
    const roleRows = Array.isArray(roleResult) ? roleResult[0] : roleResult;
    if (Array.isArray(roleRows) && roleRows[0]) {
      fetchedRole = roleRows[0];
    }
  }

  const roles = fetchedRole?.roles
    ? [...new Set(fetchedRole.roles || [])]
    : [];

  return serializeUser({
    ...user,
    user_role: fetchedRole || user.user_role,
    roles,
  });
}

async function getUserRoleModules(userId) {
  if (!userId) return [];
  const db = await getClient();
  const result = await db.query(
    `SELECT * FROM user WHERE id = $userId AND deleted_at = NONE FETCH user_role LIMIT 1`,
    { userId: String(userId) }
  );
  const rows = Array.isArray(result) ? result[0] : result;
  const user = Array.isArray(rows) ? rows[0] : null;
  if (!user) return [];

  let fetchedRole = user.user_role;
  const roleId =
    typeof user.user_role === 'object' ? user.user_role?.id : user.user_role;

  if (roleId && (!fetchedRole || !Array.isArray(fetchedRole.roles))) {
    const roleResult = await db.query(
      `SELECT * FROM user_role WHERE id = $roleId AND deleted_at = NONE LIMIT 1`,
      { roleId }
    );
    const roleRows = Array.isArray(roleResult) ? roleResult[0] : roleResult;
    if (Array.isArray(roleRows) && roleRows[0]) {
      fetchedRole = roleRows[0];
    }
  }

  return fetchedRole?.roles ? [...new Set(fetchedRole.roles.map(String))] : [];
}

function hasSecurityAlertsAccess(roleModules) {
  if (!Array.isArray(roleModules)) return false;
  return roleModules.some((r) => {
    const s = String(r);
    return (
      s === 'admin' ||
      s === 'super_admin' ||
      s === 'admin.*' ||
      s === 'admin.security_alerts' ||
      s.startsWith('admin.')
    );
  });
}

module.exports = {
  authenticatePosUser,
  getUserRoleModules,
  hasSecurityAlertsAccess,
};
