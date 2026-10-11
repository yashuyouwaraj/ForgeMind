
import { isIP } from "node:net";

const DEFAULT_ALLOWED_HOSTS = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
];

function getAllowedHosts(): Set<string> {
  const configured = process.env.GIT_ALLOWED_HOSTS
    ?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  const hosts = configured?.length
    ? configured
    : DEFAULT_ALLOWED_HOSTS;

  for (const host of hosts) {
    // Accept hostnames only, never URLs, ports, wildcards or IP literals.
    if (
      host !== host.trim() ||
      host.includes("://") ||
      host.includes("/") ||
      host.includes(":") ||
      host.includes("*") ||
      host.endsWith(".") ||
      isIP(host) !== 0 ||
      host.length > 253 ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(host)
    ) {
      throw new Error("INVALID_GIT_ALLOWED_HOSTS_CONFIGURATION");
    }
  }

  return new Set(hosts);
}

export function validateRepositoryUrl(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2048 ||
    value !== value.trim() ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  ) {
    throw new Error("INVALID_REPOSITORY_URL");
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("INVALID_REPOSITORY_URL");
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHosts = getAllowedHosts();

  if (
    url.protocol !== "https:" ||
    isIP(hostname) !== 0 ||
    hostname.endsWith(".") ||
    !allowedHosts.has(hostname) ||
    (url.port !== "" && url.port !== "443") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("UNSUPPORTED_REPOSITORY_URL");
  }

  // Reject encoded separators and control characters in repository paths.
  if (/%(?:2f|5c|00|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname)) {
    throw new Error("INVALID_REPOSITORY_URL");
  }

  const segments = url.pathname.split("/").filter(Boolean);

  if (
    segments.length < 2 ||
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment === "%2e" ||
        segment === "%2e%2e",
    )
  ) {
    throw new Error("INVALID_REPOSITORY_URL");
  }

  return url.toString().replace(/\/+$/, "");
}

export function normalizeRepositoryUrl(value: string): string {
  const validated = validateRepositoryUrl(value);

  return validated
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
}
