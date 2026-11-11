const API_BASE_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8000/api';

class ApiClient {
	constructor() {
		this.baseURL = API_BASE_URL;
		this.accessToken = null;
		this.refreshToken = null;
		this.isRefreshing = false;
		this.failedQueue = [];

		if (typeof localStorage !== 'undefined') {
			this.accessToken = localStorage.getItem('access_token');
			this.refreshToken = localStorage.getItem('refresh_token');
		}
	}

	setTokens(accessToken, refreshToken) {
		console.log('Setting tokens:', {
			hasAccessToken: !!accessToken,
			hasRefreshToken: !!refreshToken
		});

		this.accessToken = accessToken;
		this.refreshToken = refreshToken;

		if (accessToken) {
			localStorage.setItem('access_token', accessToken);
		} else {
			localStorage.removeItem('access_token');
		}

		if (refreshToken) {
			localStorage.setItem('refresh_token', refreshToken);
		} else {
			localStorage.removeItem('refresh_token');
		}
	}

	getAccessToken() {
		return this.accessToken;
	}

	getRefreshToken() {
		return this.refreshToken;
	}

	clearTokens() {
		this.accessToken = null;
		this.refreshToken = null;
		localStorage.removeItem('access_token');
		localStorage.removeItem('refresh_token');
	}

	// List of endpoints that should NOT trigger token refresh on 401
	isAuthEndpoint(endpoint) {
		const authEndpoints = [
			'/login',
			'/register',
			'/forgot-password',
			'/reset-password',
			'/refresh'
		];
		return authEndpoints.some((auth) => endpoint.startsWith(auth));
	}

	async refreshAccessToken() {
		if (!this.refreshToken) {
			this.clearTokens();
			return false;
		}

		try {
			const response = await fetch(`${this.baseURL}/refresh`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({
					refresh_token: this.refreshToken
				})
			});

			if (response.ok) {
				const data = await response.json();
				this.setTokens(data.access_token, data.refresh_token);
				return true;
			}

			this.clearTokens();
			return false;
		} catch (err) {
			console.error('Token refresh failed:', err);
			this.clearTokens();
			return false;
		}
	}

	processQueue(error, token = null) {
		this.failedQueue.forEach((prom) => {
			if (error) {
				prom.reject(error);
			} else {
				prom.resolve(token);
			}
		});
		this.failedQueue = [];
	}

	async request(endpoint, options = {}) {
		const url = `${this.baseURL}${endpoint}`;

		const headers = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...options.headers
		};

		// Only add token if we have one
		if (this.accessToken) {
			headers['Authorization'] = `Bearer ${this.accessToken}`;
		}

		const config = {
			...options,
			headers
		};

		try {
			const response = await fetch(url, config);

			// Handle 401 Unauthorized
			if (response.status === 401) {
				// Skip token refresh for auth endpoints (login, register, etc.)
				if (this.isAuthEndpoint(endpoint)) {
					// Just parse the error from the response
					const errorData = await response.json().catch(() => ({
						error: 'Invalid credentials'
					}));

					const error = new Error(errorData.error || errorData.message || 'Invalid credentials');
					error.status = 401;
					error.data = errorData;
					throw error;
				}

				// For non-auth endpoints, try to refresh token
				if (!options._retry) {
					if (this.isRefreshing) {
						return new Promise((resolve, reject) => {
							this.failedQueue.push({ resolve, reject });
						}).then((token) => {
							headers['Authorization'] = `Bearer ${token}`;
							return fetch(url, { ...config, headers, _retry: true });
						});
					}

					this.isRefreshing = true;

					try {
						const refreshed = await this.refreshAccessToken();

						if (refreshed) {
							this.processQueue(null, this.accessToken);
							headers['Authorization'] = `Bearer ${this.accessToken}`;
							const retryResponse = await fetch(url, {
								...config,
								headers,
								_retry: true
							});
							this.isRefreshing = false;

							if (!retryResponse.ok) {
								const errorData = await retryResponse.json().catch(() => ({}));
								const error = new Error(errorData.error || errorData.message || 'Request failed');
								error.status = retryResponse.status;
								error.data = errorData;
								throw error;
							}

							return await retryResponse.json();
						} else {
							this.processQueue(new Error('Session expired'));
							this.isRefreshing = false;
							this.clearTokens();

							// Only redirect if not already on login page
							if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
								window.location.href = '/login?expired=1';
							}

							const error = new Error('Session expired. Please login again.');
							error.status = 401;
							throw error;
						}
					} catch (refreshError) {
						this.processQueue(refreshError);
						this.isRefreshing = false;
						throw refreshError;
					}
				}
			}

			// Handle other HTTP errors
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({
					error: 'An unexpected error occurred'
				}));

				const error = new Error(
					errorData.message || errorData.error || `HTTP Error ${response.status}`
				);

				error.status = response.status;
				error.data = errorData;

				if (response.status === 422 && errorData.errors) {
					error.validationErrors = errorData.errors;
					error.message = errorData.message || 'Validation failed';
				}

				if (errorData.error) {
					error.message = errorData.error;
				}

				throw error;
			}

			const data = await response.json();
			return data;
		} catch (err) {
			if (err.status) throw err;

			console.error(`API Error [${endpoint}]:`, err);
			throw new Error('Network error. Please check your connection.');
		}
	}

	// HTTP methods
	async get(endpoint, params = {}) {
		const queryString = new URLSearchParams(params).toString();
		const url = queryString ? `${endpoint}?${queryString}` : endpoint;
		return this.request(url, { method: 'GET' });
	}

	async post(endpoint, data = {}) {
		return this.request(endpoint, {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}

	async put(endpoint, data = {}) {
		return this.request(endpoint, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	}

	async patch(endpoint, data = {}) {
		return this.request(endpoint, {
			method: 'PATCH',
			body: JSON.stringify(data)
		});
	}

	async delete(endpoint, data = null) {
		const options = { method: 'DELETE' };
		if (data !== null) options.body = JSON.stringify(data);
		return this.request(endpoint, options);
	}

	/**
	 * Fetch a file (e.g. a generated PDF) with the auth header and hand it to
	 * the browser as a download. Retries once after refreshing an expired token.
	 * @param {string} endpoint @param {Record<string, any>} params @param {string} fallbackName
	 */
	async download(endpoint, params = {}, fallbackName = 'download.pdf') {
		const qs = new URLSearchParams(params).toString();
		const url = `${this.baseURL}${endpoint}${qs ? `?${qs}` : ''}`;
		const go = () => fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/pdf, application/json' } });

		let response = await go();
		if (response.status === 401 && (await this.refreshAccessToken())) response = await go();
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const error = new Error(errorData.error || errorData.message || `Could not generate the file (HTTP ${response.status})`);
			/** @type {any} */ (error).status = response.status;
			throw error;
		}

		const disposition = response.headers.get('Content-Disposition') || '';
		const match = disposition.match(/filename="?([^";]+)"?/);
		const blob = await response.blob();
		const href = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = href;
		a.download = match ? match[1] : fallbackName;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(href), 10000);
	}

	async upload(endpoint, formData) {
		const url = `${this.baseURL}${endpoint}`;
		const headers = { Accept: 'application/json' };
		if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

		try {
			const response = await fetch(url, { method: 'POST', headers, body: formData });
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
				const error = new Error(errorData.error || errorData.message || `HTTP Error ${response.status}`);
				error.status = response.status;
				error.data = errorData;
				throw error;
			}
			return await response.json();
		} catch (err) {
			if (err.status) throw err;
			throw new Error('Network error. Please check your connection.');
		}
	}
}

export const api = new ApiClient();
