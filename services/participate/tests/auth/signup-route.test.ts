// @vitest-environment node
import { POST } from "@/app/api/auth/signup/route";
const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { user: { create } } }));
it("cannot create an unverified account using the legacy signup form", async () => {
  vi.stubEnv("APP_BASE_URL", "http://localhost:4411");
  const response = await POST(new Request("http://localhost:4411/api/auth/signup", { method: "POST", headers: { origin: "http://localhost:4411" }, body: new URLSearchParams({ email: "member@example.test", password: "ignored", userId: "member" }) }));
  expect(response.status).toBe(410); expect(create).not.toHaveBeenCalled(); vi.unstubAllEnvs();
});
