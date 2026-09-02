import { authService } from '$lib/api/auth.js';
import { api } from '$lib/api/client.js';

class AuthState {
  /** @type {Record<string,any>|null|undefined} */
  user = $state(null);
  loading = $state(true);
  error = $state(null);
  validationErrors = $state({});
  sessionExpired = $state(false);
  isAuthenticated = $derived(this.user !== null);

  // ── Two-factor login challenge ───────────────────────────────────────────
  // Set by login() when the account has 2FA enabled — the user isn't fully
  // authenticated (this.user stays null) until verify2FA() succeeds.
  requires2FA = $state(false);
  tempToken = $state(/** @type {string|null} */ (null));

  // True once /me or a login response reports the password has passed the
  // 6-month expiry policy — the UI should block everything but a password change.
  passwordExpired = $state(false);
  userRoles = $derived(this.user?.roles || []);
  userDivision = $derived(this.user?.division || null);
  userSchool = $derived(this.user?.school || null);

  // Role dashboards
  roleDashboards = {
    'Super Admin': '/admin/super-admin/dashboard',
    'Division User Administrator': '/admin/lis/dashboard',
    'Learner Right Protection Focal Person': '/admin/lrp/dashboard'
  };

  // URL prefixes each role is allowed to navigate to.
  // Super Admin uses '/admin/' (covers all sub-paths).
  // Every other role is scoped to its own section only.
  rolePathPrefixes = {
    'Super Admin': ['/admin/'],
    'Division User Administrator': ['/admin/lis/'],
    // Covers school/division/regional-level Focal Persons alike — scope
    // within this section is resolved server-side from the account's own
    // school_id/division_id, not by a separate frontend role.
    'Learner Right Protection Focal Person': ['/admin/lrp/']
  };

  // Display names
  roleDisplayNames = {
    'Super Admin': 'Super Admin',
    'Division User Administrator': 'Division Dashboard',
    'Learner Right Protection Focal Person': 'LRP Dashboard'
  };

  // Permissions definition
  permissions = {
    'Super Admin': {
      canAccessAllDashboards: true,
      canManageUsers: true,
      canViewAuditLogs: true,
      canManageSettings: true,
      scope: 'all', // all divisions and schools
      accessibleDashboards: [
        'Super Admin',
        'Division User Administrator',
        'Learner Right Protection Focal Person'
      ],
      menuItems: [
        { name: 'Super Admin', role: 'Super Admin', path: '/admin/super-admin/dashboard', icon: 'shield' },
        { name: 'LRP Dashboard', role: 'Learner Right Protection Focal Person', path: '/admin/lrp/dashboard', icon: 'clipboard-list' },
        { name: 'Intake Sheets', path: '/admin/lrp/intake-sheets', icon: 'clipboard-list' },
        { name: 'Learner Reports', path: '/admin/lrp/reports', icon: 'document' },
        { name: 'Manage FAQs', path: '/admin/lrp/faqs', icon: 'faq' },
        { name: 'User Management', path: '/admin/super-admin/users', icon: 'users' },
        { name: 'Audit Logs', path: '/admin/super-admin/logs', icon: 'clipboard' },
        // { name: 'Settings', path: '/admin/super-admin/settings', icon: 'cog' }
      ]
    },
    'Division User Administrator': {
      canAccessAllDashboards: false,
      canManageUsers: true,
      canViewAuditLogs: true,
      canManageSettings: false,
      scope: 'division', // limited to own division
      accessibleDashboards: ['Division User Administrator'],
      menuItems: [
        { name: 'Division Dashboard', role: 'Division User Administrator', path: '/admin/lis/dashboard', icon: 'document' },
        { name: 'User Management', path: '/admin/lis/users', icon: 'users' },
        { name: 'Audit Logs', path: '/admin/lis/logs', icon: 'clipboard' }
      ]
    },
    'Learner Right Protection Focal Person': {
      canAccessAllDashboards: false,
      canManageUsers: false,
      canViewAuditLogs: false,
      canManageSettings: false,
      // One role covers school/division/regional level alike — actual scope is
      // resolved server-side from the account's own school_id/division_id
      // (school_id set → school-level, e.g. a designated guidance counselor;
      // division_id only → division-level; neither → regional). 'division' here
      // is just the conservative default for UI copy before /me resolves it.
      scope: 'division',
      accessibleDashboards: ['Learner Right Protection Focal Person'],
      menuItems: [
        { name: 'Dashboard', role: 'Learner Right Protection Focal Person', path: '/admin/lrp/dashboard', icon: 'dashboard' },
        { name: 'Intake Sheets', path: '/admin/lrp/intake-sheets', icon: 'clipboard-list' },
        { name: 'Learner Reports', path: '/admin/lrp/reports', icon: 'document' },
        // FAQ content management is regional-only — not every Focal Person
        // account should see this, even though the role spans all 3 levels.
        { name: 'Manage FAQs', path: '/admin/lrp/faqs', icon: 'faq', regionalOnly: true }
      ]
    }
  };

