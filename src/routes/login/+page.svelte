<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authState } from '$lib/stores/auth.svelte.js';

  let username = $state('');
  let password = $state('');
  let showPassword = $state(false);
  let isSubmitting = $state(false);
  let otpCode = $state('');
  let otpSubmitting = $state(false);
  let rememberDevice = $state(false);

  let sessionExpiredMsg = $derived(
    page.url.searchParams.get('expired') === '1'
      ? 'Your session has expired. Please log in again.'
      : ''
  );

  $effect(() => {
    if (!authState.loading && authState.isAuthenticated) {
      goto(authState.getPrimaryDashboard(), { replaceState: true });
    }
  });

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    authState.error = null;
    const success = await authState.login(username, password);
    if (success) {
      await goto(authState.getPrimaryDashboard(), { replaceState: true });
    }
    isSubmitting = false;
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    if (otpSubmitting) return;
    otpSubmitting = true;
    authState.error = null;
    const success = await authState.verify2FA(otpCode, rememberDevice);
    if (success) {
      await goto(authState.getPrimaryDashboard(), { replaceState: true });
    }
    otpSubmitting = false;
  }

  function handleBackToLogin() {
    authState.cancelTwoFactor();
    otpCode = '';
    password = '';
  }
</script>

<div class="min-h-screen flex flex-col items-center justify-center px-5 py-8"
     style="background: linear-gradient(160deg,#0F172A 0%,#1E3A8A 70%,#1E40AF 100%);">

  <!-- Card -->
  <div class="w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl">

    <!-- ── Branded header ── -->
    <div class="px-6 pt-8 pb-6 text-center"
         style="background:linear-gradient(175deg,#0F172A 0%,#1e2f6e 100%);">

      <!-- Logo -->
      <div class="w-20 h-20 mx-auto mb-4">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full drop-shadow-lg">
          <defs>
            <radialGradient id="lbg" cx="50%" cy="35%" r="68%">
              <stop offset="0%" stop-color="#1E3A8A"/>
              <stop offset="100%" stop-color="#080E1C"/>
            </radialGradient>
            <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stop-color="#FEF08A"/>
              <stop offset="40%"  stop-color="#F59E0B"/>
              <stop offset="100%" stop-color="#78350F"/>
            </linearGradient>
            <linearGradient id="lgH" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stop-color="#FEF08A"/>
              <stop offset="50%"  stop-color="#F59E0B"/>
              <stop offset="100%" stop-color="#FEF08A"/>
            </linearGradient>
            <radialGradient id="ls" cx="42%" cy="28%" r="52%">
              <stop offset="0%" stop-color="#93C5FD" stop-opacity="0.2"/>
              <stop offset="100%" stop-color="transparent"/>
            </radialGradient>
            <radialGradient id="lpan" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#FEF9C3" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="transparent"/>
            </radialGradient>
            <clipPath id="lcc"><circle cx="50" cy="50" r="43"/></clipPath>
          </defs>
          <circle cx="50" cy="50" r="50"   fill="url(#lg)"/>
          <circle cx="50" cy="50" r="45.8" fill="#060C18"/>
          <circle cx="50" cy="50" r="44.4" stroke="#F59E0B" stroke-width="0.7" fill="none"/>
          <circle cx="50" cy="50" r="43"   fill="url(#lbg)"/>
          <circle cx="50" cy="50" r="43"   fill="url(#ls)"/>
          <g clip-path="url(#lcc)" stroke="white" stroke-width="0.4" opacity="0.07">
            <line x1="50" y1="7" x2="50" y2="93"/>
            <line x1="50" y1="7" x2="50" y2="93" transform="rotate(22.5 50 50)"/>
            <line x1="50" y1="7" x2="50" y2="93" transform="rotate(45 50 50)"/>
            <line x1="50" y1="7" x2="50" y2="93" transform="rotate(67.5 50 50)"/>
          </g>
          <circle cx="50"   cy="6.5"  r="2" fill="#FEF08A"/>
          <circle cx="93.5" cy="50"   r="2" fill="#FEF08A"/>
          <circle cx="50"   cy="93.5" r="2" fill="#FEF08A"/>
          <circle cx="6.5"  cy="50"   r="2" fill="#FEF08A"/>
          <ellipse cx="50" cy="34" rx="1.8" ry="7"   fill="url(#lg)"/>
          <ellipse cx="50" cy="34" rx="7"   ry="1.8" fill="url(#lgH)"/>
          <circle  cx="50" cy="34" r="3.5"  fill="url(#lg)"/>
          <circle  cx="50" cy="34" r="1.8"  fill="#FEFCE8"/>
          <rect x="13" y="32.2" width="74" height="3.5" rx="1.75" fill="white"/>
          <rect x="19.5" y="35.7" width="2" height="17" rx="1" fill="white" opacity="0.82"/>
          <rect x="78.5" y="35.7" width="2" height="17" rx="1" fill="white" opacity="0.82"/>
          <path d="M10 52.7 Q20.5 68 31 52.7 Z"           fill="url(#lpan)"/>
          <path d="M10 52.7 Q20.5 68 31 52.7"  stroke="white" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M69 52.7 Q79.5 68 90 52.7 Z"            fill="url(#lpan)"/>
          <path d="M69 52.7 Q79.5 68 90 52.7"  stroke="white" stroke-width="2.8" stroke-linecap="round"/>
          <rect x="47.5" y="35.7" width="5" height="29" rx="2.5" fill="url(#lg)"/>
          <polygon points="50,36 52.5,40.5 50,45 47.5,40.5" fill="#FEF9C3" opacity="0.75"/>
          <rect x="33" y="63.5" width="34" height="5.2" rx="2.6" fill="url(#lg)"/>
          <rect x="27" y="67.5" width="46" height="3.8" rx="1.9" fill="url(#lg)" opacity="0.65"/>
        </svg>
      </div>

      <!-- Version pill -->
      <div class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 mb-3"
           style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span class="text-white/65 text-xs tracking-wide">Version 4</span>
      </div>

      <!-- System name -->
      <h1 class="text-white font-bold text-base leading-snug">
        Legal Services<br>Information System
      </h1>
      <p class="text-blue-200/60 text-xs mt-1.5 tracking-wide">Department of Education</p>
      <p class="text-blue-300/40 text-xs tracking-wider">Cordillera Administrative Region</p>

      <!-- Divider -->
      <div class="flex items-center gap-2 mt-5">
        <div class="flex-1 h-px bg-gradient-to-r from-transparent to-white/10"></div>
        <div class="w-1 h-1 rounded-full bg-amber-400/50"></div>
        <div class="flex-1 h-px bg-gradient-to-l from-transparent to-white/10"></div>
      </div>
    </div>

    <!-- ── Login form ── -->
    <div class="bg-base-100 px-6 py-6">

      {#if authState.requires2FA}

        <p class="text-base-content/50 text-xs mb-1 text-center tracking-wide uppercase">Verification Code</p>
        <p class="text-base-content/40 text-xs mb-5 text-center">
          Enter the 6-digit code sent to your email.
        </p>

        <form onsubmit={handleVerifyOtp} class="space-y-3">
          <div class="form-control">
            <label class="label py-1" for="otp-code">
              <span class="label-text text-xs font-semibold">Verification Code</span>
            </label>
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              id="otp-code"
              class="input input-bordered input-sm w-full text-center tracking-[0.5em] font-semibold"
              placeholder="000000"
              bind:value={otpCode}
              required
              autocomplete="one-time-code"
            />
          </div>

          <label class="flex items-start gap-2 cursor-pointer select-none">
            <input type="checkbox" class="checkbox checkbox-sm checkbox-primary mt-0.5" bind:checked={rememberDevice} />
            <span class="text-xs text-base-content/60">
              Remember this device on this network for 30 days
              <span class="block text-base-content/40">Skips the verification code next time you sign in from the same device and network.</span>
            </span>
          </label>

          {#if authState.error}
            <div class="alert alert-error py-2 text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 shrink-0">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
              </svg>
              <span>{authState.error}</span>
            </div>
          {/if}

          <button
            type="submit"
            class="btn btn-primary btn-sm w-full mt-1"
            disabled={otpSubmitting || otpCode.length !== 6}
          >
            {#if otpSubmitting}
              <span class="loading loading-spinner loading-xs"></span>
              Verifying…
            {:else}
              Verify
            {/if}
          </button>

          <button type="button" onclick={handleBackToLogin} class="btn btn-ghost btn-sm w-full">
            Back to login
          </button>
        </form>

      {:else}

        <p class="text-base-content/50 text-xs mb-5 text-center tracking-wide uppercase">Sign in to your account</p>

        {#if sessionExpiredMsg}
          <div class="alert alert-warning py-2 mb-4 text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span>{sessionExpiredMsg}</span>
          </div>
        {/if}

        <form onsubmit={handleSubmit} class="space-y-3">
          <div class="form-control">
            <label class="label py-1" for="username">
              <span class="label-text text-xs font-semibold">Username</span>
            </label>
            <input
              type="text"
              id="username"
              class="input input-bordered input-sm w-full"
              placeholder="Enter your username"
              bind:value={username}
              required
              autocomplete="username"
            />
          </div>

          <div class="form-control">
            <label class="label py-1" for="password">
              <span class="label-text text-xs font-semibold">Password</span>
            </label>
            <div class="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                class="input input-bordered input-sm w-full pr-10"
                placeholder="••••••••"
                bind:value={password}
                required
                autocomplete="current-password"
              />
              <button
                type="button"
                onclick={() => showPassword = !showPassword}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {#if showPassword}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                  </svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          {#if authState.error}
            <div class="alert alert-error py-2 text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 shrink-0">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
              </svg>
              <span>{authState.error}</span>
            </div>
          {/if}

          <button
            type="submit"
            class="btn btn-primary btn-sm w-full mt-1"
            disabled={isSubmitting || !username || !password}
          >
            {#if isSubmitting}
              <span class="loading loading-spinner loading-xs"></span>
              Signing in…
            {:else}
              Sign In
            {/if}
          </button>
        </form>

      {/if}

      <p class="text-center text-xs text-base-content/25 mt-6">
        © 2026 DepEd — Cordillera Administrative Region
      </p>
    </div>

  </div>
</div>
