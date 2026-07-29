import { describe, it, expect } from 'vitest';
import { isPrivateOrReservedIp } from '../src/host/ssrf';

/**
 * The SSRF address classifier behind the link-card fetch (threat-model R2). Pure, so tested here
 * without DNS/network; the host resolves each hostname and rejects the fetch when any resolved
 * address is classified private/reserved.
 */

describe('isPrivateOrReservedIp — blocks private/reserved', () => {
  const blocked = [
    '127.0.0.1', // loopback
    '10.1.2.3', // private
    '172.16.0.1', // private
    '172.31.255.255', // private (edge)
    '192.168.1.1', // private
    '169.254.169.254', // link-local (cloud metadata)
    '100.64.0.1', // CGNAT
    '0.0.0.0', // this-network
    '198.18.0.1', // benchmark
    '224.0.0.1', // multicast
    '255.255.255.255', // broadcast/reserved
    '::1', // IPv6 loopback
    '::', // unspecified
    'fe80::1', // link-local
    'fc00::1', // unique-local
    'fd12:3456::1', // unique-local
    'ff02::1', // multicast
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    'not-an-ip' // unparseable → fail closed
  ];
  for (const ip of blocked) it(`blocks ${ip}`, () => expect(isPrivateOrReservedIp(ip)).toBe(true));
});

describe('isPrivateOrReservedIp — allows public', () => {
  const allowed = [
    '8.8.8.8',
    '1.1.1.1',
    '140.82.112.3', // github.com
    '172.15.0.1', // just outside 172.16/12
    '172.32.0.1', // just outside 172.16/12
    '100.63.0.1', // just outside 100.64/10
    '2606:4700:4700::1111', // Cloudflare IPv6
    '2001:4860:4860::8888' // Google IPv6
  ];
  for (const ip of allowed) it(`allows ${ip}`, () => expect(isPrivateOrReservedIp(ip)).toBe(false));
});