  constructor() {
    this.restoreSession();
  }

  async restoreSession() {
    const token = api.getAccessToken();
    if (!token) { this.loading = false; return; }

    try {
      const result = await authService.getCurrentUser();
      if (result.success && result.user) {
        this.user = result.user;
        this.passwordExpired = !!result.user.passwordExpired;
      } else {
        api.clearTokens();
        this.user = null;
        this.sessionExpired = true;
      }
    } catch (err) {
      if (err.status === 401) {
        api.clearTokens();
        this.user = null;
        this.sessionExpired = true;
      }
    } finally {
      this.loading = false;
    }
  }

  async login(username, password) {
    this.error = null;
    this.validationErrors = {};
    this.loading = true;
    this.requires2FA = false;
    this.tempToken = null;

    const result = await authService.login(username, password);

    if (result.success) {
      this.user = result.user;
      this.passwordExpired = !!result.passwordExpired;
      this.loading = false;
      return true;
    }

    if (result.requires2FA) {
      this.requires2FA = true;
      this.tempToken = result.tempToken;
      this.loading = false;
      return false;
    }

    this.error = result.error;
    this.validationErrors = result.validationErrors || {};
    this.loading = false;
    return false;
  }

  /** Completes login after login() set requires2FA — submits the emailed OTP. */
  async verify2FA(otpCode, rememberDevice = false) {
    this.error = null;
    this.loading = true;

    const result = await authService.verify2fa(this.tempToken, otpCode, rememberDevice);

    if (result.success) {
      this.user = result.user;
      this.passwordExpired = !!result.passwordExpired;
      this.requires2FA = false;
      this.tempToken = null;
      this.loading = false;
      return true;
    }

    this.error = result.error;
    this.loading = false;
    return false;
  }

  /** Backs out of the OTP step, back to the username/password form. */
  cancelTwoFactor() {
    this.requires2FA = false;
    this.tempToken = null;
    this.error = null;
  }

  async logout() {
    await authService.logout();
    this.user = null;
    this.error = null;
    this.requires2FA = false;
    this.tempToken = null;
    this.passwordExpired = false;
  }

  /** Re-fetches /me and swaps in the fresh user — used after actions that
   * change fields on the auth session itself (2FA toggle, profile edits). */
  async refreshUser() {
    const result = await authService.getCurrentUser();
    if (result.success && result.user) {
      this.user = result.user;
      this.passwordExpired = !!result.user.passwordExpired;
    }
    return result;
  }

  // ── Two-factor self-service management ───────────────────────────────────
  async enable2FA(password) {
    return authService.enable2FA(password);
  }

  async confirmEnable2FA(otpCode) {
    const result = await authService.confirmEnable2FA(otpCode);
    if (result.success) await this.refreshUser();
    return result;
  }

  async disable2FA(password) {
    const result = await authService.disable2FA(password);
    if (result.success) await this.refreshUser();
    return result;
  }

  clearError() { this.error = null; this.validationErrors = {}; }

  // Get primary role
  getPrimaryRole() {
    return this.userRoles[0] || null;
  }

  // Get permissions for current user
  getPermissions() {
    const primaryRole = this.getPrimaryRole();
    return this.permissions[primaryRole] || null;
  }

  // Check if user can access a specific dashboard
  canAccessDashboard(role) {
    const perms = this.getPermissions();
    if (!perms) return false;
    if (perms.canAccessAllDashboards) return true;
    return perms.accessibleDashboards.includes(role);
  }

  // Check if user can manage users
  canManageUsers() {
    const perms = this.getPermissions();
    return perms?.canManageUsers || false;
  }

  // Check if user can view audit logs
  canViewAuditLogs() {
    const perms = this.getPermissions();
    return perms?.canViewAuditLogs || false;
  }

  // Check if user can manage settings
  canManageSettings() {
    const perms = this.getPermissions();
    return perms?.canManageSettings || false;
  }

  // Get scope (all, division, self)
  getScope() {
    const perms = this.getPermissions();
    return perms?.scope || 'self';
  }

