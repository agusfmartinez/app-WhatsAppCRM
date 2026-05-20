import semver from "semver";

export function isOutdated(currentVersion, minVersion) {
  const current = semver.valid(currentVersion);
  const min = semver.valid(minVersion);
  if (!current || !min) return false;
  return semver.lt(current, min);
}
