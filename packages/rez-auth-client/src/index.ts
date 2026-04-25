export * from './client';
export * from './types';

interface RezAuthConfig {
  clientId: string;
  clientSecret: string;
  apiUrl: string;
}

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

class RezAuthClient {
  private clientId: string;
  private clientSecret: string;
  private apiUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: RezAuthConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.apiUrl = config.apiUrl;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const response = await fetch(`${this.apiUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data: TokenResponse = await response.json();
    this.accessToken = data.accessToken;
    this.tokenExpiry = new Date(Date.now() + data.expiresIn * 1000);

    return this.accessToken;
  }

  async apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  clearToken(): void {
    this.accessToken = null;
    this.tokenExpiry = null;
  }
}

export function createRezAuthClient(config: RezAuthConfig): RezAuthClient {
  return new RezAuthClient(config);
}

export type { RezAuthClient, RezAuthConfig, TokenResponse };
