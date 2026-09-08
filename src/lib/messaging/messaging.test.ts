import test from "node:test";
import assert from "node:assert/strict";
import { fillPlaceholders, looksLikeStop, normalisePhone } from "./text";

test("stop keywords are recognised in the forms people actually type", () => {
  for (const text of [
    "STOP",
    "stop",
    " Stop. ",
    "UNSUBSCRIBE",
    "unsub",
    "Cancel",
    "opt out",
    "ΔΙΑΓΡΑΦΗ",
    "στοπ",
    "stop all",
  ]) {
    assert.equal(looksLikeStop(text), true, `expected a stop for ${JSON.stringify(text)}`);
  }
});

test("an ordinary reply is not treated as a stop", () => {
  for (const text of [
    "Thank you, I am interested",
    "please stop by the office tomorrow",
    "when can I visit?",
    "",
  ]) {
    assert.equal(looksLikeStop(text), false, `expected no stop for ${JSON.stringify(text)}`);
  }
});

test("Cyprus numbers are normalised to one shape so suppression cannot be dodged", () => {
  assert.equal(normalisePhone("99123456"), "+35799123456");
  assert.equal(normalisePhone("+357 99 123456"), "+35799123456");
  assert.equal(normalisePhone("00357-99-123456"), "+35799123456");
  assert.equal(normalisePhone("357 99 123 456"), "+35799123456");
});

test("placeholders are filled per recipient", () => {
  const filled = fillPlaceholders(
    "Dear {{first_name}}, the September list is at {{price_list_url}}. Regards to {{name}}.",
    { name: "Maria Georgiou", firstName: "Maria", priceListUrl: "https://example.test/p/abc" },
  );
  assert.equal(
    filled,
    "Dear Maria, the September list is at https://example.test/p/abc. Regards to Maria Georgiou.",
  );
});

test("a missing price list link leaves nothing odd behind", () => {
  assert.equal(
    fillPlaceholders("See {{price_list_url}}", { name: "A B", firstName: "A" }),
    "See ",
  );
});
