import test from "node:test";
import assert from "node:assert/strict";
import { fillPlaceholders, looksLikeStop, normalisePhone, placeholdersLeft } from "./text";

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
    {
      name: "Maria Georgiou",
      firstName: "Maria",
      priceListUrl: "https://example.test/p/abc",
    },
  );
  assert.equal(
    filled,
    "Dear Maria, the September list is at https://example.test/p/abc. Regards to Maria Georgiou.",
  );
});

test("a missing price list link leaves nothing odd behind", () => {
  assert.equal(fillPlaceholders("See {{price_list_url}}", { name: "A B", firstName: "A" }), "See ");
});

test("placeholders are filled however they are typed", () => {
  assert.equal(
    fillPlaceholders("Dear {{ first_name }}, {{Project}} and {{first name}}.", {
      name: "Maria Georgiou",
      firstName: "Maria",
      extras: { project: "Magnum Opus" },
    }),
    "Dear Maria, Magnum Opus and Maria.",
  );
});

test("a placeholder with no value stays, so it can be caught before sending", () => {
  const filled = fillPlaceholders("{{unit}} at {{project}}", { name: "A", firstName: "A" });
  assert.equal(filled, "{{unit}} at {{project}}");
  assert.deepEqual(placeholdersLeft(filled), ["{{unit}}", "{{project}}"]);
});

test("Twilio: WhatsApp addresses and incoming numbers", async () => {
  const { whatsappAddress, plainNumber } = await import("./twilioParts");
  assert.equal(whatsappAddress("99123456"), "whatsapp:+35799123456");
  assert.equal(whatsappAddress("whatsapp:+14155238886"), "whatsapp:+14155238886");
  assert.equal(plainNumber("whatsapp:+35799123456"), "+35799123456");
  assert.equal(plainNumber("+35799123456"), "+35799123456");
});

test("Twilio: errors are explained in words the office can act on", async () => {
  const { explainTwilioError } = await import("./twilioParts");
  assert.match(explainTwilioError(400, JSON.stringify({ code: 21608, message: "unverified" })), /verified numbers/);
  assert.match(explainTwilioError(400, JSON.stringify({ code: 63015, message: "x" })), /sandbox/);
  assert.match(explainTwilioError(401, JSON.stringify({ code: 20003, message: "Authenticate" })), /TWILIO_AUTH_TOKEN/);
  assert.match(explainTwilioError(400, JSON.stringify({ code: 21408, message: "Permission" })), /Geo permissions/);
  assert.match(explainTwilioError(503, "down"), /Try again/);
  assert.match(explainTwilioError(401, JSON.stringify({ code: 20003, message: "Primary compliance profile is not approved. Please complete the KYC process in Trust Hub" })), /Trust Hub/);
});

test("campaign ways: clients and leads are texted their own way, agents theirs", async () => {
  const { campaignWays } = await import("../agentWay");
  const both = { viaEmail: true, viaWhatsapp: true, agentsBothVia: null, subject: "Hi", bodyWhatsapp: "Hi" };
  assert.deepEqual(campaignWays({ group: "CLIENTS", textChannel: "SMS" }, both), ["EMAIL", "SMS"]);
  assert.deepEqual(campaignWays({ group: "LEADS", textChannel: "WHATSAPP" }, both), ["EMAIL", "WHATSAPP"]);
  assert.deepEqual(campaignWays({ group: "BUYERS", textChannel: "SMS" }, { ...both, viaEmail: false }), ["SMS"]);
  assert.deepEqual(campaignWays({ group: "SUBOWNERS" }, both), ["EMAIL", "WHATSAPP"]);
  assert.deepEqual(campaignWays({ group: "CLIENTS", textChannel: "NONE" }, both), ["EMAIL"]);
  assert.deepEqual(campaignWays({ group: "LEADS", textChannel: "NONE" }, { ...both, viaEmail: false }), []);
  assert.deepEqual(campaignWays({ group: "AGENTS", agentChannel: "WHATSAPP" }, both), ["WHATSAPP"]);
  assert.deepEqual(campaignWays({ group: "CLIENTS", textChannel: "WHATSAPP" }, { ...both, viaWhatsapp: false }), ["EMAIL"]);
});

test("text channel: anything but WhatsApp is SMS", async () => {
  const { textChannelOf, agentTextChannel } = await import("../textChannel");
  assert.equal(textChannelOf("WHATSAPP"), "WHATSAPP");
  assert.equal(textChannelOf("whatever"), "SMS");
  assert.equal(textChannelOf(null), "SMS");
  assert.equal(textChannelOf("NONE"), "NONE");
  assert.equal(agentTextChannel("BOTH"), "WHATSAPP");
  assert.equal(agentTextChannel("EMAIL"), "SMS");
});
