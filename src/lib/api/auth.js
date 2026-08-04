import { api } from './client.js';

// "Remember this device" token — separate from the access/refresh tokens since
// it must survive logout (it's tied to the device+IP, not a login session) and
// is only ever sent on the /login and /verify-2fa auth endpoints.
const DEVICE_TOKEN_KEY = 'device_token';

class AuthService {
  getDeviceToken() {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  }

  setDeviceToken(token) {
    if (typeof localStorage === 'undefined') return;
    if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }

  clearDeviceToken() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  }

  async login(username, password) {
    try {
      const response = await api.post('/login', {
        username,
        password,
        device_info: this.getDeviceInfo(),
        device_token: this.getDeviceToken()
      });

      if (response.access_token) {
        api.setTokens(response.access_token, response.refresh_token);
        return { success: true, user: this.formatUser(response.user), passwordExpired: !!response.password_expired };
      }

      // Backend may return temp_token for 2FA
      if (response.temp_token) {
        return { success: false, requires2FA: true, tempToken: response.temp_token, otpSent: response.otp_sent };
      }

      return { success: false, error: response.message || response.error || 'Login failed' };
    } catch (err) {
      let errorMessage = 'Login failed. Please try again.';
      if (err.status === 401) {
        errorMessage = err.data?.error || 'Invalid username or password';
      } else if (err.status === 403) {
        errorMessage = err.data?.error || 'Account is deactivated. Please contact administrator.';
      } else if (err.data?.error) {
        errorMessage = err.data.error;
      } else if (err.data?.message) {
        errorMessage = err.data.message;
      }
      return { success: false, error: errorMessage, validationErrors: err.validationErrors || {} };
    }
  }

  async verify2fa(tempToken, otpCode, rememberDevice, deviceInfo) {
    try {
      const response = await api.post('/verify-2fa', {
        temp_token: tempToken,
        otp_code: otpCode,
        remember_device: !!rememberDevice,
        ...(deviceInfo && { device_info: deviceInfo })
      });
      if (response.access_token) {
        api.setTokens(response.access_token, response.refresh_token);
        if (response.device_token) this.setDeviceToken(response.device_token);
        return { success: true, user: this.formatUser(response.user), passwordExpired: !!response.password_expired };
      }
      return { success: false, error: response.error || '2FA verification failed' };
    } catch (err) {
      return {
        success: false,
        error: err.data?.error || err.message || 'Invalid OTP code'
      };
    }
  }

  async logout() {
    try {
      const refreshToken = api.getRefreshToken();
      await api.post('/logout', refreshToken ? { refresh_token: refreshToken } : {});
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      api.clearTokens();
    }
  }

  async getCurrentUser() {
    try {
      const response = await api.get('/me');
      // /me returns the user object directly (no wrapper)
      if (response.id) {
        return { success: true, user: this.formatUser(response) };
      }
      return { success: false, error: 'User not found' };
    } catch (err) {
      if (err.status === 401) api.clearTokens();
      return { success: false, error: err.data?.error || err.message };
    }
  }

  async forgotPassword(email) {
    try {
      const response = await api.post('/forgot-password', { email });
      return { success: true, message: response.message };
    } catch (err) {
      return { success: false, error: err.data?.error || err.message };
    }
  }

  async resetPassword(token, email, password, passwordConfirmation) {
    try {
      const response = await api.post('/reset-password', {
        token,
        email,
        password,
        password_confirmation: passwordConfirmation
      });
      return { success: true, message: response.message };
    } catch (err) {
      return {
        success: false,
        error: err.data?.error || err.message,
        validationErrors: err.validationErrors || {}
      };
    }
  }

  async changePassword(currentPassword, newPassword, newPasswordConfirmation) {
    try {
      const response = await api.post('/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: newPasswordConfirmation
      });
      // Backend revokes all remembered devices on password change — drop the
      // now-dead local token so we don't keep sending it on future logins.
      this.clearDeviceToken();
      return { success: true, message: response.message };
    } catch (err) {
      return {
        success: false,
        error: err.data?.error || err.message,
        validationErrors: err.validationErrors || {}
      };
    }
  }

  /** Step 1 of enabling 2FA: confirm password, triggers an emailed confirmation code. */
  async enable2FA(password) {
    try {
      const response = await api.post('/2fa/enable', { password });
      return { success: true, message: response.message, otpSent: response.otp_sent };
    } catch (err) {
      return { success: false, error: err.data?.error || err.message };
    }
  }

  /** Step 2 of enabling 2FA: verify the emailed code. */
  async confirmEnable2FA(otpCode) {
    try {
      const response = await api.post('/2fa/enable/confirm', { otp_code: otpCode });
      return { success: true, message: response.message };
    } catch (err) {
      return { success: false, error: err.data?.error || err.message };
    }
  }

  async disable2FA(password) {
    try {
      const response = await api.post('/2fa/disable', { password });
      // Backend revokes all remembered devices when 2FA is turned off.
      this.clearDeviceToken();
      return { success: true, message: response.message };
    } catch (err) {
      return { success: false, error: err.data?.error || err.message };
    }
  }

  async getProfile() {
    try {
      const response = await api.get('/profile');
      return { success: true, data: response };
    } catch (err) {
      return { success: false, error: err.data?.error || err.message };
    }
  }

  async updateProfile(data) {
    try {
      const response = await api.put('/profile', data);
      return { success: true, user: this.formatUser(response.user), message: response.message };
    } catch (err) {
      return {
        success: false,
        error: err.data?.error || err.message,
        validationErrors: err.validationErrors || {}
      };
    }
  }

  async getRefreshTokens() {
    try {
      const response = await api.get('/my-refresh-tokens');
      return { success: true, data: response };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async revokeRefreshToken(tokenId) {
    try {
      await api.delete(`/my-refresh-tokens/${tokenId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getDeviceInfo() {
    if (typeof window === 'undefined') return 'Server';
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor;
    const platform = isCapacitor ? window.Capacitor.getPlatform() : 'web';
    return `${browser} on ${navigator.platform} (${platform})`;
  }

  formatUser(user) {
    if (!user) return null;
    // roles may be string array ["Role Name"] or object array [{ id, name, slug }]
    const roles = (user.roles || []).map((r) => (typeof r === 'string' ? r : r.name));
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      fullName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      initials: `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase(),
      position: user.position,
      contactNumber: user.contact_number,
      isActive: user.is_active,
      twoFactorEnabled: user.two_factor_enabled,
      passwordExpired: !!user.password_expired,
      roles,
      role: roles[0] || 'user',
      permissions: user.permissions || [],
      division: user.division || null,
      school: user.school || null,
      organizationLevel: user.organization_level,
      effectiveDivisionId: user.effective_division_id
    };
  }
}

export const authService = new AuthService();
