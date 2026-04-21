import type { CloudApiResponse, SigninResponse } from './types';

export async function cloudSignin(email: string, password: string): Promise<SigninResponse> {
  const credentials = Buffer.from(`${email}:${password}`).toString('base64');
  const res = await fetch('https://que.actronair.com.au/api/v0/bc/signin', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
  const body = await res.json() as SigninResponse;
  if (body.status !== 200) { throw new Error(`Signin failed: ${body.message}`); }
  return body;
}


export async function cloudGet(url: string): Promise<CloudApiResponse> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const body = await res.json() as CloudApiResponse;
  if (body.error) {
    throw new Error(`API error: ${body.error}`);
  }
  return body;
}

export async function cloudPut(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}
