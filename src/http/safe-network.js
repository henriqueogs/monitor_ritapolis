'use strict';

const dns = require('dns');
const https = require('https');
const net = require('net');
const ipaddr = require('ipaddr.js');

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

function isPrivateIp(address) {
  try {
    const parsed = ipaddr.parse(String(address).split('%')[0]);
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
      return isPrivateIp(parsed.toIPv4Address().toString());
    }
    // Fail closed for loopback, private, link-local, documentation,
    // multicast, carrier-grade NAT and every other non-global range.
    return parsed.range() !== 'unicast';
  } catch {
    return true;
  }
}

function assertSafeUrl(value, { allowedHosts = null } = {}) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  if (url.protocol !== 'https:') {
    throw new Error('URL externa deve usar HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('URL externa nao pode conter credenciais');
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.localhost')) {
    throw new Error('Host local ou reservado bloqueado');
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error('Endereco IP privado ou reservado bloqueado');
  }
  if (allowedHosts?.length && !allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    throw new Error(`Host externo nao permitido: ${hostname}`);
  }

  return url;
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) { return callback(error); }
    const safe = addresses.find((entry) => !isPrivateIp(entry.address));
    if (!safe) {
      return callback(new Error(`DNS resolveu apenas enderecos privados ou reservados: ${hostname}`));
    }
    return callback(null, safe.address, safe.family);
  });
}

function createSafeHttpsAgent() {
  return new https.Agent({
    keepAlive: true,
    rejectUnauthorized: true,
    lookup: safeLookup,
  });
}

module.exports = {
  assertSafeUrl,
  createSafeHttpsAgent,
  isPrivateIp,
  safeLookup,
};
