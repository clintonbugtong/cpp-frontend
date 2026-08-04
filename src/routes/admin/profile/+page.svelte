<script>
  import { authService } from '$lib/api/auth.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { onMount } from 'svelte';

  // ── profile form ────────────────────────────────────────────────────────
  let profileForm = $state({ first_name: '', middle_name: '', last_name: '', contact_number: '' });
  let profileSubmitting = $state(false);
  let profileSuccess = $state('');
  let profileError = $state('');

  // ── password form ────────────────────────────────────────────────────────
  let passwordForm = $state({ current_password: '', new_password: '', new_password_confirmation: '' });
  let passwordSubmitting = $state(false);
  let passwordSuccess = $state('');
  let passwordError = $state('');
  let passwordErrors = $state(/** @type {Record<string,string[]>} */ ({}));
  let showCurrentPw = $state(false);
  let showNewPw = $state(false);
  let showConfirmPw = $state(false);

  onMount(async () => {
    // Pre-populate from authState.user (has firstName/middleName/lastName from /me)
    if (authState.user) {
      profileForm = {
        first_name: authState.user.firstName || '',
        middle_name: authState.user.middleName || '',
        last_name: authState.user.lastName || '',
        contact_number: authState.user.contactNumber || ''
      };
    }
    // Fetch fresh profile to get up-to-date contact_number
    const result = await authService.getProfile();
    if (result.success && result.data) {
      profileForm.contact_number = result.data.contact_number || profileForm.contact_number;
    }
  });

  async function handleProfileSave() {
    profileSubmitting = true;
    profileSuccess = '';
    profileError = '';
    const result = await authService.updateProfile(profileForm);
    if (result.success) {
      profileSuccess = 'Profile updated successfully.';
      // Re-fetch full user data from /me so authState reflects new names
      const userResult = await authService.getCurrentUser();
      if (userResult.success && userResult.user) authState.user = userResult.user;
    } else {
      profileError = result.error || 'Failed to update profile.';
    }
    profileSubmitting = false;
  }

  async function handlePasswordChange() {
    passwordSubmitting = true;
    passwordSuccess = '';
    passwordError = '';
    passwordErrors = {};
    const result = await authService.changePassword(
      passwordForm.current_password,
      passwordForm.new_password,
      passwordForm.new_password_confirmation
    );
    if (result.success) {
      passwordSuccess = 'Password changed successfully.';
      passwordForm = { current_password: '', new_password: '', new_password_confirmation: '' };
    } else {
      passwordError = result.error || 'Failed to change password.';
      passwordErrors = result.validationErrors || {};
    }
    passwordSubmitting = false;
  }

  // ── two-factor authentication ──────────────────────────────────────────
  /** @type {'idle'|'confirm-password'|'confirm-otp'|'disabling'} */
  let tfaStep = $state('idle');
  let tfaPassword = $state('');
  let tfaOtpCode = $state('');
  let tfaSubmitting = $state(false);
  let tfaError = $state('');
  let tfaSuccess = $state('');

  function openEnable2FA() {
    tfaStep = 'confirm-password';
    tfaPassword = '';
    tfaError = '';
    tfaSuccess = '';
  }

  function openDisable2FA() {
    tfaStep = 'disabling';
    tfaPassword = '';
    tfaError = '';
    tfaSuccess = '';
  }

  function cancelTfaFlow() {
    tfaStep = 'idle';
    tfaPassword = '';
    tfaOtpCode = '';
    tfaError = '';
  }

  async function handleEnable2FAStart() {
    tfaSubmitting = true;
    tfaError = '';
    const result = await authState.enable2FA(tfaPassword);
    if (result.success) {
      tfaStep = 'confirm-otp';
      tfaOtpCode = '';
    } else {
      tfaError = result.error || 'Failed to send confirmation code.';
    }
    tfaSubmitting = false;
  }

  async function handleEnable2FAConfirm() {
    tfaSubmitting = true;
    tfaError = '';
    const result = await authState.confirmEnable2FA(tfaOtpCode);
    if (result.success) {
      tfaStep = 'idle';
      tfaSuccess = 'Two-factor authentication is now enabled.';
    } else {
      tfaError = result.error || 'Invalid or expired code.';
    }
    tfaSubmitting = false;
  }

  async function handleDisable2FA() {
    tfaSubmitting = true;
    tfaError = '';
    const result = await authState.disable2FA(tfaPassword);
    if (result.success) {
      tfaStep = 'idle';
      tfaSuccess = 'Two-factor authentication has been disabled.';
    } else {
      tfaError = result.error || 'Failed to disable two-factor authentication.';
    }
    tfaSubmitting = false;
  }

  function getRoleBadge(role) {
    if (role.includes('Super')) return 'badge-error';
    if (role.includes('Legal Services')) return 'badge-primary';
    if (role.includes('Legal Information')) return 'badge-info';
    if (role.includes('Child Protection')) return 'badge-success';
    if (role.includes('Site Titling')) return 'badge-warning';
    return 'badge-ghost';
  }
