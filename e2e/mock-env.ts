// Deliberately invalid credentials for browser tests. They must never use the
// developer's .env key or passcode, even when the Next server loads .env.
export const MOCK_E2E_API_KEY = "pretext-mock-e2e-invalid-key";
export const MOCK_E2E_PASSCODE = "pretext-mock-e2e-passcode";
