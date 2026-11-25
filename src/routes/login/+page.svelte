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

<div class="min-h-screen relative flex flex-col items-center justify-center px-5 py-8 overflow-hidden"
     style="background: linear-gradient(160deg,#ECFEFF 0%,#E0F2FE 45%,#FEF3E2 100%);">

  <!-- Soft decorative blobs -->
  <div class="pointer-events-none absolute -top-24 -left-20 w-72 h-72 rounded-full opacity-40 blur-3xl" style="background:#5EEAD4;"></div>
  <div class="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full opacity-40 blur-3xl" style="background:#FDBA74;"></div>
  <div class="pointer-events-none absolute top-1/3 -right-10 w-52 h-52 rounded-full opacity-30 blur-3xl" style="background:#93C5FD;"></div>

  <!-- Card -->
  <div class="relative w-full max-w-xs rounded-3xl overflow-hidden shadow-2xl">

    <!-- ── Branded header ── -->
    <div class="px-6 pt-8 pb-6 text-center"
         style="background:linear-gradient(165deg,#0D9488 0%,#0891B2 55%,#0EA5E9 100%);">

      <!-- Logo: shield cradling a child — protection, kept simple and geometric -->
      <div class="w-20 h-20 mx-auto mb-4">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full drop-shadow-lg">
          <defs>
            <linearGradient id="shieldFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stop-color="#FFFFFF"/>
              <stop offset="100%" stop-color="#E0F2FE"/>
            </linearGradient>
            <linearGradient id="armFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"  stop-color="#0D9488"/>
              <stop offset="100%" stop-color="#0EA5E9"/>
            </linearGradient>
            <linearGradient id="childFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stop-color="#FDBA74"/>
              <stop offset="100%" stop-color="#FB7185"/>
            </linearGradient>
            <radialGradient id="glow" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="transparent"/>
            </radialGradient>
          </defs>

          <!-- outer glow -->
          <circle cx="50" cy="50" r="48" fill="url(#glow)"/>

          <!-- shield: light fill so it reads clearly against the teal header behind it -->
          <path d="M50 4 L84 17 V46 C84 70 69 87 50 96 C31 87 16 70 16 46 V17 Z" fill="url(#shieldFill)"/>
          <path d="M50 4 L84 17 V46 C84 70 69 87 50 96 C31 87 16 70 16 46 V17 Z"
                fill="none" stroke="#0D9488" stroke-opacity="0.3" stroke-width="1.5"/>

          <!-- cradling arcs: two arms sheltering the figure below -->
          <path d="M27 51 C27 76 73 76 73 51" fill="none" stroke="url(#armFill)" stroke-opacity="0.35" stroke-width="4.5" stroke-linecap="round"/>
          <path d="M35 57 C35 72 65 72 65 57" fill="none" stroke="url(#armFill)" stroke-width="6" stroke-linecap="round"/>

          <!-- the child, in warm contrast to the cool arms -->
          <circle cx="50" cy="35" r="6.5" fill="url(#childFill)"/>
          <path d="M37 63 C37 50 41 45 50 45 C59 45 63 50 63 63 Z" fill="url(#childFill)"/>
        </svg>
      </div>

      <!-- Tagline pill -->
      <div class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 mb-3"
           style="background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);">
        <span class="w-1.5 h-1.5 rounded-full bg-rose-300"></span>
        <span class="text-white/85 text-xs tracking-wide">Safe spaces for every learner</span>
      </div>

      <!-- System name -->
      <h1 class="text-white font-bold text-xl leading-tight tracking-tight">LRP-IRIS</h1>
      <p class="text-white/90 text-xs leading-snug mt-1">Learner Rights Protection –<br>Incident Reporting Information System</p>
      <p class="text-cyan-50/80 text-xs mt-1.5 tracking-wide">Department of Education</p>
      <p class="text-cyan-50/60 text-xs tracking-wider">Cordillera Administrative Region</p>

      <!-- Divider -->
      <div class="flex items-center gap-2 mt-5">
        <div class="flex-1 h-px bg-gradient-to-r from-transparent to-white/20"></div>
        <div class="w-1.5 h-1.5 rounded-full bg-rose-200/70"></div>
        <div class="flex-1 h-px bg-gradient-to-l from-transparent to-white/20"></div>
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

        <p class="text-base-content font-semibold text-sm text-center">Welcome back</p>
        <p class="text-base-content/50 text-xs mb-5 text-center">Sign in to continue keeping our learners safe</p>

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

      <p class="text-center text-xs text-base-content/40 mt-6 flex items-center justify-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3 text-rose-400">
          <path d="M12 21s-7.5-4.6-10.1-9.1C.3 8.8 1.6 5 5.2 4.2c2-.5 4 .3 5.1 2 .3.4.9.4 1.2 0 1.1-1.7 3.1-2.5 5.1-2 3.6.8 4.9 4.6 3.3 7.7C19.5 16.4 12 21 12 21z"/>
        </svg>
        Every learner has the right to feel safe
      </p>
      <p class="text-center text-xs text-base-content/25 mt-1">
        © 2026 DepEd — Cordillera Administrative Region
      </p>
    </div>

  </div>
</div>
