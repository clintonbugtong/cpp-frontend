<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { authService } from '$lib/api/auth.js';
  import { platform } from '$lib/platform.svelte.js';

  let { children } = $props();
  let sidebarOpen = $state(false);
  let currentRole = $state('Dashboard');
  /** Where this account works, for the sidebar: "School · <name>", "Division Office · <name>"… */
  const accessLabel = $derived.by(() => {
    const u = authState.user;
    if (authState.hasRole('Super Admin')) return { title: 'Super Admin', detail: 'All divisions and schools' };
    if (authState.hasRole('Learner Right Protection Focal Person')) {
      const level = u?.organizationLevel;
      if (level === 'school') return { title: 'School LRP Focal Person', detail: u?.school?.name ?? '' };
      if (level === 'division') return {
        // Some Division LRP Focal Persons are also the Division Admin.
        title: authState.hasRole('Division Admin') ? 'Division LRP Focal Person · Division Admin' : 'Division LRP Focal Person',
        detail: u?.division?.name ? `${u.division.name} Division` : ''
      };
      return { title: 'Regional LRP Focal Person', detail: 'DepEd CAR Regional Office' };
    }
    return { title: 'Division Administrator', detail: u?.division?.name ? `${u.division.name} Division` : '' };
  });
  let userMenuOpen = $state(false);

  // ── Forced password change (6-month expiry policy) ───────────────────────
  let pwForm = $state({ current_password: '', new_password: '', new_password_confirmation: '' });
  let pwSubmitting = $state(false);
  let pwError = $state('');
  let pwValidationErrors = $state(/** @type {Record<string,string[]>} */ ({}));

  async function handleForcedPasswordChange(event) {
    event.preventDefault();
    pwSubmitting = true;
    pwError = '';
    pwValidationErrors = {};
    const result = await authService.changePassword(
      pwForm.current_password,
      pwForm.new_password,
      pwForm.new_password_confirmation
    );
    if (result.success) {
      pwForm = { current_password: '', new_password: '', new_password_confirmation: '' };
      await authState.refreshUser();
    } else {
      pwValidationErrors = result.validationErrors || {};
      pwError = Object.keys(pwValidationErrors).length ? 'Please fix the errors shown below.' : result.error || 'Failed to change password.';
    }
    pwSubmitting = false;
  }

  const dashboardPages = [
    '/admin/super-admin/dashboard',
    '/admin/lis/dashboard',
    '/admin/lrp/dashboard',
    '/admin/lrp/reports',
    '/admin/dashboard'
  ];

  let showBack = $derived(!dashboardPages.includes(page.url.pathname));

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      goto(authState.getPrimaryDashboard());
    }
  }

  function toggleUserMenu() { userMenuOpen = !userMenuOpen; }
  function closeUserMenu() { userMenuOpen = false; }

  $effect(() => {
    if (!authState.loading && !authState.isAuthenticated) {
      goto(authState.sessionExpired ? '/login?expired=1' : '/login');
    }
  });

  // Block cross-role navigation: redirect to the user's own dashboard
  // whenever they land on a path their role does not own.
  $effect(() => {
    if (authState.loading || !authState.isAuthenticated) return;
    if (!authState.canAccessPath(page.url.pathname)) {
      goto(authState.getPrimaryDashboard(), { replaceState: true });
    }
  });

  const pageTitleMap = {
    '/admin/super-admin/dashboard': 'Super Admin',
    '/admin/super-admin/users': 'User Management',
    '/admin/super-admin/schools': 'School Management',
    '/admin/super-admin/logs': 'Audit Logs',
    '/admin/lis/dashboard': 'Division Dashboard',
    '/admin/lis/users': 'User Management',
    '/admin/lis/schools': 'School Management',
    '/admin/lis/logs': 'Audit Logs',
    '/admin/lrp/dashboard': 'LRP Dashboard',
    '/admin/lrp/intake-sheets': 'Intake Sheet / Incident Report',
    '/admin/lrp/intake-sheets/new': 'New Intake Sheet / Incident Report',
    '/admin/lrp/reports': 'Learner Reports',
    '/admin/lrp/faqs': 'Manage FAQs',
    '/admin/lrp/school-report': 'Zero Incident Report',
    '/admin/lrp/compliance': 'Report Compliance',
    '/admin/lrp/incident-summary': 'Incident Summary',
    '/admin/lis/compliance': 'Report Compliance',
    '/admin/super-admin/compliance': 'Report Compliance',
    '/admin/super-admin/incident-summary': 'Incident Summary',
    '/admin/profile': 'My Profile',
    '/admin/dashboard': 'Dashboard'
  };

  $effect(() => {
    const path = page.url.pathname;
    if (pageTitleMap[path]) {
      currentRole = pageTitleMap[path];
    } else if (path.match(/\/lrp\/intake-sheets\/.+\/edit/)) {
      currentRole = 'Edit Intake Sheet / Incident Report';
    } else if (path.match(/\/lrp\/intake-sheets\/.+/)) {
      currentRole = 'Intake Sheet / Incident Report Details';
    } else if (path.match(/\/lrp\/reports\/.+/)) {
      currentRole = 'Learner Report Details';
    } else if (path.includes('/super-admin')) {
      currentRole = 'Super Admin';
    } else if (path.includes('/lis')) {
      currentRole = 'Division Dashboard';
    } else if (path.includes('/lrp')) {
      currentRole = 'LRP Dashboard';
    } else {
      currentRole = 'Dashboard';
    }
  });

  async function handleLogout() {
    await authState.logout();
    goto('/login');
  }

  function navigateTo(path) {
    sidebarOpen = false;
    goto(path);
  }

  /** @param {any} item */
  function isActiveItem(item) {
    const dashboards = /** @type {any} */ (authState.roleDashboards);
    return page.url.pathname === item.path || (item.role && dashboards[item.role] === page.url.pathname);
  }

  function getIcon(iconName) {
    const icons = {
      'shield': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      'document': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'users': 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
      'clipboard': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
      'clipboard-list': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h6',
      'cog': 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      'dashboard': 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
      'faq': 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      'calendar': 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
      'clipboard-check': 'M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75',
      'chart-bar': 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
      'building': 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'
    };
    return icons[iconName] || icons['dashboard'];
  }