  // Get menu items for current user
  getMenuItems() {
    const allItems = [];
    const seenRoles = new Set();
    const seenPaths = new Set();

    for (const role of this.userRoles) {
      const perms = this.permissions[role];
      if (perms) {
        for (const item of perms.menuItems) {
          // Some items (e.g. FAQ management) only apply to a regional-level
          // account even though the role itself spans school/division/regional.
          if (item.regionalOnly && this.user?.organizationLevel !== 'regional') continue;
          if (item.role && seenRoles.has(item.role)) continue;
          if (item.role) seenRoles.add(item.role);
          if (seenPaths.has(item.path)) continue;
          seenPaths.add(item.path);
          allItems.push(item);
        }
      }
    }

    return allItems;
  }

  // Get accessible dashboards for role switcher
  getAvailableDashboards() {
    if (!this.user) return [];
    
    const dashboards = [];
    const seen = new Set();
    
    for (const role of this.userRoles) {
      if (this.roleDashboards[role] && !seen.has(role)) {
        seen.add(role);
        dashboards.push({
          role,
          path: this.roleDashboards[role],
          label: this.roleDisplayNames[role] || role
        });
      }
    }
    
    return dashboards;
  }

  getPrimaryDashboard() {
    if (!this.user || !this.userRoles.length) return '/login';
    const primaryRole = this.getPrimaryRole();
    return this.roleDashboards[primaryRole] || '/admin/dashboard';
  }

  getRoleDisplayName(role) {
    return this.roleDisplayNames[role] || role;
  }

  hasRole(role) { return this.userRoles.includes(role); }

  // Returns true if the current user is allowed to visit the given path.
  // Used by the admin layout to block cross-role navigation.
  /** @param {string} path */
  canAccessPath(path) {
    if (path === '/admin/profile') return true;
    for (const role of this.userRoles) {
      const prefixes = /** @type {any} */ (this.rolePathPrefixes)[role] || [];
      if (prefixes.some(/** @param {string} p */ p => path.startsWith(p))) return true;
    }
    return false;
  }

  // ── Fine-grained permission check (uses /api/me permissions array) ──────
  /** @param {string} permission */
  hasPermission(permission) {
    const user = /** @type {any} */ (this.user);
    return (user?.permissions ?? []).includes(permission);
  }

  // True for Super Admin and other regional-level accounts (no division/school
  // assigned) — mirrors the backend's getUserOrganizationLevel(). Used to decide
  // whether a user sees/filters data across every division or just their own.
  isRegionalLevel() {
    return this.user?.organizationLevel === 'regional';
  }

  // Human label for the account's own assignment — school takes priority
  // over division since a school-scoped account's division_id is null (see
  // getEffectiveDivisionId() on the backend). Null for a regional account,
  // which has neither — callers show a "Regional" label themselves so the
  // wording can match their context (e.g. "Regional Office" vs "Regional").
  getOrgLabel() {
    return this.user?.school?.name || this.user?.division?.name || null;
  }

  // ── Learner Rights & Protection Intake Sheets ────────────────────────────
  // Focal Person has full CRUD (scoped server-side to their division unless
  // regional-level); Super Admin can view every intake sheet but not write.
  canViewIntakeSheets() {
    return this.hasRole('Learner Right Protection Focal Person') || this.hasRole('Super Admin');
  }
  canManageIntakeSheets() {
    return this.hasRole('Learner Right Protection Focal Person');
  }
  isIntakeSheetsReadOnly() {
    return this.hasRole('Super Admin') && !this.hasRole('Learner Right Protection Focal Person');
  }

  // ── Learner Reports (the public report form's submissions) ──────────────
  // Focal Person: view + triage + link to an intake sheet, scoped server-side
  // to their own school (if assigned), else division, else everywhere.
  // Super Admin: view only, everywhere.
  canViewLearnerReports() {
    return this.hasRole('Learner Right Protection Focal Person') || this.hasRole('Super Admin');
  }
  canTriageLearnerReports() {
    return this.hasRole('Learner Right Protection Focal Person');
  }
  canLinkLearnerReports() {
    return this.hasRole('Learner Right Protection Focal Person');
  }
  isLearnerReportsReadOnly() {
    return this.hasRole('Super Admin') && !this.hasRole('Learner Right Protection Focal Person');
  }

  // ── FAQ content (learner portal's public FAQ page) ───────────────────────
  // Super Admin: always. Focal Person: only when the account itself is
  // regional-level (no division_id/school_id) — division/school-level Focal
  // Persons are scoped to case work, not site content.
  canManageFaqs() {
    return this.hasRole('Super Admin') ||
      (this.hasRole('Learner Right Protection Focal Person') && this.user?.organizationLevel === 'regional');
  }
}

export const authState = new AuthState();