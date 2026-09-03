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

  // Extract the user's home branch (inventory_store record id) for row-level
  // restrictions. When set, the JWT carries branch_id as a claim, and
  // SurrealDB PERMISSIONS can filter rows by WHERE branch_id = $auth.branch_id.
  // Users without a branch_id (super admins, area managers) see all branches.
  const branchId = user.branch_id
    ? (typeof user.branch_id === 'object'
        ? user.branch_id?.id?.toString?.() || String(user.branch_id?.id || '')
        : String(user.branch_id))
    : null;

  return serializeUser({
    ...user,
    user_role: fetchedRole || user.user_role,
    roles,
    branch_id: branchId,
  });
}

module.exports = {
  authenticatePosUser,
};
