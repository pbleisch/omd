/**
 * SSRF guards for the link-card fetch (threat-model R2). A document author could otherwise induce
 * OMD's host-side fetch to reach an internal/link-local service when the user clicks "insert" or
 * "refresh" on an attacker-chosen URL. The classifier below is pure (no DNS, no network) so it's
 * unit-testable; the host resolves each URL's hostname to IPs and rejects the fetch if any resolved
 * address is private/loopback/link-local/reserved (see `linkMeta.ts`).
 */

/** Parse a dotted IPv4 string to four octets, or null if it isn't one. */
function parseIpv4(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
  return o.every((n) => n >= 0 && n <= 255) ? o : null;
}

/** True if an IPv4 address is private, loopback, link-local, or otherwise not a public host. */
function isPrivateIpv4(o: [number, number, number, number]): boolean {
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0 && o[2] === 0) return true; // 192.0.0.0/24 IETF protocol
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved (incl. 255.255.255.255)
  return false;
}

/**
 * True if `ip` (IPv4 or IPv6, as returned by `dns.lookup`) is NOT a routable public address —
 * i.e. the fetch should be blocked. Unparseable input is treated as blocked (fail closed).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const raw = ip.trim().toLowerCase().replace(/%.*$/, ''); // drop any zone id
  const v4 = parseIpv4(raw);
  if (v4) return isPrivateIpv4(v4);

  // IPv6.
  if (raw === '::1' || raw === '::') return true; // loopback / unspecified
  // IPv4-mapped / -embedded (`::ffff:127.0.0.1`, `::ffff:7f00:1`): check the embedded v4.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(raw);
  if (mapped) {
    const inner = parseIpv4(mapped[1]);
    return inner ? isPrivateIpv4(inner) : true;
  }
  const first = raw.split(':')[0];
  if (first.startsWith('fc') || first.startsWith('fd')) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(first)) return true; // fe80::/10 link-local
  if (first.startsWith('ff')) return true; // ff00::/8 multicast
  if (raw.includes(':')) return false; // a plausible public IPv6
  return true; // not a recognizable IP — fail closed
}
