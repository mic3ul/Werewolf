import test from "node:test";
import assert from "node:assert/strict";
import { buildRoles, getWinner } from "../worker.js";

test("role assignment returns exactly one role per player", () => {
  for (let count = 4; count <= 20; count += 1) {
    const roles = buildRoles(count);
    assert.equal(roles.length, count);
    assert.equal(roles.filter((role) => role === "qais").length, 1);
    assert.equal(roles.filter((role) => role === "wolf").length, Math.max(1, Math.floor(count / 4)));
    if (count >= 5) assert.equal(roles.filter((role) => role === "doctor").length, 1);
  }
});

test("role assignment rejects fewer than four players", () => {
  assert.throws(() => buildRoles(3), RangeError);
});

test("the village wins when no living wolves remain", () => {
  assert.equal(getWinner([
    { alive: true, role: "villager" },
    { alive: false, role: "wolf" },
  ]), "village");
});

test("the wolves win when they equal or outnumber all other living players", () => {
  assert.equal(getWinner([
    { alive: true, role: "wolf" },
    { alive: true, role: "villager" },
  ]), "wolves");
});

test("the game continues while the village outnumbers the wolves", () => {
  assert.equal(getWinner([
    { alive: true, role: "wolf" },
    { alive: true, role: "doctor" },
    { alive: true, role: "qais" },
  ]), null);
});
