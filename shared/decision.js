import { buildProfileFeatureShape } from "./messages.js";

export const DecisionOutcome = {
  INVITE: "invite",
  SKIP: "skip"
};

export function evaluateConnectDecision(rawProfile, config) {
  if (!rawProfile || !config) {
    return skip("missing_profile_or_config");
  }

  const profile = buildProfileFeatureShape(rawProfile);

  if (!profile.hasConnectButton) return skip("no_connect_button");
  if (!matchesKeyword(profile.title, config.jobTitleKeyword))
    return skip("job_title_mismatch");
  if (config.locationKeyword && !matchesKeyword(profile.location, config.locationKeyword))
    return skip("location_mismatch");
  if (Number.isFinite(config.minMutualConnections)) {
    if (profile.mutualConnections < config.minMutualConnections) return skip("mutual_connections_low");
  }

  return { decision: DecisionOutcome.INVITE, reason: "success" };
}

export function evaluateProfiles(rawProfiles, config) {
  if (!Array.isArray(rawProfiles)) return [];
  return rawProfiles.map((profile) => ({
    profile,
    ...evaluateConnectDecision(profile, config)
  }));
}

function matchesKeyword(text, keyword) {
  if (!keyword) return true;
  if (!text) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function skip(reason) {
  return { decision: DecisionOutcome.SKIP, reason };
}
