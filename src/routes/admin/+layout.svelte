<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { authService } from '$lib/api/auth.js';
  import { platform } from '$lib/platform.svelte.js';

  let { children } = $props();
  let sidebarOpen = $state(false);
  let currentRole = $state('Dashboard');
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
      pwError = result.error || 'Failed to change password.';
      pwValidationErrors = result.validationErrors || {};
    }
    pwSubmitting = false;
  }

  const dashboardPages = [
    '/admin/super-admin/dashboard',
    '/admin/lis/dashboard',
    '/admin/legal-services/dashboard',
    '/admin/child-protection/dashboard',
    '/admin/site-titling/dashboard',
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
    '/admin/super-admin/logs': 'Audit Logs',
    '/admin/lis/dashboard': 'LIS Dashboard',
    '/admin/lis/users': 'User Management',
    '/admin/lis/logs': 'Audit Logs',
    '/admin/legal-services/dashboard': 'Administrative Cases',
    '/admin/legal-services/cases': 'Cases',
    '/admin/legal-services/cases/create': 'New Case',
    '/admin/legal-services/certificates': 'Certificates',
    '/admin/legal-services/certificates/list': 'All Certificates',
    '/admin/child-protection/dashboard': 'Child Protection',
    '/admin/site-titling/dashboard': 'Site Titling',
    '/admin/lrp/dashboard': 'LRP Dashboard',
    '/admin/lrp/intake-sheets': 'Intake Sheets',
    '/admin/lrp/intake-sheets/new': 'New Intake Sheet',
    '/admin/lrp/reports': 'Learner Reports',
    '/admin/profile': 'My Profile',
    '/admin/dashboard': 'Dashboard'
  };

  $effect(() => {
    const path = page.url.pathname;
    if (pageTitleMap[path]) {
      currentRole = pageTitleMap[path];
    } else if (path.match(/\/legal-services\/cases\/.+\/edit/)) {
      currentRole = 'Edit Case';
    } else if (path.match(/\/legal-services\/cases\/.+/)) {
      currentRole = 'Case Details';
    } else if (path.match(/\/lrp\/intake-sheets\/.+\/edit/)) {
      currentRole = 'Edit Intake Sheet';
    } else if (path.match(/\/lrp\/intake-sheets\/.+/)) {
      currentRole = 'Intake Sheet Details';
    } else if (path.match(/\/lrp\/reports\/.+/)) {
      currentRole = 'Learner Report Details';
    } else if (path.includes('/super-admin')) {
      currentRole = 'Super Admin';
    } else if (path.includes('/lis')) {
      currentRole = 'LIS Dashboard';
    } else if (path.includes('/legal-services')) {
      currentRole = 'Administrative Cases';
    } else if (path.includes('/child-protection')) {
      currentRole = 'Child Protection';
    } else if (path.includes('/site-titling')) {
      currentRole = 'Site Titling';
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
      'scale': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      'heart': 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
      'building': 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
      'document': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'users': 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
      'clipboard': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
      'clipboard-list': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h6',
      'certificate': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
      'cog': 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      'dashboard': 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
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
              {#if authState.user?.division?.name}
                • {authState.user.division.name}
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
                  {#if authState.user?.division?.name}
                    <p class="text-xs text-base-content/40 mt-1">{authState.user.division.name}</p>
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
        
        <div class="flex items-center gap-3 px-5 py-4 border-b border-base-200">
          <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <span class="text-primary font-bold text-sm">LS</span>
          </div>
          <div>
            <h2 class="font-semibold text-sm">LSIS</h2>
            <p class="text-xs text-base-content/40">
              {authState.getScope() === 'all' ? 'Full Access' : 
               authState.getScope() === 'division' ? 'Division Access' : 'Standard Access'}
            </p>
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
              <span class="truncate">{item.name}</span>
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