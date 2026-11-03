import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleNavigation } from "../src/lib/navigation.ts";

const hrefs = (roles) => visibleNavigation(roles).map((item) => item.href);

test("seller sees only sales screens", () => {
  const seller = hrefs(["SELLER"]);
  for (const href of ["/examinations", "/dashboard/tickets", "/dashboard/scan", "/dashboard/day-closure"])
    assert.ok(seller.includes(href), href);
  for (const href of ["/dashboard/branches", "/dashboard/users", "/dashboard/questions", "/dashboard/results", "/dashboard/omr"])
    assert.ok(!seller.includes(href), href);
});

test("OMR operator sees scanning and results, not sales", () => {
  const operator = hrefs(["OMR_OPERATOR"]);
  assert.ok(operator.includes("/dashboard/omr"));
  assert.ok(operator.includes("/dashboard/results"));
  assert.ok(!operator.includes("/dashboard/tickets"));
});

test("central admin sees everything", () => {
  assert.equal(hrefs(["CENTRAL_ADMIN"]).length, visibleNavigation(["SUPER_ADMIN"]).length);
});
