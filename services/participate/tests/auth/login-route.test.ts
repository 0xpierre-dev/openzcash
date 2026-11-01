// @vitest-environment node
import { POST as login } from "@/app/api/auth/login/route";
import { POST as signup } from "@/app/api/auth/signup/route";
const session = vi.hoisted(() => ({ writeSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("APP_BASE_URL", "http://localhost:4411"); });
afterEach(() => vi.unstubAllEnvs());
it.each([login, signup])("retires password access without creating a session", async route => {
  const response = await route(new Request("http://localhost:4411/api/auth/login", { method: "POST", headers: { origin: "http://localhost:4411" }, body: JSON.stringify({ userId: "maya", password: "legacy-password" }) }));
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ error: "PASSWORD_SIGN_IN_RETIRED" });
  expect(session.writeSessionCookie).not.toHaveBeenCalled();
});
it.each([login, signup])("rejects cross-site legacy requests", async route => {
  const response = await route(new Request("http://localhost:4411/api/auth/login", { method: "POST", headers: { origin: "https://evil.example" } }));
  expect(response.status).toBe(403);
  expect(session.writeSessionCookie).not.toHaveBeenCalled();
});
