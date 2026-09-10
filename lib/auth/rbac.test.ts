import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  can,
  canAssignRole,
  canManageMember,
  capabilitiesFor,
  ROLE_RANK,
  type Capability,
} from "@/lib/auth/rbac";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";

const { OWNER, ADMIN, MEMBER, GUEST } = WorkspaceRole;
const ALL_ROLES = [OWNER, ADMIN, MEMBER, GUEST] as const;

describe("capability matrix", () => {
  it("is strictly cumulative up the hierarchy", () => {
    // Every capability a junior role holds, its senior must also hold.
    // Without this, promoting someone could silently remove an ability.
    const pairs = [
      [GUEST, MEMBER],
      [MEMBER, ADMIN],
      [ADMIN, OWNER],
    ] as const;

    for (const [junior, senior] of pairs) {
      const missing = capabilitiesFor(junior).filter((c) => !can(senior, c));
      expect(missing, `${senior} is missing ${junior}'s capabilities`).toEqual([]);
    }
  });

  it("gives every role strictly more than the one below it", () => {
    expect(capabilitiesFor(GUEST).length).toBeLessThan(capabilitiesFor(MEMBER).length);
    expect(capabilitiesFor(MEMBER).length).toBeLessThan(capabilitiesFor(ADMIN).length);
    expect(capabilitiesFor(ADMIN).length).toBeLessThan(capabilitiesFor(OWNER).length);
  });

  it("grants no capability outside the declared list", () => {
    const declared = new Set<string>(CAPABILITIES);
    for (const role of ALL_ROLES) {
      for (const capability of capabilitiesFor(role)) {
        expect(declared.has(capability), `${capability} is not declared`).toBe(true);
      }
    }
  });
});

describe("MEMBER is blocked from administration", () => {
  // The plan's Phase 1 acceptance criterion, made executable.
  const adminOnly: Capability[] = [
    "workspace.update",
    "member.invite",
    "member.remove",
    "member.change_role",
    "project.delete",
    "label.manage",
    "template.manage",
    "goal.manage",
    "timeentry.view_all",
    "comment.delete_any",
  ];

  it.each(adminOnly)("MEMBER cannot %s", (capability) => {
    expect(can(MEMBER, capability)).toBe(false);
  });

  it.each(adminOnly)("ADMIN can %s", (capability) => {
    expect(can(ADMIN, capability)).toBe(true);
  });
});

describe("irreversible and financial powers are OWNER-only", () => {
  const ownerOnly: Capability[] = [
    "workspace.delete",
    "workspace.archive",
    "workspace.transfer_ownership",
    "workspace.billing",
  ];

  it.each(ownerOnly)("only OWNER can %s", (capability) => {
    expect(can(OWNER, capability)).toBe(true);
    expect(can(ADMIN, capability)).toBe(false);
    expect(can(MEMBER, capability)).toBe(false);
    expect(can(GUEST, capability)).toBe(false);
  });
});

describe("GUEST is read-plus-comment only", () => {
  it("cannot create or modify tasks", () => {
    expect(can(GUEST, "task.create")).toBe(false);
    expect(can(GUEST, "task.update")).toBe(false);
    expect(can(GUEST, "task.delete")).toBe(false);
    expect(can(GUEST, "task.assign")).toBe(false);
  });

  it("can read and comment", () => {
    expect(can(GUEST, "task.view")).toBe(true);
    expect(can(GUEST, "project.view")).toBe(true);
    expect(can(GUEST, "comment.create")).toBe(true);
  });

  it("cannot delete other people's comments", () => {
    expect(can(GUEST, "comment.delete_own")).toBe(true);
    expect(can(GUEST, "comment.delete_any")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("never allows assigning OWNER — that is a separate transfer operation", () => {
    for (const actor of ALL_ROLES) {
      expect(canAssignRole(actor, OWNER), `${actor} assigned OWNER`).toBe(false);
    }
  });

  it("refuses granting a role at or above the actor's own", () => {
    // No self-promotion, and no ADMIN minting a peer ADMIN.
    expect(canAssignRole(ADMIN, ADMIN)).toBe(false);
    expect(canAssignRole(MEMBER, MEMBER)).toBe(false);
    expect(canAssignRole(MEMBER, ADMIN)).toBe(false);
  });

  it("allows an OWNER to appoint admins and an ADMIN to appoint members", () => {
    expect(canAssignRole(OWNER, ADMIN)).toBe(true);
    expect(canAssignRole(OWNER, MEMBER)).toBe(true);
    expect(canAssignRole(ADMIN, MEMBER)).toBe(true);
    expect(canAssignRole(ADMIN, GUEST)).toBe(true);
  });

  it("refuses anyone without the change_role capability", () => {
    expect(canAssignRole(MEMBER, GUEST)).toBe(false);
    expect(canAssignRole(GUEST, GUEST)).toBe(false);
  });
});

describe("canManageMember", () => {
  it("refuses equal rank, so peers cannot remove each other", () => {
    // Two admins removing each other is a common way a workspace gets locked.
    for (const role of ALL_ROLES) {
      expect(canManageMember(role, role), `${role} managed a peer`).toBe(false);
    }
  });

  it("allows acting only downward", () => {
    expect(canManageMember(OWNER, ADMIN)).toBe(true);
    expect(canManageMember(ADMIN, MEMBER)).toBe(true);
    expect(canManageMember(MEMBER, GUEST)).toBe(true);
  });

  it("refuses acting upward", () => {
    expect(canManageMember(ADMIN, OWNER)).toBe(false);
    expect(canManageMember(MEMBER, ADMIN)).toBe(false);
    expect(canManageMember(GUEST, MEMBER)).toBe(false);
  });
});

describe("ROLE_RANK", () => {
  it("orders roles unambiguously", () => {
    expect(ROLE_RANK[GUEST]).toBeLessThan(ROLE_RANK[MEMBER]);
    expect(ROLE_RANK[MEMBER]).toBeLessThan(ROLE_RANK[ADMIN]);
    expect(ROLE_RANK[ADMIN]).toBeLessThan(ROLE_RANK[OWNER]);
  });

  it("assigns a distinct rank to every role", () => {
    const ranks = ALL_ROLES.map((r) => ROLE_RANK[r]);
    expect(new Set(ranks).size).toBe(ALL_ROLES.length);
  });
});