</script>

<div class="max-w-3xl mx-auto space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-bold">My Profile</h1>
    <p class="text-base-content/50 mt-1">Manage your account information and password</p>
  </div>

  <!-- Account overview card -->
  <div class="card bg-base-100 shadow-sm border border-base-200">
    <div class="card-body p-5">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span class="text-2xl font-bold text-primary-content leading-none">
            {authState.user?.initials || 'U'}
          </span>
        </div>
        <div class="min-w-0">
          <p class="text-lg font-semibold">{authState.user?.fullName || '—'}</p>
          <p class="text-sm text-base-content/50">{authState.user?.email || ''}</p>
          <div class="flex flex-wrap gap-1.5 mt-2">
            {#each (authState.user?.roles ?? []) as role}
              <span class="badge badge-sm {getRoleBadge(role)}">{role}</span>
            {/each}
          </div>
        </div>
      </div>
      {#if authState.user?.division?.name || authState.user?.position}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-base-200">
          {#if authState.user?.position}
            <div>
              <p class="text-xs text-base-content/40 uppercase tracking-wider">Position</p>
              <p class="text-sm font-medium mt-0.5">{authState.user.position}</p>
            </div>
          {/if}
          {#if authState.user?.division?.name}
            <div>
              <p class="text-xs text-base-content/40 uppercase tracking-wider">Division</p>
              <p class="text-sm font-medium mt-0.5">{authState.user.division.name}</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Edit profile card -->
  <div class="card bg-base-100 shadow-sm border border-base-200">
    <div class="card-body p-5">
      <h2 class="font-semibold text-base mb-4">Personal Information</h2>

      {#if profileSuccess}
        <div class="alert alert-success text-sm py-2 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          {profileSuccess}
        </div>
      {/if}
      {#if profileError}
        <div class="alert alert-error text-sm py-2 mb-3">{profileError}</div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); handleProfileSave(); }} class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="form-control">
            <label class="label py-1" for="p-first"><span class="label-text text-xs">First Name</span></label>
            <input id="p-first" class="input input-bordered input-sm" bind:value={profileForm.first_name} required />
          </div>
          <div class="form-control">
            <label class="label py-1" for="p-mid"><span class="label-text text-xs">Middle Name</span></label>
            <input id="p-mid" class="input input-bordered input-sm" bind:value={profileForm.middle_name} />
          </div>
          <div class="form-control">
            <label class="label py-1" for="p-last"><span class="label-text text-xs">Last Name</span></label>
            <input id="p-last" class="input input-bordered input-sm" bind:value={profileForm.last_name} required />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="form-control">
            <label class="label py-1" for="p-contact"><span class="label-text text-xs">Contact Number</span></label>
            <input id="p-contact" class="input input-bordered input-sm w-full" bind:value={profileForm.contact_number} />
          </div>
        </div>
        <div class="flex justify-end">
          <button type="submit" class="btn btn-primary btn-sm" disabled={profileSubmitting}>
            {#if profileSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Change password card -->
  <div class="card bg-base-100 shadow-sm border border-base-200">
    <div class="card-body p-5">
      <h2 class="font-semibold text-base mb-4">Change Password</h2>

      {#if passwordSuccess}
        <div class="alert alert-success text-sm py-2 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          {passwordSuccess}
        </div>
      {/if}
      {#if passwordError}
        <div class="alert alert-error text-sm py-2 mb-3">{passwordError}</div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); handlePasswordChange(); }} class="space-y-4 max-w-sm">
        <!-- Current password -->
        <div class="form-control">
          <label class="label py-1" for="pw-current"><span class="label-text text-xs">Current Password</span></label>
          <div class="relative">
            <input
              id="pw-current"
              type={showCurrentPw ? 'text' : 'password'}
              class="input input-bordered input-sm w-full pr-9 {passwordErrors.current_password ? 'input-error' : ''}"
              bind:value={passwordForm.current_password}
              required
            />
            <button type="button" onclick={() => showCurrentPw = !showCurrentPw}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                {#if showCurrentPw}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                {:else}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                {/if}
              </svg>
            </button>
          </div>
          {#if passwordErrors.current_password}
            <p class="text-error text-xs mt-1">{passwordErrors.current_password[0]}</p>
          {/if}
        </div>

        <!-- New password -->
        <div class="form-control">
          <label class="label py-1" for="pw-new"><span class="label-text text-xs">New Password</span></label>
          <div class="relative">
            <input
              id="pw-new"
              type={showNewPw ? 'text' : 'password'}
              class="input input-bordered input-sm w-full pr-9 {passwordErrors.new_password ? 'input-error' : ''}"
              bind:value={passwordForm.new_password}
              required
            />
            <button type="button" onclick={() => showNewPw = !showNewPw}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                {#if showNewPw}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                {:else}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                {/if}
              </svg>
            </button>
          </div>
          {#if passwordErrors.new_password}
            <p class="text-error text-xs mt-1">{passwordErrors.new_password[0]}</p>
          {/if}
        </div>

        <!-- Confirm password -->
        <div class="form-control">
          <label class="label py-1" for="pw-confirm"><span class="label-text text-xs">Confirm New Password</span></label>
          <div class="relative">
            <input
              id="pw-confirm"
              type={showConfirmPw ? 'text' : 'password'}
              class="input input-bordered input-sm w-full pr-9"
              bind:value={passwordForm.new_password_confirmation}
              required
            />
            <button type="button" onclick={() => showConfirmPw = !showConfirmPw}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                {#if showConfirmPw}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                {:else}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                {/if}
              </svg>
            </button>
          </div>
        </div>

        <div class="flex justify-end">
          <button type="submit" class="btn btn-primary btn-sm" disabled={passwordSubmitting}>
            {#if passwordSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
            Change Password
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Two-factor authentication card -->
  <div class="card bg-base-100 shadow-sm border border-base-200">
    <div class="card-body p-5">
      <div class="flex items-center justify-between mb-1">
        <h2 class="font-semibold text-base">Two-Factor Authentication</h2>
        <span class="badge badge-sm {authState.user?.twoFactorEnabled ? 'badge-success' : 'badge-ghost'}">
          {authState.user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <p class="text-sm text-base-content/50 mb-4">
        {#if authState.user?.twoFactorEnabled}
          A verification code will be emailed to you each time you sign in.
        {:else}
          Add an extra layer of security — a verification code will be emailed to you at each sign-in.
        {/if}
      </p>

      {#if tfaSuccess}
        <div class="alert alert-success text-sm py-2 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          {tfaSuccess}
        </div>
      {/if}
      {#if tfaError}
        <div class="alert alert-error text-sm py-2 mb-3">{tfaError}</div>
      {/if}

      {#if tfaStep === 'idle'}
        {#if authState.user?.twoFactorEnabled}
          <button class="btn btn-error btn-outline btn-sm" onclick={openDisable2FA}>Disable Two-Factor Authentication</button>
        {:else}
          <button class="btn btn-primary btn-sm" onclick={openEnable2FA}>Enable Two-Factor Authentication</button>
        {/if}

      {:else if tfaStep === 'confirm-password'}
        <form onsubmit={(e) => { e.preventDefault(); handleEnable2FAStart(); }} class="space-y-3 max-w-sm">
          <div class="form-control">
            <label class="label py-1" for="tfa-pw"><span class="label-text text-xs">Confirm your password to continue</span></label>
            <input id="tfa-pw" type="password" class="input input-bordered input-sm w-full" bind:value={tfaPassword} required autocomplete="current-password" />
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn btn-ghost btn-sm" onclick={cancelTfaFlow}>Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm" disabled={tfaSubmitting}>
              {#if tfaSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
              Send Code
            </button>
          </div>
        </form>

      {:else if tfaStep === 'confirm-otp'}
        <form onsubmit={(e) => { e.preventDefault(); handleEnable2FAConfirm(); }} class="space-y-3 max-w-sm">
          <div class="form-control">
            <label class="label py-1" for="tfa-otp"><span class="label-text text-xs">Enter the 6-digit code sent to your email</span></label>
            <input
              id="tfa-otp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
              class="input input-bordered input-sm w-full text-center tracking-[0.4em] font-semibold"
              placeholder="000000" bind:value={tfaOtpCode} required autocomplete="one-time-code"
            />
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn btn-ghost btn-sm" onclick={cancelTfaFlow}>Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm" disabled={tfaSubmitting || tfaOtpCode.length !== 6}>
              {#if tfaSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
              Confirm
            </button>
          </div>
        </form>

      {:else if tfaStep === 'disabling'}
        <form onsubmit={(e) => { e.preventDefault(); handleDisable2FA(); }} class="space-y-3 max-w-sm">
          <div class="form-control">
            <label class="label py-1" for="tfa-disable-pw"><span class="label-text text-xs">Confirm your password to disable two-factor authentication</span></label>
            <input id="tfa-disable-pw" type="password" class="input input-bordered input-sm w-full" bind:value={tfaPassword} required autocomplete="current-password" />
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn btn-ghost btn-sm" onclick={cancelTfaFlow}>Cancel</button>
            <button type="submit" class="btn btn-error btn-sm" disabled={tfaSubmitting}>
              {#if tfaSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
              Disable
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
</div>
