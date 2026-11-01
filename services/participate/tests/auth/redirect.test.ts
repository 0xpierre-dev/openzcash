import { navigateAfterSignIn } from "@/lib/auth/redirect";

it("replaces the signed-out document at the preserved route after verification", () => {
  const replace = vi.fn();
  navigateAfterSignIn("/participate?record=proposal-1#comments", "/participate", replace);
  expect(replace).toHaveBeenCalledExactlyOnceWith("/participate?record=proposal-1#comments");
});

it("never navigates an authenticated browser to an external target", () => {
  const replace = vi.fn();
  navigateAfterSignIn("//attacker.example", "/participate", replace);
  expect(replace).toHaveBeenCalledExactlyOnceWith("/participate");
});