</script>

{#if authState.isAuthenticated && authState.passwordExpired}
  <!-- ── Mandatory password change — blocks the app until the 6-month-expired
       password is changed. The backend enforces this too (EnsurePasswordNotExpired
       middleware), this is just the matching UI gate. ── -->
  <div class="min-h-screen flex items-center justify-center px-4 bg-base-200/50">
    <div class="w-full max-w-sm">
      <div class="card bg-base-100 shadow-sm border border-base-200">
        <div class="card-body p-6">
          <div class="flex items-center gap-2 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-warning shrink-0">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
            </svg>
            <h1 class="font-bold text-lg">Password Change Required</h1>
          </div>
          <p class="text-sm text-base-content/50 mb-4">
            Your password is over 6 months old and must be changed before you can continue.
          </p>

          {#if pwError}
            <div class="alert alert-error py-2 mb-3 text-sm">{pwError}</div>
          {/if}

          <form onsubmit={handleForcedPasswordChange} class="space-y-3">
            <div class="form-control">
              <label class="label py-1" for="fpc-current"><span class="label-text text-xs">Current Password</span></label>
              <input
                id="fpc-current" type="password"
                class="input input-bordered input-sm w-full {pwValidationErrors.current_password ? 'input-error' : ''}"
                bind:value={pwForm.current_password} required autocomplete="current-password"
              />
              {#if pwValidationErrors.current_password}<p class="text-error text-xs mt-1">{pwValidationErrors.current_password[0]}</p>{/if}
            </div>
            <div class="form-control">
              <label class="label py-1" for="fpc-new"><span class="label-text text-xs">New Password</span></label>
              <input
                id="fpc-new" type="password"
                class="input input-bordered input-sm w-full {pwValidationErrors.new_password ? 'input-error' : ''}"
                bind:value={pwForm.new_password} required autocomplete="new-password"
              />
              {#if pwValidationErrors.new_password}<p class="text-error text-xs mt-1">{pwValidationErrors.new_password[0]}</p>{/if}
            </div>
            <div class="form-control">
              <label class="label py-1" for="fpc-confirm"><span class="label-text text-xs">Confirm New Password</span></label>
              <input
                id="fpc-confirm" type="password"
                class="input input-bordered input-sm w-full"
                bind:value={pwForm.new_password_confirmation} required autocomplete="new-password"
              />
            </div>

            <button type="submit" class="btn btn-primary btn-sm w-full mt-1" disabled={pwSubmitting}>
              {#if pwSubmitting}<span class="loading loading-spinner loading-xs"></span> Changing…{:else}Change Password{/if}
            </button>
            <button type="button" onclick={handleLogout} class="btn btn-ghost btn-sm w-full">Sign Out</button>
          </form>
        </div>
      </div>
    </div>
  </div>
{:else if authState.isAuthenticated}
  <div class="drawer lg:drawer-open">
    <input id="admin-drawer" type="checkbox" class="drawer-toggle" bind:checked={sidebarOpen} />
    
    <div class="drawer-content flex flex-col min-h-screen bg-base-200/50">
      
      <!-- Top Bar -->
      <header class="sticky top-0 z-30 bg-base-100/80 backdrop-blur-lg border-b border-base-200 px-4 lg:px-8 safe-area-top">
        <div class="flex items-center h-14 gap-3">
          <label for="admin-drawer" class="btn btn-ghost btn-sm btn-square lg:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
            </svg>
          </label>

          {#if showBack}
            <button type="button" onclick={goBack} class="btn btn-ghost btn-sm btn-square" aria-label="Go back">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
              </svg>
            </button>
          {/if}

          <div class="flex-1 flex items-center gap-3 min-w-0">
            <h1 class="text-base font-semibold truncate">{currentRole}</h1>
            <span class="w-1 h-1 rounded-full bg-base-300 hidden sm:block"></span>
            <span class="text-xs text-base-content/50 hidden sm:block">
              {authState.user?.fullName}
              {#if authState.getOrgLabel()}
                • {authState.getOrgLabel()}
              {:else if authState.isRegionalLevel()}
                • Regional
              {/if}
            </span>
          </div>

          <div class="flex items-center gap-1 relative">
            <button type="button" onclick={toggleUserMenu} class="btn btn-ghost btn-sm gap-2 px-2">
              <div class="avatar placeholder">
                <div class="w-7 rounded-full bg-primary text-primary-content flex items-center justify-center">
                  <span class="text-xs font-bold leading-none">{authState.user?.initials || 'U'}</span>
                </div>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 transition-transform {userMenuOpen ? 'rotate-180' : ''}">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
              </svg>
            </button>

            {#if userMenuOpen}
              <!-- backdrop to close on tap-outside -->
              <button type="button" class="fixed inset-0 z-[40]" onclick={closeUserMenu} aria-label="Close menu"></button>
              <div class="absolute right-0 top-full mt-2 z-[50] w-56 p-2 bg-base-100 rounded-xl shadow-xl border border-base-200">
                <div class="px-3 py-2">
                  <p class="font-medium text-sm">{authState.user?.fullName}</p>
                  <p class="text-xs text-base-content/50 truncate">{authState.user?.email}</p>
                  {#if authState.getOrgLabel()}
                    <p class="text-xs text-base-content/40 mt-1">{authState.getOrgLabel()}</p>
                  {:else if authState.isRegionalLevel()}
                    <p class="text-xs text-base-content/40 mt-1">Regional</p>
                  {/if}
                </div>
                <div class="divider my-1"></div>
                <button onclick={() => { closeUserMenu(); goto('/admin/profile'); }} class="w-full text-left px-3 py-2 rounded-lg hover:bg-base-200 text-sm transition-colors flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-base-content/50">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
                  </svg>
                  My Profile
                </button>
                <button onclick={() => { closeUserMenu(); handleLogout(); }} class="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-error text-sm transition-colors flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/>
                  </svg>
                  Sign Out
                </button>
              </div>
            {/if}
          </div>
        </div>
      </header>

      <main class="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full safe-area-bottom">
        {@render children()}
      </main>
    </div>
    
    <!-- Sidebar with Dynamic Menu -->
    <div class="drawer-side z-40">
      <label for="admin-drawer" class="drawer-overlay"></label>
      <aside class="bg-base-100 w-64 min-h-full border-r border-base-200 flex flex-col">
        
        <!-- Brand + where this account works -->
        <div class="px-4 pt-4 pb-3 border-b border-base-200">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-secondary/10 ring-1 ring-primary/15 grid place-items-center shrink-0">
              <img src="/favicon.svg" alt="" class="w-7 h-7" />
            </div>
            <div class="min-w-0" title="Learner Rights Protection – Incident Reporting Information System">
              <h2 class="font-bold text-[15px] leading-tight tracking-tight">LRP-<span class="text-primary">IRIS</span></h2>
              <p class="text-[10.5px] leading-tight text-base-content/55">Incident Reporting Information System</p>
            </div>
          </div>
          <div class="mt-3 flex items-center gap-2 rounded-lg bg-base-200/60 px-2.5 py-1.5" title={accessLabel.detail || accessLabel.title}>
            <span class="w-1.5 h-1.5 rounded-full bg-success shrink-0"></span>
            <div class="min-w-0 leading-tight">
              <p class="text-[11px] font-semibold text-base-content/80">{accessLabel.title}</p>
              {#if accessLabel.detail}<p class="text-[11px] text-base-content/55 truncate">{accessLabel.detail}</p>{/if}
            </div>
          </div>
        </div>

        <nav class="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <div class="px-3 py-2">
            <p class="text-xs font-medium text-base-content/30 uppercase tracking-widest">Menu</p>
          </div>
          
          {#each authState.getMenuItems() as item}
            <button 
              onclick={() => navigateTo(item.path)}
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left
                {isActiveItem(item)
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-base-content/60 hover:bg-base-200/50 hover:text-base-content'
                }"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
                <path stroke-linecap="round" stroke-linejoin="round" d={getIcon(item.icon)} />
              </svg>
              <span class="leading-tight">{item.name}</span>
            </button>
          {/each}
        </nav>

        <div class="p-3 border-t border-base-200">
          <button 
            onclick={handleLogout}
            class="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-base-content/60 hover:text-error hover:bg-red-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/>
            </svg>
            Sign Out
          </button>
        </div>
      </aside>
    </div>
  </div>
{/if}