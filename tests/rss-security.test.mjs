import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRssSourceUrl, isPublicRssIPv4 } from "../src/lib/rss/security.ts";

test("RSS source validation allows a normal HTTPS feed", () => {
  assert.equal(safeRssSourceUrl("https://news.ycombinator.com/rss").toString(),
    "https://news.ycombinator.com/rss");
  assert.equal(safeRssSourceUrl("https://feeds.bbci.co.uk/news/technology/rss.xml").hostname,
    "feeds.bbci.co.uk");
});
test("RSS rejects internal schemes, credentials, local/IP hostnames and alternate ports", () => {
  const bad = [
    "http://news.ycombinator.com/rss",
    "file:///etc/passwd",
    "https://127.0.0.1/rss",
    "https://0x7f000001/rss",
    "https://192.168.1.10/feed",
    "https://foo.local/rss",
    "https://foo.internal/feed",
    "https://localhost/rss",
    "https://[::1]/rss",
    "https://user:secret@news.ycombinator.com/feed",
    "https://news.ycombinator.com:8443/feed",
    "not a url",
  ];
  for (const raw of bad) assert.throws(() => safeRssSourceUrl(raw), raw);
});
test("DNS-pinned RSS transport refuses private and special-use IPv4", () => {
  for (const ip of ["0.0.0.0","10.5.4.3","127.0.0.1","169.254.169.254","172.16.1.1",
    "192.168.1.1","100.64.0.2","198.18.0.1","192.0.2.1","198.51.100.8","203.0.113.9",
    "224.0.0.1","255.255.255.255","::1","::ffff:127.0.0.1","not-an-ip"]) {
    assert.equal(isPublicRssIPv4(ip), false, ip);
  }
  for (const ip of ["1.1.1.1","8.8.8.8","93.184.215.14"]) assert.equal(isPublicRssIPv4(ip), true, ip);
});
