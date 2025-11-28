import { buildProfileFeatureShape } from "./messages.js";

export const DecisionOutcome = {
  INVITE: "invite",
  SKIP: "skip"
};

export const DecisionReason = {
  SUCCESS: { code: "success", message: "Meets criteria." },
  MISSING_PROFILE_OR_CONFIG: { code: "missing_profile_or_config", message: "Missing profile/config." },
  NO_CONNECT_BUTTON: { code: "no_connect_button", message: "Connect button not available." },
  JOB_TITLE_MISMATCH: { code: "job_title_mismatch", message: "Job title does not match keyword." },
  LOCATION_MISMATCH: { code: "location_mismatch", message: "Location does not match keyword." },
  MUTUAL_CONNECTIONS_LOW: { code: "mutual_connections_low", message: "Mutual connections below minimum." }
};

export function evaluateConnectDecision(rawProfile, config) {
  if (!rawProfile || !config) {
    return skip(DecisionReason.MISSING_PROFILE_OR_CONFIG);
  }

  const profile = buildProfileFeatureShape(rawProfile);

  if (!profile.hasConnectButton) return skip(DecisionReason.NO_CONNECT_BUTTON);
  if (!matchesKeyword(profile.title, config.jobTitleKeyword))
    return skip(DecisionReason.JOB_TITLE_MISMATCH);
  if (config.locationKeyword && !matchesKeyword(profile.location, config.locationKeyword))
    return skip(DecisionReason.LOCATION_MISMATCH);
  if (Number.isFinite(config.minMutualConnections)) {
    if (profile.mutualConnections < config.minMutualConnections) {
      return skip({
        ...DecisionReason.MUTUAL_CONNECTIONS_LOW,
        message: `Requires ≥ ${config.minMutualConnections} mutual connections`
      });
    }
  }

  return { decision: DecisionOutcome.INVITE, reasonCode: DecisionReason.SUCCESS.code, reason: DecisionReason.SUCCESS.message };
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
  if (!reason) {
    return { decision: DecisionOutcome.SKIP, reasonCode: "unknown", reason: "Skipped." };
  }
  const message = typeof reason === "string" ? reason : reason.message;
  const code = typeof reason === "string" ? reason : reason.code;
  return { decision: DecisionOutcome.SKIP, reasonCode: code, reason: message };
}
