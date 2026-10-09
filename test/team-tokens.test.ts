import { describe, expect, it } from "vitest";
import { hashInviteToken, newInviteToken } from "@/lib/team/tokens";

describe("token de convite", () => {
  it("o banco guarda só o hash; o mesmo token sempre dá o mesmo hash", () => {
    const { token, tokenHash } = newInviteToken();
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("tokens não se repetem", () => {
    expect(newInviteToken().token).not.toBe(newInviteToken().token);
  });
});
